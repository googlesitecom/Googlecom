// Depura los waypoints aún inalcanzables
import { WAYPOINTS, WAYPOINT_EDGES, MAP_BOXES, boxToAABB, segmentBlocked } from '../src/game/shared'

function firstBlocker(x1: number, z1: number, x2: number, z2: number, y = 0.5) {
  for (let i = 0; i < MAP_BOXES.length; i++) {
    if (segmentBlocked(x1, y, z1, x2, y, z2, [boxToAABB(MAP_BOXES[i])])) {
      return { i, b: MAP_BOXES[i] }
    }
  }
  return null
}

// índices problemáticos + candidatos cercanos
const probes: [number, number][] = [
  [88, 87], [88, 89], [89, 91], [91, 51], [87, 54], [87, 53],
  [103, 108], [103, 107], [103, 105], [104, 103], [106, 104],
  [109, 114], [109, 113], [110, 109], [112, 110], [112, 55], [113, 55],
  [108, 48], [107, 46], [105, 27],
]
for (const [i, j] of probes) {
  const [x1, z1] = WAYPOINTS[i], [x2, z2] = WAYPOINTS[j]
  const d = Math.hypot(x2 - x1, z2 - z1)
  const r = firstBlocker(x1, z1, x2, z2)
  console.log(`${i}(${x1},${z1}) → ${j}(${x2},${z2}) d=${d.toFixed(1)} LOS=${!r} edge=${WAYPOINT_EDGES[i].includes(j)} ${r ? `→ #${r.i}: ${JSON.stringify(r.b)}` : ''}`)
}
// qué aristas tienen los inalcanzables
for (const i of [34, 88, 89, 90, 103, 104, 106, 109, 110, 112]) {
  console.log(`wp ${i} (${WAYPOINTS[i]}): aristas → ${WAYPOINT_EDGES[i].map(j => `${j}(${WAYPOINTS[j][0]},${WAYPOINTS[j][1]})`).join(' ')}`)
}
