// Encuentra qué caja concreta bloquea un segmento
import { MAP_BOXES, boxToAABB, segmentBlocked } from '../src/game/shared'

function firstBlocker(x1: number, z1: number, x2: number, z2: number, y = 0.5) {
  const boxes = MAP_BOXES.map((b, i) => ({ a: boxToAABB(b), i, b }))
  for (const { a, i, b } of boxes) {
    if (segmentBlocked(x1, y, z1, x2, y, z2, [a])) {
      return { i, b }
    }
  }
  return null
}

const tests: [number, number, number, number][] = [
  [-30, 0, -30, -11],
  [0, 16, 0, 9],
  [0, 16, 0, 30],
  [11, 30, 0, 30],
  [13, 0, 22, 0],
  [22, 0, 14, 0],
  [-13, 0, -22, 0],
  [-14, 0, -13, 0],
  [0, 33, 0, 46],
  [0, 46, 18, 46],
  [17, 44, 26, 26],
  [-39, 0, -49.5, 0],
  [34, -26, 26, -26],
  [34, -26, 30, -11],
  [13, 0, 30, 11],
  [-19, -4, -28, 0],
]
for (const [x1, z1, x2, z2] of tests) {
  const r = firstBlocker(x1, z1, x2, z2)
  const full = segmentBlocked(x1, 0.5, z1, x2, 0.5, z2)
  console.log(`(${x1},${z1})→(${x2},${z2}) blocked=${full} → ${r ? `caja #${r.i}: ${JSON.stringify(r.b)}` : 'ninguna'}`)
}
