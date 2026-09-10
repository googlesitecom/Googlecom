// ============================================================
// FRONTERA CERO — Director del MODO HISTORIA
// Máquina de estados de 5 fases que vive DENTRO de la
// simulación (worker): controla enemigos, objetivos,
// oleadas, puntos de control y recompensas.
//
// F1 DESEMBARCO   · elimina la patrulla del muelle
// F2 SABOTAJE     · destruye 3 generadores del depósito
// F3 DEFENSA      · aguanta 90 s el patio de comunicaciones
// F4 COMANDANTE   · elimina al CNDTE. GALLO en el búnker
// F5 EXTRACCIÓN   · corre al helipuerto y sobrevive 45 s
// ============================================================
import { activeMap } from './map-types'
import type { BotDifficulty, WeaponId } from './shared'

export interface StoryState {
  phase: number
  phaseId: StoryPhaseId
  title: string
  objective: string
  progress: string
  marker: [number, number] | null
  markerKind: 'kill' | 'destroy' | 'defend' | 'boss' | 'extract' | 'none'
  timeLeft: number | null
  radio: string[]
  boss: { name: string; hp: number; maxHp: number } | null
  /** zona de compra de la fase (caja de suministros) */
  buyZone: [number, number] | null
  done: boolean
  stats: { time: number; kills: number; deaths: number; money: number }
  reward: number | null
}

export type StoryPhaseId = 'desembarco' | 'sabotaje' | 'defensa' | 'comandante' | 'extraccion' | 'completado'

/** Interfaz mínima de GameSim que usa el director */
export interface StorySimApi {
  difficulty: BotDifficulty
  addStoryBot(name: string, x: number, z: number, opts: StoryBotOpts): string
  despawnBot(id: string): void
  getPlayer(id: string): { id: string; x: number; z: number; dead: boolean; hp: number; shield: number; name: string; money: number; kills: number; deaths: number } | undefined
  setStoryCheckpoint(p: [number, number]): void
  addMoney(id: string, amount: number): void
  announce(text: string, kind: 'kill' | 'round' | 'info'): void
  damageArea(x: number, z: number, radius: number, dmg: number, attackerId: string): void
}

export interface StoryBotOpts {
  hp?: number
  shield?: number
  weapon?: WeaponId
  /** puesto de guardia (lo patrulla si no ve enemigos) */
  guardX?: number
  guardZ?: number
}

const PHASES: { id: StoryPhaseId; title: string; objective: string }[] = [
  { id: 'desembarco', title: 'FASE 1 · DESEMBARCO', objective: 'Elimina la patrulla del muelle' },
  { id: 'sabotaje', title: 'FASE 2 · SABOTAJE', objective: 'Destruye los 3 generadores del depósito' },
  { id: 'defensa', title: 'FASE 3 · DEFENSA', objective: 'Aguanta el patio de comunicaciones' },
  { id: 'comandante', title: 'FASE 4 · EL COMANDANTE', objective: 'Elimina al CNDTE. GALLO' },
  { id: 'extraccion', title: 'FASE 5 · EXTRACCIÓN', objective: 'Corre al helipuerto y sobrevive' },
  { id: 'completado', title: 'MISIÓN CUMPLIDA', objective: 'Operación Isla Gallo completada' },
]

// posiciones del mapa de historia (ISLA GALLO)
const DOCK_CENTER: [number, number] = [0, 24]
const DEFENSE_CENTER: [number, number] = [30, -16]
const BUNKER_CENTER: [number, number] = [0, -32]
const HELIPAD: [number, number] = [0, -52]
const GENERATORS: [number, number][] = [
  [-48, -8], [-42, 2], [-26, -10],
]

const HOLD_TIME = 90       // s de la fase 3
const EXTRACT_HOLD = 45    // s de la fase 5

export class StoryDirector {
  phase = 0
  phaseId: StoryPhaseId = 'desembarco'
  private sim: StorySimApi
  private t0 = Date.now()
  private lastEmit = 0
  private dirty = true
  private radioQueue: string[] = []

  // enemigos de la fase actual (ids de bots)
  private enemies: string[] = []
  // generadores
  private targets = new Map<string, { hp: number; maxHp: number; alive: boolean; x: number; z: number }>()
  private bossId: string | null = null
  private bossMaxHp = 0
  // temporizadores
  private holdT = 0
  private extractT = 0
  private extractReached = false
  private waveAt = 0
  private waveIdx = 0
  // estadísticas
  kills = 0
  playerDeaths = 0
  reward: number | null = null
  done = false

  constructor(sim: StorySimApi) {
    this.sim = sim
    for (const g of activeMap().storyTargets ?? []) {
      this.targets.set(g.id, { hp: 300, maxHp: 300, alive: true, x: g.x, z: g.z })
    }
    this.beginPhase(0)
  }

