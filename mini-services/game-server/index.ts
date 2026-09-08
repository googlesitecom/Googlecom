// ============================================================
// FRONTERA CERO — Servidor de juego (Socket.io)
// Multijugador, bots con IA, rondas, economía, granadas
// ============================================================
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import {
  GAME, WEAPONS, BUY_ITEMS, computeDamage, spawnPoint, segmentBlocked,
  WAYPOINTS, WAYPOINT_EDGES, BOT_NAMES, MAP_AABBS,
  weaponIndex, weaponByIndex,
  type Team, type WeaponId, type BodyPart,
  type NetPlayerState, type NetGrenade, type NetRoundState, type NetKillEvent, type NetSnapshot,
} from './shared'

interface BotAI {
  state: 'patrol' | 'combat'
  wp: number          // waypoint actual al que se dirige
  target: string | null
  reactAt: number     // ms timestamp en que puede empezar a disparar
  strafe: number      // -1/1
  strafePhase: number
  nextShotAt: number
  burst: number
  lastMoveCheck: number
  lastX: number; lastZ: number
  lastPosChange: number
}

interface Player {
  id: string
  name: string
  team: Team
  bot: boolean
  x: number; y: number; z: number
  yaw: number; pitch: number
  crouch: boolean
  speed: number
  hp: number
  armor: number
  dead: boolean
  respawnAt: number
  weapon: WeaponId
  owned: WeaponId[]
  frags: number
  kills: number
  deaths: number
  money: number
  streak: number
  lastKillAt: number
  multi: number
  lastShotAt: number
  protectUntil: number
  lastSeenEnemy: number
  socket?: Socket
  ai?: BotAI
}

interface Grenade {
  id: string
  owner: string
  team: Team
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  fuse: number
  bornAt: number
}

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const players = new Map<string, Player>()
const grenades = new Map<string, Grenade>()
let grenadeSeq = 0

// Estado de ronda
const round = {
  phase: 'live' as 'live' | 'ended' | 'matchend',
  endsAt: Date.now() + GAME.ROUND_TIME * 1000,
  intermissionEndsAt: 0,
  roundNumber: 1,
  scoresA: 0,
  scoresB: 0,
  roundWinsA: 0,
  roundWinsB: 0,
}

function now(): number { return Date.now() }
function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz)
}
function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)) }
function rand(a: number, b: number): number { return a + Math.random() * (b - a) }

// ------------------------------------------------------------
// Creación de jugadores
// ------------------------------------------------------------
function teamCounts(): { A: number; B: number } {
  const c = { A: 0, B: 0 }
  for (const p of players.values()) c[p.team]++
  return c
}

function pickTeam(): Team {
  const c = teamCounts()
  return c.A <= c.B ? 'A' : 'B'
}

function createPlayer(id: string, name: string, team: Team, bot: boolean, socket?: Socket): Player {
  const p: Player = {
    id, name, team, bot,
    x: 0, y: 0, z: 0,
    yaw: team === 'A' ? Math.PI * 0.25 : -Math.PI * 0.75,
    pitch: 0,
    crouch: false, speed: 0,
    hp: 100, armor: 0, dead: false, respawnAt: 0,
    weapon: 'p9',
    owned: ['knife', 'p9'],
    frags: 0,
    kills: 0, deaths: 0, money: GAME.START_MONEY,
    streak: 0, lastKillAt: 0, multi: 0,
    lastShotAt: 0, protectUntil: 0, lastSeenEnemy: 0,
    socket,
  }
  if (bot) {
    p.ai = {
      state: 'patrol', wp: nearestWaypoint(team === 'A' ? SPAWN_X_A : SPAWN_X_B, team === 'A' ? SPAWN_Z_A : SPAWN_Z_B),
      target: null, reactAt: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafePhase: Math.random() * 10,
      nextShotAt: 0, burst: 0, lastMoveCheck: 0, lastX: 0, lastZ: 0, lastPosChange: now(),
    }
  }
  respawnPlayer(p, true)
  return p
}

const SPAWN_X_A = -28, SPAWN_Z_A = -28, SPAWN_X_B = 28, SPAWN_Z_B = 28

function nearestWaypoint(x: number, z: number): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = Math.hypot(WAYPOINTS[i][0] - x, WAYPOINTS[i][1] - z)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

