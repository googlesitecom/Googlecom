// ============================================================
// EMERGENCY STRIKE — Store de estado (zustand)
// Puente entre el motor 3D y la interfaz React
// ============================================================
import { create } from 'zustand'
import type { Team, WeaponId, NetRoundState, NetPlayerState, BotDifficulty, ActionId, GameMode, PadAction } from './shared'
import { DEFAULT_KEYBINDS, DEFAULT_PAD_BINDS } from './shared'
import type { NetMode, RoomKind } from './net'

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

/** v6.2: sala 2v2 — jugadores reunidos antes de iniciar la partida */
export interface LobbySlot {
  id: string
  name: string
  team: Team
}
export interface LobbyState {
  kind: RoomKind
  players: LobbySlot[]
}

export interface Announcement {
  id: number
  text: string
  kind: 'kill' | 'round' | 'info' | 'team' | 'multi'
  team?: Team
}

export type Phase = 'menu' | 'connecting' | 'playing' | 'paused' | 'dead'
export type NetStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error'

export interface StoryState {
  active: boolean
  chapter: number
  chapterTitle: string
  objective: string
  progress: string
  hint: string
  timer: number
  dialogue: { who: string; text: string } | null
  status: 'playing' | 'victory'
  stats: { time: number; kills: number }
}

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
  gameMode: GameMode
  netStatus: NetStatus
  netError: string

  /** v6.2: formato de la sala online (1v1 clásico o 2v2 por equipos) */
  roomKind: RoomKind
  /** v6.2: en 2v2, rellenar con bots los huecos vacíos al iniciar */
  fillEmptyWithBots: boolean
  /** v6.2: estado del lobby (anfitrión e invitados 2v2) */
  lobby: LobbyState | null

  hp: number
  armor: number
  money: number
  frags: number
  smokes: number
  /** v8: equipo táctico comprado en la tienda */
  vest: boolean
  helmet: boolean
  flares: number
  stims: number
  /** v8: marca (Date.now()) hasta la que corre la adrenalina */
  stimUntil: number

  /** true mientras se reproduce la cinemática de entrada (oculta el HUD) */
  cineActive: boolean

  /** true si el jugador local lleva la bandera enemiga (CTF) */
  carryingFlag: boolean

  weapon: WeaponId
  mag: number
  reserve: number
  owned: WeaponId[]
  /** v6.1: arsenal completo (para la tienda) */
  armory: WeaponId[]
  /** v6.1: huecos de equipamiento [hueco 1, hueco 2] */
  slots: [WeaponId | null, WeaponId | null]

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
    adsSens: number
    padSens: number
    volume: number
    musicVol: number
    sfxVol: number
    quality: 'baja' | 'media' | 'alta' | 'ultra'
    keybinds: Record<ActionId, string>
    padBinds: Record<PadAction, number>
  }

  /** estado del modo historia (lo actualiza el director) */
  story: StoryState

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
  setPadBind: (action: PadAction, button: number) => void
  resetKeybinds: () => void
  setStory: (partial: Partial<StoryState>) => void
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
  gameMode: 'escaramuza',
  netStatus: 'idle',
  netError: '',
  roomKind: '1v1',
  fillEmptyWithBots: true,
  lobby: null,

  hp: 100,
  armor: 0,
  money: 1000,
  frags: 0,
  smokes: 0,
  vest: false,
  helmet: false,
  flares: 0,
  stims: 0,
  stimUntil: 0,
  cineActive: false,
  carryingFlag: false,

  weapon: 'p9',
  mag: 15,
  reserve: 90,
  owned: ['knife', 'p9'],
  armory: ['knife', 'p9'],
  slots: [null, 'p9'],

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
    adsSens: 0.75,
    padSens: 1.0,
    volume: 0.7,
    musicVol: 0.6,
    sfxVol: 1.0,
    // 'alta' sigue siendo el valor por defecto: ULTRA es OPCIONAL y el
    // jugador debe activarlo a propósito en AJUSTES (v6.2)
    quality: 'alta',
    keybinds: { ...DEFAULT_KEYBINDS },
    padBinds: { ...DEFAULT_PAD_BINDS },
  },

  story: {
    active: false,
    chapter: 0,
    chapterTitle: '',
    objective: '',
    progress: '',
    hint: '',
    timer: 0,
    dialogue: null,
    status: 'playing',
    stats: { time: 0, kills: 0 },
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
    // v7: multi-kill banners live a bit longer on screen
    setTimeout(() => {
      set((s) => ({ announcements: s.announcements.filter(x => x.id !== a.id) }))
    }, kind === 'round' ? 4200 : kind === 'multi' ? 3400 : 2800)
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
  setPadBind: (action, button) => {
    const cur = useGame.getState().settings
    const padBinds = { ...cur.padBinds }
    // si el botón ya está usado por otra acción, liberarla
    for (const k of Object.keys(padBinds) as PadAction[]) {
      if (padBinds[k] === button && k !== action) padBinds[k] = -1
    }
    padBinds[action] = button
    useGame.getState().setSettings({ padBinds })
  },
  resetKeybinds: () => {
    useGame.getState().setSettings({ keybinds: { ...DEFAULT_KEYBINDS }, padBinds: { ...DEFAULT_PAD_BINDS } })
  },
  setStory: (partial) => {
    set((s) => ({ story: { ...s.story, ...partial } }))
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
        adsSens: parsed.adsSens ?? cur.adsSens,
        padSens: parsed.padSens ?? cur.padSens,
        volume: parsed.volume ?? cur.volume,
        musicVol: parsed.musicVol ?? cur.musicVol,
        sfxVol: parsed.sfxVol ?? cur.sfxVol,
        keybinds: { ...cur.keybinds, ...(parsed.keybinds ?? {}) },
        padBinds: { ...cur.padBinds, ...(parsed.padBinds ?? {}) },
      })
    }
  }
} catch { /* JSON inválido: ignorar */ }
