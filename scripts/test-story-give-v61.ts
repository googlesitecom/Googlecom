// v6.1 — Test del flujo de ENTREGA de armas del modo historia (storyCmd give/boss/ammo)
import { GameSim } from '../src/game/sim'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ FALLO: ${name} ${extra}`) }
}

const sim = new GameSim('normal', 'historia', 'instalacion')
const events: { ev: string; to: string; data: any }[] = []
sim.onRoute((ev, data, to) => {
  if (['loadout', 'refillAmmo', 'buyResult'].includes(ev)) events.push({ ev, to: to ?? 'ALL', data })
})
sim.join('humano', 'Humano', 'A', false)
sim.addBots(7, true)
sim.start()
const p = sim.getPlayer('humano')!
const S = (sim as unknown as { players: Map<string, any> }).players

console.log('— entrega de arma nueva (cap 2: te dan la CR-4) —')
events.length = 0
sim.handleStoryCmd('humano', { cmd: 'give', weapon: 'cr4' })
check('give → loadout al jugador', events.some(e => e.ev === 'loadout' && e.to === 'humano'))
const lo = events.find(e => e.ev === 'loadout')?.data
check('loadout con cr4 en mano', lo && lo.weapon === 'cr4')
check('cr4 en arsenal', p.armory.includes('cr4'))
check('cr4 equipada en un hueco', p.slots[0] === 'cr4' || p.slots[1] === 'cr4', JSON.stringify(p.slots))
check('owned incluye cr4', p.owned.includes('cr4'))

console.log('— re-entrega (misma arma) = munición —')
events.length = 0
sim.handleStoryCmd('humano', { cmd: 'give', weapon: 'cr4' })
check('re-give → refillAmmo', events.some(e => e.ev === 'refillAmmo' && e.data.weapon === 'cr4'))
check('re-give → loadout (sincroniza)', events.some(e => e.ev === 'loadout'))
check('sin duplicados en arsenal', p.armory.filter(w => w === 'cr4').length === 1)

console.log('— jefe Vega (boss) —')
const bot = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B')!
sim.handleStoryCmd('humano', { cmd: 'boss', botId: bot.id })
check('bot renombrado a Cnel. Vega', bot.name === 'Cnel. Vega')
check('jefe con cr4 valida (owned la contiene)', bot.owned.includes('cr4'), JSON.stringify(bot.owned))
check('jefe con 400 HP y 150 escudo', bot.hp === 400 && bot.shield === 150)

console.log('— ammo (reposición tras cinemática) —')
events.length = 0
sim.handleStoryCmd('humano', { cmd: 'ammo' })
check('ammo → refillAmmo por arma llevada', events.filter(e => e.ev === 'refillAmmo').length >= p.owned.filter((w: any) => w !== 'knife').length)

console.log('— muerte en la misión conserva el arsenal (repetir capítulo) —')
const before = [...p.armory]
p.protectUntil = 0
p.hp = 1
const shooter: any = Array.from(S.values()).find((q: any) => q.bot && q.team === 'B' && !q.dead && q !== bot)
if (shooter) {
  shooter.lastHitsAt = 0
  sim.handleHits(shooter, { weapon: 'ar47', hits: [{ target: 'humano', part: 'head', dist: 5 }] })
  check('jugador eliminado', p.dead)
  await new Promise(r => setTimeout(r, 9500)) // respawn de historia ~9 s de protección incluida
  check('reapareció', !p.dead)
  check('arsenal conservado', JSON.stringify(p.armory) === JSON.stringify(before), JSON.stringify(p.armory))
} else {
  check('shooter disponible (skip)', true)
}

sim.stop()
console.log(`\n=== RESULTADO: ${pass} ✓ / ${fail} ✗ ===`)
process.exit(fail ? 1 : 0)