  // ------------------------------------------------------------
  // utilidades
  // ------------------------------------------------------------
  private player() { return this.sim.getPlayer('p1') }
  private dist2(ax: number, az: number, bx: number, bz: number): number {
    return Math.hypot(ax - bx, az - bz)
  }
  private say(text: string): void {
    this.radioQueue.push(text)
    this.dirty = true
  }

  private beginPhase(n: number): void {
    this.phase = n
    this.phaseId = PHASES[n].id
    this.enemies = []
    this.bossId = null
    this.holdT = 0
    this.extractT = 0
    this.extractReached = false
    this.waveIdx = 0
    this.waveAt = 0
    this.reward = null
    this.dirty = true

    switch (n) {
      case 0: { // F1 DESEMBARCO
        this.sim.setStoryCheckpoint([0, 46])
        this.say('Centro: Operación ISLA GALLO en marcha. Limpia el muelle de la patrulla.')
        this.say('Centro: Usa las cajas y contenedores como cobertura. Suerte, operador.')
        const spots: [number, number][] = [
          [-10, 26], [-3, 26], [10, 24], [16, 30], [26, 34], [30, 26],
        ]
        for (let i = 0; i < spots.length; i++) {
          this.enemies.push(this.sim.addStoryBot(`Guardia ${i + 1}`, spots[i][0], spots[i][1], {
            guardX: spots[i][0], guardZ: spots[i][1], weapon: 'mp9',
          }))
        }
        break
      }
      case 1: { // F2 SABOTAJE
        this.sim.setStoryCheckpoint([-8, 18])
        this.say('Centro: El depósito de combustible alimenta sus radares. Destrúyelo.')
        this.say('Centro: Dispara a los NÚCLEOS NARANJAS de los 3 generadores.')
        this.reward = 0 // se otorga al terminar la fase
        const guards: [number, number][] = [[-34, 4], [-25, -4], [-44, -6], [-16, -2]]
        for (let i = 0; i < guards.length; i++) {
          this.enemies.push(this.sim.addStoryBot(`Técnico ${i + 1}`, guards[i][0], guards[i][1], {
            guardX: guards[i][0], guardZ: guards[i][1], weapon: 'breacher',
          }))
        }
        break
      }
      case 2: { // F3 DEFENSA
        this.sim.setStoryCheckpoint([16, 12])
        this.say('Centro: ¡Van a reactivar sus comunicaciones! Defiende el patio 90 segundos.')
        this.say('Centro: Hay una caja de suministros junto al barracón. Pulsa B para rearmarte.')
        break
      }
      case 3: { // F4 COMANDANTE
        this.sim.setStoryCheckpoint([0, -14])
        this.say('Centro: El Comandante GALLO se atrinchera en el búnker. ¡Cárgalo!')
        this.say('GALLO: ¿Vienes a por mí, operador? ¡Ven y búscame!')
        const guards: [number, number][] = [[-9, -25], [9, -25], [-6, -36], [6, -36]]
        for (let i = 0; i < guards.length; i++) {
          this.enemies.push(this.sim.addStoryBot(`Élite ${i + 1}`, guards[i][0], guards[i][1], {
            hp: 140, shield: 50, guardX: guards[i][0], guardZ: guards[i][1], weapon: 'ar47',
          }))
        }
        this.bossId = this.sim.addStoryBot('CNDTE. GALLO', 0, -32, {
          hp: 420, shield: 150, weapon: 'cr4', guardX: 0, guardZ: -32,
        })
        this.bossMaxHp = 570
        this.enemies.push(this.bossId)
        break
      }
      case 4: { // F5 EXTRACCIÓN
        this.sim.setStoryCheckpoint([0, -28])
        this.say('Centro: ¡Helicóptero en camino! Corre al HELIPUERTO del norte.')
        this.say('Centro: Aguantad ahí 45 segundos. ¡No os mováis del pad!')
        break
      }
      case 5: { // COMPLETADO
        this.done = true
        this.sim.setStoryCheckpoint(HELIPAD)
        this.say('Centro: ¡Extracción completada! Misión cumplida, operador.')
        this.say('Centro: La Isla Gallo vuelve a estar en calma. Buen trabajo.')
        break
      }
    }
  }

  private rewardFor(n: number): number {
    return [900, 900, 1100, 1300, 2000][n] ?? 0
  }

  private finishPhase(): void {
    const r = this.rewardFor(this.phase)
    this.sim.addMoney('p1', r)
    this.reward = r
    this.sim.announce(`${PHASES[this.phase].title} COMPLETADA · +$${r}`, 'round')
    this.beginPhase(Math.min(5, this.phase + 1))
  }

