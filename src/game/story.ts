// ============================================================
// EMERGENCY STRIKE — Director del MODO HISTORIA (v6)
// "OPERACIÓN CENIZA" en el VALLE SERENO: 6 capítulos, ~25-30
// minutos. Cada capítulo abre con una CINEMÁTICA de cámara
// (sobrevuelo con barras de cine, título y subtítulo, omisible),
// objetivos con balizas 3D, diálogos de radio por capítulo,
// temporizadores, jefe final y extracción cronometrada.
//
// Cap 1 LA INSERCIÓN  — recoger 3 inteligencias (pueblo)
// Cap 2 EL SITIO      — sobrevivir defendiendo el enlace
// Cap 3 SABOTAJE      — cargas en las 3 antenas + escape
// Cap 4 EL PRISIONERO — liberar al sargento y sobrevivir la alarma
// Cap 5 EL COMANDANTE — eliminar al Cnel. Vega
// Cap 6 LA EXTRACCIÓN — correr al helipuerto contra reloj
// ============================================================
import * as THREE from 'three'
import type { Game } from './engine'
import { useGame } from './store'
import {
  STORY_INTEL, STORY_UPLINK, STORY_ANTENNAS, STORY_PRISONER, STORY_EXTRACTION,
  type StoryObjective, type NetSnapshot,
} from './shared'

interface Marker {
  obj: StoryObjective
  group: THREE.Group
  beam: THREE.Mesh
  ring: THREE.Mesh
  label: THREE.Sprite
  done: boolean
}

const N_CHAPTERS = 6

const t1000 = (): number => performance.now()

const CHAPTER_TITLES = [
  'CAPÍTULO 1 · LA INSERCIÓN',
  'CAPÍTULO 2 · EL SITIO',
  'CAPÍTULO 3 · SABOTAJE',
  'CAPÍTULO 4 · EL PRISIONERO',
  'CAPÍTULO 5 · EL COMANDANTE',
  'CAPÍTULO 6 · LA EXTRACCIÓN',
]

/** subtítulo de localización mostrado en la cinemática del capítulo */
const CHAPTER_PLACES = [
  'VALLE SERENO · RIBERA SUR DEL RÍO',
  'PUEBLO ALBA · DEFENSA DEL ENLACE',
  'COMPLEJO CENIZA · TRES ANTENAS',
  'PRISIÓN DEL COMPLEJO · RESCATE',
  'Cnel. VEGA · OBJETIVO PRIORITARIO',
  'EXTRACCIÓN · HELIPUERTO NORTE',
]

/** punto de control (teletransporte) al activar cada capítulo */
const CHAPTER_START: { x: number; z: number; yaw: number }[] = [
  { x: 0, z: 54, yaw: 0 },       // ribera sur, mirando al norte
  { x: 0, z: 24, yaw: 0 },       // entrada sur del pueblo
  { x: 0, z: -12, yaw: 0 },      // puerta sur del complejo
  { x: 0, z: -30, yaw: -0.78 },  // patio, mirando a la prisión
  { x: 8, z: -26, yaw: 0.2 },    // patio este, mirando al comando
  { x: 0, z: -38, yaw: 0 },      // patio norte, puerta del helipuerto
]

