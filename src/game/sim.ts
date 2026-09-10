// ============================================================
// EMERGENCY STRIKE — Simulación autoritativa (navegador)
// Se ejecuta en local (solo/anfitrión). Los eventos se
// enrutan al jugador local y, si lo hay, al invitado P2P.
// ============================================================
import {
  GAME, WEAPONS, BUY_ITEMS, PICKUP_INFO, computeDamage, segmentBlocked,
  WAYPOINTS, BOT_NAMES, BOT_SKILL,
  MODES, FLAG_A, FLAG_B, DOM_ZONES, getMapData,
  type MapId, type MapData,
  type Team, type WeaponId, type BodyPart, type BotDifficulty, type PickupKind, type GrenadeKind, type GameMode,
  type NetPlayerState, type NetGrenade, type NetPickup, type NetRoundState, type NetKillEvent, type NetSnapshot,
  type NetFlagState, type NetZoneState,
} from './shared'

export type RouteFn = (ev: string, data: unknown, to?: string) => void

interface BotAI {
  state: 'patrol' | 'combat' | 'hunt' | 'retreat'
  wp: number
  target: string | null
  reactAt: number
  strafe: number
  strafePhase: number
  nextShotAt: number
  burst: number
  lastScan: number
  lastSeen: number              // última vez que vio al objetivo
  lastKnown: [number, number] | null
  huntUntil: number
  retreatUntil: number
  crouchUntil: number
  aimErr: number                // error angular actual (rad)
  aimErrNext: number            // próximo re-sorteo del error
  stuckCheck: number
  lastX: number
  lastZ: number
  speedMult: number             // variación individual de velocidad
  /** CTF/DOM: papel del bot */
  role: 'attack' | 'defend'
  /** objetivo táctico (bandera/zona) en coords. mundo */
  objX: number
  objZ: number
  objUntil: number
}

interface SimPlayer {
  id: string
  name: string
  team: Team
  bot: boolean
  x: number; y: number; z: number
  yaw: number; pitch: number
  crouch: boolean
  speed: number
  hp: number
  shield: number
  dead: boolean
  respawnAt: number
  weapon: WeaponId
  owned: WeaponId[]
  /** arsenal completo (compras + cuchillo + P9): se conserva SIEMPRE */
  armory: WeaponId[]
  /** huecos de equipamiento [hueco 1, hueco 2] — el cuchillo es el hueco 3 fijo */
  slots: [WeaponId | null, WeaponId | null]
  frags: number
  smokes: number
  kills: number
  deaths: number
  money: number
  streak: number
  lastKillAt: number
  multi: number
  lastShotAt: number
  /** control de cadencia SOLO para validación de impactos (separado del visual) */
  lastHitsAt: number
  protectUntil: number
  lastSeenEnemy: number
  lastDamageAt: number
  aiming: boolean          // en pose de apuntado (para la animación)
  sprint: boolean          // corriendo (animación estilo Fortnite)
  flag: 'A' | 'B' | null   // bandera enemiga que lleva puesta (CTF)
  ai?: BotAI
}

interface SimGrenade {
  id: string
  owner: string
  team: Team
  kind: GrenadeKind
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  fuse: number
}

interface SimSmoke {
  id: string
  x: number; y: number; z: number
  radius: number
  until: number
}

interface SimPickup {
  id: string
  kind: PickupKind
  x: number; z: number
  active: boolean
  respawnAt: number
}

/** estado de una bandera de CTF */
interface SimFlag {
  team: Team                    // equipo DUEÑO de la bandera
  status: 'home' | 'carried' | 'drop'
  x: number; z: number
  carrier: string | null
  returnAt: number
}

/** estado de una zona de dominación */
interface SimZone {
  id: 'A' | 'B' | 'C'
  name: string
  x: number; z: number
  owner: Team | null
  prog: number
  by: Team | null
}

function now(): number { return Date.now() }
function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz)
}
function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)) }
function rand(a: number, b: number): number { return a + Math.random() * (b - a) }
function round2(v: number): number { return Math.round(Number(v) * 100) / 100 }

function eye(p: SimPlayer): [number, number, number] { return [p.x, p.y + 1.55, p.z] }

/** intersección segmento-esfera: ¿el humo bloquea esta línea de visión? */
function segSphereHit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, r: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az
  const fx = ax - cx, fy = ay - cy, fz = az - cz
  const len2 = dx * dx + dy * dy + dz * dz
  let tt = len2 > 0 ? -(fx * dx + fy * dy + fz * dz) / len2 : 0
  tt = Math.max(0, Math.min(1, tt))
  const px = ax + dx * tt - cx, py = ay + dy * tt - cy, pz = az + dz * tt - cz
  return px * px + py * py + pz * pz < r * r
}

