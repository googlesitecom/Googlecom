'use client'

// ============================================================
// EMERGENCY STRIKE — Battle Royale HUD (v9)
// Matchmaking overlay, plane hint, live combat HUD, storm
// readouts, killfeed, death/victory screens. All data comes
// from the tiny br-store (the heavy BR module feeds it).
// ============================================================
import { useEffect, useState } from 'react'
import { useBr, BR_RARITIES } from '@/game/br-store'
import { getBrGame } from '@/game/br-instance'
import { Button } from '@/components/ui/button'
import { ChatBox } from './chat-box'
import { KeybindsPanel, SettingsPanel, InfoPanel, ProfileContent } from './menus'
import { useAuth } from '@/game/auth'
import {
  Users, Skull, Wind, Rocket, Plane, Heart, LogOut, Crown,
  Timer, Gauge, Loader2, Eye, Car, Keyboard, Settings, Info, Play, User, Hammer,
} from 'lucide-react'

export function BrHud() {
  const phase = useBr(s => s.phase)
  const paused = useBr(s => s.paused)
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

      {/* v11.2: ESC pause menu — the SAME menu as the normal modes */}
      {paused && <BrPauseMenu />}

      {/* click to (re)take control while the match is interactive
       *  (v9.1: solo en aviso/partida — en cola la QueueOverlay ya cubre
       *  todo y el jugador aún no controla nada) */}
      {!locked && !paused && (phase === 'plane' || phase === 'live') && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 cursor-pointer pointer-events-auto"
          onClick={() => getBrGame()?.requestLock()}
        >
          <div className="text-center space-y-2.5">
            <p className="font-tac text-3xl tracking-widest text-amber-400 uppercase">
              {phase === 'plane' ? 'Aboard the plane' : 'Paused'}
            </p>
            <p className="text-stone-300 text-lg">Click to take control</p>
            <p className="text-stone-500 text-sm font-tac-md">
              WASD move · SHIFT sprint · CTRL crouch · RMB aim · R reload · E interact · T chat · ESC menu
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
  const user = useAuth(s => s.user)
  const players = useBr(s => s.queuePlayers)
  const countdownActive = useBr(s => s.countdownActive)
  const countdown = useBr(s => s.countdown)
  const loadingMap = useBr(s => s.loadingMap)
  const qualityNote = useBr(s => s.qualityNote)
  // v11: REAL matchmaking state
  const netStatus = useBr(s => s.netStatus)
  const practice = useBr(s => s.practice)
  const real = players.length

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4"
      style={{ background: locked ? 'transparent' : 'rgba(3,5,7,0.25)' }}>
      <div className="text-center">
        <p className="font-tac text-white text-2xl tracking-[0.3em] uppercase">
          Battle Royale · {practice ? 'Practice' : 'Matchmaking'}
        </p>
        <p className="font-tac-md text-stone-400 text-[11px] mt-1.5">
          {practice
            ? 'Offline warmup — you vs 19 bots, no ranking'
            : 'Waiting on the lobby island for REAL operators'}
        </p>
      </div>

      {!practice && netStatus !== 'online' && !countdownActive ? (
        <div className="bg-stone-950/85 border border-red-900/60 rounded-xl px-8 py-5 text-center shadow-2xl tac-corner space-y-3">
          <p className="font-tac text-red-300 text-lg tracking-widest">
            {netStatus === 'connecting' ? 'CONNECTING TO THE ONLINE SERVICE…' : 'ONLINE SERVICE UNAVAILABLE'}
          </p>
          <p className="font-tac-md text-stone-500 text-[10px] max-w-[380px] leading-relaxed">
            Battle Royale matchmaking needs the live network (public real-time brokers). Bots never
            count as connected operators — the countdown only starts with 4 REAL ones.
          </p>
          <div className="flex items-center justify-center gap-2.5">
            <Button
              onClick={() => getBrGame()?.retryNet()}
              className="h-9 px-5 font-tac-md text-[11px] bg-amber-400 text-stone-950 hover:bg-amber-300 font-bold"
            >
              <Loader2 className="w-3.5 h-3.5 mr-1.5" /> RETRY
            </Button>
            <Button
              onClick={() => getBrGame()?.beginPractice()}
              variant="secondary"
              className="h-9 px-5 font-tac-md text-[11px] bg-stone-900 border border-stone-600 text-stone-300 hover:bg-stone-800"
            >
              PRACTICE VS BOTS
            </Button>
          </div>
        </div>
      ) : countdownActive ? (
        <div className="bg-stone-950/85 border-2 border-amber-500/70 rounded-xl px-10 py-5 text-center shadow-2xl tac-corner">
          <p className="font-tac-md text-amber-200/80 text-[11px] tracking-[0.3em]">DEPLOYING IN</p>
          <p className="font-tac text-amber-200 text-6xl tabular-nums leading-none mt-1.5">{countdown}</p>
          <p className="font-tac-md text-stone-500 text-[10px] mt-2">
            {real} OPERATORS LOCKED · room fills to 20 with bots
          </p>
        </div>
      ) : (
        <div className="bg-stone-950/85 border border-stone-700/70 rounded-xl px-8 py-4 flex items-center gap-4 shadow-xl">
          {netStatus === 'connecting' || netStatus === 'offline' ? (
            <Loader2 className="w-6 h-6 text-amber-300 animate-spin" />
          ) : (
            <Users className="w-6 h-6 text-emerald-400" />
          )}
          <div>
            <p className="font-tac text-white text-lg tracking-widest">
              {practice ? 'PRACTICE MATCH' : 'WAITING FOR REAL OPERATORS'}
            </p>
            <p className="font-tac-md text-stone-400 text-[11px] mt-0.5">
              {practice
                ? 'Deploying in a moment — gliding into the island'
                : `${real}/4 REAL OPERATORS — the 60-second countdown starts at 4 (bots never count)`}
            </p>
          </div>
        </div>
      )}

      {/* connected REAL operators */}
      {!practice && (
        <div className="w-[min(430px,92vw)] bg-stone-950/70 border border-stone-800 rounded-lg p-3">
          <p className="font-tac-md text-stone-500 text-[10px] mb-2 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> REAL OPERATORS CONNECTED — {real}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {players.map((p, i) => (
              <div key={`${p.name}-${i}`} className="font-tac-md text-[11px] text-stone-300 bg-stone-900/70 rounded px-2.5 py-1 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${p.real ? 'bg-emerald-400' : 'bg-stone-600'}`} />
                <span className="truncate">{p.name}</span>
                {p.name === user && <span className="text-amber-300/70 text-[9px] shrink-0">(YOU)</span>}
              </div>
            ))}
          </div>
          {real < 4 && (
            <p className="font-tac-md text-stone-600 text-[10px] mt-2.5 leading-relaxed">
              Tip: invite friends from your profile (they must ACCEPT), or open the page in another
              browser/device and log in with another operator — each one counts.
            </p>
          )}
        </div>
      )}

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
        <p className="font-tac-md text-stone-600 text-[10px] mt-1">
          SHIFT sprint · CTRL crouch · RMB aim · R reload · E interact · T chat · ESC menu
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
  const weaponRarity = useBr(s => s.weaponRarity)
  const mag = useBr(s => s.mag)
  const reserve = useBr(s => s.reserve)
  const stormLabel = useBr(s => s.stormLabel)
  const stormPhase = useBr(s => s.stormPhase)
  const feed = useBr(s => s.feed)
  const hint = useBr(s => s.hint)
  const inStorm = useBr(s => s.inStorm)
  const inVehicle = useBr(s => s.inVehicle)
  // v12: construcción
  const mats = useBr(s => s.mats)
  const buildMode = useBr(s => s.buildMode)
  const buildPlaceable = useBr(s => s.buildPlaceable)
  const showCrosshair = phase === 'live' && !inVehicle && !buildMode
  // v10: rareza estilo Fortnite del arma equipada
  const rar = weaponRarity >= 0 && weaponRarity < BR_RARITIES.length ? BR_RARITIES[weaponRarity] : null
  const scope = useBr(s => s.scope)

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

      {/* v10: chat de partida ([T]) — mismo canal en BR */}
      {phase === 'live' && <ChatBox />}

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

      {/* v11.2: sniper scope (ADS on the FR-338) */}
      {scope && phase === 'live' && <SniperScope />}

      {/* v11.2: dynamic crosshair — same spread language as the normal modes */}
      {showCrosshair && !scope && <DynamicCrosshair />}
      {showCrosshair && <HitMarker />}

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

      {/* bottom left: HP + v12 MATERIALS */}
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
        {/* v12: build materials */}
        <div className={`mt-2 bg-stone-950/85 backdrop-blur-sm border rounded-md px-4 py-2.5 shadow-xl tac-corner flex items-center gap-2.5 ${
          buildMode ? 'border-sky-500/70' : 'border-stone-700/70'
        }`}>
          <Hammer className={`w-4 h-4 ${buildMode ? 'text-sky-300' : 'text-amber-300/80'}`} />
          <div className="flex-1">
            <span className="font-tac-md text-[9px] text-stone-500 block leading-none">MATERIALS</span>
            <span className={`font-tac text-lg tabular-nums leading-none block mt-0.5 ${mats >= 10 ? 'text-stone-100' : 'text-red-300'}`}>{mats}</span>
          </div>
          {mats < 10 && (
            <span className="font-tac-md text-[9px] text-red-300/80">LOW</span>
          )}
        </div>
      </div>

      {/* v12: build mode piece bar (Q · C · Z) */}
      {buildMode && phase === 'live' && (
        <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2">
          <div className="bg-stone-950/85 backdrop-blur-sm border border-sky-700/60 rounded-lg px-4 py-2.5 shadow-2xl tac-corner">
            <div className="flex items-center gap-2">
              {(['wall', 'ramp', 'floor'] as const).map(k => {
                const key = k === 'wall' ? 'Q' : k === 'ramp' ? 'C' : 'Z'
                const active = buildMode === k
                return (
                  <div key={k} className={`rounded px-2.5 py-1.5 flex items-center gap-2 border ${
                    active ? 'bg-sky-500/20 border-sky-400/70' : 'bg-stone-900/60 border-stone-800'
                  }`}>
                    <span className={`font-tac text-[11px] px-1 rounded ${active ? 'text-sky-200' : 'text-stone-400'}`}>{key}</span>
                    <span className={`font-tac-md text-[10px] tracking-widest ${active ? 'text-sky-200' : 'text-stone-500'}`}>
                      {k === 'wall' ? 'WALL' : k === 'ramp' ? 'RAMP' : 'FLOOR'}
                    </span>
                  </div>
                )
              })}
              <span className="w-px h-6 bg-stone-700" />
              <span className={`font-tac-md text-[10px] tracking-wider ${buildPlaceable ? 'text-emerald-300' : 'text-red-300'}`}>
                {buildPlaceable ? 'LMB BUILD · 10 MATS' : 'BLOCKED'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* bottom right: weapon */}
      <div className="absolute bottom-6 right-6">
        <div
          className="bg-stone-950/85 backdrop-blur-sm border rounded-md px-5 py-3 text-right shadow-xl tac-corner"
          style={rar ? { borderColor: `${rar.css}99` } : undefined}
        >
          <p className="font-tac-md text-stone-400 text-[10px] mb-1">WEAPON</p>
          {rar && (
            <p className="font-tac-md text-[10px] tracking-[0.18em] mb-0.5" style={{ color: rar.css }}>
              {rar.label} · {Math.round(rar.dmgMult * 100)}% DMG
            </p>
          )}
          <p
            className={`font-tac text-base ${weaponLabel.includes('UNARMED') ? 'text-red-300 animate-pulse' : 'text-amber-200'}`}
            style={rar ? { color: rar.css } : undefined}
          >
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
// v11.2 — DYNAMIC CROSSHAIR (spread-driven, like the normal modes)
// ------------------------------------------------------------
function DynamicCrosshair() {
  const spread = useBr(s => s.spread)
  const gap = Math.round(4 + spread * 2.4)
  const arm = 7
  const color = 'rgba(245,245,240,0.92)'
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
      <div className="relative" style={{ width: 2, height: 2 }}>
        {/* dot */}
        <span className="absolute rounded-full" style={{ width: 2, height: 2, background: color, left: 0, top: 0 }} />
        {[0, 90, 180, 270].map(deg => (
          <span
            key={deg}
            className="absolute"
            style={{
              width: deg % 180 === 0 ? 2 : arm,
              height: deg % 180 === 0 ? arm : 2,
              background: color,
              left: deg % 180 === 0 ? 0 : deg === 90 ? gap + 1 : -(gap + arm + 1),
              top: deg % 180 === 0 ? (deg === 180 ? gap + 1 : -(gap + arm + 1)) : 0,
              transition: 'left 90ms linear, top 90ms linear',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** v11.2: hitmarker — X flash on every confirmed hit (headshots in red).
 *  Pure CSS replay keyed by the hit timestamp (no state churn). */
function HitMarker() {
  const hitAt = useBr(s => s.hitAt)
  const hitHead = useBr(s => s.hitHead)
  if (!hitAt) return null
  const color = hitHead ? '#ff5555' : '#f5f5f0'
  return (
    <div
      key={hitAt}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ animation: 'brHit 220ms ease-out forwards' }}
    >
      {[45, 135, 225, 315].map(deg => (
        <span
          key={deg}
          className="absolute"
          style={{
            width: 10, height: 2, background: color,
            transform: `rotate(${deg}deg) translate(9px, 0)`,
            transformOrigin: '0 0',
          }}
        />
      ))}
      <style>{`@keyframes brHit { from { opacity: 1 } to { opacity: 0 } }`}</style>
    </div>
  )
}

/** v11.2: sniper scope overlay while aiming the FR-338 */
function SniperScope() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 26%, rgba(0,0,0,0.97) 33%)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 2, height: '46vh', background: 'rgba(20,20,20,0.85)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ height: 2, width: '46vh', background: 'rgba(20,20,20,0.85)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: 6, height: 6, background: '#d64545' }} />
    </div>
  )
}

// ------------------------------------------------------------
// v11.2 — BR PAUSE MENU (the same menu as the normal modes)
// v12: + pestaña PROFILE (récord de carrera + stats por modo)
// ------------------------------------------------------------
type BrPauseTab = 'profile' | 'controls' | 'settings' | 'info'

function BrPauseMenu() {
  const [tab, setTab] = useState<BrPauseTab>('controls')
  const user = useAuth(s => s.user)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
      style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <div className="w-[min(880px,94vw)] max-h-[92vh] overflow-y-auto bg-[#0b0e11]/97 border border-stone-800 shadow-2xl rounded-xl">
        <div className="px-5 sm:px-7 pt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-tac text-2xl tracking-[0.2em] text-white uppercase">
            Game <span className="text-amber-300">paused</span>
          </h2>
          <Button
            onClick={() => getBrGame()?.requestLock()}
            className="h-11 px-6 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
          >
            <Play className="w-4 h-4 mr-2" /> Resume
          </Button>
        </div>

        <div className="px-5 sm:px-7 pt-4 flex flex-wrap gap-1 border-b border-stone-800">
          {user && (
            <button
              onClick={() => setTab('profile')}
              className={`flex items-center gap-1.5 px-3 py-2 font-tac-md text-[11px] tracking-widest uppercase border-b-2 transition-colors ${tab === 'profile' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <User className="w-3.5 h-3.5" /> Profile
            </button>
          )}
          <button
            onClick={() => setTab('controls')}
            className={`flex items-center gap-1.5 px-3 py-2 font-tac-md text-[11px] tracking-widest uppercase border-b-2 transition-colors ${tab === 'controls' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
          >
            <Keyboard className="w-3.5 h-3.5" /> Controls
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-2 font-tac-md text-[11px] tracking-widest uppercase border-b-2 transition-colors ${tab === 'settings' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <button
            onClick={() => setTab('info')}
            className={`flex items-center gap-1.5 px-3 py-2 font-tac-md text-[11px] tracking-widest uppercase border-b-2 transition-colors ${tab === 'info' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
          >
            <Info className="w-3.5 h-3.5" /> Info
          </button>
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'profile' && user && <ProfileContent user={user} />}
          {tab === 'controls' && (
            <div className="space-y-5">
              <KeybindsPanel />
              {/* v12: construcción estilo Fortnite — teclas propias del BR */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4">
                <h4 className="font-tac-md text-amber-200/90 text-[11px] mb-3 flex items-center gap-2">
                  <Hammer className="w-4 h-4" /> Battle Royale — Fortnite-style building
                </h4>
                <div className="grid sm:grid-cols-3 gap-2.5 text-[11px]">
                  <div className="bg-stone-900/60 border border-stone-800 rounded px-3 py-2 flex items-center gap-2.5">
                    <span className="font-tac text-amber-200 text-sm px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700">Q</span>
                    <span className="text-stone-300">Wall piece</span>
                  </div>
                  <div className="bg-stone-900/60 border border-stone-800 rounded px-3 py-2 flex items-center gap-2.5">
                    <span className="font-tac text-amber-200 text-sm px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700">C</span>
                    <span className="text-stone-300">Stairs / ramp</span>
                  </div>
                  <div className="bg-stone-900/60 border border-stone-800 rounded px-3 py-2 flex items-center gap-2.5">
                    <span className="font-tac text-amber-200 text-sm px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700">Z</span>
                    <span className="text-stone-300">Floor piece</span>
                  </div>
                </div>
                <p className="text-stone-600 text-[10px] mt-2.5 leading-relaxed">
                  Pick a piece and LEFT-CLICK to place it on the grid (hold for turbo-build).
                  Each piece costs <b className="text-stone-400">10 materials</b>; destroy enemy
                  structures by shooting them. Crates and ammo boxes give materials, and every
                  elimination pays +60. Walls give real cover — even against bot fire.
                </p>
              </div>
            </div>
          )}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'info' && <InfoPanel />}
        </div>

        <div className="px-5 sm:px-7 pb-6 border-t border-stone-800 pt-4">
          <Button
            variant="destructive"
            className="w-full h-11 font-bold tracking-widest uppercase"
            onClick={() => getBrGame()?.leave()}
          >
            <LogOut className="w-4 h-4 mr-2" /> Leave match
          </Button>
        </div>
      </div>
    </div>
  )
}

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
