// ============================================================
// EMERGENCY STRIKE — Match chat (v10)
// In-match text chat shared by EVERY mode (normal PvP and
// campaign): press [T] (or Enter) while playing, type, Enter to
// send. v11: REAL multiplayer — when the match runs on a P2P
// room, your line travels to the other operators and theirs
// appear live. Offline/bot matches keep the canned squad chatter
// so the channel still feels alive.
// Pure local state — nothing here touches the render loop.
// ============================================================
import { create } from 'zustand'
import { useAuth } from './auth'
import { useGame } from './store'

export interface ChatMsg {
  id: number
  from: string
  text: string
  mine: boolean
  /** color accent: 'me' | 'team' | 'enemy' | 'system' */
  kind: 'me' | 'team' | 'enemy' | 'system'
  t: number
}

interface ChatState {
  messages: ChatMsg[]
  open: boolean
  openChat: () => void
  closeChat: () => void
  push: (from: string, text: string, kind: ChatMsg['kind']) => void
  reset: () => void
}

let chatId = 0

export const useChat = create<ChatState>((set) => ({
  messages: [],
  open: false,
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

/** player sends a line; real operators receive it on the network */
export function sendChatLine(text: string): void {
  const clean = text.trim().slice(0, 90)
  if (!clean) return
  const name = chatLocalName()
  useChat.getState().push(name, clean, 'me')
  // v11: P2P room → the line goes through the host relay
  if (roomRelay && roomRelay(clean)) return
  // offline/bot match: a teammate answers ~1-2.4 s later
  if (Math.random() < 0.72) {
    const reply = pick(REPLIES)
    const who = pick(SQUAD_NAMES)
    setTimeout(() => useChat.getState().push(who, reply, 'team'), 900 + Math.random() * 1500)
  }
}

/** v11: a line arrived from a REAL operator on the P2P room */
export function pushNetChatLine(from: string, text: string, kind: 'team' | 'enemy' | 'me' = 'team'): void {
  useChat.getState().push(from.slice(0, 16), text.slice(0, 90), kind)
}

/** v11: chat relay hook — the engine's net client installs this while a
 *  P2P room is connected, so lines travel host ↔ guests */
let roomRelay: ((text: string) => boolean) | null = null
export function setRoomChatRelay(fn: ((text: string) => boolean) | null): void {
  roomRelay = fn
}

/** ambient chatter from squadmates / other operators */
export function ambientChatter(): void {
  const st = useChat.getState()
  if (st.open) return
  st.push(pick(SQUAD_NAMES), pick(MATCH_LINES), 'team')
}

export function systemChatter(text: string): void {
  useChat.getState().push('RADIO', text, 'system')
}

// ------------------------------------------------------------
// Canned chatter (in-game text stays English, like the rest of
// the game copy)
// ------------------------------------------------------------
const SQUAD_NAMES = ['Kero', 'Delta', 'Sixto', 'Vera', 'Rojo', 'Mora', 'Iris', 'Tadeo']

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
  'Supply drop incoming, watch the sky',
  'Grabbed a crate, new rifle smells nice',
  'Careful, someone is camping that drop',
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
