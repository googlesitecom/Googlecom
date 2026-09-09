// Depuración: ¿qué cajas bloquean los waypoints/pociones marcados?
import { MAP_AABBS, MAP_BOXES } from '../src/game/shared'

const targets: [number, number, string][] = [
  [18, -46, 'wp anillo46'],
  [36, -46, 'wp anillo46'],
  [46, -36, 'wp anillo46'],
  [46, 36, 'wp anillo46'],
  [-18, 46, 'wp anillo46'],
  [-36, 46, 'wp anillo46'],
  [-46, 36, 'wp anillo46'],
  [-46, -36, 'wp anillo46'],
  [8, -13, 'wp plaza'],
  [-8, 13, 'wp plaza'],
  [32, 30, 'wp depósito'],
  [-32, -30, 'wp depósito'],
  [42.5, 7, 'poción radar'],
  [41, -33, 'poción colonia'],
  [-41, 33, 'poción colonia'],
  [44, 41.5, 'poción depósito'],
  [-44, -41.5, 'poción depósito'],
]

for (const [x, z, label] of targets) {
  const r = 0.5
  console.log(`\n=== ${label} (${x},${z}) ===`)
  for (let i = 0; i < MAP_BOXES.length; i++) {
    const b = MAP_AABBS[i]
    if (b.minY > 1.6) continue
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
      const box = MAP_BOXES[i]
      console.log(`  bloquea: box(${box.x},${box.y},${box.z} w${box.w} h${box.h} d${box.d} ${box.mat})`)
    }
  }
}
