// v6.2 — Test determinista de la 2v2 a nivel de simulación
// Escenarios: 4 humanos por equipos, relleno desigual de bots, baja de un
// jugador → bot de reemplazo, fuego amigo desactivado, marcador por equipos
import { GameSim } from '../src/game/sim'
import type { Team } from '../src/game/shared'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ FALLO: ${name} ${extra}`) }
}

const S = (sim: GameSim) => (sim as unknown as { players: Map<string, any> }).players

// ------------------------------------------------------------
console.log('— 1. sala 2v2 completa: 4 humanos, sin bots —')
{
  const sim = new GameSim('normal', 'escaramuza')
  const events: { ev: string; data: any; to: string }[] = []
  sim.onRoute((ev, data, to) => { if (ev === 'spawnEvent') events.push({ ev, data, to: to ?? 'ALL' }) })
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.join('p3', 'Rival1', 'B', false)
  sim.join('p4', 'Rival2', 'B', false)
  sim.start()
  const P = S(sim)
  const teams = { A: 0, B: 0 }
  for (const q of P.values()) teams[q.team as Team]++
  check('4 jugadores', P.size === 4, `size=${P.size}`)
  check('equipos 2 y 2', teams.A === 2 && teams.B === 2, JSON.stringify(teams))
  check('cada uno con spawnEvent dirigido', ['p1', 'p2', 'p3', 'p4'].every(id => events.some(e => e.to === id)))
  check('welcome data por id (ruta del worker)', ['p1', 'p2', 'p3', 'p4'].every(id => {
    const w = sim.getWelcomeData(id) as { id?: string; team?: Team }
    return w?.id === id && !!w?.team
  }))
  check('sin bots', Array.from(P.values()).every(q => !q.bot))
}

// ------------------------------------------------------------
console.log('— 2. relleno desigual (2 humanos: anfitrión + aliado) —')
{
  const sim = new GameSim('normal', 'escaramuza')
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.addBotsPer(0, 2)   // hueco VERDE vacío → 2 bots
  sim.start()
  const P = S(sim)
  const teams = { A: 0, B: 0 }
  const bots = { A: 0, B: 0 }
  for (const q of P.values()) { teams[q.team as Team]++; if (q.bot) bots[q.team as Team]++ }
  check('2v2 total (4 operadores)', P.size === 4, `size=${P.size}`)
  check('humano+humano vs bot+bot', teams.A === 2 && teams.B === 2 && bots.A === 0 && bots.B === 2, JSON.stringify({ teams, bots }))
}

// ------------------------------------------------------------
console.log('— 3. relleno con 3 humanos (1 hueco) —')
{
  const sim = new GameSim('normal', 'escaramuza')
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.join('p3', 'Rival1', 'B', false)
  sim.addBotsPer(0, 1)   // solo falta 1 VERDE
  sim.start()
  const P = S(sim)
  const verde = Array.from(P.values()).filter(q => q.team === 'B')
  check('VERDE = 2 (1 humano + 1 bot)', verde.length === 2 && verde.some(q => q.bot) && verde.some(q => !q.bot))
}

// ------------------------------------------------------------
console.log('— 4. baja de un jugador → bot de reemplazo —')
{
  const sim = new GameSim('normal', 'escaramuza')
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.join('p3', 'Rival1', 'B', false)
  sim.join('p4', 'Rival2', 'B', false)
  sim.start()
  sim.leave('p3')
  const P = S(sim)
  check('p3 fuera', !P.has('p3'))
  const humansB = Array.from(P.values()).filter(q => q.team === 'B' && !q.bot).length
  check('VERDE quedó con 1 humano', humansB === 1)
  const bot = sim.fillTeamBot('B')
  check('bot de reemplazo añadido a VERDE', !!bot && bot.bot && bot.team === 'B')
  check('VERDE vuelve a 2', Array.from(P.values()).filter(q => q.team === 'B').length === 2)
  // y con el bando ya completo no añade más
  const extra = sim.fillTeamBot('B')
  check('no añade de más con el bando completo', extra === null)
}

// ------------------------------------------------------------
console.log('— 5. fuego amigo OFF en 2v2 —')
{
  const sim = new GameSim('normal', 'escaramuza')
  const events: { ev: string; data: any; to: string }[] = []
  sim.onRoute((ev, data, to) => { if (ev === 'hitConfirm' || ev === 'kill' || ev === 'econ') events.push({ ev, data, to: to ?? 'ALL' }) })
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.join('p3', 'Rival', 'B', false)
  sim.start()
  const P = S(sim)
  const p1 = P.get('p1'), p2 = P.get('p2'), p3 = P.get('p3')
  for (const q of [p1, p2, p3]) { q.x = 0; q.z = 0; q.protectUntil = 0; q.ai = undefined }
  p1.x = 1 // cerca
  // p1 dispara a su aliado p2 → NO debe registrar nada
  p1.lastHitsAt = 0
  sim.handleHits(p1, { weapon: 'cr4', hits: [{ target: 'p2', part: 'body', dist: 2 }] })
  check('aliado no recibe daño', p2.hp === 100, `hp=${p2.hp}`)
  check('sin confirmación de golpe al aliado', !events.some(e => e.ev === 'hitConfirm'))
  // p1 dispara al rival p3 → daño normal (con la cadencia del arma entre disparos)
  p1.lastHitsAt = 0
  sim.handleHits(p1, { weapon: 'cr4', hits: [{ target: 'p3', part: 'body', dist: 2 }] })
  check('rival recibe daño', p3.hp < 100, `hp=${p3.hp}`)
  check('confirmación al tirador', events.some(e => e.ev === 'hitConfirm' && e.to === 'p1'))
}

// ------------------------------------------------------------
console.log('— 6. marcador por equipos con 4 humanos —')
{
  const sim = new GameSim('normal', 'escaramuza')
  sim.join('p1', 'Anfitrión', 'A', false)
  sim.join('p2', 'Aliado', 'A', false)
  sim.join('p3', 'Rival1', 'B', false)
  sim.join('p4', 'Rival2', 'B', false)
  sim.start()
  const P = S(sim)
  for (const q of P.values()) { q.protectUntil = 0; q.ai = undefined }
  const p1 = P.get('p1'), p3 = P.get('p3'), p4 = P.get('p4')
  p1.x = 1; p1.z = 0; p3.x = 0; p3.z = 0; p4.x = 0; p4.z = 1
  const before = (sim as any).round.scoresA
  // p1 mata a p3 y a p4 → 2 puntos para ÁMBAR (con la cadencia entre disparos)
  p1.lastHitsAt = 0
  sim.handleHits(p1, { weapon: 'cr4', hits: [{ target: 'p3', part: 'head', dist: 2 }] })
  p1.lastHitsAt = 0
  sim.handleHits(p1, { weapon: 'cr4', hits: [{ target: 'p4', part: 'head', dist: 2 }] })
  const after = (sim as any).round.scoresA
  check('las bajas suman al EQUIPO', after === before + 2, `scoresA ${before}→${after}`)
  check('víctimas muertas con respawn', p3.dead && p4.dead)
  check('asesino con economía (+$', (p1 as any).money > 1000)
}

console.log(`\nRESULTADO: ${pass} ✓ · ${fail} ✗`)
process.exit(fail > 0 ? 1 : 0)
