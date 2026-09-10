// Prueba determinista v2 de los arreglos del mensaje #11:
// 1) handlePlayerShot → handleHits (orden real del juego): daño registrado y muerte
// 2) Strafe lateral medido RESPECTO A LA LÍNEA AL OBJETIVO (no al yaw instantáneo)
import { GameSim } from '../src/game/sim'

const sim = new GameSim('normal', 'escaramuza')
const events: string[] = []
sim.onRoute((ev, data) => {
  const d = data as Record<string, unknown>
  if (ev === 'kill') events.push(`kill: ${String(d.killerName)} → ${String(d.victimName)}`)
})
sim.join('humano', 'Humano', 'A', false)
sim.addBots(4)
sim.start()

const p = sim.getPlayer('humano')!
const players = (sim as unknown as { players: Map<string, any> }).players

// aislar al humano de los demás bots: teleport lejos + eliminar a los otros
const bots = Array.from(players.values()).filter((q: any) => q.bot)
for (const b of bots) { if (b.team === 'A') b.protectUntil = 1e15 } // aliados no mueren
const enemy = bots.find((q: any) => q.team === 'B')!
console.log(`\nPRUEBA 1 — humano dispara a ${enemy.name}`)
console.log(`  humano: dead=${p.dead}, hp=${p.hp} | bot: hp=${enemy.hp}, escudo=${enemy.shield}, protectUntil=${enemy.protectUntil}`)

const dmgDealt: number[] = []
for (let i = 0; i < 20; i++) {
  if (p.dead) break
  // mantener al bot quieto y a salvo de aliados: teleport del humano a 8 m
  const dx = enemy.x - p.x, dz = enemy.z - p.z, dd = Math.hypot(dx, dz) || 1
  sim.handleInput(p, { pos: [enemy.x - (dx / dd) * 8, 0, enemy.z - (dz / dd) * 8], yaw: 0, pitch: 0, crouch: false, speed: 0, weapon: 'p9' })
  const before = enemy.hp + enemy.shield
  sim.handlePlayerShot(p, [p.x, 1.6, p.z], [enemy.x, 1.5, enemy.z])
  sim.handleHits(p, { weapon: 'p9', hits: [{ target: enemy.id, part: 'body', dist: 8 }] })
  await new Promise(r => setTimeout(r, 150))
  if (enemy.dead) break
  const after = enemy.hp + enemy.shield
  if (after < before) dmgDealt.push(before - after)
}
console.log(`  impactos con daño: ${dmgDealt.length}/20 | daño total: ${dmgDealt.reduce((s, x) => s + x, 0)}`)
console.log(`  ¿murió el bot? ${enemy.dead ? 'SÍ ✓' : 'NO ✗'} (hp=${enemy.hp}, escudo=${enemy.shield})`)
console.log(`  humano vivo: dead=${p.dead} | bajas humano: ${p.kills}`)

// PRUEBA 2: strafe lateral respecto a la línea bot→humano (combate real)
console.log('\nPRUEBA 2 — strafe lateral en combate (10 s, ventanas de 0,5 s)')
await new Promise(r => setTimeout(r, 2500)) // que entre en combate
const target2 = Array.from(players.values()).find((q: any) => q.team === 'B' && !q.dead) || enemy
const samples: number[] = []
let stateCombat = 0, statePatrol = 0
let lastX = target2.x, lastZ = target2.z
for (let w = 0; w < 20; w++) {
  await new Promise(r => setTimeout(r, 500))
  if (!target2.dead) {
    if (target2.ai?.state === 'combat') stateCombat++
    else statePatrol++
    // lateral = componente de velocidad PERPENDICULAR a la línea bot→humano
    const vx = (target2.x - lastX) / 0.5, vz = (target2.z - lastZ) / 0.5
    const tx = p.x - target2.x, tz = p.z - target2.z
    const td = Math.hypot(tx, tz) || 1
    const ux = tx / td, uz = tz / td
    const forward = vx * ux + vz * uz
    const lateral = Math.abs(vx - forward * ux + (vz - forward * uz)) // |v - forward·u|
    const lat = Math.hypot(vx - forward * ux, vz - forward * uz)
    samples.push(lat)
  }
  lastX = target2.x; lastZ = target2.z
}
const med = samples.reduce((s, x) => s + x, 0) / (samples.length || 1)
const max = Math.max(...samples, 0)
console.log(`  ventanas en combate: ${stateCombat} | en patrulla: ${statePatrol}`)
console.log(`  lateral media: ${med.toFixed(2)} m/s | máxima: ${max.toFixed(2)} m/s`)
console.log('  (el código de combate impone ≤1,9 m/s de strafe puro; la patrulla avanza en línea recta)')
console.log(`\nKills: ${events.slice(0, 10).join(' · ')}`)
sim.stop()
console.log('\n=== FIN ===')
