'use client'

// ============================================================
// EMERGENCY STRIKE — Armería táctica (v6.1)
// Compra armas, equípalas en el HUECO 1 o 2 y elige tu
// loadout: el arsenal se conserva aunque caigas.
// ============================================================

import { useGame } from '@/game/store'
import { BUY_ITEMS, WEAPONS, keyLabel, type WeaponId } from '@/game/shared'
import { getGame } from '@/game/game-instance'
import { Coins, X, Shield, Zap, Crosshair, Package, Check, RefreshCw } from 'lucide-react'

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
  const armory = useGame(s => s.armory)
  const slots = useGame(s => s.slots)
  const weapon = useGame(s => s.weapon)
  const armor = useGame(s => s.armor)
  const frags = useGame(s => s.frags)
  const team = useGame(s => s.team)
  const key1 = keyLabel(useGame(s => s.settings.keybinds.slot1))
  const key2 = keyLabel(useGame(s => s.settings.keybinds.slot2))
  const key3 = keyLabel(useGame(s => s.settings.keybinds.slot3))

  if (!open) return null

  const cats = [...new Set(BUY_ITEMS.map(i => i.cat))]

  const handleBuy = (itemId: string, price: number) => {
    if (money < price) return
    getGame()?.buy(itemId)
  }

  const handleEquip = (wid: WeaponId, slot: 0 | 1) => {
    getGame()?.equip(wid, slot)
  }

  const slotCard = (idx: 0 | 1, key: string, label: string) => {
    const w = slots[idx]
    const active = !!w && w === weapon
    const name = w ? WEAPONS[w].name : '— vacío —'
    return (
      <div
        className={`flex-1 min-w-[150px] rounded-lg border px-4 py-2.5 transition-colors ${
          active
            ? 'bg-amber-950/60 border-amber-500/70 shadow-lg shadow-amber-900/20'
            : w
              ? 'bg-stone-900/80 border-stone-700'
              : 'bg-stone-950/60 border-stone-800 border-dashed'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black tracking-widest ${active ? 'text-amber-300' : 'text-stone-500'}`}>
            {label}
          </span>
          <kbd className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${active ? 'bg-amber-900/70 text-amber-200' : 'bg-stone-800 text-stone-400'}`}>
            {key}
          </kbd>
          {active && <Check className="w-3 h-3 text-amber-400 ml-auto" />}
        </div>
        <div className={`text-sm font-black truncate mt-1 ${w ? 'text-stone-100' : 'text-stone-600'}`}>
          {name}
        </div>
        {w && (
          <div className="text-[10px] text-stone-500">
            {WEAPONS[w].slot === 'primary' ? 'Principal' : 'Secundaria'} · DMG {WEAPONS[w].damage}{WEAPONS[w].pellets > 1 ? `×${WEAPONS[w].pellets}` : ''}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm font-mono">
      <div className="w-[min(940px,94vw)] max-h-[88vh] overflow-y-auto bg-stone-900 border-2 border-amber-700/50 rounded-2xl shadow-2xl custom-scroll">
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
          {/* ===== TU LOADOUT: huecos equipables ===== */}
          <div>
            <h3 className="text-sm font-bold tracking-widest text-stone-400 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400/80" /> TU LOADOUT
            </h3>
            <div className="flex flex-wrap gap-2.5 items-stretch">
              {slotCard(0, key1, 'HUECO 1')}
              {slotCard(1, key2, 'HUECO 2')}
              <div className={`flex-1 min-w-[130px] rounded-lg border px-4 py-2.5 ${weapon === 'knife' ? 'bg-amber-950/60 border-amber-500/70' : 'bg-stone-900/80 border-stone-700'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black tracking-widest text-stone-500">HUECO 3</span>
                  <kbd className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${weapon === 'knife' ? 'bg-amber-900/70 text-amber-200' : 'bg-stone-800 text-stone-400'}`}>{key3}</kbd>
                </div>
                <div className="text-sm font-black text-stone-100 mt-1">Cuchillo Táctico</div>
                <div className="text-[10px] text-stone-500">Cuerpo a cuerpo · siempre contigo</div>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
              Compra armas y <span className="text-amber-300/90 font-bold">equípalas en el hueco que quieras</span> con
              los botones de cada arma. Se conservan aunque caigas en combate.
            </p>
          </div>

          {/* ===== catálogo ===== */}
          {cats.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-bold tracking-widest text-stone-400 mb-3 flex items-center gap-2">
                <span>{CAT_ICONS[cat] ?? '📦'}</span> {cat.toUpperCase()}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {BUY_ITEMS.filter(i => i.cat === cat).map(item => {
                  const isWeapon = !!item.weapon
                  const wid = item.weapon as WeaponId | undefined
                  const inArmory = isWeapon && wid != null && armory.includes(wid)
                  const armorFull = item.equip === 'shield' && armor >= 100
                  const fragsFull = item.equip === 'frag' && frags >= 2
                  const afford = money >= item.price
                  const w = wid ? WEAPONS[wid] : null
                  const inSlot1 = wid != null && slots[0] === wid
                  const inSlot2 = wid != null && slots[1] === wid
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-4 transition-all ${
                        inArmory
                          ? 'bg-stone-800/70 border-emerald-800/60'
                          : afford && !armorFull && !fragsFull
                            ? 'bg-stone-800/60 border-stone-700 hover:border-amber-600/70 hover:shadow-lg hover:shadow-amber-900/20'
                            : 'bg-stone-950/60 border-stone-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-stone-100 text-sm truncate flex items-center gap-2">
                            {item.name}
                            {inArmory && (
                              <span className="text-[8px] font-black tracking-widest text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded px-1.5 py-0.5">
                                EN TU ARSENAL
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500 truncate">{item.desc}</div>
                          {w && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-400">
                              <span>DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ''}</span>
                              <span>{w.rpm} RPM</span>
                              <span>MAG {w.mag}</span>
                              {w.sniper && <span className="text-emerald-400">MIRA ×8</span>}
                            </div>
                          )}
                          {item.equip === 'shield' && (
                            <div className="mt-2 text-[10px] text-sky-300/80 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> {armor > 0 ? `Escudo actual: ${Math.round(armor)}` : 'Sin escudo'} · Pociones por el mapa
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
                          {armorFull && <div className="text-[9px] text-green-400 font-bold mt-1">COMPLETO</div>}
                          {fragsFull && <div className="text-[9px] text-green-400 font-bold mt-1">MÁXIMO</div>}
                        </div>
                      </div>

                      {/* ===== acciones ===== */}
                      {isWeapon && wid ? (
                        inArmory ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleEquip(wid, 0)}
                              className={`h-8 rounded-md text-[10px] font-black tracking-widest border transition-all active:scale-[0.98] ${
                                inSlot1
                                  ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md shadow-amber-900/30'
                                  : 'bg-stone-800 text-stone-200 border-stone-600 hover:border-amber-500/70 hover:text-amber-300'
                              }`}
                            >
                              {inSlot1 ? '✓ EN HUECO 1' : 'EQUIPAR ▸ HUECO 1'}
                            </button>
                            <button
                              onClick={() => handleEquip(wid, 1)}
                              className={`h-8 rounded-md text-[10px] font-black tracking-widest border transition-all active:scale-[0.98] ${
                                inSlot2
                                  ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md shadow-amber-900/30'
                                  : 'bg-stone-800 text-stone-200 border-stone-600 hover:border-amber-500/70 hover:text-amber-300'
                              }`}
                            >
                              {inSlot2 ? '✓ EN HUECO 2' : 'EQUIPAR ▸ HUECO 2'}
                            </button>
                            <button
                              disabled={!afford}
                              onClick={() => handleBuy(item.id, item.price)}
                              className={`col-span-2 h-7 rounded-md text-[10px] font-bold tracking-widest border flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                                afford
                                  ? 'bg-stone-950/80 text-stone-400 border-stone-700 hover:text-stone-200 hover:border-stone-500'
                                  : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                              }`}
                            >
                              <RefreshCw className="w-3 h-3" /> REPONER MUNICIÓN · ${item.price}
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={!afford}
                            onClick={() => handleBuy(item.id, item.price)}
                            className={`mt-3 w-full h-9 rounded-md text-xs font-black tracking-widest border transition-all active:scale-[0.98] ${
                              afford
                                ? 'bg-amber-400 text-stone-950 border-amber-300 hover:bg-amber-300 shadow-md shadow-amber-900/30'
                                : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                            }`}
                          >
                            {afford ? 'COMPRAR' : 'SIN FONDOS'}
                          </button>
                        )
                      ) : (
                        <button
                          disabled={!afford || armorFull || fragsFull}
                          onClick={() => handleBuy(item.id, item.price)}
                          className={`mt-3 w-full h-9 rounded-md text-xs font-black tracking-widest border transition-all active:scale-[0.98] ${
                            afford && !armorFull && !fragsFull
                              ? 'bg-amber-400 text-stone-950 border-amber-300 hover:bg-amber-300 shadow-md shadow-amber-900/30'
                              : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                          }`}
                        >
                          {armorFull ? 'COMPLETO' : fragsFull ? 'MÁXIMO' : afford ? 'COMPRAR' : 'SIN FONDOS'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="text-center text-xs text-stone-600 pt-2 border-t border-stone-800 leading-relaxed">
            Dos huecos de arma (1 y 2) + cuchillo (3) · El cuchillo y el arma del hueco 2 los cambias con la rueda o {keyLabel(useGame.getState().settings.keybinds.lastWeapon)}
          </div>
        </div>
      </div>
    </div>
  )
}
