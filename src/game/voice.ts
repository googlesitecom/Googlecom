// ============================================================
// EMERGENCY STRIKE — PROXIMITY VOICE CHAT (v12)
// Real voice between ONLINE operators in TEAM matches (PvP rooms
// and co-op). Mic capture → 16 kHz mono PCM chunks with VAD →
// the existing PeerJS room connections (host relays to the other
// guests, exactly like the text chat) → playback with POSITION
// attenuation + stereo panning driven by the 3D world (the
// engine ticks the positions every frame).
// - Push-to-talk [V] (default) or open mic (setting)
// - Distance model: silent beyond 26 m, smooth falloff
// - Bots NEVER speak: they simply never send (no client).
// ============================================================
import { create } from 'zustand'
import { chatLocalName } from './chat'

// ---------------- UI store (tiny — always loaded) ----------------
export interface VoiceSpeaker {
  name: string
  /** 0..1 how loud they currently are for the local player */
  level: number
  dist: number
}
interface VoiceState {
  /** true while the room has real operators to talk to */
  active: boolean
  mic: 'off' | 'requesting' | 'ready' | 'denied'
  transmitting: boolean
  ptt: boolean           // push-to-talk held
  mode: 'ptt' | 'open'
  volume: number
  enabled: boolean
  speakers: VoiceSpeaker[]
  set: (p: Partial<VoiceState>) => void
}
export const useVoice = create<VoiceState>((set) => ({
  active: false,
  mic: 'off',
  transmitting: false,
  ptt: false,
  mode: 'ptt',
  volume: 0.9,
  enabled: true,
  speakers: [],
  set: (p) => set(p),
}))

// ---------------- constants ----------------
const RATE = 16000              // transport sample rate (mono Int16)
const MAX_DIST = 26             // proximity range (m) — silent beyond
const VAD_THRESHOLD = 0.011     // RMS gate for "speaking"
const VAD_HANGOVER = 0.30       // s of tail after speech stops
const SPEAKER_TTL = 2.0         // s before a silent speaker row fades