function respawnPlayer(p: Player, initial = false): void {
  const idx = Array.from(players.values()).filter(q => q.team === p.team).indexOf(p)
  const [x, , z] = spawnPoint(p.team, Math.max(0, idx))
  p.x = x; p.y = 0.02; p.z = z
  p.hp = 100
  p.dead = false
  p.crouch = false
  p.protectUntil = now() + GAME.SPAWN_PROTECT * 1000
  // Al morir se pierden las armas compradas (estilo CS)
  if (!initial) {
    p.owned = ['knife', 'p9']
    p.weapon = 'p9'
    p.frags = Math.min(p.frags, 0)
  } else {
    p.owned = ['knife', 'p9']
    p.weapon = 'p9'
  }
  if (p.bot) botBuy(p)
  // notificar al propio jugador
  p.socket?.emit('spawnEvent', {
    pos: [p.x, p.y, p.z],
    yaw: p.yaw,
    hp: p.hp, armor: p.armor,
    weapons: p.owned,
    weapon: p.weapon,
    frags: p.frags,
    money: p.money,
    protect: GAME.SPAWN_PROTECT,
  })
}

// ------------------------------------------------------------
// Economía / compra
// ------------------------------------------------------------
function inBuyZone(p: Player): boolean {
  const bx = p.team === 'A' ? SPAWN_X_A : SPAWN_X_B
  const bz = p.team === 'A' ? SPAWN_Z_A : SPAWN_Z_B
  return Math.hypot(p.x - bx, p.z - bz) < GAME.BUY_RADIUS + 2
}

function botBuy(p: Player): void {
  // los bots compran según su presupuesto
  if (p.money >= 4750 && Math.random() < 0.22) {
    p.owned = ['knife', 'p9', 'awp338']; p.weapon = 'awp338'; p.money -= 4750
  } else if (p.money >= 2900) {
    const w: WeaponId = Math.random() < 0.5 ? 'cr4' : 'ar47'
    p.owned = ['knife', 'p9', w]; p.weapon = w; p.money -= WEAPONS[w].price
  } else if (p.money >= 1800 && Math.random() < 0.6) {
    p.owned = ['knife', 'p9', 'mp9']; p.weapon = 'mp9'; p.money -= 1250
  } else if (p.money >= 1250) {
    p.owned = ['knife', 'p9', 'mp9']; p.weapon = 'mp9'; p.money -= 1250
  } else if (p.money >= 700 && Math.random() < 0.5) {
    p.owned = ['knife', 'p9', 'aguila']; p.weapon = 'aguila'; p.money -= 700
  }
  if (p.money >= 1000 && p.armor < 50) { p.armor = 100; p.money -= 1000 }
  if (p.money >= 600 && p.frags < 1 && Math.random() < 0.4) { p.frags = 1; p.money -= 300 }
}

function handleBuy(p: Player, itemId: string): void {
  const item = BUY_ITEMS.find(i => i.id === itemId)
  if (!item) return void p.socket?.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Artículo desconocido' })
  if (p.dead) return void p.socket?.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Estás eliminado' })
  if (!inBuyZone(p)) return void p.socket?.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Sal de combate: compra solo en tu base' })
  if (p.money < item.price) return void p.socket?.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Fondos insuficientes' })

  if (item.weapon) {
    const w = WEAPONS[item.weapon]
    p.money -= item.price
    if (p.owned.includes(w.id)) {
      // recomprar = munición completa
      p.socket?.emit('refillAmmo', { weapon: w.id })
    } else {
      p.owned.push(w.id)
      p.weapon = w.id
      p.socket?.emit('giveWeapon', { weapon: w.id })
    }
  } else if (item.equip === 'armor') {
    p.money -= item.price
    p.armor = 100
  } else if (item.equip === 'frag') {
    if (p.frags >= 2) {
      return void p.socket?.emit('buyResult', { ok: false, itemId, money: p.money, error: 'Máximo 2 granadas' })
    }
    p.money -= item.price
    p.frags++
  }
  p.socket?.emit('buyResult', { ok: true, itemId, money: p.money })
  p.socket?.emit('econ', { money: p.money, frags: p.frags })
}

