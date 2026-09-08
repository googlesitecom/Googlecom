'use client'

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { WEAPONS, TEAM_INFO, type Team } from '@/game/shared'
import { Crosshair, Shield, Heart, Skull, Coins, Zap, Timer, MapPin, Gamepad2, Copy, Users, Wifi } from 'lucide-react'

export function Hud() {
  const hp = useGame(s => s.hp)
  const armor = useGame(s => s.armor)
  const money = useGame(s => s.money)
  const frags = useGame(s => s.frags)
  const weapon = useGame(s => s.weapon)
  const mag = useGame(s => s.mag)
  const reserve = useGame(s => s.reserve)
  const round = useGame(s => s.round)
  const team = useGame(s => s.team)
  const killfeed = useGame(s => s.killfeed)
  const announcements = useGame(s => s.announcements)
  const buyZone = useGame(s => s.buyZone)
  const phase = useGame(s => s.phase)
  const fps = useGame(s => s.fps)
  const mode = useGame(s => s.mode)
  const ping = useGame(s => s.ping)
  const gamepadConnected = useGame(s => s.gamepadConnected)
  const w = WEAPONS[weapon]

  if (phase !== 'playing' && phase !== 'dead') return null

  return (
    <div className="fixed inset-0 z-30 pointer-events-none font-mono">
      {/* ===== Barra superior: ronda y marcador ===== */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <TeamScore team="A" kills={round?.scoresA ?? 0} wins={round?.roundWinsA ?? 0} active={team === 'A'} />
        <div className="bg-stone-950/85 border border-stone-700 rounded-lg px-5 py-2 text-center shadow-xl">
          <div className="flex items-center gap-2 text-amber-300">
            <Timer className="w-4 h-4" />
            <span className="text-xl font-black tabular-nums">
              {formatTime(round?.timeLeft ?? 0)}
            </span>
          </div>
          <div className="text-[10px] text-stone-400 tracking-widest">
            RONDA {round?.roundNumber ?? 1} · A {round?.scoresA ?? 0}–{round?.scoresB ?? 0} B
          </div>
        </div>
        <TeamScore team="B" kills={round?.scoresB ?? 0} wins={round?.roundWinsB ?? 0} active={team === 'B'} />
      </div>

      {/* ===== Chip de sala (multijugador P2P) ===== */}
      <RoomChip />

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

      {/* ===== Vida y armadura (abajo-izquierda) ===== */}
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
        <div className="flex items-center gap-3 bg-stone-950/70 rounded-lg px-4 py-2 border border-stone-700/60 shadow-xl">
          <Shield className="w-5 h-5 text-stone-400" />
          <div className="flex-1">
            <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-stone-400 transition-all duration-200" style={{ width: `${Math.max(0, armor)}%` }} />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-stone-300 w-10 text-right">{Math.round(armor)}</span>
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
        </div>
      </div>

      {/* ===== Munición y arma (abajo-derecha) ===== */}
      <div className="absolute bottom-6 right-6 text-right">
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
            ZONA DE COMPRA — presiona <kbd className="bg-stone-800 px-1.5 py-0.5 rounded text-amber-300">B</kbd>
          </span>
        </div>
      )}

      {/* ===== FPS / ping / mando ===== */}
      <div className="absolute bottom-1 right-2 text-stone-600 text-[10px] font-mono flex items-center gap-3">
        {gamepadConnected && <Gamepad2 className="w-3.5 h-3.5 text-green-500" />}
        {mode !== 'solo' && ping > 0 && <span className="text-stone-500">{ping} MS</span>}
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
// Chip de sala P2P — código + estado del rival
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
    } catch { /* sin permiso de portapapeles */ }
  }

  return (
    <div className="absolute top-[76px] left-1/2 -translate-x-1/2 pointer-events-auto">
      <div className={`flex items-center gap-3 rounded-lg px-4 py-1.5 border shadow-2xl ${
        connected
          ? 'bg-green-950/70 border-green-700/50'
          : 'bg-stone-950/75 border-amber-700/50 animate-pulse'
      }`}>
        <Users className="w-4 h-4 text-stone-300 shrink-0" />
        <span className="text-stone-400 text-[10px] font-bold tracking-widest">SALA</span>
        <span className="text-amber-300 text-lg font-black tracking-[0.2em] tabular-nums">{roomCode}</span>
        {mode === 'host' && !connected && (
          <>
            <span className="text-amber-200/80 text-[10px] font-bold tracking-widest hidden sm:inline">ESPERANDO RIVAL…</span>
            <button
              onClick={copy}
              className="bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded px-2 py-1 flex items-center gap-1 text-[10px] font-bold text-stone-200 tracking-widest transition-colors"
            >
              <Copy className="w-3 h-3" /> {copied ? '¡COPIADO!' : 'COPIAR'}
            </button>
          </>
        )}
        {connected && (
          <span className="text-green-300 text-[10px] font-bold tracking-widest flex items-center gap-1">
            <Wifi className="w-3 h-3" /> {mode === 'host' ? 'RIVAL CONECTADO' : 'P2P ACTIVO'}
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
