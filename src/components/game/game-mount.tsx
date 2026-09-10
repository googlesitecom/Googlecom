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
    game.net.connect(playerName || 'Operador', {
      mode: st.mode,
      roomCode: st.roomCode,
      fillBots: st.fillBots,
      difficulty: st.botDifficulty,
      gameMode: st.gameMode,
      roomKind: st.roomKind,          // v6.2: 1v1 clásico o 2v2 con lobby
      fillEmpty: st.fillEmptyWithBots, // v6.2: huecos vacíos con bots
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

  // v6.4: la calidad se aplica EN VIVO — cambiarla en AJUSTES (incluso
  // desde el menú de pausa) reconfigura el render al instante
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
      {/* viñeta cinematográfica (v5): coste cero en el GPU */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 82% 74% at 50% 46%, transparent 58%, rgba(0,0,0,0.42) 100%)',
        }}
      />
      {/* minimapa (dibujado por el motor) */}
      <canvas
        ref={minimapRef}
        width={240}
        height={240}
        className="absolute top-4 left-4 rounded-lg border-2 border-stone-600/70 shadow-2xl z-20 pointer-events-none"
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
        <p className="text-3xl font-black tracking-widest text-amber-400">EN PAUSA</p>
        <p className="text-stone-300 text-lg">Haz clic para volver al combate</p>
        <p className="text-stone-500 text-sm">ESC para pausar · Tab marcador · B comprar</p>
      </div>
    </div>
  )
}
