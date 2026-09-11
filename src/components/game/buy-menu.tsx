'use client'

// ============================================================
// EMERGENCY STRIKE — Tactical Armory (v7)
// Redesigned shop: category rail, weapon cards with stat bars,
// loadout slots with equip actions. All copy in English.
// ============================================================

import { useState } from 'react'
import { useGame } from '@/game/store'
import { BUY_ITEMS, WEAPONS, keyLabel, type WeaponId } from '@/game/shared'
import { getGame } from '@/game/game-instance'
import { Coins, X, Shield, Zap, Crosshair, Package, Check, RefreshCw, Crosshair as Scope, Flame, Wind } from 'lucide-react'

const CATEGORIES = ['Pistols', 'SMG', 'Shotguns', 'Rifles', 'Sniper', 'Equipment'] as const

const CAT_LABEL: Record<string, { icon: typeof Crosshair; hint: string }> = {
  'Pistols': { icon: Crosshair, hint: 'Sidearms' },
  'SMG': { icon: Zap, hint: 'Close quarters' },
  'Shotguns': { icon: Flame, hint: 'Breach & clear' },
  'Rifles': { icon: Package, hint: 'All-round work' },
  'Sniper': { icon: Scope, hint: 'Long range' },
  'Equipment': { icon: Shield, hint: 'Survivability' },
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
  const [cat, setCat] = useState<string>('Rifles')

  if (!open) return null

  const items = BUY_ITEMS.filter(i => i.cat === cat)

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
    return (
      <div
        className={`flex-1 min-w-[150px] rounded-md border px-4 py-2.5 transition-colors tac-corner ${
          active
            ? 'bg-amber-950/60 border-amber-500/70 shadow-lg shadow-amber-900/20'
            : w
              ? 'bg-stone-900/80 border-stone-700'
              : 'bg-stone-950/60 border-stone-800 border-dashed'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`font-tac-md text-[10px] ${active ? 'text-amber-300' : 'text-stone-500'}`}>
            {label}
          </span>
          <kbd className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${active ? 'bg-amber-900/70 text-amber-200' : 'bg-stone-800 text-stone-400'}`}>
            {key}
          </kbd>
          {active && <Check className="w-3 h-3 text-amber-400 ml-auto" />}
        </div>
        <div className={`font-tac text-base truncate mt-1 ${w ? 'text-stone-100' : 'text-stone-600'}`}>
          {w ? WEAPONS[w].name : '— empty —'}
        </div>
        {w && (
          <div className="font-tac-md text-[9px] text-stone-500">
            {WEAPONS[w].slot === 'primary' ? 'PRIMARY' : 'SECONDARY'} · DMG {WEAPONS[w].damage}{WEAPONS[w].pellets > 1 ? `×${WEAPONS[w].pellets}` : ''}
          </div>
        )}
      </div>
    )
  }

  // stats normalizados para las barras
  const statBar = (label: string, value: number, max: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="font-tac-md text-[9px] text-stone-500 w-10 text-right shrink-0">{label}</span>
      <div className="flex-1 h-[5px] bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <div className="w-[min(980px,94vw)] max-h-[88vh] overflow-y-auto bg-stone-900/97 border border-amber-700/40 rounded-xl shadow-2xl custom-scroll">
        {/* header */}
        <div className="sticky top-0 bg-stone-900/97 backdrop-blur-sm border-b border-stone-700/70 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md border border-amber-700/50 bg-amber-950/40 flex items-center justify-center">
              <Crosshair className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-tac text-xl tracking-[0.18em] text-amber-300 uppercase">Tactical Armory</h2>
              <p className="font-tac-md text-[10px] text-stone-500">
                {team === 'A' ? 'AMBER SQUAD base' : 'GREEN SQUAD base'} · Close with B or ESC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-700/50 rounded-md px-4 py-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span className="font-tac text-2xl text-amber-300 tabular-nums">${money}</span>
            </div>
            <button
              onClick={() => getGame()?.closeBuyMenu()}
              className="p-2 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* ===== YOUR LOADOUT ===== */}
          <div>
            <h3 className="font-tac-md text-xs text-stone-400 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400/80" /> YOUR LOADOUT
            </h3>
            <div className="flex flex-wrap gap-2.5 items-stretch">
              {slotCard(0, key1, 'SLOT 1')}
              {slotCard(1, key2, 'SLOT 2')}
              <div className={`flex-1 min-w-[130px] rounded-md border px-4 py-2.5 tac-corner ${weapon === 'knife' ? 'bg-amber-950/60 border-amber-500/70' : 'bg-stone-900/80 border-stone-700'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-tac-md text-[10px] text-stone-500">SLOT 3</span>
                  <kbd className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${weapon === 'knife' ? 'bg-amber-900/70 text-amber-200' : 'bg-stone-800 text-stone-400'}`}>{key3}</kbd>
                </div>
                <div className="font-tac text-base text-stone-100 mt-1">Tactical Knife</div>
                <div className="font-tac-md text-[9px] text-stone-500">Melee · always with you</div>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
              Buy weapons and <span className="text-amber-300/90 font-bold">equip them in the slot you want</span> with
              the buttons on each card. Your arsenal is kept even if you fall in combat.
            </p>
          </div>

          {/* ===== category rail ===== */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const meta = CAT_LABEL[c]
              const Icon = meta?.icon ?? Package
              const activeCat = cat === c
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`flex items-center gap-2 rounded-md border px-4 py-2 transition-colors ${
                    activeCat
                      ? 'bg-amber-500/15 border-amber-400/70 text-amber-200'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${activeCat ? 'text-amber-300' : 'text-stone-500'}`} />
                  <span className="font-tac-md text-[11px]">{c.toUpperCase()}</span>
                </button>
              )
            })}
          </div>

          {/* ===== catalog (selected category) ===== */}
          <div>
            {cat === 'Equipment' && (
              <p className="font-tac-md text-[10px] text-stone-500 mb-3">— {CAT_LABEL['Equipment'].hint} · pickups also spawn around the map —</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(item => {
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
                    className={`rounded-lg border p-4 transition-all tac-corner ${
                      inArmory
                        ? 'bg-stone-800/70 border-emerald-800/60'
                        : afford && !armorFull && !fragsFull
                          ? 'bg-stone-800/60 border-stone-700 hover:border-amber-600/70 hover:shadow-lg hover:shadow-amber-900/20'
                          : 'bg-stone-950/60 border-stone-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-tac text-stone-100 text-base truncate flex items-center gap-2">
                          {item.name}
                          {inArmory && (
                            <span className="font-tac-md text-[8px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded px-1.5 py-0.5">
                              OWNED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 truncate">{item.desc}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-tac tabular-nums text-lg ${afford ? 'text-amber-300' : 'text-red-400'}`}>
                          ${item.price}
                        </div>
                        {armorFull && <div className="font-tac-md text-[9px] text-green-400 mt-1">MAXED</div>}
                        {fragsFull && <div className="font-tac-md text-[9px] text-green-400 mt-1">MAX 2</div>}
                      </div>
                    </div>

                    {/* stat bars */}
                    {w && (
                      <div className="mt-3 space-y-1.5">
                        {statBar('DMG', w.damage * (w.pellets > 1 ? w.pellets : 1), 130, 'linear-gradient(90deg,#f87171,#fbbf24)')}
                        {statBar('RPM', w.rpm, 800, 'linear-gradient(90deg,#38bdf8,#22d3ee)')}
                        {statBar('MAG', w.mag, 32, 'linear-gradient(90deg,#a3e635,#84cc16)')}
                        {statBar('MOB', (w.moveMult - 0.8) * 100, 30, 'linear-gradient(90deg,#c084fc,#a78bfa)')}
                        <div className="flex gap-x-3 font-tac-md text-[9px] text-stone-400 pt-0.5">
                          {w.sniper && <span className="text-emerald-400">SCOPE ×8</span>}
                          {w.auto ? <span>FULL-AUTO</span> : <span>SEMI</span>}
                          {w.pellets > 1 && <span>{w.pellets} PELLETS</span>}
                        </div>
                      </div>
                    )}
                    {item.equip === 'shield' && (
                      <div className="mt-3 font-tac-md text-[10px] text-sky-300/80 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> {armor > 0 ? `Current shield: ${Math.round(armor)}` : 'No shield'} · potions around the map
                      </div>
                    )}
                    {item.equip === 'frag' && (
                      <div className="mt-3 font-tac-md text-[10px] text-stone-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Carrying: {frags}/2 · 6.5 m radius
                      </div>
                    )}
                    {item.equip === 'smoke' && (
                      <div className="mt-3 font-tac-md text-[10px] text-stone-400 flex items-center gap-1">
                        <Wind className="w-3 h-3" /> 12 s curtain · max 2
                      </div>
                    )}

                    {/* ===== actions ===== */}
                    {isWeapon && wid ? (
                      inArmory ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleEquip(wid, 0)}
                            className={`h-8 rounded-md font-tac-md text-[10px] border transition-all active:scale-[0.98] ${
                              inSlot1
                                ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md shadow-amber-900/30'
                                : 'bg-stone-800 text-stone-200 border-stone-600 hover:border-amber-500/70 hover:text-amber-300'
                            }`}
                          >
                            {inSlot1 ? '✓ IN SLOT 1' : 'EQUIP ▸ SLOT 1'}
                          </button>
                          <button
                            onClick={() => handleEquip(wid, 1)}
                            className={`h-8 rounded-md font-tac-md text-[10px] border transition-all active:scale-[0.98] ${
                              inSlot2
                                ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md shadow-amber-900/30'
                                : 'bg-stone-800 text-stone-200 border-stone-600 hover:border-amber-500/70 hover:text-amber-300'
                            }`}
                          >
                            {inSlot2 ? '✓ IN SLOT 2' : 'EQUIP ▸ SLOT 2'}
                          </button>
                          <button
                            disabled={!afford}
                            onClick={() => handleBuy(item.id, item.price)}
                            className={`col-span-2 h-7 rounded-md font-tac-md text-[10px] border flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                              afford
                                ? 'bg-stone-950/80 text-stone-400 border-stone-700 hover:text-stone-200 hover:border-stone-500'
                                : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                            }`}
                          >
                            <RefreshCw className="w-3 h-3" /> RESTOCK AMMO · ${item.price}
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={!afford}
                          onClick={() => handleBuy(item.id, item.price)}
                          className={`mt-3 w-full h-9 rounded-md font-tac-md text-xs border transition-all active:scale-[0.98] ${
                            afford
                              ? 'bg-amber-400 text-stone-950 border-amber-300 hover:bg-amber-300 shadow-md shadow-amber-900/30'
                              : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                          }`}
                        >
                          {afford ? 'PURCHASE' : 'NOT ENOUGH FUNDS'}
                        </button>
                      )
                    ) : (
                      <button
                        disabled={!afford || armorFull || fragsFull}
                        onClick={() => handleBuy(item.id, item.price)}
                        className={`mt-3 w-full h-9 rounded-md font-tac-md text-xs border transition-all active:scale-[0.98] ${
                          afford && !armorFull && !fragsFull
                            ? 'bg-amber-400 text-stone-950 border-amber-300 hover:bg-amber-300 shadow-md shadow-amber-900/30'
                            : 'bg-stone-950/60 text-stone-700 border-stone-800 cursor-not-allowed'
                        }`}
                      >
                        {armorFull ? 'ALREADY MAXED' : fragsFull ? 'MAX 2 CARRIED' : afford ? 'PURCHASE' : 'NOT ENOUGH FUNDS'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-center font-tac-md text-[10px] text-stone-600 pt-2 border-t border-stone-800 leading-relaxed">
            Two weapon slots (1 and 2) + knife (3) · swap with the mouse wheel or {keyLabel(useGame.getState().settings.keybinds.lastWeapon)}
          </div>
        </div>
      </div>
    </div>
  )
}
