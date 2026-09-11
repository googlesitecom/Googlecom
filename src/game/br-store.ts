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
