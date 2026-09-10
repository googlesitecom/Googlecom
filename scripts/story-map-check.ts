// ============================================================
// Verificación del mapa de la misión (INSTALACIÓN CENIZA):
// - spawns y objetivos sin colisión
// - waypoints alcanzables y grafo conectado
// - LOS entre puntos clave
// Ejecutar: bun scripts/story-map-check.ts
// ============================================================
import { MAPS, STORY_INTEL, STORY_UPLINK, STORY_ANTENNAS, STORY_EXTRACTION, boxToAABB, segmentBlocked } from '../src/game/shared'

const md = MAPS.instalacion
const aabbs = md.boxes.map(boxToAABB)

let errors = 0
const bad = (msg: string): void => { errors++; console.error('  ✗', msg) }
const ok = (msg: string): void => console.log('  ✓', msg)

// punto despejado en el suelo (cápsula aproximada por AABB de 0.7×1.8)
function clearAt(x: number, z: number, y = 0): boolean {
  for (const b of aabbs) {
    if (b.minY > y + 1.8) continue
    if (b.maxY < y + 0.55) continue    // se puede subir de un paso (step-up)
    if (x + 0.35 > b.minX && x - 0.35 < b.maxX && z + 0.35 > b.minZ && z - 0.35 < b.maxZ) return false
  }
  return true
}

console.log('== INSTALACIÓN CENIZA ==')
console.log(`cajas: ${md.boxes.length} · waypoints: ${md.waypoints.length} · aristas: ${md.edges.reduce((n, e) => n + e.length, 0) / 2}`)

console.log('\n-- spawns --')
for (const [name, sp] of [['JUGADOR (A)', md.spawnA], ['ENEMIGO (B)', md.spawnB]] as [string, number[]][]) {
  if (clearAt(sp[0], sp[2])) ok(`${name} en (${sp[0]}, ${sp[2]}) despejado`)
  else bad(`${name} en (${sp[0]}, ${sp[2]}) DENTRO de geometría`)
  // anillo de radio 2.4 (respawn en círculo)
  for (let a = 0; a < 8; a++) {
    const x = sp[0] + Math.cos(a / 8 * Math.PI * 2) * 2.4
    const z = sp[2] + Math.sin(a / 8 * Math.PI * 2) * 2.4
    if (!clearAt(x, z)) bad(`anillo de spawn de ${name} bloqueado en (${x.toFixed(1)}, ${z.toFixed(1)})`)
  }
}

console.log('\n-- objetivos de la misión --')
const objs = [...STORY_INTEL, STORY_UPLINK, ...STORY_ANTENNAS, STORY_EXTRACTION]
for (const o of objs) {
  // basta con que haya un punto practicable en un anillo alrededor del objetivo
  let reach = false
  for (let a = 0; a < 8 && !reach; a++) {
    const x = o.x + Math.cos(a / 8 * Math.PI * 2) * 2.2
    const z = o.z + Math.sin(a / 8 * Math.PI * 2) * 2.2
    if (clearAt(x, z)) reach = true
  }
  if (reach) ok(`${o.label} accesible (${o.x}, ${o.z})`)
  else bad(`${o.label} INACCESIBLE (${o.x}, ${o.z})`)
}

console.log('\n-- grafo de bots --')
// BFS desde el waypoint 0
const seen = new Set<number>([0])
const queue = [0]
while (queue.length) {
  const i = queue.shift()!
  for (const j of md.edges[i]) {
    if (!seen.has(j)) { seen.add(j); queue.push(j) }
  }
}
if (seen.size === md.waypoints.length) ok(`grafo CONECTADO (${seen.size}/${md.waypoints.length})`)
else bad(`grafo partido: ${seen.size}/${md.waypoints.length} alcanzables`)
const isolated = md.waypoints.map((_, i) => i).filter(i => md.edges[i].length === 0)
if (isolated.length === 0) ok('sin waypoints aislados')
else bad(`waypoints aislados: ${isolated.join(', ')}`)
// waypoints dentro de geometría
for (let i = 0; i < md.waypoints.length; i++) {
  const [x, z] = md.waypoints[i]
  if (!clearAt(x, z)) bad(`waypoint ${i} (${x}, ${z}) dentro de geometría`)
}

console.log('\n-- rutas clave (LOS a 1.2 m) --')
const keyPts: [string, number, number][] = [
  ['brecha sur', 0, 50],
  ['comando (interior)', 0, 2],
  ['enlace', 13.5, 2],
  ['radar', -27, 4],
  ['cuartel este', 16, 34],
  ['antena alfa', 30, -27],
  ['antena bravo', -29, -28],
  ['antena charlie', 27, 29],
  ['helipuerto', 0, -40],
]
for (let i = 0; i < keyPts.length; i++) {
  for (let j = i + 1; j < keyPts.length; j++) {
    const [na, xa, za] = keyPts[i]
    const [nb, xb, zb] = keyPts[j]
    // solo pares cercanos (< 40 m) importan para el combate
    if (Math.hypot(xa - xb, za - zb) > 40) continue
    if (!segmentBlocked(xa, 1.2, za, xb, 1.2, zb, aabbs)) ok(`LOS ${na} ↔ ${nb}`)
    else console.log('  ·', `sin LOS directa ${na} ↔ ${nb} (cobertura)`)
  }
}

console.log(`\n${errors === 0 ? 'SIN ERRORES' : `${errors} ERRORES`}`)
process.exit(errors === 0 ? 0 : 1)