/** diálogos de radio por capítulo (quien habla, texto) */
const RADIO: { who: string; text: string }[][] = [
  [
    { who: 'MANDO', text: 'Operativo, has cruzado la sierra. El Valle Sereno duerme al atardecer.' },
    { who: 'MANDO', text: 'Tres inteligencias esperan: el MOLINO, la CAPILLA en ruinas y la TORRE DE VIGÍA.' },
    { who: 'RED', text: 'Te siento en el canal. Soy Red, tu apoyo en la red. Muévete con cuidado.' },
    { who: 'MANDO', text: 'Primera inteligencia recuperada. Quedan dos.' },
    { who: 'RED', text: 'Los milicianos patrullan el pueblo. No dejes que te rodeen.' },
    { who: 'MANDO', text: 'Intel completa. El plan de invasión ya es nuestro. Avanzamos.' },
  ],
  [
    { who: 'RED', text: 'Subo el enlace desde la plaza del pueblo… ¡van a venir directos a por mí!' },
    { who: 'RED', text: 'Transmisión al 50 %. ¡Aguanta el asedio!' },
    { who: 'MANDO', text: 'Refuerzos enemigos en camino. No claudiques.' },
    { who: 'RED', text: '¡Últimos segundos! Aguanten…' },
    { who: 'RED', text: '¡ENLACE COMPLETO! Tienen el plan de defensa completo.' },
  ],
  [
    { who: 'MANDO', text: 'Tres antenas guían sus defensas: ALFA en la colina, BRAVO al oeste, CHARLIE junto al helipuerto.' },
    { who: 'RED', text: 'Coloca una carga en cada mástil. Mantén la tecla de interactuar.' },
    { who: 'MANDO', text: 'Cargas colocadas. ¡Apártate, van a volar los repetidores!' },
    { who: 'RED', text: '¡Qué espectáculo! Red enemiga: destruida.' },
    { who: 'MANDO', text: 'El complejo queda ciego. Siguiente fase.' },
  ],
  [
    { who: 'RED', text: 'Detecto un prisionero en la celda este… es el Sargento Ríos, resistencia local.' },
    { who: 'MANDO', text: 'Rescátalo. La prisión está en el ala este del complejo.' },
    { who: 'RÍOS', text: 'Gracias, operativo… la llave del comandante ya es tuya. Cubre mi huida.' },
    { who: 'MANDO', text: '¡La alarma ha saltado! Sobrevive mientras Ríos escapa.' },
    { who: 'RÍOS', text: '¡Estoy fuera! Vega está en el edificio de comando. Acaba con esto.' },
    { who: 'MANDO', text: 'Capítulo superado. El complejo es tuyo… casi.' },
  ],
  [
    { who: 'MANDO', text: 'El Cnel. Vega comanda desde el norte del patio. Blindado y letal.' },
    { who: 'RED', text: '¡Vega abatido! Helicóptero en camino al helipuerto norte.' },
    { who: 'MANDO', text: '¡Vamos operativo! Corre a la EXTRACCIÓN.' },
    { who: 'MANDO', text: 'La puerta norte está abierta. ¡Muévete!' },
  ],
  [
    { who: 'MANDO', text: 'El helicóptero mantiene posición 150 segundos. ¡Corre por la puerta norte!' },
    { who: 'RED', text: 'Vientos de cola, operativo. El valle ya es leyenda.' },
    { who: 'MANDO', text: '¡Ahí viene! Últimos metros.' },
    { who: 'MANDO', text: 'Operación Ceniza completada. Sacúdete el polvo, héroe.' },
  ],
]

/** rutas de cámara de la cinemática de cada capítulo (VALLE SERENO) */
const CHAPTER_CINES: { points: [number, number, number][]; looks: [number, number, number][]; dur: number }[] = [
  {   // 1 · LA INSERCIÓN: desde la sierra sur, sobre el río y el pueblo,
    //     vuelve a caer junto al operativo en la ribera
    points: [[8, 36, 96], [4, 20, 66], [0, 10, 44], [-6, 6, 26], [0, 4, 18], [6, 3, 32], [0, 1.9, 50]],
    looks: [[0, 3, 60], [0, 2, 44], [0, 2, 20], [0, 1.5, 13], [0, 1.5, 13], [0, 2, 16], [0, 2, 36]],
    dur: 12,
  },
  {   // 2 · EL SITIO: barrido del pueblo hasta la entrada sur de la plaza
    points: [[-38, 26, 34], [-18, 14, 22], [0, 9, 4], [14, 6, 18], [0, 2.2, 28]],
    looks: [[-8, 2, 18], [0, 2, 16], [0, 1.6, 12], [0, 1.6, 10], [0, 1.6, 10]],
    dur: 10,
  },
  {   // 3 · SABOTAJE: sobre el muro norte, helipuerto y antenas
    points: [[0, 30, -84], [0, 16, -62], [26, 10, -50], [28, 7, -30], [6, 5, -28], [0, 2.0, -14]],
    looks: [[0, 2, -60], [0, 2, -60], [30, 2, -50], [14, 1.5, -26], [0, 1.5, -30], [0, 1.5, -30]],
    dur: 12,
  },
  {   // 4 · EL PRISIONERO: descenso del muro norte hasta la celda,
    //     luego al patio junto al comando
    points: [[0, 14, -70], [14, 9, -60], [26, 6, -50], [22, 3.4, -46], [8, 2.6, -36], [0, 2.4, -30]],
    looks: [[0, 2, -60], [10, 1.5, -50], [20, 1.5, -44], [20, 1.2, -44], [12, 1.4, -40], [16, 1.2, -42]],
    dur: 10,
  },
  {   // 5 · EL COMANDANTE: rastreo bajo y dramático del patio
    points: [[-24, 4, -46], [-12, 3.2, -40], [-4, 2.6, -38], [6, 3.0, -38], [8, 1.9, -26]],
    looks: [[0, 1.8, -40], [0, 1.8, -40], [0, 1.8, -42], [0, 1.8, -42], [0, 1.8, -40]],
    dur: 9,
  },
  {   // 6 · EXTRACCIÓN y FINAL: órbita del helipuerto al atardecer
    points: [[20, 12, -74], [18, 9, -62], [0, 7, -48], [-16, 8, -58], [-14, 10, -70], [0, 2.2, -46]],
    looks: [[0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 1.6, -60]],
    dur: 12,
  },
]