// ------------------------------------------------------------
// Daño y muerte
// ------------------------------------------------------------
function announce(text: string, kind: 'kill' | 'round' | 'info' = 'info', team?: Team): void {
  io.emit('announce', { text, kind, team })
}

function applyDamage(attacker: Player, victim: Player, dmg: number, part: BodyPart, weapon: WeaponId, dirHint: [number, number]): void {
  if (victim.dead) return
  if (now() < victim.protectUntil) return
  if (attacker.team === victim.team && attacker.id !== victim.id) return

  // armadura absorbe
  if (victim.armor > 0 && part !== 'legs') {
    const absorbed = Math.min(victim.armor, Math.round(dmg * 0.5))
    victim.armor -= absorbed
    dmg -= absorbed
  }
  victim.hp -= dmg

  const w = WEAPONS[weapon]
  io.to(victim.id).emit('takeDamage', {
    attacker: attacker.id, dmg, part, weapon,
    dir: dirHint,
    attackerPos: [attacker.x, attacker.y, attacker.z],
  })
  if (attacker.id !== victim.id && !attacker.bot) {
    io.to(attacker.id).emit('hitConfirm', { victim: victim.id, dmg, part, weapon, headshot: part === 'head', victimHp: Math.max(0, victim.hp) })
  }
  // sonido de impacto para todos los cercanos
  io.emit('damageFX', { x: victim.x, y: victim.y + 1.2, z: victim.z, part })

  // los bots reaccionan al recibir daño
  if (victim.bot && victim.ai) {
    victim.ai.target = attacker.id
    victim.ai.reactAt = now() + rand(150, 450)
    victim.ai.state = 'combat'
  }

  if (victim.hp <= 0) killPlayer(attacker, victim, weapon, part === 'head')
}

function killPlayer(killer: Player, victim: Player, weapon: WeaponId, headshot: boolean): void {
  victim.dead = true
  victim.hp = 0
  victim.deaths++
  victim.streak = 0
  victim.respawnAt = now() + GAME.RESPAWN_TIME * 1000
  victim.frags = 0

  if (killer.id !== victim.id) {
    killer.kills++
    killer.streak++
    const t = now()
    killer.multi = (t - killer.lastKillAt < 4000) ? killer.multi + 1 : 1
    killer.lastKillAt = t
    killer.money = Math.min(GAME.MAX_MONEY, killer.money + GAME.KILL_REWARD + (headshot ? GAME.HS_REWARD : 0))
    if (killer.team === 'A') round.scoresA++; else round.scoresB++
  }

  const ev: NetKillEvent = {
    killer: killer.id, killerName: killer.name, killerTeam: killer.team,
    victim: victim.id, victimName: victim.name, victimTeam: victim.team,
    weapon, headshot,
    killerStreak: killer.streak,
    multi: killer.multi,
  }
  io.emit('kill', ev)

  // anuncios de racha / multimuerte
  const msgs: string[] = []
  if (killer.multi === 2) msgs.push('¡DOBLE MUERTE!')
  else if (killer.multi === 3) msgs.push('¡TRIPLE MUERTE!')
  else if (killer.multi === 4) msgs.push('¡FURIA LETAL!')
  else if (killer.multi >= 5) msgs.push('¡MASACRE!')
  if (killer.streak === 5) msgs.push(`${killer.name}: RACHA DE 5`)
  else if (killer.streak === 8) msgs.push(`${killer.name}: RACHA DE 8`)
  else if (killer.streak === 10) msgs.push(`${killer.name}: ¡IMPARABLE!`)
  if (killer.streak === 12) msgs.push(`${killer.name}: ¡DIOS DE LA GUERRA!`)
  for (const m of msgs) announce(m, 'kill', killer.team)

  io.to(victim.id).emit('deathEvent', { killer: killer.id, killerName: killer.name, weapon, respawnIn: GAME.RESPAWN_TIME })

  checkRoundEnd()
}

function checkRoundEnd(): void {
  if (round.phase !== 'live') return
  if (round.scoresA >= GAME.ROUND_KILLS || round.scoresB >= GAME.ROUND_KILLS) {
    endRound(round.scoresA > round.scoresB ? 'A' : 'B')
  }
}

