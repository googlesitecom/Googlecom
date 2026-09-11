'use client'

// ============================================================
// EMERGENCY STRIKE — Battle Royale HUD (v9)
// Matchmaking overlay, plane hint, live combat HUD, storm
// readouts, killfeed, death/victory screens. All data comes
// from the tiny br-store (the heavy BR module feeds it).
// ============================================================
import { useEffect, useState } from 'react'
import { useBr } from '@/game/br-store'
import { getBrGame } from '@/game/br-instance'
import { Button } from '@/components/ui/button'
import {
  Users, Skull, Wind, Rocket, Crosshair, Plane, Heart, LogOut, Crown,
  Timer, Gauge, Loader2, Eye, Car,
} from 'lucide-react'

export function BrHud() {
  const phase = useBr(s => s.phase)
  const [locked, setLocked] = useState(false)
  const [hurt, setHurt] = useState(0)

  useEffect(() => {
    const onLock = (): void => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', onLock)
    const id = setInterval(() => {
      const g = getBrGame()
      if (g) setHurt(g.hurtLevel)
    }, 100)
    return () => {
      document.removeEventListener('pointerlockchange', onLock)
      clearInterval(id)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-30 pointer-events-none select-none" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      {/* storm / damage vignettes */}
      {useBr.getState().inStorm && phase === 'live' && (
        <div className="absolute inset-0 animate-pulse" style={{ boxShadow: 'inset 0 0 140px rgba(200,30,60,0.55)' }} />
      )}
      {hurt > 0.03 && (
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${Math.round(90 + hurt * 120)}px rgba(160,20,20,${hurt * 0.6})` }} />
      )}

      {phase === 'queue' && <QueueOverlay locked={locked} />}
      {phase === 'plane' && <PlaneHint locked={locked} />}
      {(phase === 'live' || phase === 'dead' || phase === 'victory') && <LiveHud />}
      {phase === 'dead' && <DeathScreen />}
      {phase === 'victory' && <VictoryScreen />}

      {/* click to (re)take control while the match is interactive */}
      {!locked && (phase === 'queue' || phase === 'plane' || phase === 'live') && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 cursor-pointer pointer-events-auto"
          onClick={() => getBrGame()?.requestLock()}
        >
          <div className="text-center space-y-2.5">
            <p className="font-tac text-3xl tracking-widest text-amber-400 uppercase">
              {phase === 'queue' ? 'Lobby island' : phase === 'plane' ? 'Aboard the plane' : 'Paused'}
            </p>
            <p className="text-stone-300 text-lg">Click to take control</p>
            <p className="text-stone-500 text-sm font-tac-md">
              {phase === 'queue'
                ? 'WASD to walk the island while the squad fills'
                : 'WASD move · SPACE jump / drop · E interact · R reload · ESC mouse'}
            </p>
            <Button
              onClick={e => { e.stopPropagation(); getBrGame()?.leave() }}
              variant="secondary"
              className="h-9 px-6 font-tac-md text-[11px] bg-stone-900/90 border border-stone-600 text-stone-300 hover:bg-red-950/60 hover:border-red-800/70 hover:text-red-200 mt-2"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> LEAVE MATCH
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// MATCHMAKING (lobby island)
// ------------------------------------------------------------
function QueueOverlay({ locked }: { locked: boolean }) {
  const players = useBr(s => s.queuePlayers)
  const countdownActive = useBr(s => s.countdownActive)
  const countdown = useBr(s => s.countdown)
  const loadingMap = useBr(s => s.loadingMap)
  const qualityNote = useBr(s => s.qualityNote)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4"
      style={{ background: locked ? 'transparent' : 'rgba(3,5,7,0.25)' }}>
      <div className="text-center">
        <p className="font-tac text-white text-2xl tracking-[0.3em] uppercase">Battle Royale · Matchmaking</p>
        <p className="font-tac-md text-stone-400 text-[11px] mt-1.5">
          Waiting on the lobby island — the match starts once the countdown ends
        </p>
      </div>

      {countdownActive ? (
        <div className="bg-stone-950/85 border-2 border-amber-500/70 rounded-xl px-10 py-5 text-center shadow-2xl tac-corner">
          <p className="font-tac-md text-amber-200/80 text-[11px] tracking-[0.3em]">DEPLOYING IN</p>
          <p className="font-tac text-amber-200 text-6xl tabular-nums leading-none mt-1.5">{countdown}</p>
          <p className="font-tac-md text-stone-500 text-[10px] mt-2">
            {players.length} connected · room fills to 20 with bots
          </p>
        </div>
      ) : (
        <div className="bg-stone-950/85 border border-stone-700/70 rounded-xl px-8 py-4 flex items-center gap-4 shadow-xl">
          <Loader2 className="w-6 h-6 text-amber-300 animate-spin" />
          <div>
            <p className="font-tac text-white text-lg tracking-widest">CONNECTING OPERATORS</p>
            <p className="font-tac-md text-stone-400 text-[11px] mt-0.5">
              {players.length}/4 operators detected — the 60-second countdown starts at 4
            </p>
          </div>
        </div>
      )}

      {/* connected operators */}
      <div className="w-[min(430px,92vw)] bg-stone-950/70 border border-stone-800 rounded-lg p-3">
        <p className="font-tac-md text-stone-500 text-[10px] mb-2 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> CONNECTED — {players.length}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {players.map((p, i) => (
            <div key={`${p.name}-${i}`} className="font-tac-md text-[11px] text-stone-300 bg-stone-900/70 rounded px-2.5 py-1 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${p.real ? 'bg-emerald-400' : 'bg-stone-600'}`} />
              {p.name}
              {i === 0 && <span className="text-amber-300/70 text-[9px]">(YOU)</span>}
            </div>
          ))}
        </div>
      </div>

      {loadingMap && (
        <p className="font-tac-md text-stone-500 text-[10px] flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> STREAMING THE ISLAND (280×280 m)…
        </p>
      )}
      {qualityNote && (
        <p className="font-tac-md text-amber-200/80 text-[10px] flex items-center gap-2 bg-amber-950/40 border border-amber-900/50 rounded px-3 py-1.5">
          <Gauge className="w-3.5 h-3.5" /> {qualityNote}
        </p>
      )}

      <Button
        onClick={() => getBrGame()?.leave()}
        variant="secondary"
        className="h-9 px-6 font-tac-md text-[11px] bg-stone-900/80 border border-stone-600 text-stone-300 hover:bg-stone-800 pointer-events-auto"
      >
        <LogOut className="w-3.5 h-3.5 mr-1.5" /> LEAVE QUEUE
      </Button>
    </div>
  )
}

