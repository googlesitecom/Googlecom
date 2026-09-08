// Verificación de integridad del mapa grande
import {
  MAP_BOXES, MAP_AABBS, SPAWN_A, SPAWN_B, WAYPOINTS, WAYPOINT_EDGES,
  spawnPoint, segmentBlocked, GAME, WEAPONS, PICKUP_SPOTS,
} from '../src/game/shared'

let errors = 0

// 1) cajas dentro de límites
for (const b of MAP_BOXES) {
  if (Math.abs(b.x) > 72 || Math.abs(b.z) > 72) { console.error(`FUERA DE LÍMITES: box(${b.x},${b.z})`); errors++ }
  if (b.h <= 0 || b.w <= 0 || b.d <= 0) { console.error(`DIMENSIÓN INVÁLIDA: box(${b.x},${b.y},${b.z})`); errors++ }
}
console.log(`Cajas: ${MAP_BOXES.length}`)

// 2) spawns despejados (cajas sólidas con minY < 1.6 no deben pisar el área de spawn)
function blockedAt(x: number, z: number, r: number): boolean {
  for (const b of MAP_AABBS) {
    if (b.minY < 1.6 && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true
  }
  return false
}
for (const [name, sp] of [['A', SPAWN_A], ['B', SPAWN_B]] as const) {
  for (let i = 0; i < 6; i++) {
    const [x, , z] = spawnPoint(name === 'A' ? 'A' : 'B', i)
    if (blockedAt(x, z, 0.5)) { console.error(`SPAWN ${name}[${i}] BLOQUEADO en (${x},${z})`); errors++ }
  }
}
console.log(`Spawns OK: A(${SPAWN_A}) B(${SPAWN_B})`)

// 3) waypoints no bloqueados y conectividad (BFS)
let start = -1
for (let i = 0; i < WAYPOINTS.length; i++) {
  const [x, z] = WAYPOINTS[i]
  if (blockedAt(x, z, 0.35)) { console.error(`WAYPOINT ${i} (${x},${z}) BLOQUEADO`); errors++ }
  if (start === -1 && WAYPOINT_EDGES[i].length > 0) start = i
}
const visited = new Set<number>([start])
const queue = [start]
while (queue.length) {
  const n = queue.shift()!
  for (const m of WAYPOINT_EDGES[n]) {
    if (!visited.has(m)) { visited.add(m); queue.push(m) }
  }
}
const unreachable = WAYPOINTS.map((_, i) => i).filter(i => WAYPOINT_EDGES[i].length > 0 && !visited.has(i))
if (unreachable.length) { console.error(`WAYPOINTS INALCANZABLES: ${unreachable.join(', ')}`); errors++ }
console.log(`Waypoints: ${WAYPOINTS.length}, alcanzables: ${visited.size}, aislados (0 aristas): ${WAYPOINTS.filter((_, i) => WAYPOINT_EDGES[i].length === 0).length}`)

// 4) ninguna caja debe solaparse gravemente con otra (solapes entre muros son aceptables en juntas)
let overlaps = 0
for (let i = 0; i < MAP_BOXES.length; i++) {
  for (let j = i + 1; j < MAP_BOXES.length; j++) {
    const a = MAP_AABBS[i], b = MAP_AABBS[j]
    const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
    const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
    const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
    if (ox > 0 && oy > 0 && oz > 0) {
      const vol = ox * oy * oz
      const minVol = Math.min((a.maxX - a.minX) * (a.maxY - a.minY) * (a.maxZ - a.minZ), (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ))
      if (vol > minVol * 0.55) { overlaps++; if (overlaps <= 8) console.warn(`  solape fuerte: ${JSON.stringify(MAP_BOXES[i])} ↔ ${JSON.stringify(MAP_BOXES[j])}`) }
    }
  }
}
console.log(`Solapes fuertes: ${overlaps}`)

// 5) retroceso de armas razonable (grados)
for (const w of Object.values(WEAPONS)) {
  if (w.recoilV > 6) { console.error(`RETROCESO EXCESIVO: ${w.id} recoilV=${w.recoilV}`); errors++ }
}

// 6) pociones no dentro de cajas sólidas
for (const p of PICKUP_SPOTS) {
  if (blockedAt(p.x, p.z, 0.45)) { console.error(`POCIÓN ${p.kind} (${p.x},${p.z}) BLOQUEADA`); errors++ }
}
console.log(`Pociones: ${PICKUP_SPOTS.length}`)

console.log(GAME.MAP_HALF === 70 ? 'MAP_HALF = 70 ✓' : 'MAP_HALF INCORRECTO')
console.log(errors === 0 ? 'SIN ERRORES' : `ERRORES: ${errors}`)