function nearestWaypoint(x: number, z: number, wps: [number, number][] = WAYPOINTS): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < wps.length; i++) {
    const d = Math.hypot(wps[i][0] - x, wps[i][1] - z)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

export class GameSim {
  private players = new Map<string, SimPlayer>()
  private grenades = new Map<string, SimGrenade>()
  private smokes: SimSmoke[] = []
  private pickups: SimPickup[] = []
  private grenadeSeq = 0
  private botSeq = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick = now()
  private tickCount = 0
  private route: RouteFn | null = null
  private mode: GameMode

  // CTF
  private flags: Record<'a' | 'b', SimFlag> = {
    a: { team: 'A', status: 'home', x: FLAG_A[0], z: FLAG_A[1], carrier: null, returnAt: 0 },
    b: { team: 'B', status: 'home', x: FLAG_B[0], z: FLAG_B[1], carrier: null, returnAt: 0 },
  }
  // dominación
  private zones: SimZone[] = DOM_ZONES.map(z => ({ id: z.id, name: z.name, x: z.x, z: z.z, owner: null, prog: 0, by: null }))
  private domTickAt = 0

  private round = {
    phase: 'live' as 'live' | 'ended' | 'matchend',
    endsAt: now() + GAME.ROUND_TIME * 1000,
    intermissionEndsAt: 0,
    roundNumber: 1,
    scoresA: 0,
    scoresB: 0,
    roundWinsA: 0,
    roundWinsB: 0,
  }

  /** mapa activo (ciudad o instalación del modo historia) */
  private md: MapData

  constructor(private difficulty: BotDifficulty = 'normal', mode: GameMode = 'escaramuza', mapId: MapId = 'ciudad') {
    this.mode = mode
    this.md = getMapData(mapId)
    // en la misión no hay límite de ronda: el ritmo lo marca el director
    this.round.endsAt = now() + (mode === 'historia' ? 3_600_000 : MODES[mode].time * 1000)
    // pociones repartidas por el mapa (respawn escalonado)
    let pk = 0
    for (const s of this.md.pickups) {
      this.pickups.push({
        id: `p${pk++}`, kind: s.kind, x: s.x, z: s.z,
        active: true, respawnAt: 0,
      })
    }
  }

  /** ¿son enemigos? (en TODOS CONTRA TODOS cualquier otro jugador lo es) */
  private isEnemy(a: SimPlayer, b: SimPlayer): boolean {
    if (a.id === b.id) return false
    if (this.mode === 'ffa') return true
    return a.team !== b.team
  }

  onRoute(fn: RouteFn): void { this.route = fn }

  start(): void {
    if (this.timer) return
    this.lastTick = now()
    this.timer = setInterval(() => this.tick(), GAME.TICK)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.grenades.clear()
  }

  // ------------------------------------------------------------
  // v6.4: PAUSA real en partidas offline — el jugador pulsa ESC y TODO
  // se congela (los bots dejan de disparar). Al reanudar, los relojes
  // de ronda/respawn/IA se desplazan el tiempo pausado para que la
  // partida continúe exactamente donde estaba.
  // ------------------------------------------------------------
  pause(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.pausedAt = now()
  }

  resume(): void {
    if (this.timer) return
    const delta = Math.max(0, now() - this.pausedAt)
    if (delta > 0) {
      this.lastTick = now()
      // congelar los relojes del juego
      this.round.endsAt += delta
      if (this.round.intermissionEndsAt > 0) this.round.intermissionEndsAt += delta
      for (const p of this.players.values()) {
        p.respawnAt += delta
        if (p.lastDamageAt > 0) p.lastDamageAt += delta
        if (p.lastShotAt > 0) p.lastShotAt += delta
        if (p.lastHitsAt > 0) p.lastHitsAt += delta
        if (p.protectUntil > 0) p.protectUntil += delta
        if (p.lastSeenEnemy > 0) p.lastSeenEnemy += delta
        if (p.lastKillAt > 0) p.lastKillAt += delta
        if (p.bot && p.ai) {
          p.ai.reactAt += delta
          p.ai.nextShotAt += delta
          p.ai.lastScan += delta
          p.ai.lastSeen += delta
          p.ai.aimErrNext += delta
          p.ai.stuckCheck += delta
          p.ai.huntUntil += delta
          p.ai.retreatUntil += delta
          p.ai.crouchUntil += delta
          p.ai.objUntil += delta
        }
      }
      for (const s of this.smokes) s.until += delta
      for (const pk of this.pickups) if (pk.respawnAt > 0) pk.respawnAt += delta
      for (const fl of [this.flags.a, this.flags.b]) if (fl.returnAt > 0) fl.returnAt += delta
    }
    this.timer = setInterval(() => this.tick(), GAME.TICK)
  }

  private pausedAt = 0

  private emit(ev: string, data: unknown, to?: string): void {
    this.route?.(ev, data, to)
  }

  // ------------------------------------------------------------
  // Creación de jugadores
  // ------------------------------------------------------------
  private teamCounts(): { A: number; B: number } {
    const c = { A: 0, B: 0 }
    for (const p of this.players.values()) c[p.team]++
    return c
  }

  addBots(perTeam: number, allTeamB = false): void {
    if (allTeamB) {
      // modo historia: todos los enemigos son del bando B
      for (let i = 0; i < perTeam; i++) this.spawnBot('B')
      return
    }
    for (let t = 0; t < 2; t++) {
      const team: Team = t === 0 ? 'A' : 'B'
      for (let i = 0; i < perTeam; i++) {
        this.spawnBot(team)
      }
    }
  }

  /** v6.2: bots en cantidades distintas por bando (relleno de huecos 2v2) */
  addBotsPer(a: number, b: number): void {
    for (let i = 0; i < a; i++) this.spawnBot('A')
    for (let i = 0; i < b; i++) this.spawnBot('B')
  }

  /** v6.2: sustituye por un bot al jugador que abandona una 2v2 (mantiene
   *  el bando equilibrado: 2 operadores por lado) */
  fillTeamBot(team: Team): SimPlayer | null {
    const members = Array.from(this.players.values()).filter(p => p.team === team).length
    if (members >= 2) return null // el bando ya está completo
    return this.spawnBot(team)
  }

  private spawnBot(team: Team): SimPlayer {
    const id = `bot-${this.botSeq++}`
    let name = ''
    for (const n of BOT_NAMES) {
      if (!Array.from(this.players.values()).some(p => p.name === n)) { name = n; break }
    }
    if (!name) name = `BOT-${100 + this.botSeq}`
    const p = this.createPlayer(id, name, team, true)
    this.players.set(id, p)
    return p
  }

  join(id: string, name: string, team?: Team, announce = true): SimPlayer {
    const counts = this.teamCounts()
    const t: Team = team ?? (counts.A <= counts.B ? 'A' : 'B')
    const p = this.createPlayer(id, String(name).slice(0, 16).trim() || 'Operador', t, false)
    this.players.set(id, p)
    if (announce) {
      this.emit('playerJoined', { id, name: p.name, team: t })
      this.emit('announce', { text: `${p.name} se unió al ${t === 'A' ? 'ÁMBAR' : 'VERDE'}`, kind: 'info' })
    }
    return p
  }

  leave(id: string): void {
    const p = this.players.get(id)
    if (!p) return
    this.players.delete(id)
    this.emit('playerLeft', { id, name: p.name })
    this.emit('announce', { text: `${p.name} abandonó`, kind: 'info' })
  }

  private createPlayer(id: string, name: string, team: Team, bot: boolean): SimPlayer {
    const p: SimPlayer = {
      id, name, team, bot,
      x: 0, y: 0, z: 0,
      yaw: team === 'A' ? Math.PI * 0.75 : -Math.PI * 0.25,
      pitch: 0,
      crouch: false, speed: 0,
      hp: 100, shield: 0, dead: false, respawnAt: 0,
      weapon: 'p9',
      owned: ['knife', 'p9'],
      armory: ['knife', 'p9'],
      slots: [null, 'p9'],
      frags: 0, smokes: 0,
      kills: 0, deaths: 0, money: GAME.START_MONEY,
      streak: 0, lastKillAt: 0, multi: 0,
      lastShotAt: 0, lastHitsAt: 0, protectUntil: 0, lastSeenEnemy: 0, lastDamageAt: 0,
      aiming: false, sprint: false, flag: null,
    }
    if (bot) {
      p.ai = {
        state: 'patrol', wp: nearestWaypoint(p.x, p.z, this.md.waypoints),
        target: null, reactAt: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafePhase: Math.random() * 2,
        nextShotAt: 0, burst: 0,
        lastScan: Math.floor(Math.random() * 200), lastSeen: 0, lastKnown: null, huntUntil: 0, retreatUntil: 0, crouchUntil: 0,
        aimErr: 0, aimErrNext: 0,
        stuckCheck: now(), lastX: 0, lastZ: 0,
        speedMult: 0.88 + Math.random() * 0.26,
        role: Math.random() < 0.62 ? 'attack' : 'defend',
        objX: 0, objZ: 0, objUntil: 0,
      }
    }
    this.respawnPlayer(p, true)
    return p
  }

  private respawnPlayer(p: SimPlayer, initial = false): void {
    const idx = Array.from(this.players.values()).filter(q => q.team === p.team).indexOf(p)
    const base = p.team === 'A' ? this.md.spawnA : this.md.spawnB
    const ang = (idx * 2.399) % (Math.PI * 2)
    const rr = 1.5 + (idx % 3) * 1.2
    const x = base[0] + Math.cos(ang) * rr
    const z = base[2] + Math.sin(ang) * rr
    p.x = x; p.y = 0.02; p.z = z
    p.hp = 100
    p.shield = 0
    p.dead = false
    p.crouch = false
    p.lastDamageAt = 0
    p.protectUntil = now() + (this.mode === 'historia' ? 9000 : GAME.SPAWN_PROTECT * 1000)
    if (initial) {
      p.armory = ['knife', 'p9']
      p.slots = [null, 'p9']
      this.recomputeOwned(p)
      p.weapon = 'p9'
    } else {
      // v6.1: el ARSENAL y los HUECOS se conservan al reaparecer
      if (!p.armory.includes('knife')) p.armory.unshift('knife')
      if (!p.armory.includes('p9')) p.armory.push('p9')
      if (!p.slots[0] && !p.slots[1]) p.slots = [null, 'p9']
      this.recomputeOwned(p)
      if (!p.owned.includes(p.weapon)) p.weapon = p.slots[1] ?? p.slots[0] ?? 'p9'
      for (const wid of p.owned) {
        if (WEAPONS[wid].mag > 0) this.emit('refillAmmo', { weapon: wid }, p.id)
      }
    }
    // granadas de cortesía al reaparecer (mín. 1 de cada una, máx. 2)
    p.frags = clamp(p.frags, 1, 2)
    p.smokes = clamp(p.smokes, 1, 2)
    p.aiming = false
    p.sprint = false
    p.flag = null
    if (p.ai) {
      p.ai.state = 'patrol'
      p.ai.wp = nearestWaypoint(x, z, this.md.waypoints)
      p.ai.target = null
      p.ai.lastKnown = null
    }
    if (p.bot) this.botBuy(p)
    this.emit('spawnEvent', {
      pos: [p.x, p.y, p.z],
      yaw: p.yaw,
      hp: p.hp, armor: p.shield,
      weapons: p.owned,
      weapon: p.weapon,
      frags: p.frags,
      smokes: p.smokes,
      money: p.money,
      protect: GAME.SPAWN_PROTECT,
    }, p.id)
    // v6.1: sincroniza arsenal + huecos con el cliente (tienda/HUD)
    this.syncLoadout(p)
  }

  // ------------------------------------------------------------
  // Arsenal y huecos de equipamiento (v6.1)
  // ------------------------------------------------------------
  /** armas LLEVADAS = huecos equipados + cuchillo (orden de ciclo) */
  private recomputeOwned(p: SimPlayer): void {
    const carried: WeaponId[] = []
    for (const w of [p.slots[0], p.slots[1], 'knife' as WeaponId]) {
      if (w && WEAPONS[w] && !carried.includes(w)) carried.push(w)
    }
    p.owned = carried
  }

  /** coloca un arma del arsenal en un hueco libre (o el de su categoría) */
  private autoEquip(p: SimPlayer, wid: WeaponId): void {
    if (p.slots[0] === wid) p.slots[0] = null
    if (p.slots[1] === wid) p.slots[1] = null
    const cat = WEAPONS[wid].slot === 'primary' ? 0 : 1
    if (!p.slots[cat]) p.slots[cat] = wid
    else if (!p.slots[1 - cat]) p.slots[1 - cat] = wid
    else p.slots[cat] = wid
    this.recomputeOwned(p)
  }

  /** sincroniza el inventario del jugador con su cliente (tienda/HUD) */
  private syncLoadout(p: SimPlayer, handTo?: WeaponId): void {
    if (handTo && p.owned.includes(handTo)) p.weapon = handTo
    this.emit('loadout', {
      owned: p.owned.slice(),
      armory: p.armory.slice(),
      slots: [p.slots[0], p.slots[1]],
      weapon: p.weapon,
    }, p.id)
  }

  // ------------------------------------------------------------
  // Economía / compra
  // ------------------------------------------------------------
  private spawnX(team: Team): number { return team === 'A' ? this.md.spawnA[0] : this.md.spawnB[0] }
  private spawnZ(team: Team): number { return team === 'A' ? this.md.spawnA[2] : this.md.spawnB[2] }

  private inBuyZone(p: SimPlayer): boolean {
    return Math.hypot(p.x - this.spawnX(p.team), p.z - this.spawnZ(p.team)) < GAME.BUY_RADIUS + 2.5
  }

  private botBuy(p: SimPlayer): void {
    // modo historia: armamento fijo decente, sin economía
    if (this.mode === 'historia') {
      if (!p.armory.some(w => w === 'ar47' || w === 'cr4')) {
        const w: WeaponId = Math.random() < 0.5 ? 'ar47' : 'cr4'
        p.armory.push(w)
        this.autoEquip(p, w)
        p.weapon = w
      }
      if (p.shield < 25) p.shield = 50
      return
    }
    const buyPrimary = (w: WeaponId, price: number): void => {
      p.armory = ['knife', 'p9', w]
      p.slots = [w, null]
      this.recomputeOwned(p)
      p.weapon = w
      p.money -= price
    }
    if (p.money >= 4750 && Math.random() < 0.22) {
      buyPrimary('awp338', 4750)
    } else if (p.money >= 2900) {
      const w: WeaponId = Math.random() < 0.5 ? 'cr4' : 'ar47'
      buyPrimary(w, WEAPONS[w].price)
    } else if (p.money >= 1250 && Math.random() < 0.75) {
      buyPrimary('mp9', 1250)
    } else if (p.money >= 700 && Math.random() < 0.5) {
      p.armory = ['knife', 'p9', 'aguila']
      p.slots = [null, 'aguila']
      this.recomputeOwned(p)
      p.weapon = 'aguila'
      p.money -= 700
    }
    // los bots compran un escudo a medias (menos tanque que el jugador)
    if (p.money >= 1000 && p.shield < 25) { p.shield = 50; p.money -= 1000 }
    if (p.money >= 600 && p.frags < 1 && Math.random() < 0.45) { p.frags = 1; p.money -= 300 }
  }

  handleBuy(p: SimPlayer, itemId: string): void {
    const item = BUY_ITEMS.find(i => i.id === itemId)
    if (!item) return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Artículo desconocido' }, p.id)
    if (p.dead) return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Estás eliminado' }, p.id)
    if (!this.inBuyZone(p)) return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Compra solo en tu base' }, p.id)
    if (p.money < item.price) return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Fondos insuficientes' }, p.id)

    if (item.weapon) {
      const w = WEAPONS[item.weapon]
      p.money -= item.price
      if (p.armory.includes(w.id)) {
        // ya está en tu arsenal: repone la munición de reserva
        this.emit('refillAmmo', { weapon: w.id }, p.id)
        this.syncLoadout(p)
      } else {
        // v6.1: compra → arsenal + hueco automático (libre o de su categoría)
        p.armory.push(w.id)
        this.autoEquip(p, w.id)
        this.syncLoadout(p, w.id)
      }
    } else if (item.equip === 'shield') {
      p.money -= item.price
      p.shield = 100
    } else if (item.equip === 'frag') {
      if (p.frags >= 2) {
        return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Máximo 2 granadas' }, p.id)
      }
      p.money -= item.price
      p.frags++
    } else if (item.equip === 'smoke') {
      if (p.smokes >= 2) {
        return void this.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Máximo 2 granadas de humo' }, p.id)
      }
      p.money -= item.price
      p.smokes++
    }
    this.emit('buyResult', { ok: true, itemId, money: p.money }, p.id)
    this.emit('econ', { money: p.money, frags: p.frags, smokes: p.smokes }, p.id)
  }

  /** v6.1: equipar un arma del arsenal en el hueco elegido (desde la tienda) */
  handleEquip(p: SimPlayer, weapon: WeaponId, slot: number): void {
    const s = slot === 1 ? 1 : 0
    if (!WEAPONS[weapon] || weapon === 'knife') {
      return void this.emit('buyResult', { ok: false, itemId: `equip:${String(weapon)}`, money: p.money, error: 'Artículo desconocido' }, p.id)
    }
    if (!p.armory.includes(weapon)) {
      return void this.emit('buyResult', { ok: false, itemId: `equip:${String(weapon)}`, money: p.money, error: 'Aún no tienes esa arma' }, p.id)
    }
    if (p.dead) {
      return void this.emit('buyResult', { ok: false, itemId: `equip:${String(weapon)}`, money: p.money, error: 'Estás eliminado' }, p.id)
    }
    // quitarla del otro hueco si la llevabas puesta y colocarla en el elegido
    if (p.slots[0] === weapon) p.slots[0] = null
    if (p.slots[1] === weapon) p.slots[1] = null
    p.slots[s] = weapon
    this.recomputeOwned(p)
    this.syncLoadout(p, weapon)
    this.emit('buyResult', { ok: true, itemId: `equip:${String(weapon)}:${s}`, money: p.money }, p.id)
  }

  // ------------------------------------------------------------
  // Comandos del director del modo historia
  // ------------------------------------------------------------
  handleStoryCmd(playerId: string, data: { cmd?: string; botId?: string; weapon?: WeaponId; count?: number; x?: number; z?: number }): void {
    const cmd = data?.cmd
    if (cmd === 'boss') {
      // convierte un bot en el jefe final
      const p = data.botId ? this.players.get(data.botId) : null
      if (!p) {
        // sin id explícito: el primer bot del bando B
        for (const q of this.players.values()) {
          if (q.bot && q.team === 'B') {
            q.name = 'Cnel. Vega'; q.hp = 400; q.shield = 150; q.weapon = 'cr4'
            if (!q.armory.includes('cr4')) q.armory.push('cr4')
            q.slots[0] = 'cr4'
            this.recomputeOwned(q)
            break
          }
        }
      } else {
        p.name = 'Cnel. Vega'
        p.hp = 400
        p.shield = 150
        p.weapon = 'cr4'
        if (!p.armory.includes('cr4')) p.armory.push('cr4')
        p.slots[0] = 'cr4'
        this.recomputeOwned(p)
      }
      this.broadcastSnapshot()
    } else if (cmd === 'give' && data.weapon) {
      // entrega de arma al jugador de la misión
      const p = this.players.get(playerId)
      const w = data.weapon
      if (p && WEAPONS[w]) {
        if (!p.armory.includes(w)) {
          p.armory.push(w)
          this.autoEquip(p, w)
          this.syncLoadout(p, w)
          this.emit('refillAmmo', { weapon: w }, p.id)
        } else {
          this.emit('refillAmmo', { weapon: w }, p.id)
          this.syncLoadout(p, w)
        }
      }
    } else if (cmd === 'ammo') {
      const p = this.players.get(playerId)
      if (p) for (const wid of p.owned) {
        if (WEAPONS[wid].mag > 0) this.emit('refillAmmo', { weapon: wid }, p.id)
      }
    } else if (cmd === 'reinforce') {
      // refuerzos de la misión (asedio del capítulo 2 / alarma del 4):
      // bots extra del bando B hasta un máximo razonable
      const curB = Array.from(this.players.values()).filter(q => q.team === 'B').length
      const n = Math.max(0, Math.min(12, curB + (data.count ?? 2)) - curB)
      if (n > 0) this.addBots(n, true)
      this.broadcastSnapshot()
    } else if (cmd === 'protect') {
      // invulnerable durante la cinemática (el jugador no puede moverse)
      const p = this.players.get(playerId)
      if (p) p.protectUntil = now() + Math.max(1, data.count ?? 5) * 1000
    } else if (cmd === 'attack') {
      // asedio: todos los enemigos convergen sobre un punto (enlace/celda)
      const tx = data.x ?? 0
      const tz = data.z ?? 0
      for (const q of this.players.values()) {
        if (!q.bot || q.team !== 'B' || !q.ai) continue
        q.ai.state = 'hunt'
        q.ai.lastKnown = [tx, tz]
        q.ai.huntUntil = now() + 30000
      }
    }
  }

  // ------------------------------------------------------------
  // Daño y muerte
  // ------------------------------------------------------------
  private announce(text: string, kind: 'kill' | 'round' | 'info' = 'info', team?: Team): void {
    this.emit('announce', { text, kind, team })
  }

  private applyDamage(attacker: SimPlayer, victim: SimPlayer, dmg: number, part: BodyPart, weapon: WeaponId, dirHint: [number, number]): void {
    if (victim.dead) return
    if (now() < victim.protectUntil) return
    if (attacker.id !== victim.id && !this.isEnemy(attacker, victim)) return

    // escudo primero (estilo Fortnite): absorbe todo el daño hasta agotarse
    const total = dmg
    const absorbed = Math.min(victim.shield, dmg)
    victim.shield -= absorbed
    dmg -= absorbed
    victim.lastDamageAt = now()
    if (dmg > 0) victim.hp -= dmg

    this.emit('takeDamage', {
      attacker: attacker.id, dmg, part, weapon,
      dir: dirHint,
      attackerPos: [attacker.x, attacker.y, attacker.z],
    }, victim.id)
    if (attacker.id !== victim.id && !attacker.bot) {
      this.emit('hitConfirm', { victim: victim.id, dmg: total, part, weapon, headshot: part === 'head', victimHp: Math.max(0, victim.hp), victimShield: Math.max(0, victim.shield) }, attacker.id)
    }
    this.emit('damageFX', { x: victim.x, y: victim.y + 1.2, z: victim.z, part })

    // los bots reaccionan al recibir daño (se giran rápido hacia el atacante)
    if (victim.bot && victim.ai) {
      const skill = BOT_SKILL[this.difficulty]
      victim.ai.target = attacker.id
      victim.ai.state = 'combat'
      victim.ai.lastKnown = [attacker.x, attacker.z]
      victim.ai.reactAt = now() + skill.react[0] * 0.6
      victim.ai.aimErrNext = 0
    }

    if (victim.hp <= 0) this.killPlayer(attacker, victim, weapon, part === 'head')
  }

  private killPlayer(killer: SimPlayer, victim: SimPlayer, weapon: WeaponId, headshot: boolean): void {
    // si el caído llevaba la bandera, se suelta donde murió
    if (victim.flag) {
      const f = victim.flag === 'A' ? this.flags.a : this.flags.b
      if (f.carrier === victim.id) {
        f.status = 'drop'
        f.carrier = null
        f.x = victim.x
        f.z = victim.z
        f.returnAt = now() + GAME.FLAG_RETURN_TIME * 1000
        this.emit('flagEvent', { flag: victim.flag, type: 'drop', x: f.x, z: f.z })
        this.announce(`¡LA BANDERA ${victim.flag === 'A' ? 'ÁMBAR' : 'VERDE'} HA CAÍDO!`, 'round')
      }
      victim.flag = null
    }
    victim.dead = true
    victim.hp = 0
    victim.deaths++
    victim.streak = 0
    victim.respawnAt = now() + GAME.RESPAWN_TIME * 1000
    victim.frags = 0
    victim.smokes = 0

    if (killer.id !== victim.id) {
      killer.kills++
      killer.streak++
      const t = now()
      killer.multi = (t - killer.lastKillAt < 4000) ? killer.multi + 1 : 1
      killer.lastKillAt = t
      killer.money = Math.min(GAME.MAX_MONEY, killer.money + GAME.KILL_REWARD + (headshot ? GAME.HS_REWARD : 0))
      // v6.1: el dinero del asesino se sincroniza AL INSTANTE con su cliente
      // (antes la tienda mostraba el saldo viejo y parecía que no podías
      // comprar la segunda arma)
      this.emit('econ', { money: killer.money, frags: killer.frags, smokes: killer.smokes }, killer.id)
      if (this.mode !== 'ffa') {
        if (killer.team === 'A') this.round.scoresA++; else this.round.scoresB++
      }
    }

    const ev: NetKillEvent = {
      killer: killer.id, killerName: killer.name, killerTeam: killer.team,
      victim: victim.id, victimName: victim.name, victimTeam: victim.team,
      weapon, headshot,
      killerStreak: killer.streak,
      multi: killer.multi,
    }
    this.emit('kill', ev)

    const msgs: string[] = []
    if (killer.multi === 2) msgs.push('¡DOBLE MUERTE!')
    else if (killer.multi === 3) msgs.push('¡TRIPLE MUERTE!')
    else if (killer.multi === 4) msgs.push('¡FURIA LETAL!')
    else if (killer.multi >= 5) msgs.push('¡MASACRE!')
    if (killer.streak === 5) msgs.push(`${killer.name}: RACHA DE 5`)
    else if (killer.streak === 8) msgs.push(`${killer.name}: RACHA DE 8`)
    else if (killer.streak === 10) msgs.push(`${killer.name}: ¡IMPARABLE!`)
    if (killer.streak === 12) msgs.push(`${killer.name}: ¡DIOS DE LA GUERRA!`)
    for (const m of msgs) this.announce(m, 'kill', killer.team)

    this.emit('deathEvent', { killer: killer.id, killerName: killer.name, weapon, respawnIn: GAME.RESPAWN_TIME }, victim.id)

    this.checkRoundEnd()
  }

  private checkRoundEnd(): void {
    if (this.round.phase !== 'live') return
    if (this.mode === 'historia') return   // el ritmo lo marca el director de la misión
    const target = MODES[this.mode].target
    if (this.mode === 'escaramuza') {
      if (this.round.scoresA >= target || this.round.scoresB >= target) {
        this.endRound(this.round.scoresA > this.round.scoresB ? 'A' : 'B')
      }
    } else if (this.mode === 'ffa') {
      for (const p of this.players.values()) {
        if (p.kills >= target) { this.endRound(p.team); break }
      }
    } else {
      // bandera / dominación: puntuación de equipo
      if (this.round.scoresA >= target || this.round.scoresB >= target) {
        this.endRound(this.round.scoresA > this.round.scoresB ? 'A' : 'B')
      }
    }
  }

  private endRound(winner: Team): void {
    this.round.phase = 'ended'
    this.round.intermissionEndsAt = now() + 6000
    if (winner === 'A') this.round.roundWinsA++; else this.round.roundWinsB++
    this.announce(`RONDA ${this.round.roundNumber} PARA ${winner === 'A' ? 'ÁMBAR' : 'VERDE'}`, 'round')
    this.emit('roundEnd', { winner, scoresA: this.round.scoresA, scoresB: this.round.scoresB, roundWinsA: this.round.roundWinsA, roundWinsB: this.round.roundWinsB })

    for (const p of this.players.values()) {
      p.money = Math.min(GAME.MAX_MONEY, p.money + (p.team === winner ? GAME.WIN_REWARD : GAME.LOSE_REWARD))
      this.emit('econ', { money: p.money, frags: p.frags, smokes: p.smokes }, p.id)
    }
  }

  private startRound(): void {
    this.round.roundNumber++
    this.round.phase = 'live'
    this.round.endsAt = now() + MODES[this.mode].time * 1000
    this.round.scoresA = 0
    this.round.scoresB = 0
    this.resetObjectives()
    this.announce(`RONDA ${this.round.roundNumber} — ¡EN COMBATE!`, 'round')
    for (const p of this.players.values()) {
      p.respawnAt = now() + rand(200, 900)
      p.multi = 0
      p.flag = null
    }
    this.emit('roundStart', { roundNumber: this.round.roundNumber })
  }

  /** banderas y zonas vuelven a su estado inicial */
  private resetObjectives(): void {
    this.flags.a = { team: 'A', status: 'home', x: FLAG_A[0], z: FLAG_A[1], carrier: null, returnAt: 0 }
    this.flags.b = { team: 'B', status: 'home', x: FLAG_B[0], z: FLAG_B[1], carrier: null, returnAt: 0 }
    for (const z of this.zones) { z.owner = null; z.prog = 0; z.by = null }
    this.emit('flagEvent', { flag: 'a', type: 'home' })
    this.emit('flagEvent', { flag: 'b', type: 'home' })
  }

  private endMatch(winner: Team): void {
    this.round.phase = 'matchend'
    this.round.intermissionEndsAt = now() + 12000
    this.announce(`¡VICTORIA FINAL PARA ${winner === 'A' ? 'ESCUADRÓN ÁMBAR' : 'ESCUADRÓN VERDE'}!`, 'round')
    this.emit('matchEnd', { winner, roundWinsA: this.round.roundWinsA, roundWinsB: this.round.roundWinsB })
  }

  private resetMatch(): void {
    this.round.roundNumber = 1
    this.round.roundWinsA = 0
    this.round.roundWinsB = 0
    this.round.scoresA = 0
    this.round.scoresB = 0
    this.round.phase = 'live'
    this.round.endsAt = now() + GAME.ROUND_TIME * 1000
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.streak = 0; p.money = GAME.START_MONEY
      p.respawnAt = now() + rand(200, 900)
      // nueva partida: arsenal inicial (las compras pertenecían a la anterior)
      if (!p.bot) {
        p.armory = ['knife', 'p9']
        p.slots = [null, 'p9']
        this.recomputeOwned(p)
        p.weapon = 'p9'
        this.syncLoadout(p)
      }
      this.emit('econ', { money: p.money }, p.id)
    }
    this.announce('NUEVA PARTIDA — RONDA 1', 'round')
    this.emit('roundStart', { roundNumber: 1 })
  }

  // ------------------------------------------------------------
  // CAPTURAR LA BANDERA
  // ------------------------------------------------------------
  /** bandera del equipo contrario a `team` */
  private enemyFlag(team: Team): SimFlag {
    return team === 'A' ? this.flags.b : this.flags.a
  }

  private updateFlags(): void {
    if (this.mode !== 'bandera' || this.round.phase !== 'live') return
    const t = now()
    for (const key of ['a', 'b'] as const) {
      const f = this.flags[key]
      const enemyTeam: Team = f.team === 'A' ? 'B' : 'A'
      if (f.status === 'home') {
        // ¿un enemigo la roba?
        for (const p of this.players.values()) {
          if (p.dead || p.team !== enemyTeam || p.flag) continue
          if (Math.hypot(p.x - f.x, p.z - f.z) < 2.1) {
            f.status = 'carried'
            f.carrier = p.id
            p.flag = f.team
            this.emit('flagEvent', { flag: key, type: 'carried', carrier: p.id, x: p.x, z: p.z })
            this.announce(`¡${p.name} ROBÓ LA BANDERA ${f.team === 'A' ? 'ÁMBAR' : 'VERDE'}!`, 'round', enemyTeam)
            break
          }
        }
      } else if (f.status === 'carried') {
        const c = f.carrier ? this.players.get(f.carrier) : undefined
        if (!c || c.dead) {
          // seguridad: el portador se fue — soltar en el sitio
          f.status = 'drop'
          f.carrier = null
          f.returnAt = t + GAME.FLAG_RETURN_TIME * 1000
        } else {
          f.x = c.x
          f.z = c.z
          // ¿captura? llega a SU base con la bandera propia en casa
          const home = f.team === 'A' ? FLAG_A : FLAG_B
          const own = f.team === 'A' ? this.flags.b : this.flags.a   // la bandera del equipo del portador
          const ownHome = c.team === 'A' ? FLAG_A : FLAG_B
          void home
          if (Math.hypot(c.x - ownHome[0], c.z - ownHome[1]) < 3.2 && own.status === 'home') {
            // ¡captura!
            if (c.team === 'A') this.round.scoresA++
            else this.round.scoresB++
            c.flag = null
            c.money = Math.min(GAME.MAX_MONEY, c.money + 1000)
            this.emit('econ', { money: c.money, frags: c.frags, smokes: c.smokes }, c.id)
            f.status = 'home'
            f.carrier = null
            f.x = (f.team === 'A' ? FLAG_A : FLAG_B)[0]
            f.z = (f.team === 'A' ? FLAG_A : FLAG_B)[1]
            this.emit('flagEvent', { flag: key, type: 'home' })
            this.announce(`¡${c.name} CAPTURA LA BANDERA! (${this.round.scoresA}–${this.round.scoresB})`, 'round', c.team)
            this.emit('captureFX', { x: c.x, z: c.z, team: c.team })
            this.checkRoundEnd()
          }
        }
      } else if (f.status === 'drop') {
        // devolución automática o recogida
        for (const p of this.players.values()) {
          if (p.dead || p.flag) continue
          if (Math.hypot(p.x - f.x, p.z - f.z) > 2.1) continue
          if (p.team === enemyTeam) {
            // el enemigo la vuelve a coger
            f.status = 'carried'
            f.carrier = p.id
            p.flag = f.team
            this.emit('flagEvent', { flag: key, type: 'carried', carrier: p.id, x: p.x, z: p.z })
            this.announce(`¡${p.name} RECOGIÓ LA BANDERA!`, 'round', enemyTeam)
          } else {
            // el dueño la devuelve a casa
            f.status = 'home'
            f.x = (f.team === 'A' ? FLAG_A : FLAG_B)[0]
            f.z = (f.team === 'A' ? FLAG_A : FLAG_B)[1]
            this.emit('flagEvent', { flag: key, type: 'home' })
            this.announce('BANDERA DEVUELTA A SU BASE', 'info')
          }
          break
        }
        if (f.status === 'drop' && t > f.returnAt) {
          f.status = 'home'
          f.x = (f.team === 'A' ? FLAG_A : FLAG_B)[0]
          f.z = (f.team === 'A' ? FLAG_A : FLAG_B)[1]
          this.emit('flagEvent', { flag: key, type: 'home' })
        }
      }
    }
  }

  // ------------------------------------------------------------
  // DOMINACIÓN
  // ------------------------------------------------------------
  private updateZones(dt: number): void {
    if (this.mode !== 'dominacion' || this.round.phase !== 'live') return
    const t = now()
    for (const z of this.zones) {
      let a = 0, b = 0
      for (const p of this.players.values()) {
        if (p.dead) continue
        if (Math.hypot(p.x - z.x, p.z - z.z) > GAME.DOM_ZONE_RADIUS) continue
        if (p.team === 'A') a++; else b++
      }
      if (a > 0 && b === 0 && z.owner !== 'A') {
        z.by = 'A'
        z.prog += dt / GAME.DOM_CAP_TIME
        if (z.prog >= 1) {
          z.owner = 'A'; z.prog = 0; z.by = null
          this.announce(`ZONA ${z.name} CAPTURADA POR ÁMBAR`, 'round', 'A')
          this.emit('zoneEvent', { zone: z.id, owner: 'A' })
        }
      } else if (b > 0 && a === 0 && z.owner !== 'B') {
        z.by = 'B'
        z.prog += dt / GAME.DOM_CAP_TIME
        if (z.prog >= 1) {
          z.owner = 'B'; z.prog = 0; z.by = null
          this.announce(`ZONA ${z.name} CAPTURADA POR VERDE`, 'round', 'B')
          this.emit('zoneEvent', { zone: z.id, owner: 'B' })
        }
      } else if (a === 0 && b === 0) {
        // sin nadie: el progreso decae despacio
        z.by = null
        z.prog = Math.max(0, z.prog - dt * 0.12)
      } else {
        // disputada: congelada
        z.by = null
      }
    }
    // puntos por zonas en propiedad (cada 5 s)
    if (t > this.domTickAt) {
      this.domTickAt = t + 5000
      let a = 0, b = 0
      for (const z of this.zones) {
        if (z.owner === 'A') a++
        else if (z.owner === 'B') b++
      }
      if (a) { this.round.scoresA += a * GAME.DOM_TICK_POINTS }
      if (b) { this.round.scoresB += b * GAME.DOM_TICK_POINTS }
      if (a || b) this.checkRoundEnd()
    }
  }

  // ------------------------------------------------------------
  // BOTS — IA con dificultad
  // ------------------------------------------------------------
  private canSee(a: SimPlayer, b: SimPlayer): boolean {
    const skill = BOT_SKILL[this.difficulty]
    const [ax, ay, az] = eye(a)
    const bx = b.x, by = b.y + (b.crouch ? 0.9 : 1.2), bz = b.z
    const d = dist3(ax, ay, az, bx, by, bz)
    if (d > skill.seeDist) return false
    if (segmentBlocked(ax, ay, az, bx, by, bz, this.md.aabbs)) return false
    // cortina de humo: bloquea la línea de visión de los bots
    const t = now()
    for (const s of this.smokes) {
      if (t > s.until) continue
      if (segSphereHit(ax, ay, az, bx, by, bz, s.x, s.y + 1, s.z, s.radius)) return false
    }
    return true
  }

  private botFindTarget(p: SimPlayer): SimPlayer | null {
    let best: SimPlayer | null = null
    let bestD = Infinity
    const [ex, ey, ez] = eye(p)
    // en la misión los defensores no avistan a 75 m a través del valle
    // abierto: mantienen el combate dentro del pueblo y el complejo
    const maxSpot = this.mode === 'historia' ? 52 : 110
    for (const q of this.players.values()) {
      if (q.dead || !this.isEnemy(p, q)) continue
      if (now() < q.protectUntil) continue
      // misión: el refugio del jugador (radio 14 m de su inserción) es zona
      // segura — evita el acampamiento y el bucle de muertes en la aparición
      if (this.mode === 'historia' && Math.hypot(q.x - this.md.spawnA[0], q.z - this.md.spawnA[2]) < 14) continue
      const d = dist3(ex, ey, ez, q.x, q.y + 1.2, q.z)
      if (d > maxSpot) continue
      if (d < bestD && this.canSee(p, q)) { bestD = d; best = q }
    }
    return best
  }

  /** objetivo táctico del bot según el modo (null = patrulla clásica) */
  private botObjective(p: SimPlayer): [number, number] | null {
    if (this.mode === 'bandera') {
      if (p.flag) {
        // lleva la bandera: correr a su base
        const home = p.team === 'A' ? FLAG_A : FLAG_B
        return [home[0], home[1]]
      }
      const enemy = this.enemyFlag(p.team)
      const own = p.team === 'A' ? this.flags.a : this.flags.b
      if (p.ai!.role === 'attack') {
        if (enemy.status === 'carried') {
          // un compañero la lleva: escoltar (ir a la base propia para despejar camino)
          const home = p.team === 'A' ? FLAG_A : FLAG_B
          return [home[0] + rand(-6, 6), home[1] + rand(-6, 6)]
        }
        return [enemy.x, enemy.z]
      }
      // defensa: rondar la bandera propia
      if (own.status === 'drop') return [own.x, own.z]
      return [own.x + rand(-7, 7), own.z + rand(-7, 7)]
    }
    if (this.mode === 'dominacion') {
      // zona más cercana que no sea nuestra
      let best: SimZone | null = null
      let bestD = Infinity
      for (const z of this.zones) {
        if (z.owner === p.team) continue
        const d = Math.hypot(z.x - p.x, z.z - p.z)
        if (d < bestD) { bestD = d; best = z }
      }
      if (best) return [best.x + rand(-3, 3), best.z + rand(-3, 3)]
      // todas nuestras: quedarse en la más cercana
      let own: SimZone | null = null
      let ownD = Infinity
      for (const z of this.zones) {
        const d = Math.hypot(z.x - p.x, z.z - p.z)
        if (d < ownD) { ownD = d; own = z }
      }
      return own ? [own.x, own.z] : null
    }
    return null
  }

  private botUpdate(p: SimPlayer, dt: number, t: number): void {
    const ai = p.ai!
    const skill = BOT_SKILL[this.difficulty]
    if (p.dead) return
    p.aiming = false
    p.sprint = false

    // --- búsqueda de objetivo (cada 200 ms) ---
    if (t - ai.lastScan > 200) {
      ai.lastScan = t
      const target = this.botFindTarget(p)
      if (target) {
        if (ai.target !== target.id) {
          ai.target = target.id
          ai.reactAt = t + rand(skill.react[0], skill.react[1])
          ai.burst = 0
          ai.aimErrNext = 0
        }
        ai.state = 'combat'
        ai.lastSeen = t
        ai.lastKnown = [target.x, target.z]
      } else if (ai.state === 'combat') {
        const cur = this.players.get(ai.target ?? '')
        if (!cur || cur.dead || t - ai.lastSeen > 1400) {
          // objetivo perdido → cazar última posición conocida
          ai.state = ai.lastKnown ? 'hunt' : 'patrol'
          ai.huntUntil = t + 5000
          ai.target = null
        }
      }
    }

    const target = ai.target ? this.players.get(ai.target) : undefined
    const MOVE = 5.8 * ai.speedMult

    // --- retirada con poca vida ---
    if (ai.state === 'combat' && target && p.hp < 32 && ai.retreatUntil < t && Math.random() < 0.6) {
      ai.state = 'retreat'
      ai.retreatUntil = t + rand(1800, 3000)
    }
    if (ai.state === 'retreat' && t > ai.retreatUntil) ai.state = 'patrol'

    if (ai.state === 'retreat' && ai.lastKnown) {
      // alejarse de la última posición conocida del enemigo
      const [lx, lz] = ai.lastKnown
      const dx = p.x - lx, dz = p.z - lz
      const d = Math.hypot(dx, dz) || 1
      const nx = p.x + (dx / d) * MOVE * dt
      const nz = p.z + (dz / d) * MOVE * dt
      if (!this.posBlocked(nx, nz)) { p.x = nx; p.z = nz }
      else {
        if (!this.posBlocked(p.x + (dx / d) * MOVE * dt, p.z)) p.x += (dx / d) * MOVE * dt
        else if (!this.posBlocked(p.x, p.z + (dz / d) * MOVE * dt)) p.z += (dz / d) * MOVE * dt
      }
      p.speed = MOVE
      const wantYaw = Math.atan2(lx - p.x, lz - p.z)
      p.yaw += this.angleLerp(p.yaw, wantYaw, dt * 6)
      p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
      p.crouch = false
      return
    }

    if (ai.state === 'hunt') {
      // ir a la última posición conocida del enemigo
      const dest = ai.lastKnown
      if (!dest || t > ai.huntUntil) { ai.state = 'patrol'; ai.lastKnown = null }
      else {
        const [wx, wz] = dest
        const dx = wx - p.x, dz = wz - p.z
        const d = Math.hypot(dx, dz)
        if (d < 2) { ai.state = 'patrol'; ai.lastKnown = null }
        else {
          const wantYaw = Math.atan2(dx, dz)
          p.yaw += this.angleLerp(p.yaw, wantYaw, dt * 5)
          p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
          const nx = p.x + (dx / d) * MOVE * dt
          const nz = p.z + (dz / d) * MOVE * dt
          if (!this.posBlocked(nx, nz)) { p.x = nx; p.z = nz; p.speed = MOVE }
          else { ai.state = 'patrol'; p.speed = 0 }
        }
        p.crouch = false
        return
      }
    }

    if (ai.state === 'combat' && target && !target.dead) {
      const d = dist3(p.x, p.y, p.z, target.x, target.y, target.z)
      const w = WEAPONS[p.weapon]

      // agacharse a distancia larga para mejorar puntería
      if (d > 24 && w.auto) {
        if (ai.crouchUntil < t && Math.random() < 0.004) ai.crouchUntil = t + rand(900, 2200)
      } else {
        ai.crouchUntil = 0
      }
      p.crouch = t < ai.crouchUntil

      // error de puntería con deriva (más estable cuanto más tiempo apuntando;
      // en fácil tarda mucho más en asentarse → falla bastante)
      if (t > ai.aimErrNext) {
        ai.aimErrNext = t + rand(350, 800)
        const aimT = clamp((t - ai.reactAt) / skill.settle, 0, 1)
        const base = skill.aimErr * (1 - aimT * 0.72) * (0.7 + Math.random() * 0.6)
        ai.aimErr = base * (Math.random() < 0.5 ? -1 : 1)
      }

      // apuntar con predicción de movimiento (lead)
      const lead = Math.min(0.22, d / 300) * (target.speed > 2 ? 1 : 0.2)
      const tx = target.x + Math.sin(target.yaw + Math.PI) * target.speed * lead
      const tz = target.z + Math.cos(target.yaw + Math.PI) * target.speed * lead
      const wantYaw = Math.atan2(tx - p.x, tz - p.z) + ai.aimErr
      const dy = target.y + (target.crouch ? 0.95 : 1.15) - (p.y + 1.55)
      const flat = Math.hypot(tx - p.x, tz - p.z)
      const wantPitch = Math.atan2(dy, flat) + ai.aimErr * 0.4
      p.yaw += this.angleLerp(p.yaw, wantYaw, dt * skill.aimSpeed)
      p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * skill.aimSpeed)

      // strafe COMBATIVO pero sereno (antes era frenético: 3,9 m/s con
      // giros cada 0,7-1,6 s → "se mueven muchísimo de lado a lado"):
      // - cambios de dirección cada 1,2-2,8 s
      // - 30 % de las veces se detiene en firme (dispara plantado)
      // - velocidad lateral 1,9 m/s (paso táctico)
      // - el francotirador jamás baila: planta y dispara
      // - a larga distancia apenas se desplaza: avanza
      const pref = w.id === 'awp338' ? 28 : w.id === 'breacher' ? 6 : 13
      ai.strafePhase += dt
      if (ai.strafePhase > rand(1.2, 2.8)) {
        ai.strafePhase = 0
        if (Math.random() < 0.3) ai.strafe = 0
        else ai.strafe = Math.random() < 0.5 ? -1 : 1
      }
      const sniperStill = w.id === 'awp338'
      const farRange = d > pref + 8
      let strafeAmp = sniperStill ? 0 : ai.strafe * 1.9
      if (farRange) strafeAmp *= 0.4
      if (p.crouch) strafeAmp *= 0.3
      const perpX = Math.cos(p.yaw) * strafeAmp
      const perpZ = -Math.sin(p.yaw) * strafeAmp
      let vx = perpX
      let vz = perpZ
      const toX = (target.x - p.x) / (d || 1)
      const toZ = (target.z - p.z) / (d || 1)
      if (d > pref + 4) { vx += toX * MOVE * 0.7; vz += toZ * MOVE * 0.7 }
      else if (d < pref - 4) { vx -= toX * MOVE * 0.7; vz -= toZ * MOVE * 0.7 }

      const nx = p.x + vx * dt, nz = p.z + vz * dt
      if (!this.posBlocked(nx, nz)) { p.x = nx; p.z = nz }
      else if (!this.posBlocked(p.x + vx * dt, p.z)) { p.x += vx * dt }
      else if (!this.posBlocked(p.x, p.z + vz * dt)) { p.z += vz * dt }
      p.speed = Math.hypot(vx, vz)
      p.aiming = true

      // --- disparo ---
      if (t > ai.reactAt && t > ai.nextShotAt && this.canSee(p, target)) {
        this.botShoot(p, target, d, t)
      }
    } else {
      // --- patrulla: con objetivo táctico (bandera/zona) o sesgo territorial ---
      p.crouch = false
      const [wx, wz] = this.md.waypoints[ai.wp]
      const dx = wx - p.x, dz = wz - p.z
      const d = Math.hypot(dx, dz)
      if (d < 1.4) {
        const edges = this.md.edges[ai.wp]
        if (edges.length) {
          const obj = this.botObjective(p)
          if (obj) {
            // ir hacia el objetivo por el grafo
            let bestW = edges[0], bestD = Infinity
            for (const e of edges) {
              const dd = Math.hypot(this.md.waypoints[e][0] - obj[0], this.md.waypoints[e][1] - obj[1])
              if (dd < bestD) { bestD = dd; bestW = e }
            }
            ai.wp = bestW
          } else if (this.mode === 'ffa') {
            // todos contra todos: exploración mixta
            if (Math.random() < 0.5) {
              // sesgo al centro (acción)
              let bestW = edges[0], bestD = Infinity
              for (const e of edges) {
                const dd = Math.hypot(this.md.waypoints[e][0], this.md.waypoints[e][1])
                if (dd < bestD) { bestD = dd; bestW = e }
              }
              ai.wp = bestW
            } else {
              ai.wp = edges[Math.floor(Math.random() * edges.length)]
            }
          } else {
            // escaramuza: sesgo hacia el territorio enemigo
            // historia: los enemigos DEFIENDEN el corazón del valle/complejo
            // — no persiguen la aparición del jugador
            const guardX = this.mode === 'historia' ? (this.md.guard?.[0] ?? 0) : this.spawnX(p.team === 'A' ? 'B' : 'A')
            const guardZ = this.mode === 'historia' ? (this.md.guard?.[1] ?? 0) : this.spawnZ(p.team === 'A' ? 'B' : 'A')
            const distGuard = Math.hypot(p.x - guardX, p.z - guardZ)
            const bias = this.mode === 'historia'
              ? (distGuard > 30 ? 0.85 : 0.25)
              : (distGuard > 38 ? 0.72 : 0.35)
            if (Math.random() < bias) {
              let bestW = edges[0], bestD = Infinity
              for (const e of edges) {
                const dd = Math.hypot(this.md.waypoints[e][0] - guardX, this.md.waypoints[e][1] - guardZ)
                if (dd < bestD) { bestD = dd; bestW = e }
              }
              ai.wp = bestW
            } else {
              ai.wp = edges[Math.floor(Math.random() * edges.length)]
            }
          }
        } else {
          ai.wp = nearestWaypoint(p.x, p.z, this.md.waypoints)
        }
      } else {
        const wantYaw = Math.atan2(dx, dz)
        p.yaw += this.angleLerp(p.yaw, wantYaw, dt * 5)
        p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
        const nx = p.x + (dx / d) * MOVE * dt
        const nz = p.z + (dz / d) * MOVE * dt
        if (!this.posBlocked(nx, nz)) { p.x = nx; p.z = nz; p.speed = MOVE; p.sprint = MOVE > 4.6 }
        else { ai.wp = nearestWaypoint(p.x, p.z, this.md.waypoints); p.speed = 0 }
      }
    }

    // anti-atasco: si no se mueve, saltar al waypoint más cercano
    if (t - ai.stuckCheck > 2500) {
      if (Math.hypot(p.x - ai.lastX, p.z - ai.lastZ) < 1 && ai.state !== 'combat') {
        ai.wp = nearestWaypoint(p.x, p.z, this.md.waypoints)
        const [tx, tz] = this.md.waypoints[ai.wp]
        if (!this.posBlocked(tx, tz)) { p.x = tx; p.z = tz }
      }
      ai.lastX = p.x; ai.lastZ = p.z; ai.stuckCheck = t
    }
    p.y = 0.02
  }

  private angleLerp(cur: number, want: number, rate: number): number {
    let d = want - cur
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d * Math.min(1, rate)
  }

  private posBlocked(x: number, z: number): boolean {
    for (const b of this.md.aabbs) {
      if (x > b.minX - 0.35 && x < b.maxX + 0.35 && z > b.minZ - 0.35 && z < b.maxZ + 0.35 && b.minY < 1.6) return true
    }
    return false
  }

  private botShoot(p: SimPlayer, target: SimPlayer, d: number, t: number): void {
    const ai = p.ai!
    const skill = BOT_SKILL[this.difficulty]
    const w = WEAPONS[p.weapon]

    if (w.auto) {
      if (ai.burst <= 0) {
        if (t < ai.nextShotAt) return
        ai.burst = Math.floor(rand(3, 9))
      }
      ai.burst--
      ai.nextShotAt = t + (60000 / w.rpm) + (ai.burst <= 0 ? rand(skill.burstPause[0], skill.burstPause[1]) : 0)
    } else {
      if (t < ai.nextShotAt) return
      ai.nextShotAt = t + Math.max(60000 / w.rpm, w.id === 'awp338' ? rand(1400, 2100) : (60000 / w.rpm) + rand(60, 250))
    }

    p.lastShotAt = t

    // precisión — ahora ligada también al ERROR VISUAL de apuntado:
    // si el cañón apunta lejos del objetivo (aimErr grande), falla casi seguro
    const angErr = Math.abs(ai.aimErr)
    const angTarget = Math.atan2(0.38, Math.max(2, d)) // radio angular del torso
    let hitChance = skill.hitBase - clamp((d - 10) / 55, 0, 0.42)
    if (angErr > angTarget * 1.6) hitChance *= 0.25         // apuntando lejos → falla
    else if (angErr > angTarget) hitChance *= 0.6
    if (target.speed > 3.5) hitChance -= 0.14
    if (target.crouch) hitChance += 0.04
    if (p.crouch) hitChance += 0.06
    if (w.id === 'awp338') hitChance = d < 45 ? Math.min(0.92, skill.hitBase + 0.18) : Math.max(0.05, skill.hitBase - 0.14)
    if (w.id === 'breacher') hitChance = d < 8 ? 0.9 : 0.45
    if (w.id === 'mp9' && d > 25) hitChance -= 0.1
    hitChance = clamp(hitChance, 0.03, 0.95)

    const hit = Math.random() < hitChance
    const aimY = target.y + 1.2
    const spread = hit ? 0 : rand(0.4, 1.4)
    const hitPos: [number, number, number] = hit
      ? [target.x, aimY, target.z]
      : [target.x + rand(-1, 1) * spread, aimY + rand(-0.5, 0.8), target.z + rand(-1, 1) * spread]

    this.emit('shotFired', {
      playerId: p.id,
      origin: [p.x, p.y + 1.5, p.z],
      hit: hitPos,
      weapon: p.weapon,
    })

    if (hit) {
      const r = Math.random()
      const part: BodyPart = r < (d < 18 ? 0.09 : 0.05) ? 'head' : r < 0.85 ? 'body' : 'legs'
      const skill = BOT_SKILL[this.difficulty]
      const dmg = Math.max(1, Math.round(computeDamage(w, part, d) * skill.dmg))
      const dx = p.x - target.x, dz = p.z - target.z
      this.applyDamage(p, target, dmg, part, p.weapon, [dx, dz])
    }
  }

  // ------------------------------------------------------------
  // Granadas
  // ------------------------------------------------------------
  handleGrenadeThrow(p: SimPlayer, pos: [number, number, number], vel: [number, number, number], kind: GrenadeKind = 'frag'): void {
    if (p.dead) return
    if (kind === 'smoke') {
      if (p.smokes <= 0) return
      p.smokes--
    } else {
      if (p.frags <= 0) return
      p.frags--
    }
    const id = `g${this.grenadeSeq++}`
    const lim = this.md.half - 0.5
    const g: SimGrenade = {
      id, owner: p.id, team: p.team, kind,
      x: clamp(pos[0], -lim, lim), y: clamp(pos[1], 0.2, 30), z: clamp(pos[2], -lim, lim),
      vx: vel[0], vy: vel[1], vz: vel[2],
      fuse: kind === 'smoke' ? 1.6 : 2.4,
    }
    this.grenades.set(id, g)
    this.emit('grenadeSpawn', { id, owner: p.id, kind, pos, vel })
    this.emit('econ', { money: p.money, frags: p.frags, smokes: p.smokes }, p.id)
  }

  private updateGrenades(dt: number): void {
    const lim = this.md.half - 0.5
    for (const g of this.grenades.values()) {
      g.fuse -= dt
      if (g.fuse <= 0) { this.explodeGrenade(g); continue }
      g.vy -= GAME.GRAVITY * dt
      let nx = g.x + g.vx * dt
      let ny = g.y + g.vy * dt
      let nz = g.z + g.vz * dt
      if (ny < 0.12) {
        ny = 0.12
        g.vy = -g.vy * 0.42
        g.vx *= 0.72
        g.vz *= 0.72
      }
      for (const b of this.md.aabbs) {
        if (nx > b.minX - 0.1 && nx < b.maxX + 0.1 && ny > b.minY - 0.1 && ny < b.maxY + 0.1 && nz > b.minZ - 0.1 && nz < b.maxZ + 0.1) {
          const px = Math.min(nx - (b.minX - 0.1), (b.maxX + 0.1) - nx)
          const py = Math.min(ny - (b.minY - 0.1), (b.maxY + 0.1) - ny)
          const pz = Math.min(nz - (b.minZ - 0.1), (b.maxZ + 0.1) - nz)
          if (px <= py && px <= pz) { g.vx = -g.vx * 0.45; nx = g.x }
          else if (pz <= py) { g.vz = -g.vz * 0.45; nz = g.z }
          else { g.vy = -g.vy * 0.4; ny = g.y }
          g.vx *= 0.75; g.vz *= 0.75
          break
        }
      }
      g.x = clamp(nx, -lim, lim)
      g.y = Math.max(0.12, ny)
      g.z = clamp(nz, -lim, lim)
    }
  }

  private explodeGrenade(g: SimGrenade): void {
    this.grenades.delete(g.id)
    if (g.kind === 'smoke') {
      // cortina de humo: bloquea visión 12 s
      const sid = `s${this.grenadeSeq++}`
      this.smokes.push({ id: sid, x: g.x, y: g.y, z: g.z, radius: 3.6, until: now() + 12000 })
      this.emit('smokeSpawn', { id: sid, pos: [g.x, g.y, g.z], duration: 12000 })
      return
    }
    this.emit('grenadeExplode', { id: g.id, pos: [g.x, g.y, g.z] })
    const owner = this.players.get(g.owner)
    const RADIUS = 6.5
    for (const p of this.players.values()) {
      if (p.dead) continue
      const d = dist3(g.x, g.y, g.z, p.x, p.y + 1, p.z)
      if (d > RADIUS) continue
      const blocked = segmentBlocked(g.x, g.y + 0.2, g.z, p.x, p.y + 1, p.z, this.md.aabbs)
      let dmg = 112 * (1 - d / RADIUS) * (blocked ? 0.35 : 1)
      dmg = Math.round(dmg)
      if (dmg < 8) continue
      if (owner) {
        const dx = g.x - p.x, dz = g.z - p.z
        this.applyDamage(owner, p, dmg, 'body', 'knife', [dx, dz])
      }
    }
  }

  // ------------------------------------------------------------
  // Entradas de clientes
  // ------------------------------------------------------------
  handleInput(p: SimPlayer, data: {
    pos: [number, number, number]; yaw: number; pitch: number
    crouch: boolean; speed: number; weapon: string
    aiming?: boolean; sprint?: boolean
  }): void {
    if (p.dead) return
    const lim = this.md.half - 0.5
    p.x = clamp(Number(data.pos?.[0]) || 0, -lim, lim)
    p.y = clamp(Number(data.pos?.[1]) || 0, -1, 30)
    p.z = clamp(Number(data.pos?.[2]) || 0, -lim, lim)
    p.yaw = Number(data.yaw) || 0
    p.pitch = clamp(Number(data.pitch) || 0, -1.4, 1.4)
    p.crouch = !!data.crouch
    p.speed = clamp(Number(data.speed) || 0, 0, 12)
    p.aiming = !!data.aiming
    p.sprint = !!data.sprint && !p.crouch
    const wid = data.weapon as WeaponId
    if (wid && WEAPONS[wid] && p.owned.includes(wid)) p.weapon = wid
  }

  handleHits(p: SimPlayer, data: {
    weapon: WeaponId
    hits: { target: string, part: BodyPart, dist: number }[]
  }): void {
    if (p.dead) return
    const w = WEAPONS[data.weapon]
    if (!w) return
    const t = now()
    // límite de cadencia para ACIERTOS (separado de lastShotAt: el mensaje
    // visual 'playerShot' del mismo disparo actualiza lastShotAt un instante
    // antes y, si se comparara contra él, TODOS los impactos del jugador
    // se rechazarían por llegar "demasiado rápido")
    const minInterval = (60000 / w.rpm) * 0.55
    if (t - p.lastHitsAt < minInterval) return
    p.lastHitsAt = t
    const maxHits = Math.max(1, w.pellets)
    for (const h of (data.hits || []).slice(0, maxHits)) {
      const victim = this.players.get(String(h.target))
      if (!victim || victim.dead || victim.team === p.team) continue
      const dist = clamp(Number(h.dist) || 10, 0, 200)
      const dmg = computeDamage(w, h.part, dist)
      const dx = p.x - victim.x, dz = p.z - victim.z
      this.applyDamage(p, victim, dmg, h.part, data.weapon, [dx, dz])
    }
  }

  /** Disparo de un jugador humano (solo visual: traza + animación de disparo para los demás) */
  handlePlayerShot(p: SimPlayer, origin: [number, number, number], hit: [number, number, number]): void {
    if (p.dead) return
    p.lastShotAt = now()
    this.emit('shotFired', {
      playerId: p.id,
      origin: [round2(origin[0]), round2(origin[1]), round2(origin[2])],
      hit: [round2(hit[0]), round2(hit[1]), round2(hit[2])],
      weapon: p.weapon,
    })
  }

  /** Explosión de barril disparado por un jugador (daño de área + FX para todos) */
  handleBarrelShot(p: SimPlayer, pos: [number, number, number]): void {
    if (p.dead) return
    this.emit('barrelExplode', {
      playerId: p.id,
      pos: [round2(pos[0]), round2(pos[1]), round2(pos[2])],
    })
    const RADIUS = 5.5
    for (const victim of this.players.values()) {
      if (victim.dead) continue
      const d = dist3(pos[0], pos[1], pos[2], victim.x, victim.y + 1, victim.z)
      if (d > RADIUS) continue
      const blocked = segmentBlocked(pos[0], pos[1] + 0.2, pos[2], victim.x, victim.y + 1, victim.z, this.md.aabbs)
      let dmg = 96 * (1 - d / RADIUS) * (blocked ? 0.3 : 1)
      dmg = Math.round(dmg)
      if (dmg < 6) continue
      const dx = pos[0] - victim.x, dz = pos[2] - victim.z
      this.applyDamage(p, victim, dmg, 'body', 'knife', [dx, dz])
    }
  }

  getWelcomeData(id: string): unknown {
    const p = this.players.get(id)!
    return {
      id,
      name: p.name,
      team: p.team,
      players: Array.from(this.players.values()).map(x => this.netPlayer(x)),
      round: this.netRound(),
      econ: { money: p.money, frags: p.frags, smokes: p.smokes },
    }
  }

  // ------------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------------
  private tick(): void {
    const t = now()
    let dt = (t - this.lastTick) / 1000
    this.lastTick = t
    dt = Math.min(dt, 0.1)
    this.tickCount++

    for (const p of this.players.values()) {
      if (p.dead && t >= p.respawnAt && this.round.phase === 'live') this.respawnPlayer(p)
    }

    // regeneración de vida estilo Fortnite (tras 8 s sin daño)
    if (this.round.phase === 'live') {
      for (const p of this.players.values()) {
        if (p.dead || p.hp >= 100) continue
        if (p.lastDamageAt && t - p.lastDamageAt < GAME.REGEN_DELAY * 1000) continue
        p.hp = Math.min(100, p.hp + GAME.REGEN_HP * dt)
      }
    }

    // pociones: reaparición y recogida por proximidad
    this.updatePickups(t)

    for (const p of this.players.values()) {
      if (p.bot) this.botUpdate(p, dt, t)
    }

    // objetivos de los modos de juego
    this.updateFlags()
    this.updateZones(dt)

    this.updateGrenades(dt)

    // limpiar humos expirados
    if (this.smokes.length && t > this.smokes[0].until) {
      this.smokes = this.smokes.filter(s => t < s.until)
    }

    if (this.round.phase === 'live' && t > this.round.endsAt) {
      const winner = this.round.scoresA === this.round.scoresB
        ? (this.teamCounts().A <= this.teamCounts().B ? 'A' : 'B')
        : (this.round.scoresA > this.round.scoresB ? 'A' : 'B')
      this.endRound(winner)
    } else if (this.round.phase === 'ended' && t > this.round.intermissionEndsAt) {
      if (this.round.roundWinsA >= GAME.ROUNDS_TO_WIN || this.round.roundWinsB >= GAME.ROUNDS_TO_WIN) {
        this.endMatch(this.round.roundWinsA > this.round.roundWinsB ? 'A' : 'B')
      } else this.startRound()
    } else if (this.round.phase === 'matchend' && t > this.round.intermissionEndsAt) {
      this.resetMatch()
    }

    if (this.tickCount % GAME.SNAPSHOT_EVERY === 0) this.broadcastSnapshot()
  }

  private netPlayer(p: SimPlayer): NetPlayerState {
    return {
      id: p.id, name: p.name, team: p.team, bot: p.bot,
      x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100,
      yaw: Math.round(p.yaw * 1000) / 1000,
      pitch: Math.round(p.pitch * 1000) / 1000,
      hp: Math.max(0, Math.round(p.hp)), armor: Math.max(0, Math.round(p.shield)),
      weapon: p.weapon, dead: p.dead, crouch: p.crouch,
      speed: Math.round(p.speed * 10) / 10,
      kills: p.kills, deaths: p.deaths, money: p.money, streak: p.streak,
      aiming: p.aiming, sprint: p.sprint && !p.crouch && p.speed > 4.2,
      flag: p.flag,
    }
  }

  private netGrenade(g: SimGrenade): NetGrenade {
    return { id: g.id, x: Math.round(g.x * 100) / 100, y: Math.round(g.y * 100) / 100, z: Math.round(g.z * 100) / 100, team: g.team, kind: g.kind }
  }

  private netPickup(p: SimPickup): NetPickup {
    return { id: p.id, kind: p.kind, x: p.x, z: p.z, active: p.active }
  }

  private netRound(): NetRoundState {
    const r: NetRoundState = {
      phase: this.round.phase,
      timeLeft: Math.max(0, Math.round((this.round.endsAt - now()) / 1000)),
      roundNumber: this.round.roundNumber,
      scoresA: this.round.scoresA, scoresB: this.round.scoresB,
      roundWinsA: this.round.roundWinsA, roundWinsB: this.round.roundWinsB,
      mode: this.mode,
      scoreTarget: MODES[this.mode].target,
    }
    if (this.mode === 'bandera') {
      const mk = (f: SimFlag): NetFlagState => ({
        status: f.status, x: Math.round(f.x), z: Math.round(f.z), carrier: f.carrier ?? undefined,
      })
      r.flags = { a: mk(this.flags.a), b: mk(this.flags.b) }
    }
    if (this.mode === 'dominacion') {
      r.zones = this.zones.map(z => ({
        id: z.id, owner: z.owner,
        prog: Math.round(z.prog * 100) / 100, by: z.by,
      }))
    }
    if (this.mode === 'ffa') {
      let lead: SimPlayer | null = null
      for (const p of this.players.values()) {
        if (!lead || p.kills > lead.kills) lead = p
      }
      r.leader = lead ? { name: lead.name, kills: lead.kills, team: lead.team } : null
    }
    return r
  }

  private broadcastSnapshot(): void {
    const snap: NetSnapshot = {
      t: now(),
      players: Array.from(this.players.values()).map(x => this.netPlayer(x)),
      grenades: Array.from(this.grenades.values()).map(x => this.netGrenade(x)),
      pickups: this.pickups.map(x => this.netPickup(x)),
      round: this.netRound(),
    }
    this.emit('snapshot', snap)
  }

  getPlayer(id: string): SimPlayer | undefined { return this.players.get(id) }

  emitSnapshotOnce(): void { this.broadcastSnapshot() }

  // ------------------------------------------------------------
  // Pociones (estilo Fortnite): recogen los jugadores humanos
  // ------------------------------------------------------------
  private updatePickups(t: number): void {
    for (const pk of this.pickups) {
      if (!pk.active) {
        if (t >= pk.respawnAt) pk.active = true
        continue
      }
      const info = PICKUP_INFO[pk.kind]
      for (const p of this.players.values()) {
        if (p.dead || p.bot) continue
        const d = Math.hypot(p.x - pk.x, p.z - pk.z)
        if (d > GAME.PICKUP_RADIUS) continue
        // no recoger si sería un desperdicio total
        const hpGain = Math.min(info.hp, 100 - p.hp)
        const shGain = Math.min(info.shield, 100 - p.shield)
        if (hpGain <= 0 && shGain <= 0) continue
        p.hp = Math.min(100, p.hp + info.hp)
        p.shield = Math.min(100, p.shield + info.shield)
        pk.active = false
        pk.respawnAt = t + GAME.PICKUP_RESPAWN * 1000
        this.emit('pickupEvent', {
          kind: pk.kind, hp: Math.round(p.hp), shield: Math.round(p.shield),
          hpGain: Math.round(hpGain), shieldGain: Math.round(shGain),
        }, p.id)
        break
      }
    }
  }
}
