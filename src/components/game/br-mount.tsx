'use client'

// ============================================================
// EMERGENCY STRIKE — Battle Royale mount (v9)
// This component is dynamically imported by the root page, so
// EVERYTHING it pulls (the whole BR engine module) lives in a
// separate lazy chunk: zero cost for the rest of the game until
// the player enters BR — and fully disposed on unmount.
// ============================================================
import { useEffect, useRef } from 'react'
import { startBrGame, type BattleRoyaleGame } from '@/game/battle-royale'
import { setBrGame } from '@/game/br-instance'
import { BrHud } from './br-hud'

export function BrMount() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<BattleRoyaleGame | null>(null)

  useEffect(() => {
    if (!canvasRef.current || !minimapRef.current) return
    const game = startBrGame(canvasRef.current, minimapRef.current)
    gameRef.current = game
    setBrGame(game)
    return () => {
      gameRef.current = null
      setBrGame(null)
      game.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" id="br-canvas" />
      {/* tactical minimap (drawn by the BR engine) */}
      <canvas
        ref={minimapRef}
        width={240}
        height={240}
        className="absolute top-4 left-4 z-20 pointer-events-none"
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '10px',
          border: '1px solid rgba(160,168,158,0.45)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
        }}
      />
      {/* cinematic vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 82% 74% at 50% 46%, transparent 58%, rgba(0,0,0,0.42) 100%)',
        }}
      />
      <BrHud />
    </div>
  )
}
