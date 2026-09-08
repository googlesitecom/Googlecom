'use client'

import dynamic from 'next/dynamic'
import { useGame } from '@/game/store'
import { MainMenu, ConnectingScreen, PauseMenu } from '@/components/game/menus'
import { Hud, DeathOverlay } from '@/components/game/hud'
import { BuyMenu } from '@/components/game/buy-menu'
import { Scoreboard } from '@/components/game/scoreboard'

const GameMount = dynamic(
  () => import('@/components/game/game-mount').then(m => m.GameMount),
  { ssr: false },
)

export default function Home() {
  const phase = useGame(s => s.phase)
  const inGame = phase !== 'menu'

  return (
    <main className="w-screen h-screen overflow-hidden bg-stone-950">
      {inGame && <GameMount />}
      {inGame && <Hud />}
      {inGame && <Scoreboard />}
      {inGame && <BuyMenu />}
      {inGame && <DeathOverlay />}
      {inGame && <PauseMenu />}
      {phase === 'menu' && <MainMenu />}
      {phase === 'connecting' && <ConnectingScreen />}
    </main>
  )
}