export class StoryDirector {
  private game: Game
  private scene: THREE.Scene
  private chapter = 0          // 0..5
  private markers: Marker[] = []
  private dialogueLine = -1
  private dialogueT = 0
  /** segundos restantes del temporizador activo (0 = ninguno) */
  private timer = 0
  /** progreso del capítulo (texto) */
  private progress = ''
  private objective = ''
  private holdT = 0            // tiempo manteniendo E sobre un objetivo
  private holdTarget: Marker | null = null
  private startedAt = 0
  private kills = 0
  private lastKillId = 0
  private bossSpawned = false
  private bossDead = false
  /** capítulo activo de verdad (la cinemática ya terminó) */
  private chapterLive = false
  private finished = false
  private beaconMat!: THREE.MeshBasicMaterial

  constructor(game: Game) {
    this.game = game
    this.scene = game.getStoryScene()
  }

  /** acceso a la escena/estado — el motor lo llama al iniciar */
  begin(): void {
    useGame.getState().setStory({ active: true, chapter: 1, status: 'playing' })
    this.startedAt = performance.now()
    this.setChapter(0, true)
  }

  // ----------------------------------------------------------
  // Capítulos
  // ----------------------------------------------------------
  private setChapter(n: number, withCine: boolean): void {
    this.chapter = n
    this.scheduled = null
    this.clearMarkers()
    this.dialogueLine = -1
    this.timer = 0
    this.holdT = 0
    this.holdTarget = null
    this.chapterLive = false
    this.siegeDone = false
    this.siegeHalf = false
    this.siegeQuarter = false
    this.boomDone = false
    this.rescueFreed = false
    this.rescueDone = false
    this.bossSpawned = false
    this.bossDead = false
    const st = { chapter: n + 1, chapterTitle: CHAPTER_TITLES[n], timer: 0, progress: '', hint: '', objective: '' }

    // objetivo de cabecera (se pule al activar el capítulo)
    const OBJECTIVES = [
      'Recupera las 3 INTELIGENCIAS del pueblo',
      'DEFIENDE el enlace hasta completar la subida',
      'SABOTEA las 3 antenas (mantén E)',
      'Libera al SARGENTO RÍOS',
      'Elimina al CNEL. VEGA',
      'Alcanza la EXTRACCIÓN antes de que despegue',
    ]
    this.objective = OBJECTIVES[n]
    st.objective = this.objective
    useGame.getState().setStory(st)

    if (withCine) {
      // cinemática de capítulo → al terminar (u omitirse) se activa
      const c = CHAPTER_CINES[n]
      this.game.playStoryCine({
        points: c.points.map(p => new THREE.Vector3(...p)),
        looks: c.looks.map(p => new THREE.Vector3(...p)),
        dur: c.dur,
        title: 'OPERACIÓN CENIZA',
        subtitle: CHAPTER_PLACES[n],
        onDone: () => this.activateChapter(),
      })
    } else {
      this.activateChapter()
    }
  }