function endRound(winner: Team): void {
  round.phase = 'ended'
  round.intermissionEndsAt = now() + 6000
  if (winner === 'A') round.roundWinsA++; else round.roundWinsB++
  announce(`RONDA ${round.roundNumber} PARA ${winner === 'A' ? 'ÁMBAR' : 'VERDE'}`, 'round')
  io.emit('roundEnd', { winner, scoresA: round.scoresA, scoresB: round.scoresB, roundWinsA: round.roundWinsA, roundWinsB: round.roundWinsB })

  // recompensas económicas
  for (const p of players.values()) {
    p.money = Math.min(GAME.MAX_MONEY, p.money + (p.team === winner ? GAME.WIN_REWARD : GAME.LOSE_REWARD))
    p.socket?.emit('econ', { money: p.money })
  }
}

function startRound(): void {
  round.roundNumber++
  round.phase = 'live'
  round.endsAt = now() + GAME.ROUND_TIME * 1000
  round.scoresA = 0
  round.scoresB = 0
  announce(`RONDA ${round.roundNumber} — ¡EN COMBATE!`, 'round')
  for (const p of players.values()) {
    p.respawnAt = now() + rand(200, 900)
    p.multi = 0
  }
  io.emit('roundStart', { roundNumber: round.roundNumber })
}

function endMatch(winner: Team): void {
  round.phase = 'matchend'
  round.intermissionEndsAt = now() + 12000
  announce(`¡VICTORIA FINAL PARA ${winner === 'A' ? 'ESCUADRÓN ÁMBAR' : 'ESCUADRÓN VERDE'}!`, 'round')
  io.emit('matchEnd', { winner, roundWinsA: round.roundWinsA, roundWinsB: round.roundWinsB })
}

function resetMatch(): void {
  round.roundNumber = 1
  round.roundWinsA = 0
  round.roundWinsB = 0
  round.scoresA = 0
  round.scoresB = 0
  round.phase = 'live'
  round.endsAt = now() + GAME.ROUND_TIME * 1000
  for (const p of players.values()) {
    p.kills = 0; p.deaths = 0; p.streak = 0; p.money = GAME.START_MONEY
    p.respawnAt = now() + rand(200, 900)
    p.socket?.emit('econ', { money: p.money })
  }
  announce('NUEVA PARTIDA — RONDA 1', 'round')
  io.emit('roundStart', { roundNumber: 1 })
}

// ------------------------------------------------------------
// BOTS — IA
// ------------------------------------------------------------
function eye(p: Player): [number, number, number] { return [p.x, p.y + 1.55, p.z] }

function canSee(a: Player, b: Player): boolean {
  const [ax, ay, az] = eye(a)
  const bx = b.x, by = b.y + (b.crouch ? 0.9 : 1.2), bz = b.z
  const d = dist3(ax, ay, az, bx, by, bz)
  if (d > 46) return false
  return !segmentBlocked(ax, ay, az, bx, by, bz, MAP_AABBS)
}

function botFindTarget(p: Player): Player | null {
  let best: Player | null = null
  let bestD = Infinity
  const [ex, ey, ez] = eye(p)
  for (const q of players.values()) {
    if (q.dead || q.team === p.team) continue
    if (now() < q.protectUntil) continue
    const d = dist3(ex, ey, ez, q.x, q.y + 1.2, q.z)
    if (d < bestD && canSee(p, q)) { bestD = d; best = q }
  }
  return best
}

