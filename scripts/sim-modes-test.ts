// Prueba end-to-end de la simulación de modos de juego (sin navegador)
import { GameSim } from '../src/game/sim'
import type { GameMode } from '../src/game/shared'

async function runMode(mode: GameMode, seconds: number): Promise<void> {
  console.log(`\n========== MODO: ${mode} ==========`)
  const events: string[] = []
  const sim = new GameSim('dificil', mode)
  sim.onRoute((ev, data) => {
    const d = data as Record<string, unknown>
    if (ev === 'announce') events.push(String(d.text))
    if (ev === 'flagEvent') events.push('flagEvent ' + JSON.stringify(d))
    if (ev === 'zoneEvent') events.push('zoneEvent ' + JSON.stringify(d))
    if (ev === 'kill') events.push(`kill: ${String(d.killerName)} → ${String(d.victimName)}`)
  })
  sim.join('p1', 'Tester', 'A', false)
  sim.addBots(4)
  sim.start()

  const p = sim.getPlayer('p1')!
  const dt = 0.05
  const ticks = Math.floor(seconds / dt)
  // teleport de partida: cerca del objetivo para acelerar el contacto
  const start: [number, number] = mode === 'bandera' ? [50, 0] : mode === 'dominacion' ? [8, 8] : [30, 30]
  sim.handleInput(p, { pos: [start[0], 0, start[1]], yaw: 0, pitch: 0, crouch: false, speed: 0, weapon: 'p9' })

  for (let i = 0; i < ticks; i++) {
    await new Promise(r => setTimeout(r, dt * 1000))
    if (mode === 'bandera') {
      // ir a la bandera enemiga; si la lleva, volver a casa
      const carrying = !!p.flag
      const gx = carrying ? -58 : 58
      const gdx = gx - p.x, gdz = -p.z
      const gd = Math.hypot(gdx, gdz) || 1
      sim.handleInput(p, {
        pos: [p.x + (gdx / gd) * 5 * dt, 0, p.z + (gdz / gd) * 5 * dt],
        yaw: p.yaw, pitch: 0, crouch: false, speed: 5, weapon: 'p9',
      })
    }
  }

  const players = Array.from((sim as unknown as { players: Map<string, { name: string; kills: number; flag: string | null }> }).players.values())
  const round = (sim as unknown as { round: { scoresA: number; scoresB: number; phase: string; roundNumber: number } }).round
  console.log(`Jugadores: ${players.map(q => `${q.name}(k${q.kills}${q.flag ? ' PORTA-BANDERA-' + q.flag : ''})`).join(' ')}`)
  console.log(`Marcador: A ${round.scoresA} — B ${round.scoresB} · fase ${round.phase} · ronda ${round.roundNumber}`)
  console.log(`Eventos (${events.length}):`)
  for (const e of events.slice(0, 18)) console.log('  ' + e)
  sim.stop()
}

await runMode('escaramuza', 45)
await runMode('ffa', 45)
await runMode('bandera', 40)
console.log('\n=== FIN ===')
