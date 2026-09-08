// ============================================================
// FRONTERA CERO — Store de estado (zustand)
// Puente entre el motor 3D y la interfaz React
// ============================================================
import { create } from 'zustand'
import type { Team, WeaponId, NetRoundState, NetPlayerState } from './shared'

export interface KillFeedEntry {
  id: number
  killer: string
  killerTeam: Team
  victim: string
  victimTeam: Team
  weapon: WeaponId
  headshot: boolean
  t: number
}

export interface Announcement {
  id: number
  text: string
  kind: 'kill' | 'round' | 'info' | 'team'
  team?: Team
}

export type Phase = 'menu' | 'connecting' | 'playing' | 'paused' | 'dead'

interface GameState {
  phase: Phase
  playerName: string
  playerId: string
  team: Team
  connected: boolean

  hp: number
  armor: number
  money: number
  frags: number

  weapon: WeaponId
  mag: number
  reserve: number
  owned: WeaponId[]

  round: NetRoundState | null

  killfeed: KillFeedEntry[]
  announcements: Announcement[]

  deathInfo: { killer: string; respawnIn: number; diedAt: number } | null

  scoreboardOpen: boolean
  buyOpen: boolean
  buyZone: boolean
  scoreboard: NetPlayerState[]

  settings: {
    sens: number
    volume: number
    quality: 'baja' | 'media' | 'alta'
  }

  fps: number
  ping: number

  // acciones
  setPhase: (p: Phase) => void
  setPlayerName: (n: string) => void
  setConnected: (c: boolean) => void
  setHud: (partial: Partial<GameState>) => void
  addKill: (e: Omit<KillFeedEntry, 'id' | 't'>) => void
  addAnnouncement: (text: string, kind: Announcement['kind'], team?: Team) => void
  setSettings: (s: Partial<GameState['settings']>) => void
}

let feedId = 0
let annId = 0

export const useGame = create<GameState>((set) => ({
  phase: 'menu',
  playerName: '',
  playerId: '',
  team: 'A',
  connected: false,

  hp: 100,
  armor: 0,
  money: 1000,
  frags: 0,

  weapon: 'p9',
  mag: 15,
  reserve: 90,
  owned: ['knife', 'p9'],

  round: null,

  killfeed: [],
  announcements: [],

  deathInfo: null,

  scoreboardOpen: false,
  buyOpen: false,
  buyZone: false,
  scoreboard: [],

  settings: {
    sens: 1.0,
    volume: 0.7,
    quality: 'alta',
  },

  fps: 0,
  ping: 0,

  setPhase: (p) => set({ phase: p }),
  setPlayerName: (n) => set({ playerName: n }),
  setConnected: (c) => set({ connected: c }),
  setHud: (partial) => set(partial),
  addKill: (e) => {
    const entry: KillFeedEntry = { ...e, id: ++feedId, t: performance.now() }
    set((s) => ({ killfeed: [...s.killfeed.slice(-7), entry] }))
    setTimeout(() => {
      set((s) => ({ killfeed: s.killfeed.filter(k => k.id !== entry.id) }))
    }, 6000)
  },
  addAnnouncement: (text, kind, team) => {
    const a: Announcement = { id: ++annId, text, kind, team }
    set((s) => ({ announcements: [...s.announcements.slice(-3), a] }))
    setTimeout(() => {
      set((s) => ({ announcements: s.announcements.filter(x => x.id !== a.id) }))
    }, kind === 'round' ? 4200 : 2800)
  },
  setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
}))
