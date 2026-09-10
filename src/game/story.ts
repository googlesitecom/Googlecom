// ============================================================
// FRONTERA CERO — Director del MODO HISTORIA
// "OPERACIÓN CENIZA": 4 capítulos en la instalación militar,
// ~15-20 minutos de juego. Objetivos con balizas 3D, diálogos
// de radio, temporizadores, jefe final y extracción.
//
// Cap 1 INFILTRACIÓN  — recoger 3 inteligencias
// Cap 2 EL SITIO      — sobrevivir defendiendo el enlace
// Cap 3 SABOTAJE      — colocar cargas en las 3 antenas
// Cap 4 EL COMANDANTE — eliminar al Cnel. Vega y extraerse
// ============================================================
import * as THREE from 'three'
import type { Game } from './engine'
import { useGame } from './store'
import {
  STORY_INTEL, STORY_UPLINK, STORY_ANTENNAS, STORY_EXTRACTION,
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

const CHAPTER_TITLES = [
  'CAPÍTULO 1 · INFILTRACIÓN',
  'CAPÍTULO 2 · EL SITIO',
  'CAPÍTULO 3 · SABOTAJE',
  'CAPÍTULO 4 · EL COMANDANTE',
]

/** diálogos de radio por capítulo (quien habla, texto) */
const RADIO: { who: string; text: string }[][] = [
  [
    { who: 'MANDO', text: 'Operativo, la brecha sur está abierta. Entra sin ruido.' },
    { who: 'MANDO', text: 'Primera inteligencia: interior del EDIFICIO DE COMANDO.' },
    { who: 'MANDO', text: 'Bien. Segunda: la estación de RADAR, al oeste.' },
    { who: 'MANDO', text: 'Última: el CUARTEL este. Cuidado con las patrullas.' },
    { who: 'MANDO', text: 'Intel completa. La Red tiene los códigos. Capítulo 1 superado.' },
  ],
  [
    { who: 'RED', text: 'Subo al enlace de comunicaciones… van a notarlo. ¡Defiéndeme!' },
    { who: 'RED', text: 'Tranmisión a un 50 %. ¡Aguanta!' },
    { who: 'RED', text: '¡Ya casi! Aguanten un poco más…' },
    { who: 'RED', text: '¡ENLACE COMPLETO! Tienen el plan de defensa completo.' },
  ],
  [
    { who: 'MANDO', text: 'Tres antenas guían sus defensas: ALFA, BRAVO y CHARLIE.' },
    { who: 'MANDO', text: 'Coloca una carga en cada una. Mantén la tecla de interactuar.' },
    { who: 'MANDO', text: 'Cargas listas. ¡Apártate, van a volar los repeitores!' },
    { who: 'MANDO', text: 'Red de comunicaciones enemiga: destruida.' },
  ],
  [
    { who: 'MANDO', text: 'El Cnel. Vega está en el complejo. Es el cerebro de todo.' },
    { who: 'MANDO', text: '¡Vega abatido! Helicóptero en camino al HELIPUERTO.' },
    { who: 'MANDO', text: '¡Vamos operativo! Corre a la EXTRACCIÓN.' },
    { who: 'MANDO', text: 'Operación Ceniza completada. Sacúdete el polvo, héroe.' },
  ],
]

export class StoryDirector {
  private game: Game
  private scene: THREE.Scene
  private chapter = 0          // 0..3
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
  private extractionOpen = false
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
    this.setChapter(0)
  }

  // ----------------------------------------------------------
  // Capítulos
  // ----------------------------------------------------------
  private setChapter(n: number): void {
    this.chapter = n
    this.clearMarkers()
    this.dialogueLine = -1
    this.timer = 0
    this.holdT = 0
    this.holdTarget = null
    this.siegeDone = false
    this.boomDone = false
    const st = { chapter: n + 1, chapterTitle: CHAPTER_TITLES[n], timer: 0, progress: '', hint: '' }

    if (n === 0) {
      this.objective = 'Recupera las 3 INTELIGENCIAS'
      this.spawnMarkers(STORY_INTEL, 0xd9a05b)
      this.nextDialogue()
      st.progress = '0 / 3'
    } else if (n === 1) {
      this.objective = 'DEFIENDE el enlace hasta completar la subida'
      this.spawnMarkers([STORY_UPLINK], 0x4ade80)
      this.timer = 240            // 4 minutos de asedio
      this.nextDialogue()
      st.timer = 240
      // recompensa de supervivencia: un AR-47 para el resto de la misión
      this.game.net.sendStoryCmd({ cmd: 'give', weapon: 'ar47' })
    } else if (n === 2) {
      this.objective = 'SABOTEA las 3 antenas (mantén E)'
      this.spawnMarkers(STORY_ANTENNAS, 0xf87171)
      this.nextDialogue()
      st.progress = '0 / 3'
    } else {
      this.objective = 'Elimina al CNEL. VEGA'
      this.game.net.sendStoryCmd({ cmd: 'boss' })
      this.spawnMarkers([], 0xffffff)
      this.nextDialogue()
    }
    useGame.getState().setStory(st)
  }

  private completeChapter(): void {
    if (this.chapter >= 3) return
    this.nextDialogue()
    this.game.audio.roundEnd()
    this.setChapter(this.chapter + 1)
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
    if (this.extractionOpen) out.push({ x: STORY_EXTRACTION.x, z: STORY_EXTRACTION.z, color: '#4ade80' })
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

    // ---- lógica por capítulo ----
    if (this.chapter === 0) this.updateIntel(dt)
    else if (this.chapter === 1) this.updateSiege(dt)
    else if (this.chapter === 2) this.updateSabotage(dt)
    else this.updateBoss(dt)

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
          setTimeout(() => this.completeChapter(), 1400)
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
    if (far) return      // el temporizador no avanza lejos del enlace
    const half = this.timer < 120
    const quarter = this.timer < 60
    if (half && !this.siegeHalf) { this.siegeHalf = true; this.nextDialogue() }
    if (quarter && !this.siegeQuarter) { this.siegeQuarter = true; this.nextDialogue() }
    if (this.timer <= 0 && !this.siegeDone) {
      this.siegeDone = true
      this.siegeHalf = false
      this.siegeQuarter = false
      setTimeout(() => this.completeChapter(), 1200)
    }
  }

  private siegeHalf = false
  private siegeQuarter = false
  private siegeDone = false

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
        setTimeout(() => this.completeChapter(), 1600)
      }
    }
  }

  private boomDone = false

  /** Cap 4: jefe + extracción */
  private updateBoss(dt: number): void {
    void dt
    if (!this.bossSpawned) {
      this.bossSpawned = true
      useGame.getState().setStory({ progress: 'OBJETIVO PRIORITARIO' })
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
            this.extractionOpen = true
            this.nextDialogue()
            setTimeout(() => this.nextDialogue(), 5000)
            this.spawnMarkers([STORY_EXTRACTION], 0x4ade80)
            this.objective = 'Alcanza la EXTRACCIÓN (helipuerto norte)'
            useGame.getState().setStory({ objective: this.objective, progress: '' })
            this.game.audio.roundStart()
          }
        }
      }
      return
    }
    // extracción
    const d = Math.hypot(this.game.pos.x - STORY_EXTRACTION.x, this.game.pos.z - STORY_EXTRACTION.z)
    useGame.getState().setStory({ hint: `EXTRACCIÓN A ${Math.round(d)} m` })
    if (d < 4.5) {
      this.finished = true
      this.nextDialogue()
      const time = Math.round((performance.now() - this.startedAt) / 1000)
      useGame.getState().setStory({
        status: 'victory',
        dialogue: null,
        hint: '',
        timer: 0,
        stats: { time, kills: this.countKills() },
      })
      this.game.audio.roundEnd()
    }
  }

  // ----------------------------------------------------------
  // Eventos del motor
  // ----------------------------------------------------------
  onSnapshot(snap: NetSnapshot): void {
    void snap
  }

  /** el jugador murió: el capítulo en curso se reinicia */
  onPlayerDeath(): void {
    if (this.finished) return
    this.game.audio.announceDing()
    setTimeout(() => {
      if (this.finished) return
      useGame.getState().addAnnouncement('MISIÓN: repitiendo el capítulo actual', 'info')
      // el inventario se conserva (v5); reiniciar solo el capítulo
      this.siegeHalf = false
      this.siegeQuarter = false
      this.setChapter(this.chapter)
    }, 2200)
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