function botUpdate(p: Player, dt: number, t: number): void {
  const ai = p.ai!
  if (p.dead) return

  // --- objetivo ---
  if (t - (p.lastSeenEnemy || 0) > 400) {
    p.lastSeenEnemy = t
    const target = botFindTarget(p)
    if (target) {
      if (ai.target !== target.id) {
        ai.target = target.id
        ai.reactAt = t + rand(350, 700)   // tiempo de reacción humano
        ai.burst = 0
      }
      ai.state = 'combat'
    } else if (ai.state === 'combat' && (!ai.target || !players.get(ai.target))) {
      ai.state = 'patrol'
      ai.target = null
    }
  }

  const target = ai.target ? players.get(ai.target) : undefined
  const MOVE = 4.4

  if (ai.state === 'combat' && target && !target.dead) {
    const d = dist3(p.x, p.y, p.z, target.x, target.y, target.z)
    // mirar al objetivo con error angular decreciente
    const aimT = clamp((t - ai.reactAt) / 900, 0, 1)
    const err = (1 - aimT) * 0.20 + clamp(d / 46, 0, 1) * 0.10 + (target.speed > 3 ? 0.05 : 0.02)
    const wantYaw = Math.atan2(target.x - p.x, target.z - p.z)
    const dy = target.y + 1.1 - (p.y + 1.55)
    const flat = Math.hypot(target.x - p.x, target.z - p.z)
    const wantPitch = Math.atan2(dy, flat)
    p.yaw += (wantYaw - p.yaw + err * Math.sin(t * 0.013 + p.id.length)) * Math.min(1, dt * 8)
    p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * 8)

    // strafe circular
    ai.strafePhase += dt
    if (ai.strafePhase > 1.1) { ai.strafePhase = 0; ai.strafe *= -1 }
    const perpX = Math.cos(p.yaw) * ai.strafe
    const perpZ = -Math.sin(p.yaw) * ai.strafe
    let vx = perpX * MOVE * 0.75
    let vz = perpZ * MOVE * 0.75
    // mantener distancia preferida según arma
    const w = WEAPONS[p.weapon]
    const pref = w.id === 'awp338' ? 26 : w.id === 'breacher' ? 6 : 13
    const toX = (target.x - p.x) / (d || 1)
    const toZ = (target.z - p.z) / (d || 1)
    if (d > pref + 3) { vx += toX * MOVE * 0.7; vz += toZ * MOVE * 0.7 }
    else if (d < pref - 3) { vx -= toX * MOVE * 0.7; vz -= toZ * MOVE * 0.7 }

    const nx = p.x + vx * dt, nz = p.z + vz * dt
    if (!posBlocked(nx, p.y, nz)) { p.x = nx; p.z = nz }
    else if (!posBlocked(p.x + vx * dt, p.y, p.z)) { p.x += vx * dt }
    else if (!posBlocked(p.x, p.y, p.z + vz * dt)) { p.z += vz * dt }
    p.speed = Math.hypot(vx, vz)

    // --- disparo ---
    if (t > ai.reactAt && t > ai.nextShotAt && canSee(p, target)) {
      botShoot(p, target, d)
    }
  } else {
    // --- patrulla ---
    const [wx, wz] = WAYPOINTS[ai.wp]
    const dx = wx - p.x, dz = wz - p.z
    const d = Math.hypot(dx, dz)
    if (d < 1.2) {
      const edges = WAYPOINT_EDGES[ai.wp]
      ai.wp = edges.length ? edges[Math.floor(Math.random() * edges.length)] : nearestWaypoint(p.x, p.z)
    } else {
      const wantYaw = Math.atan2(dx, dz)
      p.yaw += Math.abs(wantYaw - p.yaw) > Math.PI
        ? ((wantYaw > p.yaw ? wantYaw - Math.PI * 2 : wantYaw + Math.PI * 2) - p.yaw) * Math.min(1, dt * 5)
        : (wantYaw - p.yaw) * Math.min(1, dt * 5)
      p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
      const nx = p.x + (dx / d) * MOVE * dt
      const nz = p.z + (dz / d) * MOVE * dt
      if (!posBlocked(nx, p.y, nz)) { p.x = nx; p.z = nz; p.speed = MOVE }
      else { ai.wp = nearestWaypoint(p.x, p.z); p.speed = 0 }
    }
    // si se queda atascado, teletransporte de emergencia
    if (t - ai.lastMoveCheck > 2500) {
      if (Math.hypot(p.x - ai.lastX, p.z - ai.lastZ) < 1) {
        ai.wp = nearestWaypoint(p.x, p.z)
        const [tx, tz] = WAYPOINTS[ai.wp]
        p.x = tx; p.z = tz
      }
      ai.lastX = p.x; ai.lastZ = p.z; ai.lastMoveCheck = t
    }
  }
  p.y = 0.02
}

function posBlocked(x: number, y: number, z: number): boolean {
  for (const b of MAP_AABBS) {
    if (x > b.minX - 0.35 && x < b.maxX + 0.35 && z > b.minZ - 0.35 && z < b.maxZ + 0.35 && b.minY < 1.6) return true
  }
  return false
}

