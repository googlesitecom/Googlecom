// Depurar LOS entre dos bots con posiciones reales
import { MAP_AABBS, segmentBlocked } from '../src/game/shared'

const tests: [number, number, number, number, number, number, string][] = [
  [-3, 1.57, 10, 14, 1.22, 36, 'bot-0 → bot-6 (mercado a diagonal SE)'],
  [-3, 1.57, 10, 4, 1.22, 23, 'bot-0 → bot-5 (contenedor en medio)'],
  [-44.9, 1.57, -48, 29.2, 1.22, 42.4, 'spawn A → spawn B (diagonal completa)'],
  [0, 1.57, -12, 0, 1.22, 12, 'norte → sur por el mercado (puertas)'],
  [-10, 1.57, 0, 10, 1.22, 0, 'oeste → este por el mercado (puertas)'],
  [10, 1.57, 10, -10, 1.22, -10, 'diag SE → diag NO'],
]

for (const [ax, ay, az, bx, by, bz, label] of tests) {
  const blocked = segmentBlocked(ax, ay, az, bx, by, bz)
  // encontrar la primera caja que bloquea
  let blocker = 'ninguna'
  if (blocked) {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    outer: for (let i = 0; i < MAP_AABBS.length; i++) {
      const b = MAP_AABBS[i]
      let tmin = 0, tmax = 1
      const axes: [number, number, number, number][] = [
        [ax, dx, b.minX, b.maxX], [ay, dy, b.minY, b.maxY], [az, dz, b.minZ, b.maxZ],
      ]
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < mn || o > mx) continue outer
        } else {
          let t1 = (mn - o) / d, t2 = (mx - o) / d
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
          if (tmin > tmax) continue outer
        }
      }
      blocker = `caja #${i} (${JSON.stringify(MAP_AABBS[i])})`
      break
    }
  }
  console.log(`${label}: ${blocked ? 'BLOQUEADO' : 'LIBRE'} — ${blocker}`)
}

// cuántas cajas tienen minY < 1.6 y bloquean a la altura de ojos
let eyeBlockers = 0
for (const b of MAP_AABBS) if (b.minY < 1.6 && b.maxY > 1.2) eyeBlockers++
console.log(`\nCajas con rango Y que cruza 1.2-1.6: ${eyeBlockers} de ${MAP_AABBS.length}`)
