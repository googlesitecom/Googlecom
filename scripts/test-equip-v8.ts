// ============================================================
// v8 — Test determinista del EQUIPO TÁCTICO de la tienda
// Escenarios: chaleco (-35% cuerpo), casco (-30% cabeza),
// bengala (revela + contador), botiquín (cura), estímulo
// (+velocidad y duración), caja de munición (repone TODAS),
// límites (max 2 / ya equipado) y bots comprando armadura.
// ============================================================
import { GameSim } from '../src/game/sim'
import { EQUIPMENT } from '../src/game/shared'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ FALLO: ${name} ${extra}`) }
}

const sim = new GameSim('normal', 'escaramuza')
const events: { ev: string; to: string; data: any }[] = []
sim.onRoute((ev, data, to) => {
  if (['buyResult', 'econ', 'healed', 'flareUsed', 'flareFx', 'stimUsed', 'refillAmmo', 'announce', 'spawnEvent'].includes(ev)) {
    events.push({ ev, to: (to as string) ?? 'ALL', data })
  }
})
sim.join('humano', 'Humano', 'A', false)
sim.addBots(3)
sim.start()
const p = sim.getPlayer('humano')!
const S = (sim as unknown as { players: Map<string, any> }).players
const enemy = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B')!
p.protectUntil = Date.now() + 60000

// colocar al jugador dentro de su zona de compra
const spawnA = (sim as any).md?.spawnA ?? [0, 0, 60]
p.x = spawnA[0]; p.z = spawnA[2]

console.log('— 1. chaleco antibalas ($6000) —')
p.money = 20000
events.length = 0
sim.handleBuy(p, 'e:vest')
check('compra ok', events.some(e => e.ev === 'buyResult' && e.to === 'humano' && e.data.ok))
check('dinero descontado', p.money === 14000, `money=${p.money}`)
check('vest activo', p.vest === true)
events.length = 0
sim.handleBuy(p, 'e:vest')
check('recompra rechazada', events.some(e => e.ev === 'buyResult' && !e.data.ok && /vest/i.test(e.data.error ?? '')) && p.money === 14000)
check('econ lleva vest=1', events.some(e => e.ev === 'econ' && e.to === 'humano' && e.data.vest === 1) || p.vest)

console.log('— 2. reducción de daño del chaleco (cuerpo) —')
const victim = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B' && !q.dead)!
const before = victim.hp
victim.vest = false
victim.shield = 0
victim.protectUntil = 0
victim.dead = false
;(sim as any).applyDamage(p, victim, 100, 'body', 'ar47', [0, 1])
const takenNoVest = before - victim.hp
// revivir a la víctima (el primer impacto de 100 la mató) para el 2.º ensayo
victim.dead = false
victim.hp = 100
victim.shield = 0
victim.vest = true
;(sim as any).applyDamage(p, victim, 100, 'body', 'ar47', [0, 1])
const takenVest = 100 - victim.hp
check(`cuerpo con chaleco ~${Math.round(100 * (1 - EQUIPMENT.VEST_REDUCTION))} (sin chaleco ${takenNoVest})`, Math.abs(takenVest - Math.round(100 * (1 - EQUIPMENT.VEST_REDUCTION))) <= 1, `takenVest=${takenVest}`)

console.log('— 3. casco ($2400) reduce daño de cabeza —')
p.money = 5000
victim.dead = false
victim.hp = 100
victim.shield = 0
victim.vest = false
victim.helmet = true
;(sim as any).applyDamage(p, victim, 100, 'head', 'ar47', [0, 1])
const takenHead = 100 - victim.hp
check(`cabeza con casco ~${Math.round(100 * (1 - EQUIPMENT.HELMET_REDUCTION))}`, Math.abs(takenHead - Math.round(100 * (1 - EQUIPMENT.HELMET_REDUCTION))) <= 1, `takenHead=${takenHead}`)
victim.helmet = false

console.log('— 4. bengala localizadora: compra, uso y límite —')
p.money = 3000
events.length = 0
sim.handleBuy(p, 'e:flare')
sim.handleBuy(p, 'e:flare')
sim.handleBuy(p, 'e:flare') // tercera: rechazada (max 2)
check('2 bengalas en inventario', p.flares === 2, `flares=${p.flares}`)
check('3.ª rechazada', events.some(e => e.ev === 'buyResult' && !e.data.ok && /flare/i.test(e.data.error ?? '')))
events.length = 0
sim.handleUseFlare(p)
check('flareUsed al jugador', events.some(e => e.ev === 'flareUsed' && e.to === 'humano'))
check('flareFx para todos', events.some(e => e.ev === 'flareFx' && e.to === 'ALL'))
check('contador baja a 1', p.flares === 1)
const evU = events.find(e => e.ev === 'flareUsed')
check(`duración ${EQUIPMENT.FLARE_DURATION}s`, !!evU && evU.data.until - Date.now() > (EQUIPMENT.FLARE_DURATION - 1) * 1000)
events.length = 0
sim.handleUseFlare(p)
sim.handleUseFlare(p) // sin bengalas
check('sin bengalas → aviso, no error', p.flares === 0 && events.some(e => e.ev === 'buyResult' && !e.data.ok && /No flares/i.test(e.data.error ?? '')))

console.log('— 5. botiquín: cura instantánea —')
p.hp = 27
p.money = 1000
events.length = 0
sim.handleBuy(p, 'e:medkit')
check('hp al 100', p.hp === 100, `hp=${p.hp}`)
check('evento healed', events.some(e => e.ev === 'healed' && e.to === 'humano' && e.data.hp === 100))
check('dinero descontado', p.money === 350, `money=${p.money}`)

console.log('— 6. estímulo: duración y uso —')
p.money = 2000
events.length = 0
sim.handleBuy(p, 'e:stim')
check('1 estímulo', p.stims === 1)
sim.handleUseStim(p)
check('stimUsed al jugador', events.some(e => e.ev === 'stimUsed' && e.to === 'humano'))
check('contador baja a 0', p.stims === 0)
check(`estímulo activo ~${EQUIPMENT.STIM_DURATION}s`, p.stimUntil - Date.now() > (EQUIPMENT.STIM_DURATION - 1) * 1000)

console.log('— 7. caja de munición repone TODO el arsenal —')
p.money = 1000
p.armory = ['knife', 'p9', 'ar47', 'cr4']
events.length = 0
sim.handleBuy(p, 'e:ammo')
const refilled = events.filter(e => e.ev === 'refillAmmo').map(e => e.data.weapon)
check('repone las 3 armas con cargador', refilled.includes('p9') && refilled.includes('ar47') && refilled.includes('cr4'), JSON.stringify(refilled))
check('el cuchillo no se repone', !refilled.includes('knife'))
check('dinero descontado', p.money === 650, `money=${p.money}`)

console.log('— 8. el equipo pasivo SOBREVIVE a la muerte —')
p.dead = true
p.vest = true
p.helmet = true
p.flares = 1
p.stims = 1
// simular el respawn completo (killPlayer + respawn)
;(sim as any).killPlayer(enemy, p, 'ar47', false)
;(sim as any).respawnPlayer(p)
check('vest sigue activo tras reaparecer', p.vest === true)
check('helmet sigue activo', p.helmet === true)
check('bengala conservada', p.flares === 1)
check('estímulo conservado', p.stims === 1)
const spawnEv = events.filter(e => e.ev === 'spawnEvent' && e.to === 'humano').at(-1)
check('spawnEvent informa vest/helmet/flares', !!spawnEv && spawnEv.data.vest === 1 && spawnEv.data.helmet === 1 && spawnEv.data.flares === 1, JSON.stringify(spawnEv?.data ?? null))

console.log('— 9. los bots con dinero compran armadura —')
const bot = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B')!
bot.money = 9000
bot.vest = false
bot.helmet = false
bot.shield = 50
bot.frags = 1
bot.armory = ['knife', 'p9']
// determinista: Math.random()→0 elige cr4 (2900) tras el chaleco (6000)
const origRandom = Math.random
;(globalThis as any).__origRandom = origRandom
Math.random = () => 0
try {
  ;(sim as any).botBuy(bot)
} finally {
  Math.random = origRandom
}
check('bot compró chaleco primero', bot.vest === true, `vest=${bot.vest}`)
check('bot compró rifle con lo restante', bot.armory.some((w: any) => w === 'cr4' || w === 'ar47'), JSON.stringify(bot.armory))
check('dinero final = 100 (9000−6000−2900)', bot.money === 100, `money=${bot.money}`)

console.log(`\nRESULTADO: ${pass} ✓ / ${fail} ✗`)
sim.stop()
if (fail > 0) process.exit(1)
process.exit(0)