// ------------------------------------------------------------
// PLANE / DROP
// ------------------------------------------------------------
function PlaneHint({ locked }: { locked: boolean }) {
  return (
    <div className="absolute bottom-[16%] left-1/2 -translate-x-1/2 text-center">
      <div className="bg-stone-950/80 border border-amber-500/60 rounded-lg px-8 py-4 shadow-2xl tac-corner">
        <Plane className="w-8 h-8 text-amber-300 mx-auto mb-1.5 animate-pulse" />
        <p className="font-tac text-amber-200 text-xl tracking-[0.22em]">PRESS [SPACE] TO JUMP</p>
        <p className="font-tac-md text-stone-400 text-[11px] mt-1.5">
          {locked ? 'WASD steers the freefall · the glider opens near the ground' : 'Click to take control, then SPACE'}
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// LIVE HUD
// ------------------------------------------------------------
function LiveHud() {
  const phase = useBr(s => s.phase)
  const hp = useBr(s => s.hp)
  const alive = useBr(s => s.alive)
  const kills = useBr(s => s.kills)
  const weaponLabel = useBr(s => s.weaponLabel)
  const mag = useBr(s => s.mag)
  const reserve = useBr(s => s.reserve)
  const stormLabel = useBr(s => s.stormLabel)
  const stormPhase = useBr(s => s.stormPhase)
  const feed = useBr(s => s.feed)
  const hint = useBr(s => s.hint)
  const inStorm = useBr(s => s.inStorm)
  const inVehicle = useBr(s => s.inVehicle)
  const showCrosshair = phase === 'live' && !inVehicle

  return (
    <>
      {/* top center: alive + kills + storm */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5">
        <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-4 py-2 flex items-center gap-2.5 shadow-xl tac-corner">
          <Users className="w-4 h-4 text-stone-400" />
          <span className="font-tac text-lg text-stone-100 tabular-nums">{alive}</span>
          <span className="font-tac-md text-[9px] text-stone-500">ALIVE</span>
        </div>
        <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-4 py-2 flex items-center gap-2.5 shadow-xl tac-corner">
          <Skull className="w-4 h-4 text-red-400/90" />
          <span className="font-tac text-lg text-stone-100 tabular-nums">{kills}</span>
          <span className="font-tac-md text-[9px] text-stone-500">ELIMS</span>
        </div>
        <div className={`backdrop-blur-sm border rounded-md px-4 py-2 flex items-center gap-2.5 shadow-xl tac-corner ${
          inStorm ? 'bg-red-950/80 border-red-600/70' : 'bg-stone-950/85 border-stone-700/70'
        }`}>
          <Wind className={`w-4 h-4 ${inStorm ? 'text-red-300 animate-pulse' : 'text-purple-300/80'}`} />
          <div>
            <span className="font-tac text-sm text-stone-100 block leading-none">{stormLabel}</span>
            <span className="font-tac-md text-[9px] text-stone-500">STORM PHASE {stormPhase}/7</span>
          </div>
        </div>
      </div>

      {/* killfeed top right */}
      <div className="absolute top-4 right-4 space-y-1.5 w-[min(300px,44vw)]">
        {feed.map(f => (
          <div key={f.id} className={`text-right font-tac-md text-[11px] rounded px-2.5 py-1 border ${
            f.mine
              ? 'bg-amber-950/60 border-amber-700/60 text-amber-200'
              : 'bg-stone-950/70 border-stone-800 text-stone-400'
          }`}>
            {f.text}
          </div>
        ))}
      </div>

      {/* crosshair */}
      {showCrosshair && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Crosshair className="w-5 h-5 text-stone-100/90" strokeWidth={1.4} />
        </div>
      )}

      {/* interaction hint */}
      {hint && phase === 'live' && !inVehicle && (
        <div className="absolute bottom-[26%] left-1/2 -translate-x-1/2 bg-stone-950/80 border border-amber-600/50 rounded px-4 py-1.5">
          <span className="font-tac-md text-amber-200 text-xs tracking-wider">{hint}</span>
        </div>
      )}
      {inVehicle && (
        <div className="absolute bottom-[26%] left-1/2 -translate-x-1/2 bg-stone-950/80 border border-sky-700/50 rounded px-4 py-1.5 flex items-center gap-2">
          <Car className="w-4 h-4 text-sky-300" />
          <span className="font-tac-md text-sky-200 text-xs tracking-wider">DRIVING · WASD to drive · [E] to get out</span>
        </div>
      )}

      {/* bottom left: HP */}
      <div className="absolute bottom-6 left-6 w-60">
        <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-4 py-3 shadow-xl tac-corner">
          <div className="flex items-center justify-between mb-2">
            <span className="font-tac-md text-[10px] text-stone-400 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> VITALS</span>
            <span className="font-tac text-lg text-stone-100 tabular-nums">{Math.round(hp)}</span>
          </div>
          <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${clampBar(hp)}%`,
                background: hp > 50 ? 'linear-gradient(90deg, #4ade80, #22c55e)' : hp > 25 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #f87171, #dc2626)',
              }}
            />
          </div>
        </div>
      </div>

      {/* bottom right: weapon */}
      <div className="absolute bottom-6 right-6">
        <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-5 py-3 text-right shadow-xl tac-corner">
          <p className="font-tac-md text-stone-400 text-[10px] mb-1">WEAPON</p>
          <p className={`font-tac text-base ${weaponLabel.includes('UNARMED') ? 'text-red-300 animate-pulse' : 'text-amber-200'}`}>
            {weaponLabel}
          </p>
          {mag !== 0 || reserve !== 0 ? (
            <p className="font-tac text-xl text-stone-100 tabular-nums mt-0.5">
              {mag} <span className="text-stone-500 text-sm">/ {reserve}</span>
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}

const clampBar = (v: number): number => Math.max(0, Math.min(100, v))

// ------------------------------------------------------------
// DEATH / VICTORY
// ------------------------------------------------------------
function DeathScreen() {
  const kills = useBr(s => s.kills)
  const placement = useBr(s => s.placement)
  const alive = useBr(s => s.alive)
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] pointer-events-auto">
      <div className="text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full border-2 border-red-500/60 flex items-center justify-center">
          <Skull className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <p className="font-tac text-4xl text-red-300 tracking-[0.2em] uppercase">Eliminated</p>
          <p className="font-tac text-amber-200 text-2xl mt-2">#{placement} of 20</p>
        </div>
        <div className="flex items-center justify-center gap-8 bg-stone-950/80 border border-stone-800 rounded-lg px-8 py-4">
          <div className="text-center">
            <p className="font-tac-md text-stone-500 text-[10px]">ELIMINATIONS</p>
            <p className="font-tac text-2xl text-stone-100 tabular-nums">{kills}</p>
          </div>
          <div className="text-center">
            <p className="font-tac-md text-stone-500 text-[10px]">SPECTATING</p>
            <p className="font-tac text-2xl text-stone-100 tabular-nums flex items-center justify-center gap-2">
              <Eye className="w-5 h-5 text-stone-400" /> {alive} alive
            </p>
          </div>
        </div>
        <Button
          onClick={() => getBrGame()?.leave()}
          className="h-12 px-10 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
        >
          <LogOut className="w-4 h-4 mr-2" /> Leave match
        </Button>
      </div>
    </div>
  )
}

function VictoryScreen() {
  const kills = useBr(s => s.kills)
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] pointer-events-auto">
      <div className="text-center space-y-5">
        <Crown className="w-16 h-16 text-amber-300 mx-auto" />
        <div>
          <p className="font-tac text-4xl sm:text-5xl tracking-[0.16em] uppercase leading-none"
            style={{
              background: 'linear-gradient(180deg, #ffe2b0 20%, #ff7a45 70%, #e6482c 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 4px 18px rgba(255,140,60,0.4))',
            }}>
            Last operator standing
          </p>
          <p className="font-tac-md text-stone-300 text-sm mt-3 tracking-[0.3em]">#1 OF 20 · CHAMPION</p>
        </div>
        <div className="flex items-center justify-center gap-8 bg-stone-950/80 border border-amber-800/60 rounded-lg px-10 py-4">
          <div className="text-center">
            <p className="font-tac-md text-stone-500 text-[10px]">ELIMINATIONS</p>
            <p className="font-tac text-3xl text-amber-200 tabular-nums">{kills}</p>
          </div>
          <div className="text-center">
            <p className="font-tac-md text-stone-500 text-[10px]">PLACEMENT</p>
            <p className="font-tac text-3xl text-amber-200 tabular-nums">#1</p>
          </div>
        </div>
        <Button
          onClick={() => getBrGame()?.leave()}
          className="h-12 px-10 bg-amber-400 text-stone-950 font-bold tracking-widest uppercase hover:bg-amber-300"
        >
          <Rocket className="w-4 h-4 mr-2" /> Return to menu
        </Button>
      </div>
    </div>
  )
}
