'use client'

// ============================================================
// EMERGENCY STRIKE — Match chat box (v10)
// Works in EVERY mode (PvP, campaign, Battle Royale):
//   [T] or [ENTER] opens the input (mouse unlocks to type)
//   [ENTER] sends · [ESC] closes
// Bots/operators keep the channel alive with canned chatter.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { useChat, sendChatLine } from '@/game/chat'
import { useGame } from '@/game/store'
import { useBr } from '@/game/br-store'
import { getBrGame } from '@/game/br-instance'

/** re-lock the mouse for whichever engine is running */
function relockPointer(): void {
  try {
    const br = getBrGame()
    if (br) { br.requestLock(); return }
    const w = window as unknown as { __game?: { requestLock?: () => void } }
    w.__game?.requestLock?.()
  } catch { /* the click-to-play overlay covers this case */ }
}

export function ChatBox() {
  const open = useChat(s => s.open)
  const mode = useChat(s => s.mode)
  const messages = useChat(s => s.messages)
  const openChat = useChat(s => s.openChat)
  const closeChat = useChat(s => s.closeChat)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const phase = useGame(s => s.phase)
  const brPhase = useBr(s => s.phase)
  const brActive = useBr(s => s.active)
  const buyOpen = useGame(s => s.buyOpen)

  const inMatch = brActive
    ? (brPhase === 'live' || brPhase === 'plane')
    : phase === 'playing'

  // ---- [T] / [ENTER] opens the chat while in a match ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!inMatch || buyOpen) return
      if (useChat.getState().open) return
      if (e.code === 'KeyT' || (e.code === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        if (document.pointerLockElement) document.exitPointerLock()
        useChat.getState().openChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inMatch, buyOpen])

  // ---- focus + select the input when it opens ----
  useEffect(() => {
    if (open) {
      setDraft('')
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // ---- pvp chat mode follows the active game ----
  useEffect(() => {
    if (!brActive) useChat.getState().setMode('pvp')
  }, [brActive])

  const send = (): void => {
    if (draft.trim()) sendChatLine(draft)
    setDraft('')
    useChat.getState().closeChat()
    relockPointer()
  }

  const cancel = (): void => {
    setDraft('')
    useChat.getState().closeChat()
    relockPointer()
  }

  // messages shown: last 6 (or full log while the input is open)
  const shown = open ? messages.slice(-12) : messages.slice(-6)

  return (
    <div className="absolute left-4 bottom-24 sm:left-6 w-[min(360px,72vw)] pointer-events-none select-none z-30"
      style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      {/* message log */}
      <div className="space-y-1 mb-2">
        {shown.map(m => (
          <div
            key={m.id}
            className={`text-[12px] leading-snug font-medium rounded px-2.5 py-1 w-fit max-w-full backdrop-blur-[2px] border ${
              m.kind === 'me'
                ? 'bg-amber-950/70 border-amber-700/50 text-amber-100'
                : m.kind === 'br'
                  ? 'bg-stone-950/70 border-stone-800/80 text-stone-300'
                  : m.kind === 'system'
                    ? 'bg-sky-950/60 border-sky-800/50 text-sky-200'
                    : 'bg-stone-950/70 border-stone-800/80 text-stone-200'
            }`}
          >
            <span className="font-bold mr-1.5" style={{ color: m.kind === 'me' ? '#fcd34d' : m.kind === 'br' ? '#a8a29e' : '#7dd3fc' }}>
              {m.from}:
            </span>
            {m.text}
          </div>
        ))}
      </div>

      {/* input line / hint */}
      {open ? (
        <div className="pointer-events-auto flex items-center gap-2 bg-stone-950/90 border border-amber-600/60 rounded-md px-3 py-2 shadow-2xl">
          <span className="font-tac-md text-[10px] text-amber-300/80 tracking-widest shrink-0">
            {mode === 'br' ? 'ALL' : 'TEAM'}
          </span>
          <input
            ref={inputRef}
            value={draft}
            maxLength={90}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') send()
              else if (e.key === 'Escape') cancel()
            }}
            placeholder="Type a message…"
            className="bg-transparent outline-none text-white text-[13px] w-full placeholder:text-stone-600"
          />
          <span className="font-tac-md text-[9px] text-stone-600 shrink-0">ENTER send · ESC close</span>
        </div>
      ) : (
        inMatch && messages.length === 0 && (
          <div className="font-tac-md text-[9px] text-stone-500/80 bg-stone-950/50 border border-stone-800/60 rounded px-2 py-1 w-fit">
            Press [T] to chat
          </div>
        )
      )}
    </div>
  )
}
