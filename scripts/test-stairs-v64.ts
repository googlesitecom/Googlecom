// ============================================================
// v6.4 — Test de transitabilidad de las ESCALERAS INTERIORES
// Reproduce la física del motor (escalón automático 0.58, caja
// 0.36, altura 1.8, resolución por ejes + suelo) y recorre el
// camino REAL del jugador: entra por la puerta, sube tramo a
// tramo cruzando los rellanos, hasta la última planta.
// ============================================================
import { MAP_BOXES, MAP_AABBS } from '../src/game/shared'
import type { MapBox } from '../src/game/shared'

const HALF_W = 0.36
const H = 1.8
const STEP_UP = 0.58
const GRAVITY = 22
const SPEED = 4.6

const aabbs: any[] = (MAP_AABBS as any[]) ?? MAP_BOXES.map((b: MapBox) => (b as any))

function collides(x: number, y: number, z: number, h: number): boolean {
  const minX = x - HALF_W, maxX = x + HALF_W
  const minY = y, maxY = y + h
  const minZ = z - HALF_W, maxZ = z + HALF_W
  for (let i = 0; i < aabbs.length; i++) {
    const b = aabbs[i]
    if (maxX > b.minX && minX < b.maxX && maxY > b.minY && minY < b.maxY && maxZ > b.minZ && minZ < b.maxZ) return true
  }
  return false
}

function groundAt(x: number, y: number, z: number): number {
  let groundY = 0
  for (let i = 0; i < aabbs.length; i++) {
    const b = aabbs[i]
    if (x + HALF_W > b.minX && x - HALF_W < b.maxX && z + HALF_W > b.minZ && z - HALF_W < b.maxZ) {
      if (b.maxY <= y + 0.01 && b.maxY > groundY) groundY = b.maxY
    }
  }
  return groundY
}

interface WalkState { x: number; y: number; z: number; velY: number; onGround: boolean }

/** un frame de la física del motor */
function stepFrame(s: WalkState, dirX: number, dirZ: number): 'moved' | 'blocked' {
  const dt = 1 / 60
  const dist = SPEED * dt
  let blocked = false
  const nx = s.x + dirX * dist
  if (collides(nx, s.y, s.z, H)) {
    if (s.onGround && !collides(nx, s.y + STEP_UP, s.z, H)) { s.y += STEP_UP; s.x = nx; s.velY = 0 }
    else blocked = true
  } else s.x = nx
  const nz = s.z + dirZ * dist
  if (collides(s.x, s.y, nz, H)) {
    if (s.onGround && !collides(s.x, s.y + STEP_UP, nz, H)) { s.y += STEP_UP; s.z = nz; s.velY = 0 }
    else blocked = true
  } else s.z = nz
  s.velY -= GRAVITY * dt
  const ny = s.y + s.velY * dt
  if (s.velY <= 0) {
    const g = groundAt(s.x, s.y, s.z)
    if (ny <= g) { s.y = g; s.velY = 0; s.onGround = true } else { s.y = ny; s.onGround = false }
  } else { s.y = ny; s.onGround = false }
  return blocked ? 'blocked' : 'moved'
}

/** recorre una lista de waypoints; devuelve el estado final y si se trabó */
function journey(start: [number, number], y0: number, wps: [number, number][], label: string): { y: number; x: number; z: number; stuck: boolean } {
  const s: WalkState = { x: start[0], y: y0, z: start[1], velY: 0, onGround: true }
  let stuckMs = 0
  for (const [tx, tz] of wps) {
    // caminar hacia el waypoint en segmentos
    let guard = 0
    while (guard++ < 2400) {
      const dx = tx - s.x, dz = tz - s.z
      const d = Math.hypot(dx, dz)
      if (d < 0.25) break
      const r = stepFrame(s, dx / d, dz / d)
      if (r === 'blocked') stuckMs += 1000 / 60
      else stuckMs = Math.max(0, stuckMs - 16)
      if (stuckMs > 2500) break // rodear mobiliario puede llevar un rato
      if (s.y < -30) break
    }
  }
  const stuck = stuckMs > 2500 || s.y < -30
  console.log(`  ${label}: termina y=${s.y.toFixed(2)} en (${s.x.toFixed(1)}, ${s.z.toFixed(1)})${stuck ? '  ⚠ TRABADO' : ''}`)
  return { y: s.y, x: s.x, z: s.z, stuck }
}

