'use client'

import { useGame } from '@/game/store'
import { BUY_ITEMS, WEAPONS, type WeaponId } from '@/game/shared'
import { getGame } from '@/game/game-instance'
import { Coins, X, Shield, Zap, Crosshair } from 'lucide-react'

const CAT_ICONS: Record<string, string> = {
  'Pistolas': '🔫',
  'SMG': '💥',
  'Escopetas': '🎯',
  'Rifles': '⚡',
  'Francotirador': '🔭',
  'Equipamiento': '🛡️',
}

export function BuyMenu() {
  const open = useGame(s => s.buyOpen)
  const money = useGame(s => s.money)
  const owned = useGame(s => s.owned)
  const armor = useGame(s => s.armor)
  const frags = useGame(s => s.frags)
  const team = useGame(s => s.team)

  if (!open) return null

  const cats = [...new Set(BUY_ITEMS.map(i => i.cat))]

  const handleBuy = (itemId: string, price: number) => {
    if (money < price) return
    getGame()?.buy(itemId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm font-mono">
      <div className="w-[min(900px,94vw)] max-h-[88vh] overflow-y-auto bg-stone-900 border-2 border-amber-700/50 rounded-2xl shadow-2xl custom-scroll">
        {/* cabecera */}
        <div className="sticky top-0 bg-stone-900 border-b border-stone-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Crosshair className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-xl font-black tracking-widest text-amber-300">ARMERÍA TÁCTICA</h2>
              <p className="text-xs text-stone-500">
                {team === 'A' ? 'Base ESCUADRÓN ÁMBAR' : 'Base ESCUADRÓN VERDE'} · Cierra con B o ESC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-700/50 rounded-lg px-4 py-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-black text-amber-300 tabular-nums">${money}</span>
            </div>
            <button
              onClick={() => getGame()?.closeBuyMenu()}
              className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {cats.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-bold tracking-widest text-stone-400 mb-3 flex items-center gap-2">
                <span>{CAT_ICONS[cat] ?? '📦'}</span> {cat.toUpperCase()}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {BUY_ITEMS.filter(i => i.cat === cat).map(item => {
                  const isWeapon = !!item.weapon
                  const ownedAlready = isWeapon && owned.includes(item.weapon as WeaponId)
                  const armorFull = item.equip === 'armor' && armor >= 100
                  const fragsFull = item.equip === 'frag' && frags >= 2
                  const afford = money >= item.price
                  const disabled = !afford || armorFull || fragsFull
                  const w = item.weapon ? WEAPONS[item.weapon] : null
                  return (
                    <button
                      key={item.id}
                      disabled={disabled}
                      onClick={() => handleBuy(item.id, item.price)}
                      className={`group text-left rounded-xl border p-4 transition-all
                        ${disabled
                          ? 'bg-stone-950/60 border-stone-800 opacity-50 cursor-not-allowed'
                          : 'bg-stone-800/60 border-stone-700 hover:border-amber-600/70 hover:bg-stone-800 hover:shadow-lg hover:shadow-amber-900/20 cursor-pointer active:scale-[0.98]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-stone-100 text-sm truncate">{item.name}</div>
                          <div className="text-[11px] text-stone-500 truncate">{item.desc}</div>
                          {w && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-400">
                              <span>DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ''}</span>
                              <span>{w.rpm} RPM</span>
                              <span>MAG {w.mag}</span>
                              {w.sniper && <span className="text-emerald-400">MIRA ×8</span>}
                            </div>
                          )}
                          {item.equip === 'armor' && (
                            <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> {armor > 0 ? `Actual: ${Math.round(armor)}` : 'Sin protección'}
                            </div>
                          )}
                          {item.equip === 'frag' && (
                            <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Llevas: {frags}/2 · radio 6.5 m
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-black tabular-nums ${afford ? 'text-amber-300' : 'text-red-400'}`}>
                            ${item.price}
                          </div>
                          {ownedAlready && <div className="text-[9px] text-green-400 font-bold mt-1">MUNICIÓN</div>}
                          {armorFull && <div className="text-[9px] text-green-400 font-bold mt-1">COMPLETO</div>}
                          {fragsFull && <div className="text-[9px] text-green-400 font-bold mt-1">MÁXIMO</div>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="text-center text-xs text-stone-600 pt-2 border-t border-stone-800">
            Al comprar un arma que ya posees, se repone la munición de reserva
          </div>
        </div>
      </div>
    </div>
  )
}
