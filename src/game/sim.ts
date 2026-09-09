// ============================================================
// FRONTERA CERO — Simulación autoritativa (navegador)
// Se ejecuta en local (solo/anfitrión). Los eventos se
// enrutan al jugador local y, si lo hay, al invitado P2P.
// ============================================================
import {
  GAME, WEAPONS, BUY_ITEMS, PICKUP_INFO, PICKUP_SPOTS, computeDamage, spawnPoint, segmentBlocked,
  WAYPOINTS, WAYPOINT_EDGES, BOT_NAMES, MAP_AABBS, BOT_SKILL, SPAWN_A, SPAWN_B,
  type Team, type WeaponId, type BodyPart, type BotDifficulty, type PickupKind, type GrenadeKind,
  type NetPlayerState, type NetGrenade, type NetPickup, type NetRoundState, type NetKillEvent, type NetSnapshot,
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
  frags: number
  smokes: number
  kills: number
  deaths: number
  money: number
  streak: number
  lastKillAt: number
  multi: number
  lastShotAt: number
  protectUntil: number
  lastSeenEnemy: number
  lastDamageAt: number
  aiming: boolean          // en pose de apuntado (para la animación)
  sprint: boolean          // corriendo (animación estilo Fortnite)
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

function nearestWaypoint(x: number, z: number): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = Math.hypot(WAYPOINTS[i][0] - x, WAYPOINTS[i][1] - z)
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

  constructor(private difficulty: BotDifficulty = 'normal') {
    // pociones repartidas por el mapa (respawn escalonado)
    let pk = 0
    for (const s of PICKUP_SPOTS) {
      this.pickups.push({
        id: `p${pk++}`, kind: s.kind, x: s.x, z: s.z,
        active: true, respawnAt: 0,
      })
    }
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

  addBots(perTeam: number): void {
    for (let t = 0; t < 2; t++) {
      const team: Team = t === 0 ? 'A' : 'B'
      for (let i = 0; i < perTeam; i++) {
        this.spawnBot(team)
      }
    }
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
      frags: 0, smokes: 0,
      kills: 0, deaths: 0, money: GAME.START_MONEY,
      streak: 0, lastKillAt: 0, multi: 0,
      lastShotAt: 0, protectUntil: 0, lastSeenEnemy: 0, lastDamageAt: 0,
      aiming: false, sprint: false,
    }
    if (bot) {
      p.ai = {
        state: 'patrol', wp: nearestWaypoint(p.x, p.z),
        target: null, reactAt: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafePhase: Math.random() * 2,
        nextShotAt: 0, burst: 0,
        lastScan: Math.floor(Math.random() * 200), lastSeen: 0, lastKnown: null, huntUntil: 0, retreatUntil: 0, crouchUntil: 0,
        aimErr: 0, aimErrNext: 0,
        stuckCheck: now(), lastX: 0, lastZ: 0,
        speedMult: 0.88 + Math.random() * 0.26,
      }
    }
    this.respawnPlayer(p, true)
    return p
  }

  private respawnPlayer(p: SimPlayer, initial = false): void {
    const idx = Array.from(this.players.values()).filter(q => q.team === p.team).indexOf(p)
    const [x, , z] = spawnPoint(p.team, Math.max(0, idx))
    p.x = x; p.y = 0.02; p.z = z
    p.hp = 100
    p.shield = 0
    p.dead = false
    p.crouch = false
    p.lastDamageAt = 0
    p.protectUntil = now() + GAME.SPAWN_PROTECT * 1000
    p.owned = ['knife', 'p9']
    p.weapon = 'p9'
    // granadas de cortesía al reaparecer (mín. 1 de cada una, máx. 2)
    p.frags = clamp(p.frags, 1, 2)
    p.smokes = clamp(p.smokes, 1, 2)
    p.aiming = false
    p.sprint = false
    if (p.ai) {
      p.ai.state = 'patrol'
      p.ai.wp = nearestWaypoint(x, z)
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
  }

  // ------------------------------------------------------------
  // Economía / compra
  // ------------------------------------------------------------
  private spawnX(team: Team): number { return team === 'A' ? SPAWN_A[0] : SPAWN_B[0] }
  private spawnZ(team: Team): number { return team === 'A' ? SPAWN_A[2] : SPAWN_B[2] }

  private inBuyZone(p: SimPlayer): boolean {
    return Math.hypot(p.x - this.spawnX(p.team), p.z - this.spawnZ(p.team)) < GAME.BUY_RADIUS + 2.5
  }

  private botBuy(p: SimPlayer): void {
    if (p.money >= 4750 && Math.random() < 0.22) {
      p.owned = ['knife', 'p9', 'awp338']; p.weapon = 'awp338'; p.money -= 4750
    } else if (p.money >= 2900) {
      const w: WeaponId = Math.random() < 0.5 ? 'cr4' : 'ar47'
      p.owned = ['knife', 'p9', w]; p.weapon = w; p.money -= WEAPONS[w].price
    } else if (p.money >= 1250 && Math.random() < 0.75) {
      p.owned = ['knife', 'p9', 'mp9']; p.weapon = 'mp9'; p.money -= 1250
    } else if (p.money >= 700 && Math.random() < 0.5) {
      p.owned = ['knife', 'p9', 'aguila']; p.weapon = 'aguila'; p.money -= 700
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
      if (p.owned.includes(w.id)) {
        this.emit('refillAmmo', { weapon: w.id }, p.id)
      } else {
        p.owned.push(w.id)
        p.weapon = w.id
        this.emit('giveWeapon', { weapon: w.id }, p.id)
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

  // ------------------------------------------------------------
  // Daño y muerte
  // ------------------------------------------------------------
  private announce(text: string, kind: 'kill' | 'round' | 'info' = 'info', team?: Team): void {
    this.emit('announce', { text, kind, team })
  }

  private applyDamage(attacker: SimPlayer, victim: SimPlayer, dmg: number, part: BodyPart, weapon: WeaponId, dirHint: [number, number]): void {
    if (victim.dead) return
    if (now() < victim.protectUntil) return
    if (attacker.team === victim.team && attacker.id !== victim.id) return

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
      if (killer.team === 'A') this.round.scoresA++; else this.round.scoresB++
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
    if (this.round.scoresA >= GAME.ROUND_KILLS || this.round.scoresB >= GAME.ROUND_KILLS) {
      this.endRound(this.round.scoresA > this.round.scoresB ? 'A' : 'B')
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
    this.round.endsAt = now() + GAME.ROUND_TIME * 1000
    this.round.scoresA = 0
    this.round.scoresB = 0
    this.announce(`RONDA ${this.round.roundNumber} — ¡EN COMBATE!`, 'round')
    for (const p of this.players.values()) {
      p.respawnAt = now() + rand(200, 900)
      p.multi = 0
    }
    this.emit('roundStart', { roundNumber: this.round.roundNumber })
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
      this.emit('econ', { money: p.money }, p.id)
    }
    this.announce('NUEVA PARTIDA — RONDA 1', 'round')
    this.emit('roundStart', { roundNumber: 1 })
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
    if (segmentBlocked(ax, ay, az, bx, by, bz, MAP_AABBS)) return false
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
    for (const q of this.players.values()) {
      if (q.dead || q.team === p.team) continue
      if (now() < q.protectUntil) continue
      const d = dist3(ex, ey, ez, q.x, q.y + 1.2, q.z)
      if (d < bestD && this.canSee(p, q)) { bestD = d; best = q }
    }
    return best
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

      // strafe con cambios aleatorios
      ai.strafePhase += dt
      if (ai.strafePhase > rand(0.7, 1.6)) { ai.strafePhase = 0; ai.strafe *= -1 }
      const perpX = Math.cos(p.yaw) * ai.strafe
      const perpZ = -Math.sin(p.yaw) * ai.strafe
      const combatSpeed = 3.9 * (p.crouch ? 0.5 : 1)
      let vx = perpX * combatSpeed
      let vz = perpZ * combatSpeed
      const pref = w.id === 'awp338' ? 28 : w.id === 'breacher' ? 6 : 13
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
      // --- patrulla con sesgo hacia el territorio enemigo ---
      p.crouch = false
      const [wx, wz] = WAYPOINTS[ai.wp]
      const dx = wx - p.x, dz = wz - p.z
      const d = Math.hypot(dx, dz)
      if (d < 1.4) {
        const edges = WAYPOINT_EDGES[ai.wp]
        if (edges.length) {
          // lejos del enemigo → avanzar con más sesgo; cerca → exploración táctica
          const exX = this.spawnX(p.team === 'A' ? 'B' : 'A')
          const exZ = this.spawnZ(p.team === 'A' ? 'B' : 'A')
          const distEnemy = Math.hypot(p.x - exX, p.z - exZ)
          const bias = distEnemy > 38 ? 0.72 : 0.35
          if (Math.random() < bias) {
            let bestW = edges[0], bestD = Infinity
            for (const e of edges) {
              const dd = Math.hypot(WAYPOINTS[e][0] - exX, WAYPOINTS[e][1] - exZ)
              if (dd < bestD) { bestD = dd; bestW = e }
            }
            ai.wp = bestW
          } else {
            ai.wp = edges[Math.floor(Math.random() * edges.length)]
          }
        } else {
          ai.wp = nearestWaypoint(p.x, p.z)
        }
      } else {
        const wantYaw = Math.atan2(dx, dz)
        p.yaw += this.angleLerp(p.yaw, wantYaw, dt * 5)
        p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
        const nx = p.x + (dx / d) * MOVE * dt
        const nz = p.z + (dz / d) * MOVE * dt
        if (!this.posBlocked(nx, nz)) { p.x = nx; p.z = nz; p.speed = MOVE; p.sprint = MOVE > 4.6 }
        else { ai.wp = nearestWaypoint(p.x, p.z); p.speed = 0 }
      }
    }

    // anti-atasco: si no se mueve, saltar al waypoint más cercano
    if (t - ai.stuckCheck > 2500) {
      if (Math.hypot(p.x - ai.lastX, p.z - ai.lastZ) < 1 && ai.state !== 'combat') {
        ai.wp = nearestWaypoint(p.x, p.z)
        const [tx, tz] = WAYPOINTS[ai.wp]
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
    for (const b of MAP_AABBS) {
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
    const lim = GAME.MAP_HALF - 0.5
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
    const lim = GAME.MAP_HALF - 0.5
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
      for (const b of MAP_AABBS) {
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
      const blocked = segmentBlocked(g.x, g.y + 0.2, g.z, p.x, p.y + 1, p.z, MAP_AABBS)
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
    const lim = GAME.MAP_HALF - 0.5
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
    const minInterval = (60000 / w.rpm) * 0.55
    if (t - p.lastShotAt < minInterval) return
    p.lastShotAt = t
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
      const blocked = segmentBlocked(pos[0], pos[1] + 0.2, pos[2], victim.x, victim.y + 1, victim.z, MAP_AABBS)
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
    }
  }

  private netGrenade(g: SimGrenade): NetGrenade {
    return { id: g.id, x: Math.round(g.x * 100) / 100, y: Math.round(g.y * 100) / 100, z: Math.round(g.z * 100) / 100, team: g.team, kind: g.kind }
  }

  private netPickup(p: SimPickup): NetPickup {
    return { id: p.id, kind: p.kind, x: p.x, z: p.z, active: p.active }
  }

  private netRound(): NetRoundState {
    return {
      phase: this.round.phase,
      timeLeft: Math.max(0, Math.round((this.round.endsAt - now()) / 1000)),
      roundNumber: this.round.roundNumber,
      scoresA: this.round.scoresA, scoresB: this.round.scoresB,
      roundWinsA: this.round.roundWinsA, roundWinsB: this.round.roundWinsB,
    }
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