// ------------------------------------------------------------
// HOTEL (19.5, -19.5, 'S'): local → mundo (19.5 - lx, -19.5 - lz)
// ------------------------------------------------------------
console.log('HOTEL — recorrido completo de la escalera interior:')
{
  const w = (lx: number, lz: number): [number, number] => [19.5 - lx, -19.5 - lz]
  const r = journey(
    w(2.0, 5.0), 0,
    [
      w(7.6, 6.0),     // acercarse a la base del tramo A (carril este)
      w(7.6, 1.0),     // subir el tramo A hacia el norte
      w(6.2, -0.15),   // cruzar el rellano norte al carril oeste
      w(6.2, 5.5),     // subir el tramo B hacia el sur
      w(3.0, 6.4),     // salir al forjado P2 por el rellano sur
    ],
    'lobby → P1 → P2',
  )
  const ok = !r.stuck && r.y > 6.3 && r.y < 7.0
  console.log(`  HOTEL: ${ok ? 'OK — se sube hasta P2 sin trabarse' : 'FALLO'}`)
  if (!ok) process.exit(1)
}

// ------------------------------------------------------------
// TORRE ÁMBAR (50, -20, 'S'): 4 tramos en zigzag hasta la azotea
// ------------------------------------------------------------
console.log('TORRE — recorrido completo de la escalera interior:')
{
  const w = (lx: number, lz: number): [number, number] => [50 - lx, -20 - lz]
  const r = journey(
    w(0.0, 3.0), 0,
    [
      w(6.2, 6.0),     // base del t0 (carril este)
      w(6.2, 1.0),     // t0 sube al norte → rellano P1
      w(5.0, -0.15),   // cruza al carril oeste
      w(5.0, 5.5),     // t1 sube al sur → rellano sur P2
      w(6.2, 6.4),     // cruza al carril este por el rellano sur
      w(6.2, 1.0),     // t2 sube al norte → rellano P3
      w(5.0, -0.15),   // cruza al carril oeste
      w(5.0, 5.5),     // t3 sube al sur
      w(2.0, 6.4),     // salida OESTE a la azotea
    ],
    'baja → P1 → P2 → P3 → azotea',
  )
  const ok = !r.stuck && r.y > 11.9 && r.y < 12.9
  console.log(`  TORRE: ${ok ? 'OK — se sube hasta la azotea sin trabarse' : 'FALLO'}`)
  if (!ok) process.exit(1)
}

// ------------------------------------------------------------
// CASA GRANDE (16, 50, 'W') — regresión: su escalera sigue sana
// ------------------------------------------------------------
console.log('CASA GRANDE — regresión de la escalera interior:')
{
  // facing W (270°): lx,lz → mundo: ang=3π/2 → c=0, s=-1 → rx = lz, rz = -lx... según BR:
  // rx = lx*c - lz*s = lz ; rz = lx*s + lz*c = -lx  → mundo (16 + lz, 50 - lx)
  const w = (lx: number, lz: number): [number, number] => [16 + lz, 50 - lx]
  const r = journey(
    w(0.0, 3.5), 0,
    [
      w(3.55, 3.5),    // frente de la escalera (base z local 2.7, entrada sur)
      w(3.55, -2.0),   // subir (hacia -z local)
      w(0.5, 0.0),     // salir al forjado de la 2.ª planta
    ],
    'baja → 2.ª planta',
  )
  const ok = !r.stuck && r.y > 3.0 && r.y < 4.0
  console.log(`  CASA GRANDE: ${ok ? 'OK' : 'FALLO'}`)
  if (!ok) process.exit(1)
}

console.log('ESCALERAS INTERIORES: TODO OK')
