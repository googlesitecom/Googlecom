'use client'

// ============================================================
// EMERGENCY STRIKE — Scoreboard (v7, English + tactical type)
// ============================================================

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
    <div className="fixed inset-0 z-[45] flex items-center justify-center pointer-events-none px-4" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <div className="w-[min(860px,95vw)] bg-stone-950/92 backdrop-blur border border-stone-700 rounded-xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="px-6 py-3 bg-stone-900/80 border-b border-stone-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-tac text-lg tracking-[0.22em] text-stone-200 uppercase">Scoreboard</span>
            <span className="font-tac-md text-[10px] text-stone-500">
              Round {round?.roundNumber ?? 1} · First to {GAME.ROUNDS_TO_WIN} rounds
            </span>
          </div>
          <div className="flex gap-3 font-tac text-sm">
            <span style={{ color: TEAM_INFO.A.color }}>★ {round?.roundWinsA ?? 0}</span>
            <span className="text-stone-600">vs</span>
            <span style={{ color: TEAM_INFO.B.color }}>★ {round?.roundWinsB ?? 0}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 divide-x divide-stone-800">
          {([['A', teamA], ['B', teamB]] as const).map(([t, list]) => (
            <div key={t} className="p-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-tac-md text-sm" style={{ color: TEAM_INFO[t].color }}>
                  {TEAM_INFO[t].name}
                </span>
                <span className="font-tac-md text-[10px] text-stone-500">{list.filter(p => !p.dead).length} alive</span>
              </div>
              <div className="grid grid-cols-[1fr_44px_44px_70px_66px] font-tac-md text-[10px] text-stone-500 px-2 pb-1">
                <span>OPERATOR</span><span className="text-center">K</span>
                <span className="text-center">D</span><span className="text-center">STREAK</span>
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
                      <span className={`truncate font-tac ${p.id === myId ? 'text-amber-300' : 'text-stone-200'}`}>
                        {p.name}
                      </span>
                      {p.id === myId && <span className="font-tac-md text-[9px] text-amber-500 shrink-0">YOU</span>}
                      {p.dead && <Skull className="w-3 h-3 text-red-500 shrink-0" />}
                    </span>
                    <span className="text-center font-tac text-stone-100 tabular-nums">{p.kills}</span>
                    <span className="text-center font-tac text-stone-400 tabular-nums">{p.deaths}</span>
                    <span className="text-center font-tac tabular-nums flex items-center justify-center gap-0.5">
                      {p.streak >= 3 ? <Target className="w-3 h-3 text-red-400" /> : null}
                      <span className={p.streak >= 3 ? 'text-red-300' : 'text-stone-400'}>{p.streak}</span>
                    </span>
                    <span className="text-center font-tac text-amber-500 tabular-nums flex items-center justify-center gap-1">
                      <Coins className="w-3 h-3" />{p.money}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-2 bg-stone-900/60 border-t border-stone-800 font-tac-md text-[10px] text-stone-500 flex justify-between">
          <span>{round?.mode === 'bandera' ? 'Objective: 3 flag captures'
            : round?.mode === 'dominacion' ? 'Objective: 150 domination points'
            : round?.mode === 'ffa' ? `Objective: ${GAME.FFA_KILLS} individual kills`
            : `Round objective: ${GAME.ROUND_KILLS} team eliminations`}</span>
          <span>
            Your team: <span style={{ color: TEAM_INFO[team].color }}>{team === 'A' ? 'AMBER' : 'GREEN'}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
