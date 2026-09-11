'use client'

import { useEffect, useRef } from 'react'
import { Game } from '@/game/engine'
import { setGame, getGame } from '@/game/game-instance'
import { useGame } from '@/game/store'

export function GameMount() {
  const canvas3dRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const phase = useGame(s => s.phase)
  const playerName = useGame(s => s.playerName)
  const buyOpen = useGame(s => s.buyOpen)
  const quality = useGame(s => s.settings.quality)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    if (phase === 'menu') return
    initRef.current = true
    const game = new Game()
    setGame(game)
    game.audio.start()
    game.audio.setVolume(useGame.getState().settings.volume)
    game.init(canvas3dRef.current!, overlayRef.current!, minimapRef.current!)
    const st = useGame.getState()
    game.net.connect(playerName || 'Operator', {
      mode: st.mode,
      roomCode: st.roomCode,
      fillBots: st.fillBots,
      difficulty: st.botDifficulty,
      gameMode: st.gameMode,
      roomKind: st.roomKind,          // classic 1v1 or 2v2 with lobby
      fillEmpty: st.fillEmptyWithBots,// fill empty slots with bots
    })
    if (process.env.NODE_ENV === 'development') {
      ;(window as unknown as Record<string, unknown>).__game = game
    }

    return () => {
      initRef.current = false
      game.dispose()
      setGame(null)
    }
  }, [])

  // quality applies LIVE — changing it in SETTINGS (even from the
  // pause menu) reconfigures the renderer on the spot
  useEffect(() => {
    getGame()?.applyQuality(quality)
  }, [quality])

  const showClickToPlay = (phase === 'playing' || phase === 'paused') && !buyOpen

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <canvas ref={canvas3dRef} className="absolute inset-0 w-full h-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: '100%', height: '100%' }}
      />
      {/* cinematic vignette (cheap: no GPU cost) */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 82% 74% at 50% 46%, transparent 58%, rgba(0,0,0,0.42) 100%)',
        }}
      />
      {/* tactical minimap (drawn by the engine) — v7: circular frame */}
      <canvas
        ref={minimapRef}
        width={240}
        height={240}
        className="absolute top-4 left-4 z-20 pointer-events-none"
        style={{
          width: '216px',
          height: '216px',
          borderRadius: '50%',
          border: '1px solid rgba(160,168,158,0.45)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.55), inset 0 0 24px rgba(0,0,0,0.45)',
        }}
      />
      {showClickToPlay && <ClickToPlay />}
    </div>
  )
}

function ClickToPlay() {
  const phase = useGame(s => s.phase)
  if (phase === 'playing') return null
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
      onClick={() => getGame()?.requestLock()}
    >
      <div className="text-center space-y-3">
        <p className="font-tac text-3xl tracking-widest text-amber-400 uppercase">Paused</p>
        <p className="text-stone-300 text-lg">Click to get back into the fight</p>
        <p className="text-stone-500 text-sm font-tac-md">ESC pause · Tab scoreboard · B shop</p>
      </div>
    </div>
  )
}