  // ------------------------------------------------------------
  // notificaciones de la simulación
  // ------------------------------------------------------------
  onBotKilled(botId: string): void {
    const i = this.enemies.indexOf(botId)
    if (i === -1) return
    this.enemies.splice(i, 1)
    this.kills++
    this.dirty = true
    if (botId === this.bossId) {
      this.bossId = null
      this.sim.announce('¡COMANDANTE GALLO ELIMINADO!', 'round')
      // los guardias restantes caen con él (moral rota)
      for (const id of [...this.enemies]) this.sim.despawnBot(id)
      this.enemies = []
    }
  }

  onPlayerDeath(): void {
    this.playerDeaths++
    this.dirty = true
    this.say('Centro: Reapareces en el último punto de control. ¡Sigue intentándolo!')
  }

  /** daño a un generador; devuelve true si lo destruyó */
  onStoryTargetHit(id: string, dmg: number): boolean {
    const tg = this.targets.get(id)
    if (!tg || !tg.alive) return false
    tg.hp -= dmg
    this.dirty = true
    if (tg.hp <= 0) {
      tg.hp = 0
      tg.alive = false
      // explosión del generador: daña a los enemigos cercanos
      this.sim.damageArea(tg.x, tg.z, 7, 130, 'p1')
      this.sim.announce('GENERADOR DESTRUIDO', 'kill')
    }
    return !tg.alive
  }

  getCheckpoint(): [number, number] {
    const cps: [number, number][] = [[0, 46], [-8, 18], [16, 12], [0, -14], [0, -28], HELIPAD]
    return cps[Math.min(5, this.phase)]
  }

  /** zona de compra de la historia (caja de suministros) o null */
  getBuyZone(): [number, number] | null {
    const zones: ([number, number] | null)[] = [
      null,          // F1: sin caja
      [-8, 18],      // F2: crate del muelle
      [14, 4],       // F3: crate del barracón
      [10, -18],     // F4: crate pre-búnker
      [0, -40],      // F5: crate camino al helipuerto
      null,
    ]
    return zones[Math.min(5, this.phase)]
  }

  // ------------------------------------------------------------
  // bucle
  // ------------------------------------------------------------
  update(dt: number): void {
    if (this.done) { this.maybeEmit(); return }
    const p = this.player()
    if (!p) return

    switch (this.phase) {
      case 0: { // eliminar a todos
        if (this.enemies.length === 0) this.finishPhase()
        break
      }
      case 1: { // generadores + guardias caídos no obligatorios
        let alive = 0
        for (const tg of this.targets.values()) if (tg.alive) alive++
        if (alive === 0) this.finishPhase()
        break
      }
      case 2: { // defensa del patio
        if (p.dead) break
        const inZone = this.dist2(p.x, p.z, DEFENSE_CENTER[0], DEFENSE_CENTER[1]) < 8
        if (inZone) {
          this.holdT += dt
          this.dirty = true
        }
        // oleadas en 4 s / 34 s / 64 s de defensa
        if (this.holdT > 4 && this.waveIdx === 0) this.spawnWave(0)
        else if (this.holdT > 34 && this.waveIdx === 1) this.spawnWave(1)
        else if (this.holdT > 64 && this.waveIdx === 2) this.spawnWave(2)
        if (this.holdT >= HOLD_TIME) this.finishPhase()
        break
      }
      case 3: { // jefe
        if (this.bossId === null && this.enemies.length === 0) this.finishPhase()
        break
      }
      case 4: { // extracción
        if (p.dead) break
        if (!this.extractReached) {
          if (this.dist2(p.x, p.z, HELIPAD[0], HELIPAD[1]) < 6.5) {
            this.extractReached = true
            this.say('Centro: ¡Piloto: "Os veo, mantened la posición!" — AGUANTA 45 s.')
            // oleada final de caza
            this.spawnFinalWave()
            this.dirty = true
          }
        } else {
          this.extractT += dt
          this.dirty = true
          if (this.extractT >= EXTRACT_HOLD) this.finishPhase()
        }
        break
      }
    }
    this.maybeEmit()
  }

