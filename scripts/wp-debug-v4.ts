// Depuración de waypoints bloqueados / inalcanzables del mapa v4
import { MAP_AABBS, WAYPOINTS, WAYPOINT_EDGES } from '../src/game/shared'

function blockersAt(x: number, z: number, r = 0.35): { box: (typeof MAP_AABBS)[number]; i: number }[] {
  const out: { box: (typeof MAP_AABBS)[number]; i: number }[] = []
  for (let i = 0; i < MAP_AABBS.length; i++) {
    const b = MAP_AABBS[i]
    if (b.minY < 1.6 && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
      out.push({ box: b, i })
    }
  }
  return out
}

// 1) waypoints bloqueados → quién los bloquea
let blocked = 0
for (let i = 0; i < WAYPOINTS.length; i++) {
  const [x, z] = WAYPOINTS[i]
  const bl = blockersAt(x, z)
  if (bl.length) {
    blocked++
    const b = bl[0]
    console.log(`WP ${i} (${x},${z}) ← caja i=${b.i} x:${b.box.minX.toFixed(1)}..${b.box.maxX.toFixed(1)} z:${b.box.minZ.toFixed(1)}..${b.box.maxZ.toFixed(1)} h:${(b.box.maxY - b.box.minY).toFixed(1)} y0:${b.box.minY.toFixed(1)}`)
  }
}
console.log(`total bloqueados: ${blocked}`)

// 2) inalcanzables (BFS desde el primero con aristas)
let start = -1
for (let i = 0; i < WAYPOINTS.length; i++) {
  if (WAYPOINT_EDGES[i].length > 0) { start = i; break }
}
const visited = new Set<number>([start])
const queue = [start]
while (queue.length) {
  const n = queue.shift()!
  for (const m of WAYPOINT_EDGES[n]) {
    if (!visited.has(m)) { visited.add(m); queue.push(m) }
  }
}
for (let i = 0; i < WAYPOINTS.length; i++) {
  if (WAYPOINT_EDGES[i].length > 0 && !visited.has(i)) {
    console.log(`INALCANZABLE WP ${i} (${WAYPOINTS[i][0]},${WAYPOINTS[i][1]}) aristas=${WAYPOINT_EDGES[i].length} → ${WAYPOINT_EDGES[i].slice(0, 6).join(',')}`)
  }
}
// 3) aislados
for (let i = 0; i < WAYPOINTS.length; i++) {
  if (WAYPOINT_EDGES[i].length === 0) {
    console.log(`AISLADO WP ${i} (${WAYPOINTS[i][0]},${WAYPOINTS[i][1]})`)
  }
}
