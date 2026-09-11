// ============================================================
// v8 — Test de transitabilidad de PUERTAS de todos los edificios
// del modo normal (ciudad). Reproduce la física del motor y cruza
// cada acceso principal desde FUERA hacia DENTRO: detecta puertas
// estrechas, mobiliario que bloquea el paso y escalones imposibles.
// ============================================================
import { MAP_AABBS } from '../src/game/shared'

const HALF_W = 0.36
const H = 1.8
const STEP_UP = 0.58
const GRAVITY = 22
const SPEED = 4.6
const aabbs: any[] = (MAP_AABBS as any[]) ?? []

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

function crossDoor(from: [number, number], to: [number, number], label: string): boolean {
  const s = { x: from[0], y: 0, z: from[1], velY: 0, onGround: true }
  let stuckMs = 0
  let guard = 0
  while (guard++ < 3000) {
    const dx = to[0] - s.x, dz = to[1] - s.z
    const d = Math.hypot(dx, dz)
    if (d < 0.3) break
    const dt = 1 / 60
    const dist = SPEED * dt
    let blocked = false
    const nx = s.x + (dx / d) * dist
    if (collides(nx, s.y, s.z, H)) {
      if (s.onGround && !collides(nx, s.y + STEP_UP, s.z, H)) { s.y += STEP_UP; s.x = nx; s.velY = 0 }
      else blocked = true
    } else s.x = nx
    const nz = s.z + (dz / d) * dist
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
    if (blocked) stuckMs += 1000 / 60
    else stuckMs = Math.max(0, stuckMs - 16)
    if (stuckMs > 2000) break
  }
  const ok = stuckMs <= 2000 && Math.hypot(to[0] - s.x, to[1] - s.z) < 0.5
  console.log(`  ${label}: ${ok ? 'OK' : `FALLO (termina en ${s.x.toFixed(1)}, ${s.z.toFixed(1)}, y=${s.y.toFixed(2)})`}`)
  return ok
}

console.log('PUERTAS DE LOS EDIFICIOS (fuera → dentro):')
let fails = 0
const cases: [string, [number, number], [number, number]][] = [
  ['Hotel — entrada principal', [19.5, -13.5], [19.5, -6.5]],
  ['Torre Ámbar — vestíbulo (de fuera hacia dentro)', [47, -6.5], [47, -13.0]],
  ['Mercado — puerta norte', [19.5, -38.0], [19.5, -44.0]],
  ['Mercado — puerta este', [33.0, -52], [26.0, -52]],
  ['Casa pequeña (46,13.5) — porche', [46, 5.0], [46, 11.0]],
  ['Casa pequeña (16,16) — porche', [8.0, 16], [15.0, 16]],
  ['Casa grande (16,50) — porche', [5.0, 50], [13.0, 50]],
  ['Almacén norte — puerta grande (muelle)', [-19.5, -34.0], [-19.5, -24.0]],
  ['Nave oeste — puerta lateral', [-43.0, -19.5], [-49.0, -19.5]],
  ['Tienda (44,-57) — escaparate', [46.2, -65.0], [46.2, -58.0]],
  ['Gasolinera — kiosco (desde la marquesina)', [-51, 33.5], [-51, 23.0]],
  ['Radar — portón del recinto', [-51, 68.5], [-51, 60.0]],
]
for (const [label, from, to] of cases) {
  if (!crossDoor(from, to, label)) fails++
}

console.log(`\nPUERTAS: ${fails === 0 ? 'TODO OK' : `${fails} CON FALLOS`}`)
if (fails > 0) process.exit(1)
