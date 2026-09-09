// Depuración de conectividad del grafo de waypoints
import { WAYPOINTS, WAYPOINT_EDGES, MAP_AABBS, segmentBlocked } from '../src/game/shared'

// componentes conectados
const comp = new Int32Array(WAYPOINTS.length).fill(-1)
let nc = 0
for (let i = 0; i < WAYPOINTS.length; i++) {
  if (comp[i] !== -1 || WAYPOINT_EDGES[i].length === 0) continue
  const q = [i]
  comp[i] = nc
  while (q.length) {
    const n = q.shift()!
    for (const m of WAYPOINT_EDGES[n]) {
      if (comp[m] === -1) { comp[m] = nc; q.push(m) }
    }
  }
  nc++
}
const groups = new Map<number, number[]>()
for (let i = 0; i < WAYPOINTS.length; i++) {
  if (comp[i] === -1) continue
  const g = groups.get(comp[i]) ?? []
  g.push(i)
  groups.set(comp[i], g)
}
console.log(`Componentes: ${nc}`)
for (const [c, nodes] of groups) {
  console.log(`  comp ${c}: ${nodes.length} nodos — ej: ${nodes.slice(0, 8).map(i => WAYPOINTS[i].join(',')).join(' | ')}`)
}
const isolated = WAYPOINTS.map((_, i) => i).filter(i => WAYPOINT_EDGES[i].length === 0)
console.log(`Aislados (0 aristas): ${isolated.map(i => `${i}(${WAYPOINTS[i].join(',')})`).join(' ')}`)

// probar pares concretos
function probe(i: number, j: number) {
  const [x1, z1] = WAYPOINTS[i], [x2, z2] = WAYPOINTS[j]
  const blocked = segmentBlocked(x1, 0.5, z1, x2, 0.5, z2)
  const d = Math.hypot(x2 - x1, z2 - z1)
  const edge = WAYPOINT_EDGES[i].includes(j)
  console.log(`probe ${i}(${x1},${z1}) → ${j}(${x2},${z2}): d=${d.toFixed(1)} LOS=${!blocked} edge=${edge}`)
}
// mercado
probe(73, 66)  // puerta este → centro
probe(72, 68)  // puerta sur → interior
probe(72, 74)  // puerta sur → puerta norte? cruza interior
probe(74, 67)
probe(66, 67)
// torres
probe(75, 72)
probe(44, 45)
probe(45, 75)
probe(72, 54)
probe(53, 54)
probe(52, 53)
// bus
probe(119, 64)
probe(119, 122)
probe(64, 73)
probe(120, 65)
probe(65, 74)
// almacén sur
probe(85, 34)
probe(34, 33)
probe(89, 51)
// gas
probe(95, 59)
probe(59, 65)
probe(59, 60)
probe(95, 92)
probe(92, 91)
// barrio
probe(101, 47)
probe(101, 48)
probe(119, 50)
