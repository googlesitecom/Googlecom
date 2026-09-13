// ============================================================
// EMERGENCY STRIKE — Motor de audio (Web Audio API)
// v5: sonidos de disparo y música en MP3 del repositorio
// (audio/Pistola, Smg, Rifle, Sniper, Musica) con mezclador de
// volúmenes (general / música / efectos) y recarga procedural
// en capas (liberación → cargador fuera → cargador dentro →
// cerrojo). Fallback procedural si falta algún archivo.
// v12: DOS pistas de fondo (Musica + Musica2) en lista de
// reproducción ALTERNANTE — suena primero una completa, luego
// la otra, y vuelve a empezar (loop de la lista, no del tema).
// ============================================================
import { ASSET_BASE } from './shared'

/** instancia compartida de audio (menú + juego usan el mismo motor) */
let sharedEngine: AudioEngine | null = null
export function getAudio(): AudioEngine {
  if (!sharedEngine) sharedEngine = new AudioEngine()
  return sharedEngine
}

/** Archivos de sonido del usuario (public/audio) */
const SAMPLE_FILES: Record<string, string> = {
  pistol: 'Pistola.mp3',
  deagle: 'Pistola.mp3',
  smg: 'Smg.mp3',
  rifle: 'Rifle.mp3',
  sniper: 'Sniper.mp3',
  music: 'Musica.mp3',
  music2: 'Musica2.mp3',
}

/** v12: la lista de reproducción de fondo — Musica, luego Musica2, en bucle */
const MUSIC_PLAYLIST = ['music', 'music2'] as const

