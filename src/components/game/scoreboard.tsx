'use client'

import { useGame } from '@/game/store'
import { TEAM_INFO, GAME } from '@/game/shared'
import { Bot, Coins, Skull, Target } from 'lucide-react'

export function Scoreboard() {
  const open = useGame(s => s.scoreboardOpen)
  const players = useGame(s => s.scoreboard)
  const round = useGame(s => s.round)
  const myId = useGame(s => s.playerId)
  const team = useGame(s => s.team)

  if (!open) return null

  const teamA = players.filter(p => p.team === 'A').sort((a, b) => b.kills - a.kills)
  const teamB = players.filter(p => p.team === 'B').sort((a, b) => b.kills - a.kills)

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center pointer-events-none font-mono px-4">
      <div className="w-[min(860px,95vw)] bg-stone-950/92 backdrop-blur border border-stone-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* cabecera */}
        <div className="px-6 py-3 bg-stone-900/80 border-b border-stone-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-black tracking-widest text-stone-200">MARCADOR</span>
            <span className="text-xs text-stone-500">
              Ronda {round?.roundNumber ?? 1} · Primera a {GAME.ROUNDS_TO_WIN} rondas
            </span>
          </div>
          <div className="flex gap-3 text-sm font-black">
            <span style={{ color: TEAM_INFO.A.color }}>★ {round?.roundWinsA ?? 0}</span>
            <span className="text-stone-600">vs</span>
            <span style={{ color: TEAM_INFO.B.color }}>★ {round?.roundWinsB ?? 0}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 divide-x divide-stone-800">
          {([['A', teamA], ['B', teamB]] as const).map(([t, list]) => (
            <div key={t} className="p-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-black tracking-wider text-sm" style={{ color: TEAM_INFO[t].color }}>
                  {TEAM_INFO[t].name}
                </span>
                <span className="text-xs text-stone-500">{list.filter(p => !p.dead).length} vivos</span>
              </div>
              <div className="grid grid-cols-[1fr_44px_44px_70px_66px] text-[10px] text-stone-500 font-bold tracking-wider px-2 pb-1">
                <span>OPERADOR</span><span className="text-center">K</span>
                <span className="text-center">D</span><span className="text-center">RACHA</span>
                <span className="text-center">$</span>
              </div>
              <div className="space-y-1">
                {list.map(p => (
                  <div
                    key={p.id}
                    className={`grid grid-cols-[1fr_44px_44px_70px_66px] items-center px-2 py-1.5 rounded-lg text-sm
                      ${p.id === myId ? 'bg-amber-950/40 border border-amber-700/40' : 'bg-stone-900/60'}
                      ${p.dead ? 'opacity-45' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {p.bot && <Bot className="w-3.5 h-3.5 text-stone-500 shrink-0" />}
                      <span className={`truncate ${p.id === myId ? 'text-amber-300 font-bold' : 'text-stone-200'}`}>
                        {p.name}
                      </span>
                      {p.id === myId && <span className="text-[9px] text-amber-500 font-bold shrink-0">TÚ</span>}
                      {p.dead && <Skull className="w-3 h-3 text-red-500 shrink-0" />}
                    </span>
                    <span className="text-center font-bold tabular-nums text-stone-100">{p.kills}</span>
                    <span className="text-center tabular-nums text-stone-400">{p.deaths}</span>
                    <span className="text-center tabular-nums flex items-center justify-center gap-0.5">
                      {p.streak >= 3 ? <Target className="w-3 h-3 text-red-400" /> : null}
                      <span className={p.streak >= 3 ? 'text-red-300' : 'text-stone-400'}>{p.streak}</span>
                    </span>
                    <span className="text-center tabular-nums text-amber-500 flex items-center justify-center gap-1">
                      <Coins className="w-3 h-3" />{p.money}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-2 bg-stone-900/60 border-t border-stone-800 text-[11px] text-stone-500 flex justify-between">
          <span>{round?.mode === 'bandera' ? 'Objetivo: 3 capturas de bandera'
            : round?.mode === 'dominacion' ? 'Objetivo: 150 puntos de dominación'
            : round?.mode === 'ffa' ? `Objetivo: ${GAME.FFA_KILLS} bajas individuales`
            : `Objetivo de ronda: ${GAME.ROUND_KILLS} eliminaciones de equipo`}</span>
          <span>
            Tu equipo: <span style={{ color: TEAM_INFO[team].color }}>{team === 'A' ? 'ÁMBAR' : 'VERDE'}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