  /** arranca el capítulo de verdad: posición, balizas, diálogos, red */
  private activateChapter(): void {
    const n = this.chapter
    this.chapterLive = true
    const cp = CHAPTER_START[n]
    this.game.setPlayerPos(cp.x, cp.z, cp.yaw)
    this.game.audio.roundStart()

    const st: Partial<ReturnType<typeof useGame.getState>['story']> = {}

    if (n === 0) {
      this.spawnMarkers(STORY_INTEL, 0xd9a05b)
      this.nextDialogue()
      st.progress = '0 / 3'
      st.timer = 0
    } else if (n === 1) {
      this.spawnMarkers([STORY_UPLINK], 0x4ade80)
      this.timer = 240            // 4 minutos de asedio
      this.nextDialogue()
      st.timer = 240
      // recompensa de supervivencia: un AR-47 para el resto de la misión
      this.game.net.sendStoryCmd({ cmd: 'give', weapon: 'ar47' })
    } else if (n === 2) {
      this.spawnMarkers(STORY_ANTENNAS, 0xf87171)
      this.nextDialogue()
      st.progress = '0 / 3'
    } else if (n === 3) {
      this.spawnMarkers([STORY_PRISONER], 0x60a5fa)
      this.nextDialogue()
      st.progress = 'CAUTIVO'
    } else if (n === 4) {
      this.objective = 'Elimina al CNEL. VEGA'
      this.game.net.sendStoryCmd({ cmd: 'boss' })
      this.nextDialogue()
      st.progress = 'OBJETIVO PRIORITARIO'
    } else {
      // capítulo 6: extracción cronometrada
      this.timer = 150
      this.spawnMarkers([STORY_EXTRACTION], 0x4ade80)
      this.nextDialogue()
      st.timer = 150
      this.objective = 'EXTRACCIÓN en el helipuerto norte'
      st.objective = this.objective
      this.game.audio.announceDing()
    }
    useGame.getState().setStory(st)
  }

  private completeChapter(): void {
    if (this.chapter >= N_CHAPTERS - 1) return
    this.nextDialogue()
    this.game.audio.roundEnd()
    this.setChapter(this.chapter + 1, true)
  }

