// v6.1 — Test determinista de la armería con huecos y la economía
// Escenarios: compra x2, equipar, muerte conserva arsenal, baja sincroniza dinero
import { GameSim } from '../src/game/sim'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ FALLO: ${name} ${extra}`) }
}

const sim = new GameSim('normal', 'escaramuza')
const events: { ev: string; to: string; data: any }[] = []
sim.onRoute((ev, data, to) => {
  if (['buyResult', 'econ', 'loadout', 'refillAmmo'].includes(ev)) {
    events.push({ ev, to: to ?? 'ALL', data })
  }
})
sim.join('humano', 'Humano', 'A', false)
sim.addBots(4)
sim.start()
const p = sim.getPlayer('humano')!
const S = (sim as unknown as { players: Map<string, any> }).players
let enemy = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B')!
// blindar al humano mientras compra (los bots pelean entre ellos)
p.protectUntil = Date.now() + 60000

console.log('— 1. estado inicial —')
check('armory inicial', JSON.stringify(p.armory) === JSON.stringify(['knife', 'p9']))
check('slots iniciales', p.slots[0] === null && p.slots[1] === 'p9')
check('owned derivado', JSON.stringify(p.owned) === JSON.stringify(['p9', 'knife']), JSON.stringify(p.owned))

console.log('— 2. comprar 2 armas (dinero suficiente) —')
p.money = 8000
// colocar al jugador dentro de su zona de compra
p.x = sim.getMapSpawn?.() ?? 0
const spawnA = (sim as any).md?.spawnA ?? [0, 0, 60]
p.x = spawnA[0]; p.z = spawnA[2]
events.length = 0
sim.handleBuy(p, 'w:aguila')            // $700 → hueco 1 (el 2 lo ocupa p9)
check('compra 1 ok (buyResult)', events.some(e => e.ev === 'buyResult' && e.data.ok))
check('compra 1 → loadout', events.some(e => e.ev === 'loadout' && e.to === 'humano'))
check('aguila en arsenal', p.armory.includes('aguila'))
check('aguila equipada hueco 1 (hueco 2 ocupado por p9)', p.slots[0] === 'aguila' && p.slots[1] === 'p9', JSON.stringify(p.slots))
check('dinero descontado', p.money === 7300, `money=${p.money}`)

events.length = 0
sim.handleBuy(p, 'w:cr4')               // $2900 → primaria → hueco 1 (reemplaza aguila)
check('compra 2 ok', events.some(e => e.ev === 'buyResult' && e.data.ok))
check('cr4 en arsenal (aguila SE CONSERVA)', p.armory.includes('cr4') && p.armory.includes('aguila'))
check('cr4 en hueco 1', p.slots[0] === 'cr4', JSON.stringify(p.slots))
check('2 armas + cuchillo llevadas', p.owned.length === 3, JSON.stringify(p.owned))

console.log('— 3. equipar en el hueco elegido —')
sim.handleEquip(p, 'aguila', 1)         // aguila al hueco 2 (saca la p9)
check('aguila movida al hueco 2', p.slots[1] === 'aguila', JSON.stringify(p.slots))
check('p9 sigue en arsenal (no se pierde)', p.armory.includes('p9'))
check('arma en mano = equipada', p.weapon === 'aguila')
sim.handleEquip(p, 'cr4', 0)
check('cr4 de nuevo en hueco 1', p.slots[0] === 'cr4')
sim.handleEquip(p, 'cr4', 1)            // mover cr4 al hueco 2 → hueco 1 queda libre
check('cr4 movido a hueco 2 (hueco 1 libre)', p.slots[0] === null && p.slots[1] === 'cr4', JSON.stringify(p.slots))
events.length = 0
sim.handleEquip(p, 'awp338', 0)         // arma NO comprada
check('equipar arma no comprada rechazada', events.some(e => e.ev === 'buyResult' && !e.data.ok && /todavía|arma/i.test(e.data.error ?? '')) && p.slots[0] === null)

console.log('— 4. recomprar arma del arsenal = munición, no huecos nuevos —')
events.length = 0
p.slots = ['cr4', 'aguila']
sim.handleBuy(p, 'w:cr4')
check('recompra → refillAmmo', events.some(e => e.ev === 'refillAmmo' && e.data.weapon === 'cr4'))
check('recompra NO cambia huecos', p.slots[0] === 'cr4' && p.slots[1] === 'aguila')
check('recompra descontó dinero', p.money < 4400, `money=${p.money}`)

console.log('— 5. la baja sincroniza el dinero AL INSTANTE —')
events.length = 0
const moneyBefore = p.money
await new Promise(r => setTimeout(r, 2600))
// elegir un bot enemigo VIVO (los bots se matan entre ellos)
const live = Array.from(S.values()).filter((q: any) => q.bot && q.team === 'B' && !q.dead)
check('hay bot enemigo vivo', live.length > 0)
if (live.length) {
  const target: any = live[0]
  target.hp = 1
  target.shield = 0
  target.protectUntil = 0
  sim.handleHits(p, { weapon: 'cr4', hits: [{ target: target.id, part: 'body', dist: 10 }] })
  check('enemigo eliminado', target.dead)
  const econToMe = events.find(e => e.ev === 'econ' && e.to === 'humano' && e.data.money > moneyBefore)
  check('econ enviado al asesino al instante', !!econToMe)
  check('dinero de la baja aplicado', p.money === moneyBefore + 300, `money=${p.money} (antes ${moneyBefore})`)
  check('econ refleja el dinero nuevo', econToMe ? econToMe.data.money === p.money : false)
}

console.log('— 6. morir conserva arsenal y huecos —')
const armoryBefore = [...p.armory]
const slotsBefore = [...p.slots] as any
p.protectUntil = 0
p.hp = 1; p.shield = 0
const shooter: any = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B' && !q.dead) ?? enemy
shooter.lastHitsAt = 0
sim.handleHits(shooter, { weapon: 'ar47', hits: [{ target: 'humano', part: 'head', dist: 5 }] })
check('jugador eliminado', p.dead)
await new Promise(r => setTimeout(r, 3100))
check('reapareció', !p.dead)
check('armen conservado al reaparecer', JSON.stringify(p.armory) === JSON.stringify(armoryBefore), JSON.stringify(p.armory))
check('huecos conservados al reaparecer', JSON.stringify(p.slots) === JSON.stringify(slotsBefore), JSON.stringify(p.slots))
check('owned derivado del reaparecido', p.owned.includes('cr4') || p.owned.includes('aguila'))

console.log('— 7. compra solo en la base —')
p.x = 40; p.z = 40   // lejos de ambos spawns
events.length = 0
sim.handleBuy(p, 'w:mp9')
check('compra fuera de base rechazada', events.some(e => e.ev === 'buyResult' && !e.data.ok && /base/i.test(e.data.error ?? '')))
check('mp9 NO comprada', !p.armory.includes('mp9'))

sim.stop()
console.log(`\n=== RESULTADO: ${pass} ✓ / ${fail} ✗ ===`)
process.exit(fail ? 1 : 0)