function botShoot(p: Player, target: Player, d: number): void {
  const ai = p.ai!
  const w = WEAPONS[p.weapon]
  const t = now()
  const interval = 60000 / w.rpm

  // ráfagas
  if (w.auto) {
    if (ai.burst <= 0) {
      if (t < ai.nextShotAt) return
      ai.burst = Math.floor(rand(3, 9))
    }
    ai.burst--
    ai.nextShotAt = t + interval + (ai.burst <= 0 ? rand(280, 600) : 0)
  } else {
    if (t < ai.nextShotAt) return
    ai.nextShotAt = t + Math.max(interval, w.id === 'awp338' ? rand(1500, 2100) : interval + rand(80, 300))
  }

  p.lastShotAt = t

  // precisión según distancia/arma
  let hitChance = 0.82 - clamp((d - 10) / 60, 0, 0.55)
  if (target.speed > 3.5) hitChance -= 0.12
  if (target.crouch) hitChance += 0.04
  if (w.id === 'awp338') hitChance = d < 40 ? 0.75 : 0.55
  if (w.id === 'breacher') hitChance = d < 8 ? 0.9 : 0.45

  const hit = Math.random() < hitChance
  // punto de impacto para efectos visuales
  const aimY = target.y + 1.2
  const spread = hit ? 0 : rand(0.4, 1.4)
  const hitPos: [number, number, number] = hit
    ? [target.x, aimY, target.z]
    : [target.x + rand(-1, 1) * spread, aimY + rand(-0.5, 0.8), target.z + rand(-1, 1) * spread]

  io.emit('shotFired', {
    playerId: p.id,
    origin: [p.x, p.y + 1.5, p.z],
    hit: hitPos,
    weapon: p.weapon,
  })

  if (hit) {
    // parte del cuerpo probable
    const r = Math.random()
    const part: BodyPart = r < (d < 18 ? 0.16 : 0.07) ? 'head' : r < 0.85 ? 'body' : 'legs'
    const dmg = computeDamage(w, part, d, target.armor)
    const dx = p.x - target.x, dz = p.z - target.z
    applyDamage(p, target, dmg, part, p.weapon, [dx, dz])
  } else {
    // balas perdidas asustan a los humanos cerca
  }
}

// ------------------------------------------------------------
// Granadas
// ------------------------------------------------------------
function throwGrenade(p: Player, pos: [number, number, number], vel: [number, number, number]): void {
  if (p.dead || p.frags <= 0) return
  p.frags--
  const id = `g${grenadeSeq++}`
  const g: Grenade = {
    id, owner: p.id, team: p.team,
    x: pos[0], y: pos[1], z: pos[2],
    vx: vel[0], vy: vel[1], vz: vel[2],
    fuse: 2.4, bornAt: now(),
  }
  grenades.set(id, g)
  io.emit('grenadeSpawn', { id, owner: p.id, pos, vel })
  p.socket?.emit('econ', { money: p.money, frags: p.frags })
}

