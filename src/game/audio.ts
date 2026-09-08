// ============================================================
// FRONTERA CERO — Motor de audio procedural (Web Audio API)
// Todos los sonidos se sintetizan: sin archivos externos
// ============================================================

export class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  sfxBus!: GainNode
  ambBus!: GainNode
  noiseBuffer!: AudioBuffer
  volume = 0.7
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
    this.sfxBus.gain.value = 1
    this.sfxBus.connect(this.master)

    this.ambBus = this.ctx.createGain()
    this.ambBus.gain.value = 0.35
    this.ambBus.connect(this.master)

    // buffer de ruido blanco reutilizable (2 s)
    const len = this.ctx.sampleRate * 2
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    this.startAmbient()
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

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

  /** ganancia por distancia */
  private dGain(dist: number, maxDist = 70): number {
    return Math.max(0, 1 - dist / maxDist) ** 1.6
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
  // Disparos (por tipo de arma, con atenuación por distancia)
  // ----------------------------------------------------------
  gunshot(kind: string, dist = 0): void {
    if (!this.ctx) return
    const g = this.dGain(dist)
    if (g <= 0.01) return
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
  // Acciones del arma
  // ----------------------------------------------------------
  dryFire(): void {
    if (!this.ctx) return
    this.noise(this.sfxBus, 0.03, 0.25, { type: 'highpass', freq: 2500 })
    this.tone(this.sfxBus, 2000, 1500, 0.03, 0.12, 'square')
  }

  reload(stage: 'start' | 'mag' | 'end' | 'pump'): void {
    if (!this.ctx) return
    const bus = this.sfxBus
    if (stage === 'start') {
      this.tone(bus, 1200, 800, 0.05, 0.18, 'square')
      this.noise(bus, 0.06, 0.15, { type: 'highpass', freq: 1800 })
    } else if (stage === 'mag') {
      this.tone(bus, 500, 220, 0.08, 0.3, 'triangle')
      this.noise(bus, 0.1, 0.22, { type: 'bandpass', freq: 900, q: 1.5 })
    } else if (stage === 'end') {
      this.tone(bus, 1500, 900, 0.04, 0.22, 'square')
      this.noise(bus, 0.05, 0.2, { type: 'highpass', freq: 2000 })
    } else if (stage === 'pump') {
      this.noise(bus, 0.07, 0.3, { type: 'bandpass', freq: 700, q: 2 })
      this.tone(bus, 700, 300, 0.06, 0.25, 'square')
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
