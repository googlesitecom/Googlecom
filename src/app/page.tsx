'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useGame } from '@/game/store'
import { MainMenu, ConnectingScreen, PauseMenu } from '@/components/game/menus'
import { Hud, DeathOverlay, StoryVictory } from '@/components/game/hud'
import { BuyMenu } from '@/components/game/buy-menu'
import { Scoreboard } from '@/components/game/scoreboard'
import { BootScreen } from '@/components/boot-screen'
import { getAudio } from '@/game/audio'

const GameMount = dynamic(
  () => import('@/components/game/game-mount').then(m => m.GameMount),
  { ssr: false },
)

export default function Home() {
  const phase = useGame(s => s.phase)
  const [booted, setBooted] = useState(false)
  const inGame = phase !== 'menu'

  // la música arranca con el primer gesto (política de autoplay) y ya no se
  // detiene: el motor la atenúa durante la partida y la restaura en el menú
  useEffect(() => {
    const start = (): void => {
      const audio = getAudio()
      audio.start()
      const s = useGame.getState().settings
      audio.setVolume(s.volume)
      audio.setMusicVolume(s.musicVol)
      audio.setSfxVolume(s.sfxVol)
      audio.playMusic()
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
  }, [])

  const onBootDone = useCallback(() => setBooted(true), [])

  return (
    <main className="w-screen h-screen overflow-hidden bg-stone-950">
      {!booted && <BootScreen onDone={onBootDone} />}
      {booted && (
        <>
          {inGame && <GameMount />}
          {inGame && <Hud />}
          {inGame && <Scoreboard />}
          {inGame && <BuyMenu />}
          {inGame && <DeathOverlay />}
          {inGame && <PauseMenu />}
          {inGame && <StoryVictory />}
          {phase === 'menu' && <MainMenu />}
          {phase === 'connecting' && <ConnectingScreen />}
        </>
      )}
    </main>
  )
}