function updateGrenades(dt: number): void {
  for (const g of grenades.values()) {
    g.fuse -= dt
    if (g.fuse <= 0) { explodeGrenade(g); continue }
    g.vy -= GAME.GRAVITY * dt
    let nx = g.x + g.vx * dt
    let ny = g.y + g.vy * dt
    let nz = g.z + g.vz * dt
    // rebote en el suelo
    if (ny < 0.12) {
      ny = 0.12
      g.vy = -g.vy * 0.42
      g.vx *= 0.72
      g.vz *= 0.72
    }
    // rebote simple en muros
    for (const b of MAP_AABBS) {
      if (nx > b.minX - 0.1 && nx < b.maxX + 0.1 && ny > b.minY - 0.1 && ny < b.maxY + 0.1 && nz > b.minZ - 0.1 && nz < b.maxZ + 0.1) {
        // eje de menor penetración
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
    g.x = clamp(nx, -34.5, 34.5)
    g.y = Math.max(0.12, ny)
    g.z = clamp(nz, -34.5, 34.5)
  }
}

function explodeGrenade(g: Grenade): void {
  grenades.delete(g.id)
  io.emit('grenadeExplode', { id: g.id, pos: [g.x, g.y, g.z] })
  const owner = players.get(g.owner)
  const RADIUS = 6.5
  for (const p of players.values()) {
    if (p.dead) continue
    const d = dist3(g.x, g.y, g.z, p.x, p.y + 1, p.z)
    if (d > RADIUS) continue
    const blocked = segmentBlocked(g.x, g.y + 0.2, g.z, p.x, p.y + 1, p.z, MAP_AABBS)
    let dmg = 112 * (1 - d / RADIUS) * (blocked ? 0.35 : 1)
    dmg = Math.round(dmg)
    if (dmg < 8) continue
    if (owner) {
      const dx = g.x - p.x, dz = g.z - p.z
      applyDamage(owner, p, dmg, 'body', 'knife', [dx, dz]) // granada: parte cuerpo
    }
  }
}

// ------------------------------------------------------------
// Loop principal
// ------------------------------------------------------------
let lastTick = now()
let tickCount = 0

function tick(): void {
  const t = now()
  let dt = (t - lastTick) / 1000
  lastTick = t
  dt = Math.min(dt, 0.1)
  tickCount++

  // --- respawn de jugadores ---
  for (const p of players.values()) {
    if (p.dead && t >= p.respawnAt && round.phase === 'live') respawnPlayer(p)
  }

  // --- bots ---
  for (const p of players.values()) {
    if (p.bot) botUpdate(p, dt, t)
  }

  // --- granadas ---
  updateGrenades(dt)

  // --- fin de ronda por tiempo ---
  if (round.phase === 'live' && t > round.endsAt) {
    const winner = round.scoresA === round.scoresB ? (teamCounts().A <= teamCounts().B ? 'A' : 'B') : (round.scoresA > round.scoresB ? 'A' : 'B')
    endRound(winner)
  } else if (round.phase === 'ended' && t > round.intermissionEndsAt) {
    if (round.roundWinsA >= GAME.ROUNDS_TO_WIN || round.roundWinsB >= GAME.ROUNDS_TO_WIN) {
      endMatch(round.roundWinsA > round.roundWinsB ? 'A' : 'B')
    } else startRound()
  } else if (round.phase === 'matchend' && t > round.intermissionEndsAt) {
    resetMatch()
  }

  // --- snapshot ---
  if (tickCount % GAME.SNAPSHOT_EVERY === 0) broadcastSnapshot()
}

function netPlayer(p: Player): NetPlayerState {
  return {
    id: p.id, name: p.name, team: p.team, bot: p.bot,
    x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100,
    yaw: Math.round(p.yaw * 1000) / 1000,
    pitch: Math.round(p.pitch * 1000) / 1000,
    hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
    weapon: p.weapon, dead: p.dead, crouch: p.crouch,
    speed: Math.round(p.speed * 10) / 10,
    kills: p.kills, deaths: p.deaths, money: p.money, streak: p.streak,
  }
}

function netGrenade(g: Grenade): NetGrenade {
  return { id: g.id, x: Math.round(g.x * 100) / 100, y: Math.round(g.y * 100) / 100, z: Math.round(g.z * 100) / 100, team: g.team }
}

function netRound(): NetRoundState {
  return {
    phase: round.phase,
    timeLeft: Math.max(0, Math.round((round.endsAt - now()) / 1000)),
    roundNumber: round.roundNumber,
    scoresA: round.scoresA, scoresB: round.scoresB,
    roundWinsA: round.roundWinsA, roundWinsB: round.roundWinsB,
  }
}

function broadcastSnapshot(): void {
  const snap: NetSnapshot = {
    t: now(),
    players: Array.from(players.values()).map(netPlayer),
    grenades: Array.from(grenades.values()).map(netGrenade),
    round: netRound(),
  }
  io.emit('snapshot', snap)
}

setInterval(tick, GAME.TICK)

// ------------------------------------------------------------
// Bots iniciales
// ------------------------------------------------------------
const usedNames = new Set<string>()
function botName(): string {
  for (const n of BOT_NAMES) {
    if (!usedNames.has(n)) { usedNames.add(n); return n }
  }
  const i = 1
  const nm = `BOT-${i}${Math.floor(Math.random() * 90 + 10)}`
  usedNames.add(nm)
  return nm
}

for (let i = 0; i < GAME.BOT_COUNT; i++) {
  const id = `bot-${i}`
  const team: Team = i % 2 === 0 ? 'A' : 'B'
  players.set(id, createPlayer(id, botName(), team, true))
}
console.log(`[FRONTERA CERO] ${GAME.BOT_COUNT} bots desplegados`)

// ------------------------------------------------------------
// Conexiones de jugadores humanos
// ------------------------------------------------------------
io.on('connection', (socket: Socket) => {
  console.log(`Jugador conectado: ${socket.id}`)

  let player: Player | null = null

  socket.on('join', (data: { name: string }) => {
    if (player) return
    const name = String(data?.name || 'Operador').slice(0, 16).trim() || 'Operador'
    const team = pickTeam()
    player = createPlayer(socket.id, name, team, false, socket)
    players.set(socket.id, player)

    socket.emit('welcome', {
      id: socket.id,
      name, team,
      players: Array.from(players.values()).map(netPlayer),
      round: netRound(),
      econ: { money: player.money, frags: player.frags },
    })
    io.emit('playerJoined', { id: socket.id, name, team })
    console.log(`${name} se unió al ${team === 'A' ? 'ÁMBAR' : 'VERDE'} (${players.size} jugadores)`)
  })

  socket.on('input', (data: {
    pos: [number, number, number], yaw: number, pitch: number,
    crouch: boolean, speed: number, weapon: string
  }) => {
    if (!player || player.dead) return
    const p = player
    const [x, y, z] = data.pos
    // validación básica dentro del mapa
    p.x = clamp(Number(x) || 0, -34.5, 34.5)
    p.y = clamp(Number(y) || 0, -1, 30)
    p.z = clamp(Number(z) || 0, -34.5, 34.5)
    p.yaw = Number(data.yaw) || 0
    p.pitch = clamp(Number(data.pitch) || 0, -1.4, 1.4)
    p.crouch = !!data.crouch
    p.speed = clamp(Number(data.speed) || 0, 0, 12)
    const wid = data.weapon as WeaponId
    if (wid && WEAPONS[wid]) p.weapon = wid
  })

  socket.on("hits", (data: {
    weapon: WeaponId, pellets: number,
    hits: { target: string, part: BodyPart, dist: number }[]
  }) => {
    if (!player || player.dead) return
    const w = WEAPONS[data.weapon]
    if (!w) return
    // rate limit aproximado por RPM (una validación por disparo)
    const t = now()
    const minInterval = (60000 / w.rpm) * 0.55
    if (t - player.lastShotAt < minInterval) return
    player.lastShotAt = t
    const maxHits = Math.max(1, w.pellets)
    let count = 0
    for (const h of (data.hits || []).slice(0, maxHits)) {
      const victim = players.get(String(h.target))
      if (!victim || victim.dead || victim.team === player.team) continue
      const dist = clamp(Number(h.dist) || 10, 0, 200)
      const dmg = computeDamage(w, h.part, dist, victim.armor)
      const dx = player.x - victim.x, dz = player.z - victim.z
      applyDamage(player, victim, dmg, h.part, data.weapon, [dx, dz])
      count++
      // rate limit no se vuelve a comprobar dentro del mismo disparo
      player.lastShotAt = t
    }
    void count
  })

  socket.on('buy', (data: { itemId: string }) => {
    if (player) handleBuy(player, String(data?.itemId))
  })

  socket.on('grenadeThrow', (data: { pos: [number, number, number], vel: [number, number, number] }) => {
    if (!player) return
    const pos = [clamp(Number(data.pos?.[0]) || 0, -34, 34), clamp(Number(data.pos?.[1]) || 1, 0.2, 30), clamp(Number(data.pos?.[2]) || 0, -34, 34)] as [number, number, number]
    const vel = data.vel as [number, number, number]
    throwGrenade(player, pos, [Number(vel?.[0]) || 0, Number(vel?.[1]) || 5, Number(vel?.[2]) || 0])
  })

  socket.on('disconnect', () => {
    if (player) {
      players.delete(player.id)
      io.emit('playerLeft', { id: player.id, name: player.name })
      console.log(`${player.name} abandonó la partida (${players.size} jugadores)`)
    }
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[FRONTERA CERO] Servidor de juego en puerto ${PORT}`)
})
