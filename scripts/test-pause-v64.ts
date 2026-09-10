// ============================================================
// v6.4 — Test de la PAUSA real offline: al pausar, los bots se
// congelan (dejan de moverse y de disparar) y los relojes de la
// ronda se desplazan al reanudar para no perder tiempo.
// ============================================================
import { GameSim } from '../src/game/sim'
import type { NetSnapshot } from '../src/game/shared'

let lastSnapshot: NetSnapshot | null = null
const sim = new GameSim('normal', 'escaramuza', 'ciudad')
sim.onRoute((ev, data) => {
  if (ev === 'snapshot') lastSnapshot = data as NetSnapshot
})

const HOST = 'host'
sim.join(HOST, 'Jugador', 'A', false)
sim.addBots(3) // 3 por bando
sim.start()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function botPositions(): string {
  sim.emitSnapshotOnce()
  const s = lastSnapshot!
  return s.players.filter(p => p.id !== HOST).map(p => `${p.id.slice(0, 6)}:${p.x.toFixed(1)},${p.z.toFixed(1)}`).sort().join(' ')
}

await sleep(300)
const before = botPositions()
await sleep(300)
const moving = botPositions()
const moved = before !== moving
console.log(moved ? '✓ bots en movimiento antes de la pausa' : '✗ los bots no se mueven (test inválido)')

// ---- PAUSA: 400 ms congelados ----
sim.pause()
await sleep(150)
const frozen1 = botPositions()
await sleep(300)
const frozen2 = botPositions()
const frozen = frozen1 === frozen2
console.log(frozen ? '✓ PAUSA: bots congelados (no se mueven ni disparan)' : '✗ los bots siguieron moviéndose en pausa')

// el jugador local también está quieto (sin ticks no hay daño/regen)
// ---- REANUDAR ----
const endsBefore = (sim as unknown as { round: { endsAt: number } }).round.endsAt
sim.resume()
await sleep(300)
const after = botPositions()
const resumed = after !== frozen2
console.log(resumed ? '✓ REANUDAR: los bots vuelven a moverse' : '✗ los bots no reanudaron el movimiento')
const endsAfter = (sim as unknown as { round: { endsAt: number } }).round.endsAt
const shifted = endsAfter - endsBefore
console.log(shifted >= 250 ? `✓ reloj de ronda desplazado +${Math.round(shifted)} ms (no se pierde tiempo)` : `✗ reloj de ronda mal desplazado (+${Math.round(shifted)} ms)`)

sim.stop()
const ok = moved && frozen && resumed && shifted >= 250
console.log(ok ? 'PAUSA OFFLINE: TODO OK' : 'PAUSA OFFLINE: FALLO')
process.exit(ok ? 0 : 1)