  // ----------------------------------------------------------
  // Balizas de objetivos
  // ----------------------------------------------------------
  private spawnMarkers(objs: StoryObjective[], color: number): void {
    this.beaconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })
    for (const o of objs) this.spawnMarker(o)
  }

  private spawnMarker(o: StoryObjective): void {
    const group = new THREE.Group()
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 26, 10, 1, true),
      this.beaconMat,
    )
    beam.position.y = 13
    group.add(beam)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 28),
      new THREE.MeshBasicMaterial({ color: this.beaconMat.color.getHex(), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    group.add(ring)
    const label = this.makeLabel(o.label)
    label.position.y = 2.6
    group.add(label)
    group.position.set(o.x, 0, o.z)
    this.scene.add(group)
    this.markers.push({ obj: o, group, beam, ring, label, done: false })
  }

  private makeLabel(text: string): THREE.Sprite {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 128
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(10,12,10,0.82)'
    ctx.fillRect(0, 34, 512, 60)
    ctx.strokeStyle = 'rgba(217,160,91,0.9)'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 34, 512, 60)
    ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif'
    ctx.fillStyle = '#ffe9c4'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 66)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    sprite.scale.set(7.5, 1.9, 1)
    return sprite
  }

  private clearMarkers(): void {
    for (const m of this.markers) {
      this.scene.remove(m.group)
      m.label.material.dispose()
      ;(m.ring.material as THREE.Material).dispose()
    }
    this.markers.length = 0
    this.beaconMat?.dispose()
  }

  /** marcadores para el minimapa (los dibuja el motor) */
  minimapMarkers(): { x: number; z: number; color: string }[] {
    const out: { x: number; z: number; color: string }[] = []
    for (const m of this.markers) {
      if (m.done) continue
      out.push({ x: m.obj.x, z: m.obj.z, color: '#ffb547' })
    }
    return out
  }

  // ----------------------------------------------------------
  // Diálogos de radio
  // ----------------------------------------------------------
  private nextDialogue(): void {
    const lines = RADIO[this.chapter]
    if (!lines) return
    this.dialogueLine++
    if (this.dialogueLine >= lines.length) { this.dialogueLine = lines.length - 1; return }
    useGame.getState().setStory({ dialogue: lines[this.dialogueLine] })
    this.dialogueT = 6.5
  }

  // ----------------------------------------------------------
  // Bucle
  // ----------------------------------------------------------
  update(dt: number, t: number): void {
    if (this.finished) return
    const st = useGame.getState()
    if (st.phase !== 'playing' && st.phase !== 'dead') return
    // durante la cinemática el capítulo no avanza (el jugador no juega):
    // invulnerable mientras no pueda moverse
    // transición aplazada (inmune a la limitación de setTimeout)
    if (this.scheduled && performance.now() >= this.scheduled.at) {
      const fn = this.scheduled.fn
      this.scheduled = null
      fn()
    }
    if (st.cineActive) {
      if (!this.cineProtected) {
        this.cineProtected = true
        this.game.net.sendStoryCmd({ cmd: 'protect', count: 22 })
      }
      return
    }
    this.cineProtected = false

    // diálogo en pantalla
    if (this.dialogueT > 0) {
      this.dialogueT -= dt
      if (this.dialogueT <= 0) useGame.getState().setStory({ dialogue: null })
    }

    // balizas: pulso
    for (const m of this.markers) {
      if (m.done) continue
      const pulse = 0.35 + 0.3 * Math.sin(t * 3)
      ;(m.beam.material as THREE.MeshBasicMaterial).opacity = pulse
      const rs = 1 + 0.35 * Math.sin(t * 3)
      m.ring.scale.set(rs, rs, 1)
      m.label.position.y = 2.6 + 0.18 * Math.sin(t * 2)
    }

    // estadísticas
    const kills = this.countKills()
    const time = (performance.now() - this.startedAt) / 1000

    if (!this.chapterLive) return

    // ---- lógica por capítulo ----
    if (this.chapter === 0) this.updateIntel(dt)
    else if (this.chapter === 1) this.updateSiege(dt)
    else if (this.chapter === 2) this.updateSabotage(dt)
    else if (this.chapter === 3) this.updateRescue(dt)
    else if (this.chapter === 4) this.updateBoss(dt)
    else this.updateExtraction(dt)

    // temporizador visible
    const timer = Math.ceil(Math.max(0, this.timer))
    useGame.getState().setStory({
      timer,
      stats: { time: Math.round(time), kills },
    })
  }

  /** Cap 1: acercarse a las balizas las recoge */
  private updateIntel(dt: number): void {
    void dt
    let done = 0
    for (const m of this.markers) {
      if (m.done) { done++; continue }
      if (this.game.dead) break
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 2.6) {
        m.done = true
        this.scene.remove(m.group)
        this.game.audio.pickup(false)
        this.game.audio.announceDing()
        done++
        this.progress = `${done} / 3`
        useGame.getState().setStory({ progress: this.progress })
        this.nextDialogue()
        // capítulo 1: entrega una MP-9 para el asedio
        if (done === 1) this.game.net.sendStoryCmd({ cmd: 'give', weapon: 'mp9' })
        if (done === 3) {
          this.schedule(1.4, () => this.completeChapter())
        }
      }
    }
  }

  /** Cap 2: sobrevivir 240 s cerca del enlace */
  private updateSiege(dt: number): void {
    const up = this.markers[0]
    this.timer = Math.max(0, this.timer - dt)
    const d = up ? Math.hypot(this.game.pos.x - up.obj.x, this.game.pos.z - up.obj.z) : 0
    const far = d > 26
    useGame.getState().setStory({
      hint: far ? '¡VUELVE AL ENLACE! La subida se interrumpe si te alejas' : '',
      timer: Math.ceil(this.timer),
    })
    // oleadas: los enemigos convergen sobre el enlace cada 22 s
    if (t1000() - this.siegeWaveAt > 22000) {
      this.siegeWaveAt = t1000()
      this.game.net.sendStoryCmd({ cmd: 'attack', x: STORY_UPLINK.x, z: STORY_UPLINK.z })
    }
    if (far) return      // el temporizador no avanza lejos del enlace
    const half = this.timer < 120
    const quarter = this.timer < 60
    if (half && !this.siegeHalf) {
      this.siegeHalf = true
      this.nextDialogue()
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 3 })
    }
    if (quarter && !this.siegeQuarter) {
      this.siegeQuarter = true
      this.nextDialogue()
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 2 })
    }
    if (this.timer <= 0 && !this.siegeDone) {
      this.siegeDone = true
      this.schedule(1.2, () => this.completeChapter())
    }
  }

  private siegeHalf = false
  private siegeQuarter = false
  private siegeDone = false
  private siegeWaveAt = 0

  /** Cap 3: mantener E junto a cada antena */
  private updateSabotage(dt: number): void {
    const code = this.game.bindCode('zipline') || 'KeyE'
    const held = this.game.heldKeys().has(code)
    let done = 0
    let near: Marker | null = null
    for (const m of this.markers) {
      if (m.done) { done++; continue }
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 3.2) near = m
    }
    if (near) {
      if (held && !this.game.dead) {
        this.holdT += dt
        this.holdTarget = near
        if (this.holdT >= 2.5) {
          near.done = true
          this.scene.remove(near.group)
          this.holdT = 0
          this.holdTarget = null
          done++
          this.game.audio.reload('pump')
          this.game.audio.announceDing()
          this.nextDialogue()
          useGame.getState().setStory({ progress: `${done} / 3` })
          if (done === 3) {
            // cuenta atrás de explosión
            this.timer = 45
            this.objective = '¡APÁRTATE! Cargas activas'
            useGame.getState().setStory({ objective: this.objective })
          }
        }
      } else if (this.holdTarget === near) {
        this.holdT = Math.max(0, this.holdT - dt * 3)
      }
      const pct = Math.round((this.holdT / 2.5) * 100)
      useGame.getState().setStory({
        hint: this.holdT > 0.05 ? `COLOCANDO CARGA… ${pct}%` : 'MANTÉN [E] PARA COLOCAR LA CARGA',
      })
    } else {
      this.holdT = 0
      this.holdTarget = null
      useGame.getState().setStory({ hint: '' })
    }
    // fase de explosión: cuenta atrás y ¡bum! (una sola vez)
    if (this.timer > 0 && !this.boomDone) {
      this.timer = Math.max(0, this.timer - dt)
      useGame.getState().setStory({ timer: Math.ceil(this.timer) })
      if (this.timer <= 0) {
        this.boomDone = true
        for (const a of STORY_ANTENNAS) this.game.onGrenadeExplode([a.x, 1.5, a.z])
        this.game.audio.explosion(0)
        this.game.audio.roundEnd()
        this.schedule(1.6, () => this.completeChapter())
      }
    }
  }

  private boomDone = false

  /** Cap 4: liberar al prisionero (mantener E) y sobrevivir la alarma 75 s */
  private rescueFreed = false
  private rescueDone = false

  private updateRescue(dt: number): void {
    const code = this.game.bindCode('zipline') || 'KeyE'
    const held = this.game.heldKeys().has(code)

    if (!this.rescueFreed) {
      const m = this.markers[0]
      if (!m || m.done) return
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 3.4) {
        if (held && !this.game.dead) {
          this.holdT += dt
          if (this.holdT >= 3.0) {
            this.rescueFreed = true
            m.done = true
            this.scene.remove(m.group)
            this.holdT = 0
            this.timer = 75          // alarma: sobrevivir mientras Ríos huye
            this.nextDialogue()
            this.objective = 'SOBREVIVE la alarma mientras Ríos escapa'
            useGame.getState().setStory({ objective: this.objective, progress: 'ALERTA MÁXIMA', timer: 75 })
            this.game.audio.announceDing()
            this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 4 })
          }
        } else {
          this.holdT = Math.max(0, this.holdT - dt * 3)
        }
        const pct = Math.round((this.holdT / 3.0) * 100)
        useGame.getState().setStory({
          hint: this.holdT > 0.05 ? `ABRIENDO LA CELDA… ${pct}%` : 'MANTÉN [E] PARA LIBERAR AL PRISIONERO',
        })
      } else {
        this.holdT = 0
        useGame.getState().setStory({
          hint: `PRISIONERO A ${Math.round(d)} m · alcanza la celda y mantén [E]`,
        })
      }
      return
    }

    // fase de alarma: cronómetro con refuerzo final y presión constante
    this.timer = Math.max(0, this.timer - dt)
    useGame.getState().setStory({ timer: Math.ceil(this.timer) })
    if (t1000() - this.rescueWaveAt > 25000) {
      this.rescueWaveAt = t1000()
      this.game.net.sendStoryCmd({ cmd: 'attack', x: STORY_PRISONER.x, z: STORY_PRISONER.z })
    }
    if (this.timer < 30 && !this.rescueReinforced) {
      this.rescueReinforced = true
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 2 })
    }
    if (this.timer <= 0 && !this.rescueDone) {
      this.rescueDone = true
      useGame.getState().setStory({ hint: '', progress: '' })
      this.schedule(1.2, () => this.completeChapter())
    }
  }

  private rescueReinforced = false
  private rescueWaveAt = 0
  /** protección enviada al sim durante la cinemática en curso */
  private cineProtected = false
  /** acción aplazada (transiciones de capítulo: dirigida por frames,
   *  inmune a la limitación de setTimeout en pestañas ocultas) */
  private scheduled: { at: number; fn: () => void } | null = null

  private schedule(delayS: number, fn: () => void): void {
    this.scheduled = { at: performance.now() + delayS * 1000, fn }
  }

  /** Cap 5: jefe */
  private updateBoss(dt: number): void {
    void dt
    if (!this.bossSpawned) {
      this.bossSpawned = true
      return
    }
    if (!this.bossDead) {
      // el killfeed informa cuando Vega cae
      const feed = useGame.getState().killfeed
      for (const k of feed) {
        if (k.id > this.lastKillId) {
          this.lastKillId = k.id
          if (k.victim === 'Cnel. Vega') {
            this.bossDead = true
            this.nextDialogue()
            this.schedule(2.6, () => this.completeChapter())
          }
        }
      }
    }
  }

  /** Cap 6: extracción cronometrada */
  private updateExtraction(dt: number): void {
    this.timer = Math.max(0, this.timer - dt)
    const d = Math.hypot(this.game.pos.x - STORY_EXTRACTION.x, this.game.pos.z - STORY_EXTRACTION.z)
    useGame.getState().setStory({
      timer: Math.ceil(this.timer),
      hint: `EXTRACCIÓN A ${Math.round(d)} m`,
    })
    if (d < 4.5 && !this.finished) {
      this.finished = true
      this.nextDialogue()
      const time = Math.round((performance.now() - this.startedAt) / 1000)
      useGame.getState().setStory({
        hint: '',
        timer: 0,
        stats: { time, kills: this.countKills() },
      })
      this.game.audio.roundEnd()
      // cinemática final: órbita del helipuerto → pantalla de victoria
      const c = CHAPTER_CINES[5]
      this.game.playStoryCine({
        points: c.points.map(p => new THREE.Vector3(...p)),
        looks: c.looks.map(p => new THREE.Vector3(...p)),
        dur: c.dur,
        title: 'OPERACIÓN CENIZA',
        subtitle: 'MISIÓN CUMPLIDA · HÉROE DEL VALLE',
        onDone: () => {
          useGame.getState().setStory({ status: 'victory', dialogue: null })
        },
      })
      return
    }
    if (this.timer <= 0 && !this.finished) {
      // el helicóptero se fue: repetir el capítulo 6 (sin cinemática)
      this.finished = false
      useGame.getState().addAnnouncement('El helicóptero despegó sin ti… repitiendo la extracción', 'info')
      this.game.audio.announceDing()
      this.setChapter(5, false)
    }
  }

  // ----------------------------------------------------------
  // Eventos del motor
  // ----------------------------------------------------------
  onSnapshot(snap: NetSnapshot): void {
    void snap
  }

  /** el jugador murió: el capítulo en curso se reinicia sin cinemática */
  onPlayerDeath(): void {
    if (this.finished) return
    this.game.audio.announceDing()
    // el respawn del servidor tarda 3 s → reiniciar justo después
    this.schedule(3.6, () => {
      if (this.finished) return
      useGame.getState().addAnnouncement('MISIÓN: repitiendo el capítulo actual', 'info')
      // el inventario se conserva (v5); reiniciar solo el capítulo
      this.setChapter(this.chapter, false)
    })
  }

  dispose(): void {
    this.clearMarkers()
    useGame.getState().setStory({ active: false, dialogue: null, hint: '' })
  }

  private countKills(): number {
    const me = useGame.getState().playerName
    let kills = 0
    const feed = useGame.getState().killfeed
    for (const k of feed) if (k.killer === me) kills++
    return this.kills + kills
  }
}