export class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  sfxBus!: GainNode
  ambBus!: GainNode
  musicBus!: GainNode
  noiseBuffer!: AudioBuffer
  volume = 0.7
  musicVol = 0.6
  sfxVol = 1.0
  /** la música suena más baja durante la partida que en el menú */
  private duck = 1
  private samples = new Map<string, AudioBuffer>()
  private musicSrc: AudioBufferSourceNode | null = null
  private musicPlaying = false
  /** v12: índice del tema ACTUAL de la lista (empieza en Musica) */
  private musicTrack = 0
  private ambientNodes: AudioNode[] = []
  private started = false

  /** Debe llamarse tras un gesto del usuario */
  start(): void {
    if (this.started) return
    this.started = true
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)

    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = this.sfxVol
    this.sfxBus.connect(this.master)

    this.ambBus = this.ctx.createGain()
    this.ambBus.gain.value = 0.35
    this.ambBus.connect(this.master)

    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = this.musicVol
    this.musicBus.connect(this.master)

    // buffer de ruido blanco reutilizable (2 s)
    const len = this.ctx.sampleRate * 2
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    this.startAmbient()
    this.loadSamples()
  }

  // ----------------------------------------------------------
  // Carga de los MP3 del repositorio (asíncrona, con fallback)
  // ----------------------------------------------------------
  private loadSamples(): void {
    for (const [key, file] of Object.entries(SAMPLE_FILES)) {
      fetch(`${ASSET_BASE}/audio/${file}`)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(buf => this.ctx!.decodeAudioData(buf))
        .then(audio => {
          this.samples.set(key, audio)
          if ((key === 'music' || key === 'music2') && this.musicPlaying) this.startMusicSource()
        })
        .catch(() => { /* sin archivo: queda el sonido procedural */ })
    }
  }

  // ----------------------------------------------------------
  // Mezclador
  // ----------------------------------------------------------
  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

  setMusicVolume(v: number): void {
    this.musicVol = v
    this.applyMusicGain()
  }

  setSfxVolume(v: number): void {
    this.sfxVol = v
    if (this.sfxBus) this.sfxBus.gain.value = v
  }

  /** baja la música durante la partida (no la apaga del todo) */
  setDuck(duck: boolean): void {
    this.duck = duck ? 0.45 : 1
    this.applyMusicGain()
  }

  private applyMusicGain(): void {
    if (this.musicBus) this.musicBus.gain.value = this.musicVol * this.duck
  }

  // ----------------------------------------------------------
  // Música de fondo (v12: lista ALTERNANTE — Musica → Musica2 → …)
  // Cada tema suena COMPLETO; al acabar su onended pasa al
  // siguiente y da la vuelta a la lista. Con una sola pista
  // disponible se queda en bucle con esa (comportamiento v5).
  // ----------------------------------------------------------
  playMusic(): void {
    if (!this.ctx) return
    this.musicPlaying = true
    this.startMusicSource()
  }

  stopMusic(): void {
    this.musicPlaying = false
    if (this.musicSrc) {
      try { this.musicSrc.stop() } catch { /* ya parado */ }
      this.musicSrc = null
    }
  }

  /** nombre (para depuración/UI) del tema que suena ahora */
  get currentTrack(): string {
    return MUSIC_PLAYLIST[this.musicTrack] ?? 'music'
  }

  private startMusicSource(): void {
    if (!this.ctx || this.musicSrc) return
    // el tema actual, y si aún no llegó, el primero que SÍ esté
    const available = MUSIC_PLAYLIST.filter(k => this.samples.has(k))
    if (available.length === 0) return
    let key: (typeof MUSIC_PLAYLIST)[number] = MUSIC_PLAYLIST[this.musicTrack]
    if (!available.includes(key)) key = available[0]
    const buf = this.samples.get(key)!
    this.musicTrack = MUSIC_PLAYLIST.indexOf(key)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    // v12: sin loop por tema — el onended avanza la lista;
    // si solo hay UN tema cargado, loop directo (v5 compatible)
    const single = MUSIC_PLAYLIST.filter(k => this.samples.has(k)).length <= 1
    src.loop = single
    src.connect(this.musicBus)
    if (!single) {
      src.onended = () => {
        if (this.musicSrc !== src || !this.musicPlaying) return
        this.musicSrc = null
        // siguiente tema de la lista (vuelta al empezar de nuevo)
        for (let i = 1; i <= MUSIC_PLAYLIST.length; i++) {
          const next = MUSIC_PLAYLIST[(this.musicTrack + i) % MUSIC_PLAYLIST.length]
          if (this.samples.has(next)) {
            this.musicTrack = (this.musicTrack + i) % MUSIC_PLAYLIST.length
            break
          }
        }
        this.startMusicSource()
      }
    }
    // entrada suave de 0.5 s (evita el clic al arrancar un tema)
    try {
      const t0 = this.ctx.currentTime
      this.musicBus.gain.cancelScheduledValues(t0)
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicVol * this.duck * 0.25), t0)
      this.musicBus.gain.linearRampToValueAtTime(this.musicVol * this.duck, t0 + 0.5)
    } catch { /* planning fallido: ganancia fija */ }
    src.start()
    this.musicSrc = src
  }

  // ----------------------------------------------------------
  // Utilidades de síntesis
  // ----------------------------------------------------------
  private noise(dest: AudioNode, dur: number, gain: number, filter?: { type: BiquadFilterType, freq: number, q?: number }, delay = 0): AudioBufferSourceNode {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const g = ctx.createGain()
    const t0 = ctx.currentTime + delay
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    let node: AudioNode = src
    if (filter) {
      const f = ctx.createBiquadFilter()
      f.type = filter.type
      f.frequency.value = filter.freq
      if (filter.q) f.Q.value = filter.q
      node.connect(f)
      node = f
    }
    node.connect(g)
    g.connect(dest)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
    return src
  }

  private tone(dest: AudioNode, freq: number, endFreq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    const g = ctx.createGain()
    const t0 = ctx.currentTime + delay
    osc.frequency.setValueAtTime(freq, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(dest)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  /** ruido filtrado con barrido de frecuencia (para sonidos metálicos) */
  private sweep(dest: AudioNode, dur: number, gain: number, from: number, to: number, q = 3, delay = 0): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = q
    const g = ctx.createGain()
    const t0 = ctx.currentTime + delay
    f.frequency.setValueAtTime(from, t0)
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }

  /** ganancia por distancia */
  private dGain(dist: number, maxDist = 70): number {
    return Math.max(0, 1 - dist / maxDist) ** 1.6
  }

  /** reproduce un MP3 con variación de tono (evita repetición) */
  private playSample(name: string, gain: number, rate = 1): void {
    const buf = this.samples.get(name)
    if (!buf || !this.ctx) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g)
    g.connect(this.sfxBus)
    src.start()
  }

  // ----------------------------------------------------------
  // Ambiente: viento del desierto
  // ----------------------------------------------------------
  private startAmbient(): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 400
    f.Q.value = 0.4
    const g = ctx.createGain()
    g.gain.value = 0.12
    // LFO para variar el viento
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.13
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.05
    lfo.connect(lfoGain)
    lfoGain.connect(g.gain)
    src.connect(f)
    f.connect(g)
    g.connect(this.ambBus)
    src.start()
    lfo.start()
    this.ambientNodes.push(src, lfo)
  }

  // ----------------------------------------------------------
  // Disparos: MP3 del usuario si está cargado (con caída por
  // distancia y variación de tono); síntesis como fallback
  // ----------------------------------------------------------
  gunshot(kind: string, dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist)
    if (g <= 0.01) return
    const detune = 0.94 + Math.random() * 0.12
    if (this.samples.has(kind)) {
      // escopeta: el MP3 del rifle, más grave y lento
      if (kind === 'shotgun') this.playSample('rifle', 0.75 * g, 0.72)
      else this.playSample(kind, (kind === 'sniper' ? 0.9 : 0.7) * g, detune)
      return
    }
    const bus = this.sfxBus
    switch (kind) {
      case 'pistol':
        this.noise(bus, 0.09, 0.5 * g, { type: 'highpass', freq: 800 })
        this.tone(bus, 220, 60, 0.08, 0.35 * g, 'triangle')
        break
      case 'deagle':
        this.noise(bus, 0.16, 0.7 * g, { type: 'highpass', freq: 400 })
        this.tone(bus, 160, 40, 0.15, 0.55 * g, 'triangle')
        this.tone(bus, 1100, 300, 0.05, 0.2 * g, 'square')
        break
      case 'smg':
        this.noise(bus, 0.06, 0.4 * g, { type: 'highpass', freq: 1000 })
        this.tone(bus, 300, 90, 0.05, 0.25 * g, 'triangle')
        break
      case 'shotgun':
        this.noise(bus, 0.28, 0.8 * g, { type: 'lowpass', freq: 3000 })
        this.tone(bus, 110, 30, 0.25, 0.6 * g, 'triangle')
        break
      case 'rifle':
        this.noise(bus, 0.11, 0.65 * g, { type: 'highpass', freq: 500 })
        this.tone(bus, 180, 45, 0.1, 0.45 * g, 'triangle')
        this.tone(bus, 900, 250, 0.04, 0.22 * g, 'square')
        break
      case 'sniper':
        this.noise(bus, 0.35, 0.9 * g, { type: 'lowpass', freq: 4000 })
        this.tone(bus, 90, 25, 0.3, 0.7 * g, 'triangle')
        this.tone(bus, 1400, 200, 0.12, 0.25 * g, 'sawtooth')
        // eco lejano
        if (dist > 4) this.noise(bus, 0.4, 0.12 * g, { type: 'lowpass', freq: 900 }, 0.12)
        break
    }
  }

  // ----------------------------------------------------------
  // RECARGA — sonido en capas hecho a medida (v5)
  // start = liberación del cargador
  // mag   = cargador fuera (deslizamiento metálico)
  // end   = cargador dentro + pestillo + cerrojo
  // pump  = bombeo de la escopeta (dos tiempos)
  // ----------------------------------------------------------
  dryFire(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.03, 0.25, { type: 'highpass', freq: 2500 })
    this.tone(this.sfxBus, 2000, 1500, 0.03, 0.12, 'square')
    // golpe seco del percutor
    this.noise(this.sfxBus, 0.05, 0.22, { type: 'bandpass', freq: 3200, q: 8 }, 0.02)
  }

  reload(stage: 'start' | 'mag' | 'end' | 'pump'): void {
    if (!this.ctx) return
    const bus = this.sfxBus
    const v = 0.85 + Math.random() * 0.3   // ligera variación por recarga
    if (stage === 'start') {
      // botón de liberación: clic seco + micro-resorte
      this.noise(bus, 0.035, 0.30 * v, { type: 'bandpass', freq: 2300, q: 6 })
      this.tone(bus, 1900, 1500, 0.03, 0.10 * v, 'square')
      this.sweep(bus, 0.05, 0.12 * v, 1600, 900, 8, 0.01)
    } else if (stage === 'mag') {
      // cargador deslizando hacia abajo: barrido metálico + golpe al soltarse
      this.sweep(bus, 0.17, 0.30 * v, 1500, 420, 2.5)
      this.noise(bus, 0.06, 0.26 * v, { type: 'lowpass', freq: 900 }, 0.16)
      this.tone(bus, 320, 120, 0.07, 0.16 * v, 'triangle', 0.17)
    } else if (stage === 'end') {
      // cargador entrando a presión: golpe hueco + pestillo + cerrojo atrás/adelante
      this.noise(bus, 0.05, 0.40 * v, { type: 'lowpass', freq: 600 })
      this.tone(bus, 150, 62, 0.08, 0.34 * v, 'sine')
      this.noise(bus, 0.04, 0.30 * v, { type: 'bandpass', freq: 2700, q: 7 }, 0.05)   // pestillo
      this.sweep(bus, 0.09, 0.34 * v, 950, 2200, 4, 0.10)                             // cerrojo atrás
      this.noise(bus, 0.05, 0.42 * v, { type: 'bandpass', freq: 1900, q: 5 }, 0.19)   // suelta
      this.tone(bus, 3150, 2500, 0.16, 0.10 * v, 'triangle', 0.20)                    // ring metálico
    } else if (stage === 'pump') {
      // escopeta: corredera atrás (t0) y adelante (t+0.12)
      this.sweep(bus, 0.10, 0.42 * v, 700, 1500, 3)
      this.noise(bus, 0.05, 0.34 * v, { type: 'bandpass', freq: 1300, q: 4 })
      this.sweep(bus, 0.08, 0.38 * v, 1700, 800, 3, 0.13)
      this.noise(bus, 0.05, 0.40 * v, { type: 'bandpass', freq: 2100, q: 6 }, 0.20)
      this.tone(bus, 2900, 2300, 0.12, 0.10 * v, 'triangle', 0.21)
    }
  }

  draw(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.08, 0.15, { type: 'highpass', freq: 1200 })
    this.tone(this.sfxBus, 900, 1300, 0.07, 0.12, 'triangle')
  }

  knifeSwing(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.12, 0.25, { type: 'bandpass', freq: 1800, q: 3 })
  }

  // ----------------------------------------------------------
  // Feedback de combate
  // ----------------------------------------------------------
  hitmarker(headshot = false): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, headshot ? 2100 : 1500, headshot ? 1900 : 1200, 0.05, 0.22, 'square')
    if (headshot) this.tone(this.sfxBus, 2800, 2400, 0.07, 0.15, 'sine', 0.03)
  }

  killConfirm(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 900, 1400, 0.08, 0.2, 'triangle')
    this.tone(this.sfxBus, 1400, 1900, 0.1, 0.2, 'triangle', 0.07)
  }

  playerHurt(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 200, 90, 0.15, 0.3, 'sawtooth')
    this.noise(this.sfxBus, 0.12, 0.18, { type: 'lowpass', freq: 500 })
  }

  impact(dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist, 50)
    if (g <= 0.01) return
    this.noise(this.sfxBus, 0.06, 0.3 * g, { type: 'bandpass', freq: 2200, q: 1.2 })
    this.tone(this.sfxBus, 700, 200, 0.05, 0.12 * g, 'square')
  }

  fleshHit(dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist, 40)
    if (g <= 0.02) return
    this.noise(this.sfxBus, 0.08, 0.4 * g, { type: 'lowpass', freq: 600 })
    this.tone(this.sfxBus, 150, 60, 0.07, 0.3 * g, 'sine')
  }

  explosion(dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist, 90)
    if (g <= 0.02) return
    const bus = this.sfxBus
    this.noise(bus, 0.9, 1.0 * g, { type: 'lowpass', freq: 500 })
    this.tone(bus, 70, 18, 0.8, 0.9 * g, 'triangle')
    this.tone(bus, 300, 40, 0.3, 0.4 * g, 'sawtooth')
    this.noise(bus, 0.5, 0.3 * g, { type: 'lowpass', freq: 1200 }, 0.15)
  }

  grenadeBounce(dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist, 30)
    if (g <= 0.03) return
    this.tone(this.sfxBus, 800, 300, 0.06, 0.2 * g, 'triangle')
  }

  throwSound(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.1, 0.15, { type: 'bandpass', freq: 1400, q: 2 })
  }

  // ----------------------------------------------------------
  // Pasos
  // ----------------------------------------------------------
  footstep(dist = 0, own = false): void {
    if (!this.ctx) return
    const g = own ? 0.14 : this.dGain(dist, 22) * 0.5
    if (g <= 0.01) return
    this.noise(this.sfxBus, 0.07, g, { type: 'bandpass', freq: own ? 500 : 700, q: 0.8 })
    this.tone(this.sfxBus, 130, 70, 0.06, g * 0.7, 'sine')
  }

  jump(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.08, 0.12, { type: 'lowpass', freq: 400 })
  }

  land(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.1, 0.2, { type: 'lowpass', freq: 300 })
    this.tone(this.sfxBus, 100, 50, 0.09, 0.18, 'sine')
  }

  // ----------------------------------------------------------
  // UI y estado
  // ----------------------------------------------------------
  uiClick(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 1200, 900, 0.04, 0.15, 'square')
  }

  buy(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 700, 1100, 0.07, 0.16, 'triangle')
    this.tone(this.sfxBus, 1100, 1600, 0.08, 0.14, 'triangle', 0.06)
  }

  /** Recogida de poción/botiquín (burbujeo ascendente) */
  pickup(shield = false): void {
    if (!this.ctx) return
    const base = shield ? 500 : 620
    this.tone(this.sfxBus, base, base * 1.6, 0.09, 0.18, 'sine')
    this.tone(this.sfxBus, base * 1.3, base * 2.1, 0.1, 0.14, 'sine', 0.07)
    this.tone(this.sfxBus, base * 1.8, base * 2.6, 0.12, 0.1, 'sine', 0.14)
  }

  roundStart(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 400, 400, 0.12, 0.25, 'triangle')
    this.tone(this.sfxBus, 500, 500, 0.12, 0.25, 'triangle', 0.15)
    this.tone(this.sfxBus, 650, 650, 0.25, 0.28, 'triangle', 0.3)
  }

  /** v13.3: rumbo grave del avión de transporte durante la cinemática */
  planeFlyby(dur = 13): void {
    if (!this.ctx) return
    const bus = this.sfxBus
    const d = Math.min(10, dur)
    // dos sawtooth graves desafinados = batido de hélices + aire de fondo
    this.tone(bus, 58, 44, d, 0.15, 'sawtooth')
    this.tone(bus, 61, 46, d, 0.11, 'sawtooth')
    this.tone(bus, 116, 88, d * 0.8, 0.045, 'triangle', d * 0.2)
    this.noise(bus, d, 0.07, { type: 'lowpass', freq: 640 })
  }

  /** v13.3: apertura del paracaídas (golpe de tela) */
  chuteOpen(dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist, 80)
    if (g <= 0.02) return
    this.noise(this.sfxBus, 0.4, 0.5 * g, { type: 'bandpass', freq: 720, q: 0.6 })
    this.tone(this.sfxBus, 190, 85, 0.25, 0.2 * g, 'sine')
  }

  roundEnd(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 600, 300, 0.3, 0.25, 'triangle')
    this.tone(this.sfxBus, 450, 220, 0.4, 0.22, 'triangle', 0.25)
  }

  deathSound(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 300, 60, 0.5, 0.4, 'sawtooth')
    this.noise(this.sfxBus, 0.3, 0.2, { type: 'lowpass', freq: 400 })
  }

  announceDing(): void {
    if (!this.ctx) return
    this.tone(this.sfxBus, 1600, 1600, 0.1, 0.12, 'sine')
    this.tone(this.sfxBus, 2100, 2100, 0.14, 0.1, 'sine', 0.08)
  }
}
