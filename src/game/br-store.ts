// ============================================================
// EMERGENCY STRIKE — Battle Royale UI state (v9)
// Tiny always-loaded store: the heavy BR engine module is fetched
// on demand (see components/game/br-mount.tsx), so this is the only
// BR code resident in memory outside a match.
// ============================================================
import { create } from 'zustand'

export type BrPhase = 'queue' | 'plane' | 'live' | 'dead' | 'victory'

export interface BrQueuePlayer {
  name: string
  real: boolean      // human connection (vs bot filler)
}

export interface BrFeedEntry {
  id: number
  text: string
  mine: boolean
}

// ------------------------------------------------------------
// v10 — WEAPON RARITIES (Fortnite-style tiers)
// BR uses the SAME arsenal as the normal modes (shared.ts WEAPONS);
// each looted weapon rolls a rarity tier that colors it and boosts
// its damage. Loot beams, interaction hints, the HUD and the kill
// feed all speak this color language.
// ------------------------------------------------------------
export interface BrRarity {
  id: string
  label: string
  color: number     // three.js color (beams / rings)
  css: string       // HUD color
  dmgMult: number   // damage multiplier
  weight: number    // spawn probability (weapon floor loot)
}

export const BR_RARITIES: BrRarity[] = [
  { id: 'common',    label: 'COMMON',    color: 0xb9c2cc, css: '#b9c2cc', dmgMult: 1.0,  weight: 0.40 },
  { id: 'uncommon',  label: 'UNCOMMON',  color: 0x57d867, css: '#57d867', dmgMult: 1.10, weight: 0.26 },
  { id: 'rare',      label: 'RARE',      color: 0x52a8ff, css: '#52a8ff', dmgMult: 1.22, weight: 0.18 },
  { id: 'epic',      label: 'EPIC',      color: 0xb266ff, css: '#b266ff', dmgMult: 1.38, weight: 0.11 },
  { id: 'legendary', label: 'LEGENDARY', color: 0xffb347, css: '#ffb347', dmgMult: 1.55, weight: 0.05 },
]

/** weighted rarity roll; minTier crates supply drops floor */
export function rollBrRarity(minTier = 0): number {
  const pool = BR_RARITIES.slice(Math.max(0, Math.min(BR_RARITIES.length - 1, minTier)))
  let total = 0
  for (const r of pool) total += r.weight
  let roll = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= pool[i].weight
    if (roll <= 0) return BR_RARITIES.length - pool.length + i
  }
  return BR_RARITIES.length - 1
}

interface BrState {
  active: boolean
  phase: BrPhase
  /** matchmaking: connected operators (queue/lobby island) */
  queuePlayers: BrQueuePlayer[]
  countdown: number          // s remaining (matchmaking / plane hint)
  countdownActive: boolean
  /** match state */
  alive: number
  totalPlayers: number
  kills: number
  placement: number
  hp: number
  shield: number
  weapon: string
  weaponLabel: string
  /** v10: índice de rareza del arma actual (-1 = sin arma) */
  weaponRarity: number
  mag: number
  reserve: number
  stormPhase: number
  stormLabel: string
  stormTimer: number
  inStorm: boolean
  inVehicle: boolean
  qualityNote: string
  /** set while the map streams in behind the lobby island */
  loadingMap: boolean
  showLeave: boolean
  /** v9: BR killfeed */
  feed: BrFeedEntry[]
  /** interaction hint (loot / vehicle) */
  hint: string

  set: (p: Partial<BrState>) => void
  addFeed: (text: string, mine: boolean) => void
  reset: () => void
}

let feedId = 0

const initial = {
  active: false,
  phase: 'queue' as BrPhase,
  queuePlayers: [],
  countdown: 0,
  countdownActive: false,
  alive: 0,
  totalPlayers: 20,
  kills: 0,
  placement: 0,
  hp: 100,
  shield: 0,
  weapon: '',
  weaponLabel: '',
  weaponRarity: -1,
  mag: 0,
  reserve: 0,
  stormPhase: 0,
  stormLabel: '',
  stormTimer: 0,
  inStorm: false,
  inVehicle: false,
  qualityNote: '',
  loadingMap: false,
  showLeave: true,
  feed: [] as BrFeedEntry[],
  hint: '',
}

export const useBr = create<BrState>((set) => ({
  ...initial,
  set: (p) => set(p),
  addFeed: (text, mine) => {
    const e = { id: ++feedId, text, mine }
    set((s) => ({ feed: [...s.feed.slice(-5), e] }))
    setTimeout(() => {
      set((s) => ({ feed: s.feed.filter(f => f.id !== e.id) }))
    }, 5200)
  },
  reset: () => set({ ...initial, feed: [] }),
}))