// ---------------- codec helpers ----------------
function floatTo16B64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  // bytes → base64 (chunked to avoid stack limits)
  const u8 = new Uint8Array(i16.buffer)
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)))
  }
  return btoa(bin)
}
function b64ToFloat(b64: string): Float32Array | null {
  try {
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    const i16 = new Int16Array(u8.buffer)
    const out = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 0x8000
    return out
  } catch { return null }
}
/** linear resample to RATE (whatever the context sample rate is) */
function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === RATE) return input
  const ratio = fromRate / RATE
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const frac = src - i0
    const a = input[i0] ?? 0
    const b = input[i0 + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

// ---------------- per-speaker playback chain ----------------
interface SpeakerChain {
  name: string
  gain: GainNode
  pan: StereoPannerNode
  lastAt: number
}
/** where the remote operators are right now (engine feeds this) */
export type RemotePos = { name: string; x: number; y: number; z: number }

// ---------------- the engine ----------------
class VoiceChat {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private master: GainNode | null = null
  private speaking = false
  private speakUntil = 0
  private chains = new Map<string, SpeakerChain>()
  /** net.ts installs this: (b64) => send to the room */
  private relay: ((b64: string) => void) | null = null
  /** latest world positions of the remote operators */
  private remotes: RemotePos[] = []
  private localPos = { x: 0, y: 0, z: 0, yaw: 0 }
  private dead = false
  private speakersAt = 0

  /** net.ts calls this when a room with REAL operators is connected */
  setRoom(active: boolean): void {
    useVoice.getState().set({ active })
    if (!active) {
      this.setTransmitting(false)
      this.pruneChains(0)
    }
  }
  setRelay(fn: ((b64: string) => void) | null): void { this.relay = fn }

  /** the engine reports local life state (dead operators don't talk) */
  setDead(dead: boolean): void { this.dead = dead }

  setVolume(v: number): void {
    useVoice.getState().set({ volume: v })
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
    }
  }

  // ---------------- capture ----------------
  async enable(): Promise<void> {
    const st = useVoice.getState()
    if (!st.enabled) return
    if (st.mic === 'ready' || st.mic === 'requesting') return
    useVoice.getState().set({ mic: 'requesting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.stream = stream
      this.ctx = new AudioContext()
      // NOTE: we resample manually to 16k in the processor, so the
      // context sample rate doesn't matter (Safari-safe)
      await this.ctx.resume()
      this.master = this.ctx.createGain()
      this.master.gain.value = useVoice.getState().volume
      this.master.connect(this.ctx.destination)

      this.source = this.ctx.createMediaStreamSource(stream)
      // ScriptProcessor is deprecated but works everywhere and needs
      // no worklet file (the game ships as one bundle)
      this.processor = this.ctx.createScriptProcessor(2048, 1, 1)
      this.processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0)
        this.onMicFrame(input, this.ctx!.sampleRate)
        // keep the pipeline alive (output unused)
        const out = ev.outputBuffer.getChannelData(0)
        out.fill(0)
      }
      this.source.connect(this.processor)
      // Chrome requires the processor to reach the destination to run
      const sink = this.ctx.createGain()
      sink.gain.value = 0
      this.processor.connect(sink)
      sink.connect(this.ctx.destination)
      useVoice.getState().set({ mic: 'ready' })
    } catch {
      useVoice.getState().set({ mic: 'denied' })
      this.teardown()
    }
  }

  private teardown(): void {
    try { if (this.processor) this.processor.onaudioprocess = null } catch { /* ok */ }
    try { this.processor?.disconnect() } catch { /* ok */ }
    try { this.source?.disconnect() } catch { /* ok */ }
    try { this.stream?.getTracks().forEach(t => t.stop()) } catch { /* ok */ }
    try { void this.ctx?.close() } catch { /* ok */ }
    this.processor = null
    this.source = null
    this.stream = null
    this.ctx = null
    this.master = null
  }

  disable(): void {
    this.teardown()
    this.setTransmitting(false)
    useVoice.getState().set({ mic: 'off' })
  }

  private onMicFrame(input: Float32Array, rate: number): void {
    const now = performance.now() / 1000
    // VAD
    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    const rms = Math.sqrt(sum / input.length)
    if (rms > VAD_THRESHOLD) this.speakUntil = now + VAD_HANGOVER
    this.speaking = now < this.speakUntil

    const st = useVoice.getState()
    const wantTx = st.active && st.enabled && !this.dead
      && (st.mode === 'open' ? this.speaking : st.ptt && this.speaking)
    if (!wantTx || !this.relay) {
      this.setTransmitting(false)
      return
    }
    this.setTransmitting(true)
    // resample + encode + send (128 ms frames at 16 kHz)
    const res = resampleTo16k(input, rate)
    if (res.length < 256) return
    const b64 = floatTo16B64(res)
    if (b64.length > 3) {
      try { this.relay(b64) } catch { /* connection hiccup: drop the frame */ }
    }
  }

  private setTransmitting(on: boolean): void {
    if (useVoice.getState().transmitting !== on) useVoice.getState().set({ transmitting: on })
  }

  /** push-to-talk key (engine keydown/keyup) */
  setPtt(down: boolean): void {
    if (useVoice.getState().ptt === down) return
    useVoice.getState().set({ ptt: down })
    if (down && useVoice.getState().mode === 'ptt') {
      // lazy mic permission on first use
      void this.enable()
    }
  }

  // ---------------- playback ----------------
  /** a voice chunk arrived from a REAL operator (net.ts) */
  onRemoteVoice(from: string, b64: string): void {
    if (!this.ctx) {
      // receive-only context (a guest that never pressed V yet)
      this.ctx = new AudioContext()
      void this.ctx.resume()
      this.master = this.ctx.createGain()
      this.master.gain.value = useVoice.getState().volume
      this.master.connect(this.ctx.destination)
    }
    const f32 = b64ToFloat(b64)
    if (!f32 || !f32.length) return
    const name = from.slice(0, 16)
    let chain = this.chains.get(name)
    if (!chain) {
      const gain = this.ctx.createGain()
      gain.gain.value = 0.0001
      const pan = this.ctx.createStereoPanner()
      gain.connect(pan)
      pan.connect(this.master!)
      chain = { name, gain, pan, lastAt: 0 }
      this.chains.set(name, chain)
    }
    chain.lastAt = performance.now() / 1000
    const buf = this.ctx.createBuffer(1, f32.length, RATE)
    buf.copyToChannel(new Float32Array(f32), 0)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(chain.gain)
    src.start()
  }

  private pruneChains(now: number): void {
    for (const [name, c] of this.chains) {
      if (now - c.lastAt > SPEAKER_TTL * 3) {
        try { c.gain.disconnect(); c.pan.disconnect() } catch { /* ok */ }
        this.chains.delete(name)
      }
    }
  }

  // ---------------- proximity mixing (engine ticks every frame) ----------------
  tick(local: { x: number; y: number; z: number; yaw: number }, remotes: RemotePos[]): void {
    this.localPos = local
    this.remotes = remotes
    if (this.chains.size === 0) return
    const now = performance.now() / 1000
    this.pruneChains(now)
    for (const [name, c] of this.chains) {
      const live = now - c.lastAt < SPEAKER_TTL
      if (!live) {
        if (c.gain.gain.value > 0.001 && this.ctx) {
          c.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08)
        }
        continue
      }
      const r = remotes.find(p => p.name === name)
      if (!r) {
        // unknown position (scoreboard lag): play at mid volume, centered
        if (this.ctx) {
          c.gain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.05)
          c.pan.pan.setTargetAtTime(0, this.ctx.currentTime, 0.05)
        }
        continue
      }
      const dx = r.x - local.x
      const dy = r.y - local.y
      const dz = r.z - local.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      // proximity falloff (smooth, 0 beyond MAX_DIST)
      const g = dist >= MAX_DIST ? 0 : Math.pow(1 - dist / MAX_DIST, 1.5)
      // stereo bearing: angle between my forward and the speaker
      const sin = Math.sin(local.yaw), cos = Math.cos(local.yaw)
      // forward = (-sin, -cos); right = (cos, -sin)
      const rx = (cos * dx - sin * dz) / (dist || 1)
      const pan = Math.max(-0.9, Math.min(0.9, rx))
      if (this.ctx) {
        const t = this.ctx.currentTime
        c.gain.gain.setTargetAtTime(Math.max(0.0001, g), t, 0.045)
        c.pan.pan.setTargetAtTime(pan, t, 0.05)
      }
    }
    // speakers HUD list (throttled ~10 Hz)
    if (now - this.speakersAt > 0.1) {
      this.speakersAt = now
      const list: VoiceSpeaker[] = []
      for (const [name, c] of this.chains) {
        if (now - c.lastAt < SPEAKER_TTL) {
          const r = remotes.find(p => p.name === name)
          const dist = r ? Math.hypot(r.x - local.x, r.y - local.y, r.z - local.z) : -1
          list.push({ name, level: Math.max(0.05, Math.min(1, c.gain.gain.value)), dist })
        }
      }
      useVoice.getState().set({ speakers: list.slice(0, 5) })
    }
  }

  /** my display name (voice messages carry it for the host relay) */
  get myName(): string { return chatLocalName() }

  dispose(): void {
    this.disable()
    this.relay = null
    this.remotes = []
    this.setRoom(false)
    useVoice.getState().set({ speakers: [], ptt: false })
  }
}

export const voiceChat = new VoiceChat()
