// ============================================================
// EMERGENCY STRIKE — Match chat (v10)
// In-match text chat shared by EVERY mode (normal PvP, campaign
// and Battle Royale): press [T] (or Enter) while playing, type,
// Enter to send. Squadmates / other operators answer with canned
// lines so the channel feels alive. Pure local state — nothing
// here touches the render loop.
// ============================================================
import { create } from 'zustand'
import { useAuth } from './auth'
import { useGame } from './store'

export interface ChatMsg {
  id: number
  from: string
  text: string
  mine: boolean
  /** color accent: 'me' | 'team' | 'enemy' | 'br' | 'system' */
  kind: 'me' | 'team' | 'enemy' | 'br' | 'system'
  t: number
}

interface ChatState {
  messages: ChatMsg[]
  open: boolean
  /** match context the box adapts to ('pvp' | 'br') */
  mode: 'pvp' | 'br'
  setMode: (m: 'pvp' | 'br') => void
  openChat: () => void
  closeChat: () => void
  push: (from: string, text: string, kind: ChatMsg['kind']) => void
  reset: () => void
}

let chatId = 0

export const useChat = create<ChatState>((set) => ({
  messages: [],
  open: false,
  mode: 'pvp',
  setMode: (m) => set({ mode: m }),
  openChat: () => set({ open: true }),
  closeChat: () => set({ open: false }),
  push: (from, text, kind) => {
    const msg: ChatMsg = { id: ++chatId, from, text, mine: kind === 'me', kind, t: Date.now() }
    set((s) => ({ messages: [...s.messages.slice(-40), msg] }))
  },
  reset: () => set({ messages: [], open: false }),
}))

/** name of the local player for chat lines */
export function chatLocalName(): string {
  return useAuth.getState().user
    ?? useGame.getState().playerName
    ?? 'Operator'
}

/** player sends a line; squadmates may answer a beat later */
export function sendChatLine(text: string): void {
  const clean = text.trim().slice(0, 90)
  if (!clean) return
  const name = chatLocalName()
  useChat.getState().push(name, clean, 'me')
  // a teammate/operator answers ~1-2.4 s later (not for every message)
  if (Math.random() < 0.72) {
    const reply = pick(REPLIES)
    const who = useChat.getState().mode === 'br' ? pick(BR_NAMES) : pick(SQUAD_NAMES)
    setTimeout(() => useChat.getState().push(who, reply, useChat.getState().mode === 'br' ? 'br' : 'team'), 900 + Math.random() * 1500)
  }
}

/** ambient chatter from squadmates / other operators */
export function ambientChatter(): void {
  const st = useChat.getState()
  if (st.open) return
  const br = st.mode === 'br'
  const who = br ? pick(BR_NAMES) : pick(SQUAD_NAMES)
  const line = br ? pick(BR_LINES) : pick(MATCH_LINES)
  st.push(who, line, br ? 'br' : 'team')
}

export function systemChatter(text: string): void {
  useChat.getState().push('RADIO', text, 'system')
}

// ------------------------------------------------------------
// Canned chatter (in-game text stays English, like the rest of
// the game copy)
// ------------------------------------------------------------
const SQUAD_NAMES = ['Kero', 'Delta', 'Sixto', 'Vera', 'Rojo', 'Mora', 'Iris', 'Tadeo']
const BR_NAMES = ['Kilo', 'Nova', 'Vante', 'Zumo', 'Rayo', 'Nico', 'Danna', 'Enzo', 'Ciro', 'Nyx']

const MATCH_LINES = [
  'Enemy spotted near the tower',
  'Pushing mid, cover me',
  'Reloading!',
  'They are rushing B',
  'Watch the rooftops',
  'Smoke is down, move now',
  'I will hold this angle',
  'One low on their side',
  'Careful with the barrels',
  'Buy menu, give me a sec',
  'Flag carrier heading to our base',
  'Zone BRAVO is theirs, retake?',
  'Nice shot operator',
  'Half of my mag gone on that push',
]

const BR_LINES = [
  'Dropping near the city',
  'Anyone else landing at the lake?',
  'Storm is closing, rotate NOW',
  'Got a Rare AR here, all mine',
  'Heard shots north of the ridge',
  'That crate is a trap, careful',
  'Top 10, keep it quiet',
  'Vehicle by the gas station',
  'Just got a Legendary, feel bad for you',
  'Third party at the farm',
  'The water is colder than my aim',
  'Glider deployed, see you down there',
]

const REPLIES = [
  'Copy that',
  'On it',
  'Roger',
  'Nice',
  'Affirmative',
  'Got your back',
  'Same here',
  'Let\'s move',
  'GG',
  'Hold position',
  'Say again?',
  'Take point',
  'Ha! good one',
]

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** starts ambient chatter for the current match (call once per match) */
export function startAmbientChat(): () => void {
  const timer = setInterval(() => {
    if (Math.random() < 0.55) ambientChatter()
  }, 26000 + Math.random() * 20000)
  return () => clearInterval(timer)
}