  private spawnWave(idx: number): void {
    this.waveIdx = idx + 1
    const spawnPts: [number, number][] = idx === 0
      ? [[44, -20], [50, -10], [30, -24], [40, -16]]
      : idx === 1
        ? [[44, -20], [50, -8], [46, -14], [30, -24], [16, -18]]
        : [[50, -12], [44, -18], [34, -22], [16, -18], [46, -6], [22, -14]]
    for (let i = 0; i < spawnPts.length; i++) {
      const [x, z] = spawnPts[i]
      this.enemies.push(this.sim.addStoryBot(`Asaltante ${idx + 1}-${i + 1}`, x, z, {
        guardX: DEFENSE_CENTER[0] + (Math.random() * 8 - 4), guardZ: DEFENSE_CENTER[1] + (Math.random() * 8 - 4),
        weapon: i % 3 === 0 ? 'ar47' : 'mp9',
      }))
    }
    this.sim.announce(`¡OLEADA ${idx + 1} ENTRANTE!`, 'kill')
    this.dirty = true
  }

  private spawnFinalWave(): void {
    const spawnPts: [number, number][] = [[24, -50], [-24, -50], [14, -44], [-14, -44], [0, -40], [10, -38]]
    for (let i = 0; i < spawnPts.length; i++) {
      this.enemies.push(this.sim.addStoryBot(`Cazador ${i + 1}`, spawnPts[i][0], spawnPts[i][1], {
        guardX: HELIPAD[0] + (Math.random() * 8 - 4), guardZ: HELIPAD[1] + (Math.random() * 6 - 3),
        weapon: i % 2 === 0 ? 'cr4' : 'ar47', hp: 120, shield: 25,
      }))
    }
    this.dirty = true
  }

  private maybeEmit(): void {
    const t = Date.now()
    if (!this.dirty && t - this.lastEmit < 1000) return
    this.lastEmit = t
    this.dirty = false
    this.emitState()
  }

  private emitState(): void {
    const p = this.player()
    const ph = PHASES[this.phase]
    let progress = ''
    let marker: [number, number] | null = null
    let markerKind: StoryState['markerKind'] = 'none'
    let timeLeft: number | null = null

    switch (this.phase) {
      case 0:
        progress = `${6 - this.enemies.length}/6 eliminados`
        marker = DOCK_CENTER
        markerKind = 'kill'
        break
      case 1: {
        let alive = 0
        for (const tg of this.targets.values()) if (tg.alive) alive++
        progress = `${3 - alive}/3 generadores`
        // marcador = generador vivo más cercano al jugador
        let best: [number, number] | null = null
        let bestD = Infinity
        if (p) {
          for (const tg of this.targets.values()) {
            if (!tg.alive) continue
            const d = this.dist2(p.x, p.z, tg.x, tg.z)
            if (d < bestD) { bestD = d; best = [tg.x, tg.z] }
          }
        }
        marker = best ?? DOCK_CENTER
        markerKind = 'destroy'
        break
      }
      case 2:
        progress = `${Math.floor(this.holdT)}/${HOLD_TIME} s`
        marker = DEFENSE_CENTER
        markerKind = 'defend'
        timeLeft = Math.max(0, Math.ceil(HOLD_TIME - this.holdT))
        break
      case 3:
        progress = this.bossId ? 'Jefe activo' : 'Búnker despejado'
        marker = BUNKER_CENTER
        markerKind = 'boss'
        break
      case 4:
        if (!this.extractReached) {
          progress = 'Corre al helipuerto'
          marker = HELIPAD
          markerKind = 'extract'
        } else {
          progress = `${Math.ceil(EXTRACT_HOLD - this.extractT)} s restantes`
          marker = HELIPAD
          markerKind = 'defend'
          timeLeft = Math.max(0, Math.ceil(EXTRACT_HOLD - this.extractT))
        }
        break
      case 5:
        progress = 'Extracción completa'
        break
    }

    let boss: StoryState['boss'] = null
    if (this.bossId) {
      const b = this.sim.getPlayer(this.bossId)
      if (b) boss = { name: b.name, hp: Math.max(0, Math.round(b.hp + b.shield)), maxHp: this.bossMaxHp }
    }

    const radio = this.radioQueue.splice(0, this.radioQueue.length)
    const stats = p
      ? { time: Math.round((Date.now() - this.t0) / 1000), kills: p.kills, deaths: p.deaths, money: p.money }
      : { time: Math.round((Date.now() - this.t0) / 1000), kills: this.kills, deaths: this.playerDeaths, money: 0 }

    const state: StoryState = {
      phase: this.phase,
      phaseId: this.phaseId,
      title: ph.title,
      objective: this.phase === 2 && this.holdT <= 0 ? `${ph.objective} (entra en el anillo)` : ph.objective,
      progress,
      marker,
      markerKind,
      timeLeft,
      radio,
      boss,
      buyZone: this.getBuyZone(),
      done: this.done,
      stats,
      reward: this.reward,
    }
    // lo emite la simulación por el evento 'storyEvent'
    this.onState?.(state)
  }

  /** enganchado por GameSim para emitir por la ruta de red */
  onState: ((s: StoryState) => void) | null = null
}
