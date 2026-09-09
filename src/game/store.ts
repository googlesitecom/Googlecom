// ============================================================
// FRONTERA CERO — Store de estado (zustand)
// Puente entre el motor 3D y la interfaz React
// ============================================================
import { create } from 'zustand'
import type { Team, WeaponId, NetRoundState, NetPlayerState, BotDifficulty, ActionId } from './shared'
import { DEFAULT_KEYBINDS } from './shared'
import type { NetMode } from './net'

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
export type NetStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error'

interface GameState {
  phase: Phase
  playerName: string
  playerId: string
  team: Team
  connected: boolean

  // modo de juego / sala
  mode: NetMode
  roomCode: string
  fillBots: number
  botDifficulty: BotDifficulty
  netStatus: NetStatus
  netError: string

  hp: number
  armor: number
  money: number
  frags: number
  smokes: number

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
    padSens: number
    volume: number
    quality: 'baja' | 'media' | 'alta'
    keybinds: Record<ActionId, string>
  }

  fps: number
  ping: number
  gamepadConnected: boolean

  // acciones
  setPhase: (p: Phase) => void
  setPlayerName: (n: string) => void
  setConnected: (c: boolean) => void
  setHud: (partial: Partial<GameState>) => void
  addKill: (e: Omit<KillFeedEntry, 'id' | 't'>) => void
  addAnnouncement: (text: string, kind: Announcement['kind'], team?: Team) => void
  setSettings: (s: Partial<GameState['settings']>) => void
  setKeybind: (action: ActionId, code: string) => void
  resetKeybinds: () => void
}

let feedId = 0
let annId = 0

export const useGame = create<GameState>((set) => ({
  phase: 'menu',
  playerName: '',
  playerId: '',
  team: 'A',
  connected: false,

  mode: 'solo',
  roomCode: '',
  fillBots: 0,
  botDifficulty: 'normal',
  netStatus: 'idle',
  netError: '',

  hp: 100,
  armor: 0,
  money: 1000,
  frags: 0,
  smokes: 0,

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
    padSens: 1.0,
    volume: 0.7,
    quality: 'alta',
    keybinds: { ...DEFAULT_KEYBINDS },
  },

  fps: 0,
  ping: 0,
  gamepadConnected: false,

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
  setSettings: (s) => {
    const next = { ...useGame.getState().settings, ...s }
    set({ settings: next })
    try { localStorage.setItem('fzc-settings', JSON.stringify(next)) } catch { /* sin almacenamiento */ }
  },
  setKeybind: (action, code) => {
    const cur = useGame.getState().settings
    const keybinds = { ...cur.keybinds }
    // si la tecla ya está usada por otra acción, liberar esa acción
    for (const k of Object.keys(keybinds) as ActionId[]) {
      if (keybinds[k] === code && k !== action) keybinds[k] = ''
    }
    keybinds[action] = code
    useGame.getState().setSettings({ keybinds })
  },
  resetKeybinds: () => {
    useGame.getState().setSettings({ keybinds: { ...DEFAULT_KEYBINDS } })
  },
}))

// restaurar ajustes persistidos (calidad/sensibilidad/volumen/teclas)
try {
  const saved = typeof window !== 'undefined' ? localStorage.getItem('fzc-settings') : null
  if (saved) {
    const parsed = JSON.parse(saved) as Partial<GameState['settings']>
    if (parsed && (parsed.quality || parsed.sens || parsed.volume || parsed.padSens || parsed.keybinds)) {
      const cur = useGame.getState().settings
      useGame.getState().setSettings({
        quality: parsed.quality ?? cur.quality,
        sens: parsed.sens ?? cur.sens,
        padSens: parsed.padSens ?? cur.padSens,
        volume: parsed.volume ?? cur.volume,
        keybinds: { ...cur.keybinds, ...(parsed.keybinds ?? {}) },
      })
    }
  }
} catch { /* JSON inválido: ignorar */ }
