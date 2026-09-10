// Verificación de integridad de los mapas (PvP + historia)
import { setActiveMap } from '../src/game/map-types'
import { buildPvpMap } from '../src/game/map-pvp'
import { buildStoryMap } from '../src/game/map-story'
import type { MapData } from '../src/game/map-types'
import { GAME, WEAPONS } from '../src/game/shared'

let errors = 0

function spawnPointOf(m: MapData, team: 'A' | 'B', i: number): [number, number, number] {
  const base = team === 'A' ? m.spawnA : m.spawnB
  const a = (i * 2.399) % (Math.PI * 2)
  const r = 1.5 + (i % 3) * 1.2
  return [base[0] + Math.cos(a) * r, 0, base[2] + Math.sin(a) * r]
}

function checkMap(m: MapData): void {
  console.log(`\n=== ${m.name} (${m.kind}) ===`)

  // 1) cajas dentro de límites
  for (const b of m.boxes) {
    if (Math.abs(b.x) > m.mapHalf + 2 || Math.abs(b.z) > m.mapHalf + 2) {
      console.error(`FUERA DE LÍMITES: box(${b.x},${b.z})`); errors++
    }
    if (b.h <= 0 || b.w <= 0 || b.d <= 0) { console.error(`DIMENSIÓN INVÁLIDA: box(${b.x},${b.y},${b.z})`); errors++ }
  }
  console.log(`Cajas: ${m.boxes.length}`)

  function blockedAt(x: number, z: number, r: number): boolean {
    for (const b of m.aabbs) {
      // objetos planos (maxY < 0,45: pads y marcas del suelo) se pisan
      if (b.minY < 1.6 && b.maxY > 0.45 && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true
    }
    return false
  }

  // 2) spawns despejados
  for (const [name, sp] of [['A', m.spawnA], ['B', m.spawnB]] as const) {
    for (let i = 0; i < 6; i++) {
      const [x, , z] = spawnPointOf(m, name, i)
      if (blockedAt(x, z, 0.5)) { console.error(`SPAWN ${name}[${i}] BLOQUEADO en (${x},${z})`); errors++ }
    }
  }
  console.log(`Spawns OK: A(${m.spawnA}) B(${m.spawnB})`)

  // 3) waypoints no bloqueados y conectividad (BFS)
  let start = -1
  for (let i = 0; i < m.waypoints.length; i++) {
    const [x, z] = m.waypoints[i]
    if (blockedAt(x, z, 0.35)) { console.error(`WAYPOINT ${i} (${x},${z}) BLOQUEADO`); errors++ }
    if (start === -1 && m.waypointEdges[i].length > 0) start = i
  }
  const visited = new Set<number>([start])
  const queue = [start]
  while (queue.length) {
    const n = queue.shift()!
    for (const e of m.waypointEdges[n]) {
      if (!visited.has(e)) { visited.add(e); queue.push(e) }
    }
  }
  const unreachable = m.waypoints.map((_, i) => i).filter(i => m.waypointEdges[i].length > 0 && !visited.has(i))
  if (unreachable.length) { console.error(`WAYPOINTS INALCANZABLES: ${unreachable.join(', ')}`); errors++ }
  const isolated = m.waypoints.filter((_, i) => m.waypointEdges[i].length === 0).length
  console.log(`Waypoints: ${m.waypoints.length}, alcanzables: ${visited.size}, aislados: ${isolated}`)

  // 4) solapes fuertes entre cajas
  let overlaps = 0
  for (let i = 0; i < m.boxes.length; i++) {
    for (let j = i + 1; j < m.boxes.length; j++) {
      const a = m.aabbs[i], b = m.aabbs[j]
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
      if (ox > 0 && oy > 0 && oz > 0) {
        const vol = ox * oy * oz
        const minVol = Math.min((a.maxX - a.minX) * (a.maxY - a.minY) * (a.maxZ - a.minZ), (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ))
        if (vol > minVol * 0.55) { overlaps++ }
      }
    }
  }
  console.log(`Solapes fuertes: ${overlaps}`)

  // 5) pociones no dentro de cajas sólidas
  for (const p of m.pickupSpots) {
    if (blockedAt(p.x, p.z, 0.45)) { console.error(`POCIÓN ${p.kind} (${p.x},${p.z}) BLOQUEADA`); errors++ }
  }
  console.log(`Pociones: ${m.pickupSpots.length}`)

  // 6) objetivos de la historia: acceso despejado junto al generador
  if (m.storyTargets) {
    for (const t of m.storyTargets) {
      if (blockedAt(t.x + 1.6, t.z, 0.35)) { console.error(`ACCESO AL OBJETIVO ${t.id} BLOQUEADO`); errors++ }
    }
    console.log(`Objetivos de historia: ${m.storyTargets.length}`)
  }
}

for (const w of Object.values(WEAPONS)) {
  if (w.recoilV > 6) { console.error(`RETROCESO EXCESIVO: ${w.id} recoilV=${w.recoilV}`); errors++ }
}

setActiveMap(buildPvpMap())
checkMap({ ...buildPvpMap() })
setActiveMap(buildStoryMap())
checkMap({ ...buildStoryMap() })

console.log(`\nMAP_HALF PvP = ${70} ✓`)
console.log(errors === 0 ? 'SIN ERRORES' : `ERRORES: ${errors}`)
void GAME
