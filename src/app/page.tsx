'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useGame } from '@/game/store'
import { useAuth, restoreSession } from '@/game/auth'
import { useBr } from '@/game/br-store'
import { MainMenu, ConnectingScreen, PauseMenu, NetToasts } from '@/components/game/menus'
import { esNet } from '@/game/esnet'
import { Hud, DeathOverlay, StoryVictory } from '@/components/game/hud'
import { BuyMenu } from '@/components/game/buy-menu'
import { Scoreboard } from '@/components/game/scoreboard'
import { BootScreen } from '@/components/boot-screen'
import { AuthScreen } from '@/components/auth-screen'
import { getAudio } from '@/game/audio'

const GameMount = dynamic(
  () => import('@/components/game/game-mount').then(m => m.GameMount),
  { ssr: false },
)

// v9: Battle Royale lives in its own lazily-fetched chunk (modular
// architecture) — the module code is only downloaded and evaluated
// when the player actually enters BR, and it is fully disposed on exit.
const BrMount = dynamic(
  () => import('@/components/game/br-mount').then(m => m.BrMount),
  { ssr: false },
)

export default function Home() {
  const phase = useGame(s => s.phase)
  const [booted, setBooted] = useState(false)
  const authReady = useAuth(s => s.ready)
  const authUser = useAuth(s => s.user)
  const brActive = useBr(s => s.active)
  const inGame = phase !== 'menu'
  // Battle Royale takes over the whole screen while active
  const brScreen = brActive

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

  // restore the persisted login session once, right after the boot screen
  useEffect(() => {
    if (booted) restoreSession()
  }, [booted])

  // v11: connect the REAL social network (presence, friends, squads)
  // whenever an operator is logged in; disconnect on logout
  useEffect(() => {
    if (authUser) esNet.connect()
    else esNet.disconnect()
  }, [authUser])

  const onBootDone = useCallback(() => setBooted(true), [])

  return (
    <main className="w-screen h-screen overflow-hidden bg-stone-950">
      {!booted && <BootScreen onDone={onBootDone} />}
      {booted && (
        <>
          {brScreen && <BrMount />}
          {!brScreen && authReady && !authUser && <AuthScreen />}
          {!brScreen && authUser && (
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
              <NetToasts />
            </>
          )}
        </>
      )}
    </main>
  )
}
