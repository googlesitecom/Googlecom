// Debug: rastrear por qué se pierden impactos
import { GameSim } from '../src/game/sim'

const sim = new GameSim('normal', 'escaramuza')
sim.join('humano', 'Humano', 'A', false)
sim.addBots(4)
sim.start()
const p = sim.getPlayer('humano')!
const players = (sim as unknown as { players: Map<string, any> }).players
const enemy = Array.from(players.values()).find((q: any) => q.bot && q.team === 'B')!

// esperar a que expire la protección de spawn
await new Promise(r => setTimeout(r, 3000))
console.log('inicio: protectUntil-ahora =', (enemy.protectUntil - Date.now()).toFixed(0), 'ms')

for (let i = 0; i < 10; i++) {
  const before = enemy.hp + enemy.shield
  const tNow = Date.now()
  sim.handlePlayerShot(p, [p.x, 1.6, p.z], [enemy.x, 1.5, enemy.z])
  const cad = (60000 / 267) * 0.55
  const sinceHit = tNow - p.lastHitsAt
  sim.handleHits(p, { weapon: 'p9', hits: [{ target: enemy.id, part: 'body', dist: 8 }] })
  const after = enemy.hp + enemy.shield
  console.log(`#${i} dmg=${(before - after)} | desdeUltimoHit=${sinceHit.toFixed(0)}ms (cad=${cad.toFixed(0)}) | botDead=${enemy.dead} | botHp=${enemy.hp} | yoDead=${p.dead} | proteccionRestante=${Math.max(0, enemy.protectUntil - Date.now())}ms | distReal=${Math.hypot(enemy.x - p.x, enemy.z - p.z).toFixed(1)}m`)
  await new Promise(r => setTimeout(r, 150))
}
sim.stop()
console.log('=== FIN ===')
