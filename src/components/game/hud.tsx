'use client'

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { WEAPONS, TEAM_INFO, keyLabel, MODES, type Team } from '@/game/shared'
import { Crosshair, Shield, Heart, Skull, Coins, Zap, Timer, MapPin, Gamepad2, Swords, Radio, Flag, Target, CheckCircle2 } from 'lucide-react'
import type { StoryState } from '@/game/story-director'

export function Hud() {
  const hp = useGame(s => s.hp)
  const armor = useGame(s => s.armor)
  const money = useGame(s => s.money)
  const frags = useGame(s => s.frags)
  const weapon = useGame(s => s.weapon)
  const mag = useGame(s => s.mag)
  const reserve = useGame(s => s.reserve)
  const owned = useGame(s => s.owned)
  const round = useGame(s => s.round)
  const team = useGame(s => s.team)
  const killfeed = useGame(s => s.killfeed)
  const announcements = useGame(s => s.announcements)
  const buyZone = useGame(s => s.buyZone)
  const buyKey = keyLabel(useGame(s => s.settings.keybinds.buy))
  const phase = useGame(s => s.phase)
  const cineActive = useGame(s => s.cineActive)
  const smokes = useGame(s => s.smokes)
  const fps = useGame(s => s.fps)
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
    <div className="fixed inset-0 z-30 pointer-events-none font-mono">
      {/* ===== Barra superior: modo, objetivo y marcador ===== */}
      {gameMode === 'historia' ? (
        <StoryPanel story={story} />
      ) : (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
        {gameMode === 'escaramuza' && (
          <>
            <TeamScore team="A" kills={round?.scoresA ?? 0} wins={round?.roundWinsA ?? 0} active={team === 'A'} />
            <RoundChip />
            <TeamScore team="B" kills={round?.scoresB ?? 0} wins={round?.roundWinsB ?? 0} active={team === 'B'} />
          </>
        )}
        {gameMode === 'ffa' && (
          <div className="bg-stone-950/85 border border-stone-700 rounded-lg px-5 py-2 text-center shadow-xl">
            <div className="flex items-center gap-2 text-amber-300">
              <Swords className="w-4 h-4" />
              <span className="text-xl font-black tabular-nums">{myKills} / {round?.scoreTarget ?? 15}</span>
            </div>
            <div className="text-[10px] text-stone-400 tracking-widest">
              LÍDER: {round?.leader?.name ?? '—'} · {round?.leader?.kills ?? 0}
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
            <div className="bg-stone-950/85 border border-stone-700 rounded-lg px-4 py-1.5 flex gap-3">
              <span className="text-xl font-black tabular-nums" style={{ color: TEAM_INFO.A.color }}>{round?.scoresA ?? 0}</span>
              <span className="text-stone-600 text-sm">/ {round?.scoreTarget ?? 150}</span>
              <span className="text-xl font-black tabular-nums" style={{ color: TEAM_INFO.B.color }}>{round?.scoresB ?? 0}</span>
            </div>
            <ZoneChip id="B" zone={round?.zones?.find(z => z.id === 'B')} />
            <ZoneChip id="C" zone={round?.zones?.find(z => z.id === 'C')} />
          </div>
        )}
        </div>
      )}

      {/* ===== Indicador: llevo la bandera ===== */}
      {carryingFlag && phase === 'playing' && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-400 rounded-lg px-5 py-1.5 flex items-center gap-2 animate-pulse shadow-2xl">
          <Flag className="w-4 h-4 text-amber-300" />
          <span className="text-amber-200 text-sm font-black tracking-widest">¡LLEVAS LA BANDERA! CORRE A TU BASE</span>
        </div>
      )}

      {/* ===== Anuncios centrales ===== */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {announcements.map(a => (
          <div
            key={a.id}
            className={`px-6 py-1.5 rounded font-black tracking-widest text-center shadow-2xl border ${
              a.kind === 'round'
                ? 'bg-stone-950/90 border-amber-500/60 text-amber-300 text-2xl'
                : a.kind === 'kill'
                  ? 'bg-stone-950/80 border-red-500/50 text-red-300 text-xl'
                  : 'bg-stone-950/75 border-stone-600/50 text-stone-300 text-sm'
            }`}
            style={a.team ? { borderColor: TEAM_INFO[a.team].color + '99', color: TEAM_INFO[a.team].accent } : undefined}
          >
            {a.text}
          </div>
        ))}
      </div>

      {/* ===== Killfeed ===== */}
      <div className="absolute top-4 right-4 flex flex-col gap-1.5 items-end">
        {killfeed.map(k => (
          <div key={k.id} className="bg-stone-950/75 rounded px-3 py-1 flex items-center gap-2 text-sm border border-stone-700/60 shadow-lg">
            <span className="font-bold" style={{ color: TEAM_INFO[k.killerTeam].color }}>{k.killer}</span>
            <span className="text-stone-400 text-xs">{shortWeapon(k.weapon)}</span>
            {k.headshot && <Skull className="w-4 h-4 text-red-400" />}
            <span className="text-stone-500">›</span>
            <span className="font-bold" style={{ color: TEAM_INFO[k.victimTeam].color }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* ===== Vida y escudo estilo Fortnite (abajo-izquierda) ===== */}
      <div className="absolute bottom-6 left-6 space-y-2 w-64">
        <div className="flex items-center gap-3 bg-stone-950/70 rounded-lg px-4 py-2.5 border border-stone-700/60 shadow-xl">
          <Heart className={`w-5 h-5 ${hp > 60 ? 'text-green-500' : hp > 25 ? 'text-amber-500' : 'text-red-500'}`} />
          <div className="flex-1">
            <div className="h-2.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${hp > 60 ? 'bg-green-500' : hp > 25 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, hp)}%` }}
              />
            </div>
          </div>
          <span className="text-xl font-black tabular-nums text-stone-100 w-10 text-right">{Math.max(0, Math.round(hp))}</span>
        </div>
        <div className={`flex items-center gap-3 bg-stone-950/70 rounded-lg px-4 py-2 border shadow-xl transition-opacity ${armor > 0 ? 'border-sky-700/60' : 'border-stone-700/60 opacity-60'}`}>
          <Shield className="w-5 h-5 text-sky-400" />
          <div className="flex-1">
            <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200" style={{ width: `${Math.max(0, armor)}%` }} />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-sky-300 w-10 text-right">{Math.round(armor)}</span>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-stone-950/70 rounded px-3 py-1.5 border border-amber-700/40 shadow-lg">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 font-bold tabular-nums">${money}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-stone-950/70 rounded px-3 py-1.5 border border-stone-700/60 shadow-lg">
            <Zap className="w-4 h-4 text-lime-400" />
            <span className="text-lime-300 font-bold tabular-nums">×{frags}</span>
          </div>
          <div className={`flex items-center gap-1.5 bg-stone-950/70 rounded px-3 py-1.5 border shadow-lg ${smokes > 0 ? 'border-slate-500/70' : 'border-stone-700/60 opacity-60'}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="2" /><circle cx="15" cy="12" r="2.6" /><circle cx="8.5" cy="15.5" r="2.2" />
            </svg>
            <span className="text-slate-300 font-bold tabular-nums">×{smokes}</span>
          </div>
        </div>
      </div>

      {/* ===== Munición y arma (abajo-derecha) con HUECOS 1/2 ===== */}
      <div className="absolute bottom-6 right-6 text-right space-y-2">
        <WeaponSlots owned={owned} weapon={weapon} />
        <div className="bg-stone-950/70 rounded-lg px-5 py-3 border border-stone-700/60 shadow-xl">
          <div className="text-stone-400 text-xs tracking-widest font-bold uppercase">{w.name}</div>
          <div className="flex items-baseline justify-end gap-2 mt-0.5">
            <span className={`text-4xl font-black tabular-nums ${mag <= w.mag * 0.25 ? 'text-red-400' : 'text-stone-100'}`}>
              {w.mag === 0 ? '—' : mag}
            </span>
            <span className="text-stone-500 text-xl font-bold">/ {w.mag === 0 ? '∞' : reserve}</span>
          </div>
          {w.sniper && <div className="text-emerald-400 text-[10px] tracking-widest">MIRA ×8</div>}
        </div>
      </div>

      {/* ===== Aviso de zona de compra ===== */}
      {buyZone && phase === 'playing' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-stone-950/80 border border-amber-600/50 rounded-lg px-5 py-2 shadow-2xl">
          <MapPin className="w-4 h-4 text-amber-400" />
          <span className="text-amber-200 text-sm font-bold tracking-wide">
            {gameMode === 'historia' ? 'CAJA DE SUMINISTROS' : 'ZONA DE COMPRA'} — presiona <kbd className="bg-stone-800 px-1.5 py-0.5 rounded text-amber-300">{buyKey}</kbd>
          </span>
        </div>
      )}

      {/* ===== FPS / mando ===== */}
      <div className="absolute bottom-1 right-2 text-stone-600 text-[10px] font-mono flex items-center gap-3">
        {gamepadConnected && <Gamepad2 className="w-3.5 h-3.5 text-green-500" />}
        <span>{fps} FPS</span>
      </div>

      {/* ===== Indicador de equipo ===== */}
      <div className="absolute top-4 left-[220px] flex items-center gap-2 bg-stone-950/60 rounded px-3 py-1.5 border border-stone-700/50">
        <Crosshair className="w-4 h-4" style={{ color: TEAM_INFO[team].color }} />
        <span className="text-xs font-bold tracking-wider" style={{ color: TEAM_INFO[team].accent }}>
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
      className={`bg-stone-950/85 border rounded-lg px-3 py-2 text-center shadow-xl min-w-[76px] ${active ? 'ring-1' : ''}`}
      style={{ borderColor: info.color + '80', ...(active ? { boxShadow: `0 0 14px ${info.color}44` } : {}) }}
    >
      <div className="text-[10px] font-bold tracking-widest" style={{ color: info.color }}>{team === 'A' ? 'ÁMBAR' : 'VERDE'}</div>
      <div className="text-2xl font-black tabular-nums text-stone-100">{kills}</div>
      <div className="text-[9px] text-stone-500 font-bold">/{30} · ★{wins}</div>
    </div>
  )
}

/** chip central: tiempo + ronda */
function RoundChip() {
  const round = useGame(s => s.round)
  return (
    <div className="bg-stone-950/85 border border-stone-700 rounded-lg px-5 py-2 text-center shadow-xl">
      <div className="flex items-center gap-2 text-amber-300">
        <Timer className="w-4 h-4" />
        <span className="text-xl font-black tabular-nums">
          {formatTime(round?.timeLeft ?? 0)}
        </span>
      </div>
      <div className="text-[10px] text-stone-400 tracking-widest">
        RONDA {round?.roundNumber ?? 1}
      </div>
    </div>
  )
}

/** marcador de bandera (CTF) */
function FlagScore({ team, own, score, target, status }: { team: Team; own: boolean; score: number; target: number; status: string }) {
  const info = TEAM_INFO[team]
  return (
    <div
      className={`bg-stone-950/85 border rounded-lg px-3 py-2 text-center shadow-xl min-w-[86px] ${own ? 'ring-1' : ''} ${status !== 'home' ? 'animate-pulse' : ''}`}
      style={{ borderColor: info.color + (status !== 'home' ? 'ff' : '80'), ...(own ? { boxShadow: `0 0 14px ${info.color}44` } : {}) }}
    >
      <div className="text-[10px] font-bold tracking-widest flex items-center justify-center gap-1" style={{ color: info.color }}>
        <Flag className="w-3 h-3" /> {team === 'A' ? 'ÁMBAR' : 'VERDE'}
      </div>
      <div className="text-2xl font-black tabular-nums text-stone-100">{score}<span className="text-stone-500 text-sm">/{target}</span></div>
      <div className="text-[9px] text-stone-400 font-bold">{status === 'home' ? 'EN BASE' : status === 'carried' ? '¡ROBADA!' : 'CAÍDA'}</div>
    </div>
  )
}

/** chip de zona de dominación */
function ZoneChip({ id, zone }: { id: string; zone?: { owner: Team | null; prog: number; by: Team | null } }) {
  const color = zone?.owner ? TEAM_INFO[zone.owner].color : '#78716c'
  const capturing = zone && zone.by && zone.prog > 0.02
  return (
    <div className={`bg-stone-950/85 border rounded-lg px-2.5 py-1.5 text-center shadow-xl min-w-[64px] ${capturing ? 'animate-pulse' : ''}`}
      style={{ borderColor: color + 'aa' }}>
      <div className="text-[10px] font-black tracking-widest" style={{ color }}>{id === 'A' ? 'ALFA' : id === 'B' ? 'BRAVO' : 'CHARLIE'}</div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden mt-1 w-12 mx-auto">
        <div className="h-full transition-all" style={{ width: `${Math.round((zone?.prog ?? 0) * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

function shortWeapon(id: string): string {
  const names: Record<string, string> = {
    knife: 'Cuchillo', p9: 'P9', aguila: '.50', mp9: 'MP-9', breacher: 'B-12', ar47: 'AR-47', cr4: 'CR-4', awp338: 'FR-338',
  }
  return names[id] ?? id
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ============================================================
// HISTORIA — panel de misión, barra del jefe y misión cumplida
// ============================================================
function StoryPanel({ story }: { story: StoryState | null }) {
  if (!story) return null
  if (story.done) return <StoryComplete story={story} />
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
      <div className="bg-stone-950/85 border border-cyan-600/50 rounded-xl px-6 py-2 text-center shadow-2xl min-w-[320px]">
        <div className="text-cyan-300 text-xs font-black tracking-[0.25em]">{story.title}</div>
        <div className="text-stone-100 text-sm font-bold mt-0.5">{story.objective}</div>
        <div className="flex items-center justify-center gap-3 mt-1">
          <span className="text-amber-300 text-lg font-black tabular-nums">{story.progress}</span>
          {story.timeLeft !== null && story.timeLeft !== undefined && (
            <span className="flex items-center gap-1 text-red-300 text-lg font-black tabular-nums">
              <Timer className="w-4 h-4" /> {formatTime(story.timeLeft)}
            </span>
          )}
        </div>
      </div>
      {story.boss && (
        <div className="bg-stone-950/85 border border-red-700/60 rounded-xl px-5 py-1.5 w-[320px] shadow-2xl">
          <div className="flex items-center justify-between text-[10px] font-black tracking-widest">
            <span className="text-red-300 flex items-center gap-1"><Skull className="w-3 h-3" /> {story.boss.name}</span>
            <span className="text-red-400 tabular-nums">{story.boss.hp} / {story.boss.maxHp}</span>
          </div>
          <div className="h-2 bg-stone-800 rounded-full overflow-hidden mt-1">
            <div className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all" style={{ width: `${Math.max(0, (story.boss.hp / story.boss.maxHp) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function StoryComplete({ story }: { story: StoryState }) {
  const st = story.stats
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center space-y-6 border-2 border-amber-500/60 bg-stone-950/90 rounded-3xl px-12 py-10 shadow-2xl max-w-lg mx-4">
        <CheckCircle2 className="w-16 h-16 text-amber-400 mx-auto" />
        <p className="text-4xl font-black italic tracking-widest text-amber-300">MISIÓN CUMPLIDA</p>
        <p className="text-cyan-300 font-bold tracking-widest text-sm">OPERACIÓN ISLA GALLO · COMPLETADA</p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-stone-900 rounded-xl p-3 border border-stone-700">
            <div className="text-[10px] text-stone-400 tracking-widest font-bold">TIEMPO</div>
            <div className="text-2xl font-black text-amber-300 tabular-nums">{formatTime(st.time)}</div>
          </div>
          <div className="bg-stone-900 rounded-xl p-3 border border-stone-700">
            <div className="text-[10px] text-stone-400 tracking-widest font-bold">BAJAS</div>
            <div className="text-2xl font-black text-red-300 tabular-nums">{st.kills}</div>
          </div>
          <div className="bg-stone-900 rounded-xl p-3 border border-stone-700">
            <div className="text-[10px] text-stone-400 tracking-widest font-bold">MUERTES</div>
            <div className="text-2xl font-black text-stone-300 tabular-nums">{st.deaths}</div>
          </div>
        </div>
        <p className="text-stone-500 text-xs">Vuelve al menú (ESC) para jugar otra partida</p>
      </div>
    </div>
  )
}

// ============================================================
// HUECOS DE ARMAS (1 · 2 · cuchillo) — inventario visible
// ============================================================
function WeaponSlots({ owned, weapon }: { owned: string[]; weapon: string }) {
  const kept = owned.filter(w => w !== 'knife' && w !== 'p9')
  const slots: { n: string; id: string | null }[] = [
    { n: '1', id: kept[0] ?? null },
    { n: '2', id: kept[1] ?? 'p9' },
    { n: '3', id: 'knife' },
  ]
  return (
    <div className="flex gap-1.5 justify-end">
      {slots.map(s => {
        const active = s.id !== null && s.id === weapon
        const name = s.id ? shortWeapon(s.id) : '—'
        return (
          <div
            key={s.n}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 border shadow-lg ${
              active ? 'bg-amber-500/20 border-amber-400/70' : 'bg-stone-950/70 border-stone-700/60'
            } ${s.id === null ? 'opacity-40' : ''}`}
          >
            <span className={`text-[10px] font-black ${active ? 'text-amber-300' : 'text-stone-500'}`}>{s.n}</span>
            <span className={`text-[10px] font-bold tracking-wider ${active ? 'text-amber-200' : 'text-stone-300'}`}>{name}</span>
          </div>
        )
      })}
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
        <p className="text-6xl font-black tracking-widest text-red-500 drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]">
          ELIMINADO
        </p>
        <p className="text-xl text-stone-200 font-bold">
          Por <span className="text-red-400">{deathInfo.killer}</span>
        </p>
        <p className="text-stone-400 text-lg">
          Reapareciendo en <span className="text-amber-300 font-black text-2xl tabular-nums">{countdown}</span> s
        </p>
      </div>
    </div>
  )
}
