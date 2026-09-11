'use client'

// ============================================================
// EMERGENCY STRIKE — In-game HUD (v7)
// Refined tactical layout: segmented health/shield, slot strip,
// circular minimap (engine-drawn), styled killfeed and
// player-only multi-kill banners. All copy in English.
// ============================================================

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { WEAPONS, TEAM_INFO, keyLabel, type Team } from '@/game/shared'
import { getGame } from '@/game/game-instance'
import { Shield, Heart, Skull, Coins, Zap, Timer, MapPin, Gamepad2, Copy, Users, Wifi, Flag, Swords, Radio, Target, Crosshair, ShieldCheck, HardHat, Flame, Syringe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatBox } from './chat-box'

export function Hud() {
  const hp = useGame(s => s.hp)
  const armor = useGame(s => s.armor)
  const money = useGame(s => s.money)
  const frags = useGame(s => s.frags)
  const weapon = useGame(s => s.weapon)
  const mag = useGame(s => s.mag)
  const reserve = useGame(s => s.reserve)
  const slots = useGame(s => s.slots)
  const round = useGame(s => s.round)
  const team = useGame(s => s.team)
  const killfeed = useGame(s => s.killfeed)
  const announcements = useGame(s => s.announcements)
  const buyZone = useGame(s => s.buyZone)
  const buyKey = keyLabel(useGame(s => s.settings.keybinds.buy))
  const phase = useGame(s => s.phase)
  const cineActive = useGame(s => s.cineActive)
  const smokes = useGame(s => s.smokes)
  const vest = useGame(s => s.vest)
  const helmet = useGame(s => s.helmet)
  const flares = useGame(s => s.flares)
  const stims = useGame(s => s.stims)
  const stimUntil = useGame(s => s.stimUntil)
  const flareKey = keyLabel(useGame(s => s.settings.keybinds.flare))
  const stimKey = keyLabel(useGame(s => s.settings.keybinds.stim))
  const [, forceTick] = useState(0)
  useEffect(() => {
    // refresco por segundo mientras corre la adrenalina (contador)
    const id = setInterval(() => forceTick((v: number) => v + 1), 500)
    return () => clearInterval(id)
  }, [])
  const fps = useGame(s => s.fps)
  const mode = useGame(s => s.mode)
  const ping = useGame(s => s.ping)
  const gamepadConnected = useGame(s => s.gamepadConnected)
  const carryingFlag = useGame(s => s.carryingFlag)
  const scoreboard = useGame(s => s.scoreboard)
  const story = useGame(s => s.story)
  const w = WEAPONS[weapon]

  if (phase !== 'playing' && phase !== 'dead') return null
  if (cineActive) return null

  const gameMode = round?.mode ?? 'escaramuza'
  const myKills = scoreboard.find(p => p.id === useGame.getState().playerId)?.kills ?? 0

  return (
    <div className="fixed inset-0 z-30 pointer-events-none" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      {/* v10: chat de partida ([T]) */}
      <ChatBox />

      {/* ===== Top bar: mode, objective and score ===== */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        {gameMode === 'escaramuza' && (
          <>
            <TeamScore team="A" kills={round?.scoresA ?? 0} wins={round?.roundWinsA ?? 0} active={team === 'A'} />
            <RoundChip />
            <TeamScore team="B" kills={round?.scoresB ?? 0} wins={round?.roundWinsB ?? 0} active={team === 'B'} />
          </>
        )}
        {gameMode === 'ffa' && (
          <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-lg px-5 py-2 text-center shadow-xl tac-corner">
            <div className="flex items-center gap-2 text-amber-300">
              <Swords className="w-4 h-4" />
              <span className="font-tac text-xl tabular-nums">{myKills} / {round?.scoreTarget ?? 50}</span>
            </div>
            <div className="font-tac-md text-[9px] text-stone-400">
              FIRST TO {round?.scoreTarget ?? 50} WINS · LEADER: {round?.leader?.name ?? '—'} · {round?.leader?.kills ?? 0}
            </div>
          </div>
        )}
        {gameMode === 'bandera' && (
          <>
            <FlagScore team="A" own={team === 'A'} score={round?.scoresA ?? 0} target={round?.scoreTarget ?? 3} status={round?.flags?.a.status ?? 'home'} />
            <RoundChip />
            <FlagScore team="B" own={team === 'B'} score={round?.scoresB ?? 0} target={round?.scoreTarget ?? 3} status={round?.flags?.b.status ?? 'home'} />
          </>
        )}
        {gameMode === 'dominacion' && (
          <div className="flex items-center gap-3">
            <ZoneChip id="A" zone={round?.zones?.find(z => z.id === 'A')} />
            <RoundChip />
            <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-lg px-4 py-1.5 flex gap-3 tac-corner">
              <span className="font-tac text-xl tabular-nums" style={{ color: TEAM_INFO.A.color }}>{round?.scoresA ?? 0}</span>
              <span className="text-stone-600 text-sm">/ {round?.scoreTarget ?? 150}</span>
              <span className="font-tac text-xl tabular-nums" style={{ color: TEAM_INFO.B.color }}>{round?.scoresB ?? 0}</span>
            </div>
            <ZoneChip id="B" zone={round?.zones?.find(z => z.id === 'B')} />
            <ZoneChip id="C" zone={round?.zones?.find(z => z.id === 'C')} />
          </div>
        )}
        {gameMode === 'historia' && <StoryPanel />}
      </div>

      {/* ===== P2P room chip ===== */}
      <RoomChip />

      {/* ===== Carrying the flag (v9: weapons disabled) ===== */}
      {carryingFlag && phase === 'playing' && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 bg-amber-500/25 border-2 border-amber-400 rounded-lg px-6 py-2 flex items-center gap-2.5 animate-pulse shadow-2xl">
          <Flag className="w-5 h-5 text-amber-300" />
          <span className="font-tac-md text-amber-100 text-sm tracking-wider">YOU CARRY THE FLAG — WEAPONS DISABLED · RUN HOME!</span>
        </div>
      )}

      {/* ===== v9: BRAVO zone lives on the warehouse ROOF ===== */}
      {gameMode === 'dominacion' && phase === 'playing' && (
        <div className="absolute top-[88px] left-1/2 -translate-x-1/2 bg-stone-950/75 border border-amber-900/60 rounded px-3 py-1 flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-amber-400/90" />
          <span className="font-tac-md text-[10px] text-stone-400 tracking-wider">
            BRAVO is captured on the <b className="text-amber-200">WAREHOUSE ROOF</b> — take the outside stairs · ground floor does NOT count
          </span>
        </div>
      )}

      {/* ===== Center announcements (multi-kills get the hero style) ===== */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {announcements.map(a => a.kind === 'multi' ? (
          <div
            key={a.id}
            className="relative px-8 py-1.5 rounded tac-corner"
            style={{
              background: 'linear-gradient(180deg, rgba(20,8,4,0.88) 0%, rgba(12,5,3,0.92) 100%)',
              border: '1px solid rgba(248,113,79,0.65)',
              boxShadow: '0 0 28px rgba(248,80,40,0.35), inset 0 0 18px rgba(248,80,40,0.12)',
            }}
          >
            <span
              className="font-tac text-3xl tracking-[0.14em] uppercase text-center block"
              style={{
                background: 'linear-gradient(180deg, #ffe2b0 20%, #ff7a45 60%, #e6482c 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))',
              }}
            >
              {a.text}
            </span>
          </div>
        ) : (
          <div
            key={a.id}
            className={`px-6 py-1.5 rounded font-tac tracking-[0.18em] text-center shadow-2xl border uppercase ${
              a.kind === 'round'
                ? 'bg-stone-950/90 border-amber-500/60 text-amber-300 text-2xl'
                : a.kind === 'kill'
                  ? 'bg-stone-950/80 border-red-500/50 text-red-300 text-xl'
                  : 'bg-stone-950/75 border-stone-600/50 text-stone-300 text-xs'
            }`}
            style={a.team ? { borderColor: TEAM_INFO[a.team].color + '99', color: TEAM_INFO[a.team].accent } : undefined}
          >
            {a.text}
          </div>
        ))}
      </div>

      {/* ===== Killfeed ===== */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 items-end">
        {killfeed.map(k => (
          <div
            key={k.id}
            className="bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1 flex items-center gap-2 text-sm border border-stone-700/50 shadow-lg"
            style={{ clipPath: 'polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px)' }}
          >
            <span className="font-tac" style={{ color: TEAM_INFO[k.killerTeam].color }}>{k.killer}</span>
            <span className="font-tac text-stone-400 text-[11px] tracking-wider">{shortWeapon(k.weapon)}</span>
            {k.headshot && <Skull className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-stone-600 text-[10px]">▸</span>
            <span className="font-tac" style={{ color: TEAM_INFO[k.victimTeam].color }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* ===== Health & shield — segmented tactical bars (bottom-left) ===== */}
      <div className="absolute bottom-6 left-6 space-y-2 w-[290px]">
        {/* HP */}
        <div
          className="flex items-center gap-3 bg-stone-950/70 backdrop-blur-sm rounded-md px-4 py-2.5 border border-stone-700/60 shadow-xl tac-corner"
        >
          <Heart className={`w-5 h-5 shrink-0 ${hp > 60 ? 'text-green-500' : hp > 25 ? 'text-amber-500' : 'text-red-500'}`} />
          <div className="flex-1">
            <div className="flex gap-[3px] h-[10px]">
              {Array.from({ length: 10 }).map((_, i) => {
                const segHp = Math.min(1, Math.max(0, (hp - i * 10) / 10))
                const lowHp = hp <= 25
                return (
                  <div key={i} className="flex-1 bg-stone-800/90 rounded-[1px] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${hp > 60 ? 'bg-gradient-to-r from-green-600 to-green-400' : hp > 25 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-red-700 to-red-500'} ${lowHp ? 'animate-pulse' : ''}`}
                      style={{ width: `${segHp * 100}%` }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <span className={`font-tac text-2xl tabular-nums w-10 text-right ${hp > 60 ? 'text-stone-100' : hp > 25 ? 'text-amber-200' : 'text-red-300'}`}>
            {Math.max(0, Math.round(hp))}
          </span>
        </div>
        {/* Shield */}
        <div className={`flex items-center gap-3 bg-stone-950/70 backdrop-blur-sm rounded-md px-4 py-1.5 border shadow-lg transition-opacity tac-corner ${armor > 0 ? 'border-sky-700/60' : 'border-stone-700/60 opacity-60'}`}>
          <Shield className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="flex-1">
            <div className="flex gap-[3px] h-[7px]">
              {Array.from({ length: 10 }).map((_, i) => {
                const segA = Math.min(1, Math.max(0, (armor - i * 10) / 10))
                return (
                  <div key={i} className="flex-1 bg-stone-800/90 rounded-[1px] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-600 to-cyan-300 transition-all duration-300"
                      style={{ width: `${segA * 100}%` }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <span className="font-tac text-base tabular-nums text-sky-300 w-10 text-right">{Math.round(armor)}</span>
        </div>
        {/* money / frags / smokes */}
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border border-amber-700/40 shadow-lg" style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-tac text-amber-300 tabular-nums">${money}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border border-stone-700/60 shadow-lg" style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
            <Zap className="w-4 h-4 text-lime-400" />
            <span className="font-tac text-lime-300 tabular-nums">×{frags}</span>
          </div>
          <div className={`flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border shadow-lg ${smokes > 0 ? 'border-slate-500/70' : 'border-stone-700/60 opacity-60'}`} style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="2" /><circle cx="15" cy="12" r="2.6" /><circle cx="8.5" cy="15.5" r="2.2" />
            </svg>
            <span className="font-tac text-slate-300 tabular-nums">×{smokes}</span>
          </div>
        </div>
        {/* v8 — tactical gear: chaleco/casco (pasivos) + bengala/estímulo (activos) */}
        <div className="flex gap-2">
          {(vest || helmet) && (
            <div className="flex items-center gap-2 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border border-emerald-700/50 shadow-lg" style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
              {vest && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
              {helmet && <HardHat className="w-4 h-4 text-emerald-300" />}
              <span className="font-tac-md text-[9px] text-emerald-300/90 tracking-widest">ARMORED</span>
            </div>
          )}
          <div className={`flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border shadow-lg transition-opacity ${flares > 0 ? 'border-red-500/60' : 'border-stone-700/60 opacity-50'}`} style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
            <Flame className="w-4 h-4 text-red-400" />
            <span className="font-tac text-red-300 tabular-nums">×{flares}</span>
            <kbd className="font-tac-md text-[8px] px-1 py-0.5 rounded bg-stone-800 text-stone-400">{flareKey}</kbd>
          </div>
          <div className={`flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-sm rounded px-3 py-1.5 border shadow-lg transition-opacity ${stims > 0 || stimUntil > Date.now() ? 'border-fuchsia-500/60' : 'border-stone-700/60 opacity-50'}`} style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
            <Syringe className="w-4 h-4 text-fuchsia-400" />
            {stimUntil > Date.now() ? (
              <span className="font-tac text-fuchsia-300 tabular-nums">{Math.ceil((stimUntil - Date.now()) / 1000)}s</span>
            ) : (
              <span className="font-tac text-fuchsia-300/90 tabular-nums">×{stims}</span>
            )}
            <kbd className="font-tac-md text-[8px] px-1 py-0.5 rounded bg-stone-800 text-stone-400">{stimKey}</kbd>
          </div>
        </div>
      </div>

      {/* ===== Weapon & ammo (bottom-right) ===== */}
      <div className="absolute bottom-6 right-6 text-right">
        {/* slot strip: which weapon sits on each key */}
        <div className="flex justify-end gap-1.5 mb-2">
          {[0, 1].map(idx => {
            const sl = slots[idx]
            const active = sl != null && sl === weapon
            return (
              <div
                key={idx}
                className={`px-2.5 py-1 rounded-sm border font-tac-md text-[10px] transition-colors ${active ? 'bg-amber-500/25 border-amber-500/70 text-amber-200' : sl ? 'bg-stone-950/70 border-stone-700/70 text-stone-400' : 'bg-stone-950/40 border-stone-800/60 border-dashed text-stone-600'}`}
              >
                <span className="opacity-70 mr-1">{idx + 1}</span>{sl ? shortWeapon(sl) : '—'}
              </div>
            )
          })}
          <div className={`px-2.5 py-1 rounded-sm border font-tac-md text-[10px] ${weapon === 'knife' ? 'bg-amber-500/25 border-amber-500/70 text-amber-200' : 'bg-stone-950/70 border-stone-700/70 text-stone-400'}`}>
            <span className="opacity-70 mr-1">3</span>Knife
          </div>
        </div>
        <div
          className="bg-stone-950/70 backdrop-blur-sm rounded-md px-5 py-3 border border-stone-700/60 shadow-xl tac-corner"
        >
          <div className="font-tac-md text-stone-400 text-[10px] uppercase">{w.name}</div>
          <div className="flex items-baseline justify-end gap-2 mt-0.5">
            <span className={`font-tac text-[42px] leading-none tabular-nums ${mag <= w.mag * 0.25 ? 'text-red-400' : 'text-stone-100'}`}>
              {w.mag === 0 ? '—' : mag}
            </span>
            <span className="font-tac text-stone-500 text-xl">/ {w.mag === 0 ? '∞' : reserve}</span>
          </div>
          {w.sniper && <div className="font-tac-md text-emerald-400 text-[9px] mt-0.5">SCOPE ×8</div>}
        </div>
      </div>

      {/* ===== STORY MODE: radio dialogue and hint ===== */}
      {story.active && phase === 'playing' && (
        <>
          {story.dialogue && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-xl">
              <div
                className="flex items-start gap-3 bg-stone-950/85 backdrop-blur-sm border border-amber-700/50 rounded-md px-4 py-2.5 shadow-2xl tac-corner"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}
              >
                <Radio className="w-4 h-4 text-amber-300 mt-0.5 shrink-0 animate-pulse" />
                <div>
                  <span className="font-tac-md text-amber-300 text-[10px]">{story.dialogue.who}</span>
                  <p className="text-stone-200 text-[13px] leading-snug" style={{ fontFamily: 'var(--font-geist-sans), system-ui' }}>{story.dialogue.text}</p>
                </div>
              </div>
            </div>
          )}
          {story.hint && (
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 bg-stone-950/75 border border-stone-600/60 rounded-sm px-4 py-1.5">
              <span className="font-tac-md text-amber-200 text-[11px]">{story.hint}</span>
            </div>
          )}
        </>
      )}

      {/* ===== Buy zone notice (not in the campaign) ===== */}
      {buyZone && phase === 'playing' && !story.active && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-stone-950/80 backdrop-blur-sm border border-amber-600/50 rounded-md px-5 py-2 shadow-2xl tac-corner">
          <MapPin className="w-4 h-4 text-amber-400" />
          <span className="font-tac-md text-amber-200 text-xs">
            BUY ZONE — press <kbd className="bg-stone-800 px-1.5 py-0.5 rounded text-amber-300 text-[10px]">{buyKey}</kbd>
          </span>
        </div>
      )}

      {/* ===== FPS / ping / gamepad ===== */}
      <div className="absolute bottom-1 right-2 text-stone-600 text-[10px] font-mono flex items-center gap-3">
        {gamepadConnected && <Gamepad2 className="w-3.5 h-3.5 text-green-500" />}
        {mode !== 'solo' && ping > 0 && <span className="text-stone-500">{ping} MS</span>}
        <span>{fps} FPS</span>
      </div>

      {/* ===== Team indicator ===== */}
      <div className="absolute top-[248px] left-4 flex items-center gap-2 bg-stone-950/60 rounded-sm px-3 py-1.5 border border-stone-700/50" style={{ clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)' }}>
        <Crosshair className="w-4 h-4" style={{ color: TEAM_INFO[team].color }} />
        <span className="font-tac-md text-[10px]" style={{ color: TEAM_INFO[team].accent }}>
          {TEAM_INFO[team].name}
        </span>
      </div>
    </div>
  )
}

function TeamScore({ team, kills, wins, active }: { team: Team; kills: number; wins: number; active: boolean }) {
  const info = TEAM_INFO[team]
  return (
    <div
      className={`bg-stone-950/85 backdrop-blur-sm border rounded-md px-3 py-2 text-center shadow-xl min-w-[76px] tac-corner ${active ? 'ring-1' : ''}`}
      style={{ borderColor: info.color + '80', ...(active ? { boxShadow: `0 0 14px ${info.color}44` } : {}) }}
    >
      <div className="font-tac-md text-[10px]" style={{ color: info.color }}>{team === 'A' ? 'AMBER' : 'GREEN'}</div>
      <div className="font-tac text-2xl tabular-nums text-stone-100 leading-tight">{kills}</div>
      <div className="font-tac-md text-[8px] text-stone-500">/{30} · ★{wins}</div>
    </div>
  )
}

/** center chip: time + round */
function RoundChip() {
  const round = useGame(s => s.round)
  return (
    <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-5 py-2 text-center shadow-xl tac-corner">
      <div className="flex items-center gap-2 text-amber-300">
        <Timer className="w-4 h-4" />
        <span className="font-tac text-xl tabular-nums">
          {formatTime(round?.timeLeft ?? 0)}
        </span>
      </div>
      <div className="font-tac-md text-[9px] text-stone-400">
        ROUND {round?.roundNumber ?? 1}
      </div>
    </div>
  )
}

/** capture the flag score */
function FlagScore({ team, own, score, target, status }: { team: Team; own: boolean; score: number; target: number; status: string }) {
  const info = TEAM_INFO[team]
  return (
    <div
      className={`bg-stone-950/85 backdrop-blur-sm border rounded-md px-3 py-2 text-center shadow-xl min-w-[86px] tac-corner ${own ? 'ring-1' : ''} ${status !== 'home' ? 'animate-pulse' : ''}`}
      style={{ borderColor: info.color + (status !== 'home' ? 'ff' : '80'), ...(own ? { boxShadow: `0 0 14px ${info.color}44` } : {}) }}
    >
      <div className="font-tac-md text-[10px] flex items-center justify-center gap-1" style={{ color: info.color }}>
        <Flag className="w-3 h-3" /> {team === 'A' ? 'AMBER' : 'GREEN'}
      </div>
      <div className="font-tac text-2xl tabular-nums text-stone-100 leading-tight">{score}<span className="text-stone-500 text-sm">/{target}</span></div>
      <div className="font-tac-md text-[8px] text-stone-400">{status === 'home' ? 'AT BASE' : status === 'carried' ? 'STOLEN!' : 'DROPPED'}</div>
    </div>
  )
}

/** domination zone chip */
function ZoneChip({ id, zone }: { id: string; zone?: { owner: Team | null; prog: number; by: Team | null } }) {
  const color = zone?.owner ? TEAM_INFO[zone.owner].color : '#78716c'
  const capturing = zone && zone.by && zone.prog > 0.02
  return (
    <div className={`bg-stone-950/85 backdrop-blur-sm border rounded-md px-2.5 py-1.5 text-center shadow-xl min-w-[64px] tac-corner ${capturing ? 'animate-pulse' : ''}`}
      style={{ borderColor: color + 'aa' }}>
      <div className="font-tac-md text-[10px]" style={{ color }}>{id === 'A' ? 'ALPHA' : id === 'B' ? 'BRAVO' : 'CHARLIE'}</div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden mt-1 w-12 mx-auto">
        <div className="h-full transition-all" style={{ width: `${Math.round((zone?.prog ?? 0) * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

function shortWeapon(id: string): string {
  const names: Record<string, string> = {
    knife: 'KNIFE', p9: 'P9', aguila: '.50', mp9: 'MP-9', breacher: 'B-12', ar47: 'AR-47', cr4: 'CR-4', awp338: 'FR-338',
  }
  return names[id] ?? id
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ============================================================
// P2P room chip — code + rival status
// ============================================================
function RoomChip() {
  const mode = useGame(s => s.mode)
  const roomCode = useGame(s => s.roomCode)
  const netStatus = useGame(s => s.netStatus)
  const [copied, setCopied] = useState(false)

  if (mode !== 'host' && mode !== 'guest') return null

  const connected = netStatus === 'connected'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* no clipboard permission */ }
  }

  return (
    <div className="absolute top-[76px] left-1/2 -translate-x-1/2 pointer-events-auto">
      <div className={`flex items-center gap-3 rounded-md px-4 py-1.5 border shadow-2xl tac-corner ${
        connected
          ? 'bg-green-950/70 border-green-700/50'
          : 'bg-stone-950/75 border-amber-700/50 animate-pulse'
      }`}>
        <Users className="w-4 h-4 text-stone-300 shrink-0" />
        <span className="font-tac-md text-stone-400 text-[9px]">ROOM</span>
        <span className="font-tac text-amber-300 text-lg tracking-[0.2em] tabular-nums">{roomCode}</span>
        {mode === 'host' && !connected && (
          <>
            <span className="font-tac-md text-amber-200/80 text-[9px] hidden sm:inline">WAITING FOR RIVAL…</span>
            <button
              onClick={copy}
              className="bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded px-2 py-1 flex items-center gap-1 font-tac-md text-[10px] text-stone-200 transition-colors"
            >
              <Copy className="w-3 h-3" /> {copied ? 'COPIED!' : 'COPY'}
            </button>
          </>
        )}
        {connected && (
          <span className="font-tac-md text-green-300 text-[9px] flex items-center gap-1">
            <Wifi className="w-3 h-3" /> {mode === 'host' ? 'RIVAL CONNECTED' : 'P2P ACTIVE'}
          </span>
        )}
      </div>
    </div>
  )
}

export function DeathOverlay() {
  const phase = useGame(s => s.phase)
  const deathInfo = useGame(s => s.deathInfo)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (phase !== 'dead' || !deathInfo) return
    const iv = setInterval(() => setTick(t => t + 1), 300)
    return () => clearInterval(iv)
  }, [phase, deathInfo])

  if (phase !== 'dead' || !deathInfo) return null
  const elapsed = (performance.now() - deathInfo.diedAt) / 1000
  const countdown = Math.max(0, Math.ceil(deathInfo.respawnIn - elapsed))
  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center bg-red-950/25">
      <div className="text-center space-y-4 mt-[-80px]">
        <p className="font-tac text-6xl tracking-[0.2em] text-red-500 uppercase drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]">
          Eliminated
        </p>
        <p className="text-xl text-stone-200 font-bold">
          By <span className="text-red-400">{deathInfo.killer}</span>
        </p>
        <p className="text-stone-400 text-lg">
          Respawning in <span className="font-tac text-amber-300 text-2xl tabular-nums">{countdown}</span> s
        </p>
      </div>
    </div>
  )
}

// ============================================================
// STORY MODE — chapter panel and victory screen
// ============================================================
function StoryPanel() {
  const story = useGame(s => s.story)
  if (!story.active) return null
  return (
    <div className="flex items-center gap-3">
      <div className="bg-stone-950/85 backdrop-blur-sm border border-stone-700/70 rounded-md px-5 py-2 shadow-xl text-left tac-corner">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-amber-300" />
          <span className="font-tac-md text-amber-200 text-[10px]">
            {story.chapterTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Target className="w-3.5 h-3.5 text-stone-500" />
          <span className="font-tac-md text-stone-200 text-[11px]">{story.objective}</span>
          {story.progress && <span className="font-tac text-amber-300 text-[11px] tabular-nums">{story.progress}</span>}
        </div>
      </div>
      {story.timer > 0 && (
        <div className="bg-stone-950/85 backdrop-blur-sm border border-amber-700/60 rounded-md px-4 py-2 flex items-center gap-2 shadow-xl tac-corner">
          <Timer className="w-4 h-4 text-amber-300" />
          <span className={`font-tac text-xl tabular-nums ${story.timer <= 10 ? 'text-red-400 animate-pulse' : 'text-amber-200'}`}>
            {formatTime(story.timer)}
          </span>
        </div>
      )}
    </div>
  )
}

export function StoryVictory() {
  const story = useGame(s => s.story)
  const phase = useGame(s => s.phase)
  if (!story.active || story.status !== 'victory') return null
  void phase
  const mins = Math.floor(story.stats.time / 60)
  const secs = story.stats.time % 60
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm pointer-events-auto">
      <div className="text-center space-y-6 max-w-lg px-6">
        <div>
          <p className="font-tac-md text-[11px] tracking-[0.5em] text-amber-300/70">Operation Ashfall</p>
          <h2 className="font-tac text-5xl tracking-[0.12em] text-white mt-2 uppercase">Mission</h2>
          <h2 className="font-tac text-5xl tracking-[0.12em] text-amber-400 -mt-2 uppercase">Complete</h2>
        </div>
        <div className="flex items-center justify-center gap-8 bg-stone-950/80 border border-stone-700 rounded-lg px-8 py-4">
          <div>
            <div className="font-tac-md text-[10px] text-stone-500">Time</div>
            <div className="font-tac text-2xl tabular-nums text-stone-100">{mins}:{String(secs).padStart(2, '0')}</div>
          </div>
          <div className="w-px h-10 bg-stone-700" />
          <div>
            <div className="font-tac-md text-[10px] text-stone-500">Kills</div>
            <div className="font-tac text-2xl tabular-nums text-stone-100">{story.stats.kills}</div>
          </div>
        </div>
        <Button
          onClick={() => {
            getGame()?.dispose()
            useGame.getState().setPhase('menu')
          }}
          className="h-12 px-10 bg-stone-100 text-stone-900 font-bold tracking-[0.25em] uppercase hover:bg-amber-200"
        >
          Back to menu
        </Button>
      </div>
    </div>
  )
}
