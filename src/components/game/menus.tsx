'use client'

// ============================================================
// EMERGENCY STRIKE — Main menu (v7)
// Full-bleed combat artwork background (img/menu.jpg) with a
// tactical dark grade, Rajdhani typography, refined tabs and
// detailed deploy/story panels. All copy in English.
// ============================================================

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { getAudio } from '@/game/audio'
import { ASSET_BASE, GAME } from '@/game/shared'
import { useAuth, getProfile, fmtKD, addFriend, removeFriend, createGroup, deleteGroup, toggleGroupMember, useSquad, syncSquadFromProfile, type CareerProfile, type SquadGroup } from '@/game/auth'
import { useBr, BR_RARITIES } from '@/game/br-store'
import { teamSlotsFor, roomCapacity, type RoomKind } from '@/game/net'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Users, Link2, Bot,
  Heart, Plane,
  Keyboard, Info, RotateCcw, Home, TreePine, Video, Wind, Flag, Target, Radio,
  Map, Clock, ChevronRight, Copy, Check, Music2, Footprints, Package,
  User, UserPlus, UserMinus, Trash2, Skull, Medal, Crown, Activity, Rocket, X,
} from 'lucide-react'
import {
  DIFFICULTY_LABELS, ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel, MODES, MODE_LIST, padButtonLabel, PAD_ACTION_LABELS,
  type BotDifficulty, type ActionId, type GameMode, type PadAction,
} from '@/game/shared'

// ============================================================
// Backdrop: combat artwork + tactical dark grade + film grain
// ============================================================
function MenuBackdrop() {
  return (
    <>
      {/* user's menu artwork */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${ASSET_BASE}/img/menu.jpg)` }}
      />
      {/* dark tactical grade so UI text always reads well */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,7,9,0.93) 0%, rgba(5,7,9,0.78) 34%, rgba(6,8,10,0.42) 62%, rgba(4,5,6,0.55) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,7,9,0.35) 0%, transparent 30%, rgba(4,5,6,0.6) 100%)' }} />
      {/* scanlines (subtle CRT flavor) */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.7) 0 1px, transparent 1px 3px)' }}
      />
      {/* technical grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(170,190,200,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(170,190,200,0.8) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />
      {/* frame corners */}
      <div className="absolute inset-4 border border-stone-700/30 rounded-sm pointer-events-none" />
    </>
  )
}

/** status strip above the tabs (rec dot + coordinates flavor) */
function StatusStrip() {
  return (
    <div className="w-full max-w-5xl flex items-center justify-between mb-4 select-none">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="font-tac-md text-[10px] text-stone-500">LIVE · WEBGL COMBAT SIMULATION</span>
      </div>
      <div className="font-tac-md text-[10px] text-stone-600 hidden sm:block">
        20°41'N · 103°21'W · GRID MERIDIAN-59
      </div>
    </div>
  )
}

/** Tactical tab */
function TabButton({ icon: Icon, label, active, onClick }: {
  icon: typeof Play
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative px-4 sm:px-6 py-2.5 font-tac-md text-[13px]
        transition-colors duration-150 flex items-center gap-2.5 border-t-2 ${
        active
          ? 'text-amber-200 border-amber-500/80 bg-stone-100/[0.04]'
          : 'text-stone-400 border-transparent hover:text-stone-200 hover:bg-stone-100/[0.02]'
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? 'text-amber-300/90' : 'text-stone-500 group-hover:text-stone-300'}`} />
      {label}
      {active && <span className="absolute left-0 right-0 -bottom-px h-px bg-amber-500/50" />}
    </button>
  )
}

// ============================================================
// CONTROLS panel (rebindable) — shared menu/pause
// ============================================================
const MOVEMENT: ActionId[] = ['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'jump', 'zipline']
const COMBAT: ActionId[] = ['shoot', 'aim', 'reload', 'grenadeFrag', 'grenadeSmoke', 'flare', 'stim', 'buy', 'lastWeapon', 'slot1', 'slot2', 'slot3']

function useKeyCapture() {
  const [capture, setCapture] = useState<ActionId | null>(null)
  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Escape cancels · anything else rebinds
      if (e.code !== 'Escape') useGame.getState().setKeybind(capture, e.code)
      setCapture(null)
    }
    // MOUSE buttons can also be bound (fire/aim)
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      useGame.getState().setKeybind(capture, `Mouse${e.button}`)
      setCapture(null)
    }
    const onCtx = (e: Event): void => { e.preventDefault() }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('contextmenu', onCtx, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('contextmenu', onCtx, true)
    }
  }, [capture])
  return { capture, setCapture }
}

/** gamepad button capture (polling) */
function usePadCapture() {
  const [padCapture, setPadCapture] = useState<PadAction | null>(null)
  useEffect(() => {
    if (!padCapture) return
    let raf = 0
    const poll = (): void => {
      const pads = navigator.getGamepads?.() ?? []
      for (const p of pads) {
        if (!p) continue
        for (let i = 0; i < p.buttons.length; i++) {
          if (p.buttons[i]?.pressed) {
            useGame.getState().setPadBind(padCapture, i)
            setPadCapture(null)
            return
          }
        }
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [padCapture])
  return { padCapture, setPadCapture }
}

function KeybindRow({ action, capture, onCapture }: {
  action: ActionId
  capture: ActionId | null
  onCapture: (a: ActionId) => void
}) {
  const code = useGame(s => s.settings.keybinds[action])
  const capturing = capture === action
  return (
    <div className="flex items-center justify-between gap-3 bg-stone-900/50 rounded-md px-3.5 py-2 border border-stone-700/50">
      <span className="font-tac-md text-stone-300 text-[12px]">{ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-tac-md text-[11px] tracking-widest border transition-colors ${
          capturing
            ? 'bg-amber-500/15 border-amber-400/70 text-amber-200 animate-pulse'
            : code
              ? 'bg-stone-800 border-stone-600 text-stone-200 hover:border-amber-500/50 hover:text-white'
              : 'bg-red-950/50 border-red-800/60 text-red-300'
        }`}
      >
        {capturing ? 'PRESS KEY' : keyLabel(code)}
      </button>
    </div>
  )
}

function PadRow({ action, capture, onCapture }: {
  action: PadAction
  capture: PadAction | null
  onCapture: (a: PadAction) => void
}) {
  const btn = useGame(s => s.settings.padBinds[action])
  const capturing = capture === action
  return (
    <div className="flex items-center justify-between gap-3 bg-stone-900/50 rounded-md px-3.5 py-2 border border-stone-700/50">
      <span className="font-tac-md text-stone-300 text-[12px]">{PAD_ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-tac-md text-[11px] tracking-widest border transition-colors ${
          capturing
            ? 'bg-amber-500/15 border-amber-400/70 text-amber-200 animate-pulse'
            : btn >= 0
              ? 'bg-stone-800 border-stone-600 text-stone-200 hover:border-amber-500/50 hover:text-white'
              : 'bg-red-950/50 border-red-800/60 text-red-300'
        }`}
      >
        {capturing ? 'PRESS BUTTON' : btn >= 0 ? padButtonLabel(btn) : '—'}
      </button>
    </div>
  )
}

export function KeybindsPanel() {
  const { capture, setCapture } = useKeyCapture()
  const { padCapture, setPadCapture } = usePadCapture()
  const reset = useGame(s => s.resetKeybinds)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-stone-400 text-xs leading-relaxed max-w-md">
          Click a key and press the new binding — <b className="text-stone-300">keyboard or mouse
          button</b> (fire and aim can be rebound too). If the key is already in use, the other
          action is released automatically. <b className="text-stone-300">ESC</b> cancels.
        </p>
        <Button
          onClick={reset}
          variant="secondary"
          className="h-9 font-tac-md text-[11px] bg-stone-800 border border-stone-600 hover:bg-stone-700"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> RESET DEFAULTS
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2">
            <Mouse className="w-4 h-4" /> Movement
          </h4>
          {MOVEMENT.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2">
            <Crosshair className="w-4 h-4" /> Combat (keyboard & mouse)
          </h4>
          {COMBAT.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
      </div>

      {/* gamepad (rebindable) */}
      <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4">
        <h4 className="font-tac-md text-stone-300 text-[11px] mb-3 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-amber-200/80" /> Gamepad — rebindable buttons (Xbox · PS · generic)
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(Object.keys(PAD_ACTION_LABELS) as PadAction[]).map(a => (
            <PadRow key={a} action={a} capture={padCapture} onCapture={setPadCapture} />
          ))}
        </div>
        <p className="text-stone-600 text-[10px] mt-2.5 leading-relaxed">
          Click an action and press the gamepad button you want. Sprint sits on <b>L3</b> (left
          stick click) by default; fully pushing the stick also sprints. Sensitivity lives in
          SETTINGS.
        </p>
      </div>
    </div>
  )
}

// ============================================================
// SETTINGS panel — with AUDIO (separate music/SFX)
// ============================================================
export function SettingsPanel() {
  const settings = useGame(s => s.settings)
  const setSettings = useGame(s => s.setSettings)
  return (
    <div className="space-y-7 max-w-xl">
      {/* ---- AUDIO ---- */}
      <section className="space-y-4">
        <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2 border-b border-stone-800 pb-2">
          <Volume2 className="w-4 h-4" /> Audio
        </h4>
        <SliderRow
          icon={<Volume2 className="w-4 h-4" />}
          label="MASTER VOLUME"
          value={settings.volume} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ volume: v })
            getAudio().setVolume(v)
          }}
        />
        <SliderRow
          icon={<Music2 className="w-4 h-4" />}
          label="MUSIC VOLUME"
          value={settings.musicVol} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ musicVol: v })
            getAudio().setMusicVolume(v)
          }}
        />
        <SliderRow
          icon={<Bomb className="w-4 h-4" />}
          label="SFX VOLUME"
          value={settings.sfxVol} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ sfxVol: v })
            getAudio().setSfxVolume(v)
          }}
        />
        <p className="text-stone-600 text-[10px] leading-relaxed">
          Music (Musica.mp3) plays in the menu and ducks during combat. Gunshots use the
          repository MP3s (Pistol · SMG · Rifle · Sniper). Settings save automatically.
        </p>
      </section>

      {/* ---- CONTROL ---- */}
      <section className="space-y-4">
        <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2 border-b border-stone-800 pb-2">
          <Mouse className="w-4 h-4" /> Control
        </h4>
        <SliderRow
          icon={<Mouse className="w-4 h-4" />}
          label="MOUSE SENSITIVITY"
          value={settings.sens} min={0.2} max={3} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setSettings({ sens: v })}
        />
        <SliderRow
          icon={<Crosshair className="w-4 h-4" />}
          label="AIM SENSITIVITY (ADS)"
          value={settings.adsSens} min={0.3} max={1.5} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => setSettings({ adsSens: v })}
        />
        <SliderRow
          icon={<Gamepad2 className="w-4 h-4" />}
          label="GAMEPAD SENSITIVITY"
          value={settings.padSens} min={0.2} max={3} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setSettings({ padSens: v })}
        />
      </section>

      {/* ---- GRAPHICS ---- */}
      <section>
        <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2 border-b border-stone-800 pb-2 mb-3">
          <Gauge className="w-4 h-4" /> Graphics
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['baja', 'media', 'alta', 'ultra'] as const).map(q => (
            <button
              key={q}
              onClick={() => setSettings({ quality: q })}
              className={`rounded-md py-2.5 font-tac-md text-[11px] border uppercase transition-colors relative ${
                settings.quality === q
                  ? 'bg-amber-500/15 border-amber-400/70 text-amber-200'
                  : 'bg-stone-900/60 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              {q === 'baja' ? 'LOW' : q === 'media' ? 'MEDIUM' : q === 'alta' ? 'HIGH' : 'ULTRA'}
              {q === 'ultra' && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black tracking-normal bg-amber-500 text-stone-900 rounded-sm px-1 py-px">
                  OPTIONAL
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
          <b className="text-stone-300">Applies INSTANTLY</b>, even mid-match (you will notice it in the FPS counter).
          <b className="text-stone-300"> Low</b>: no shadows, no bloom, tight fog and 30 % less resolution → max FPS.
          <b className="text-stone-300"> Medium</b>: 1K shadows, 2 lamps. <b className="text-stone-300"> High</b>: 2K shadows, bloom, dust &amp; birds (recommended).
          <b className="text-amber-200/70"> ULTRA</b>: real lights (muzzle flashes that light up the scene), sun with lens flare,
          crisp 4K shadows, wet streets and <b className="text-amber-200/70">real-time water reflection</b>. Off by default — and if your rig struggles, it auto-scales so it never lags.
          <b className="text-stone-300"> Battle Royale</b> honors the same profiles now — including <b className="text-stone-300">HIGH</b> and <b className="text-amber-200/70">ULTRA</b> (sharper resolution, richer dusk sky, drifting clouds).
        </p>
      </section>
    </div>
  )
}

function SliderRow({ icon, label, value, min, max, step, format, onChange }: {
  icon: React.ReactNode
  label: string
  value: number
  min: number; max: number; step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-tac-md text-stone-400 text-[11px] flex items-center gap-2">{icon} {label}</span>
        <span className="font-tac text-amber-200 tabular-nums text-xs">{format(value)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={v => onChange(v[0])} />
    </div>
  )
}

// ============================================================
// INFO panel — what the game is about (per user request:
// ONLY the game description, no mechanics grid)
// ============================================================
export function InfoPanel() {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-md border border-amber-700/50 bg-amber-950/30 flex items-center justify-center shrink-0">
          <Crosshair className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h3 className="font-tac text-2xl tracking-[0.14em] text-stone-100 uppercase">Emergency Strike</h3>
          <p className="font-tac-md text-[10px] text-amber-300/70">Tactical multiplayer FPS · Operation Ashfall</p>
        </div>
      </div>
      <p className="text-stone-300 text-sm leading-relaxed">
        Emergency Strike is a tactical first-person shooter that runs entirely in your browser.
        It blends <b className="text-stone-100">CS2-style gunplay</b> — recoil, weapon slots, an economy
        of kills and a buy menu — with a <b className="text-stone-100">Warzone-style world</b>: a 140×140 m
        urban map with enterable buildings, ziplines, jump pads, explosive barrels and a night-lit
        skyline.
      </p>
      <p className="text-stone-400 text-sm leading-relaxed">
        Play the way you want: team deathmatch, free-for-all, capture the flag and domination
        against smart AI, or open a peer-to-peer room and duel a friend in 1v1 / 2v2 over WebRTC.
        On top of that sits <b className="text-amber-200">OPERATION ASHFALL</b>, a full single-player
        campaign across the Serene Valley — six chapters with long cinematic flyovers, live battle
        fronts, radio dialogue, a boss duel and a timed helicopter extraction.
      </p>
      <div className="border-t border-stone-800 pt-4 flex flex-wrap gap-x-6 gap-y-2 font-tac-md text-[10px] text-stone-500">
        <span className="flex items-center gap-1.5"><Swords className="w-3.5 h-3.5 text-amber-400/60" /> 5 game modes</span>
        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-400/60" /> Online 1v1 & 2v2</span>
        <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-amber-400/60" /> 6-chapter campaign</span>
        <span className="flex items-center gap-1.5"><Gamepad2 className="w-3.5 h-3.5 text-amber-400/60" /> Full gamepad support</span>
      </div>
    </div>
  )
}

// ============================================================
// v9 — USER WIDGET (top-right) + career profile modal
// ============================================================
function rankOf(p: CareerProfile): { label: string; color: string } {
  if (p.brWins >= 5 || p.wins >= 30) return { label: 'LEGEND', color: '#fbbf24' }
  if (p.brWins >= 2 || p.wins >= 15) return { label: 'VETERAN', color: '#f59e0b' }
  if (p.wins >= 5) return { label: 'OPERATOR', color: '#d99a2b' }
  if (p.matches >= 3) return { label: 'SOLDIER', color: '#a8a29e' }
  return { label: 'RECRUIT', color: '#78716c' }
}

function UserWidget({ onOpen }: { onOpen: () => void }) {
  const user = useAuth(s => s.user)
  const squadName = useSquad(s => s.name)
  const squadMembers = useSquad(s => s.members)
  if (!user) return null
  const p = getProfile()
  const rank = rankOf(p)
  const initials = user.slice(0, 2).toUpperCase()
  return (
    <button
      onClick={onOpen}
      className="relative flex items-center gap-3 bg-[#0b0e11]/92 border border-stone-700/70 rounded-lg pl-2 pr-4 py-2 shadow-xl hover:border-amber-500/60 transition-colors tac-corner group"
      title="Career profile · friends & groups"
    >
      <span
        className="w-9 h-9 rounded-md flex items-center justify-center font-tac text-sm border shrink-0"
        style={{
          background: 'linear-gradient(160deg, #20262b, #0e1114)',
          borderColor: `${rank.color}55`,
          color: rank.color,
        }}
      >
        {initials}
      </span>
      <span className="text-left leading-tight">
        <span className="font-tac-md text-[12px] text-stone-100 block truncate max-w-[110px]">{user}</span>
        <span className="font-tac-md text-[9px] tracking-widest" style={{ color: rank.color }}>
          {rank.label} · K/D {fmtKD(p)}
        </span>
        {squadMembers.length > 0 && (
          <span className="font-tac-md text-[9px] text-amber-300/80 block truncate max-w-[130px]">
            SQUAD: {squadName} ({squadMembers.length})
          </span>
        )}
      </span>
      <Trophy className="w-3.5 h-3.5 text-stone-600 group-hover:text-amber-300/80 transition-colors" />
    </button>
  )
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-stone-950/70 border border-stone-800 rounded-md p-3 tac-corner">
      <div className="flex items-center gap-2 text-stone-500 text-[10px] font-tac-md mb-1.5">{icon} {label}</div>
      <div className="font-tac text-lg text-stone-100 tabular-nums leading-none">{value}</div>
    </div>
  )
}

// ============================================================
// v10 — SQUAD manager (friends & groups) inside the profile
// ============================================================
function SquadSection(): React.ReactElement | null {
  const user = useAuth(s => s.user)
  const squad = useSquad(s => s.groupId)
  const squadSet = useSquad(s => s.set)
  const squadClear = useSquad(s => s.clear)
  const [friendName, setFriendName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [rev, setRev] = useState(0)
  if (!user) return null
  const p = getProfile()

  const refresh = (): void => { syncSquadFromProfile(); setRev(v => v + 1) }

  const doAddFriend = (): void => {
    const r = addFriend(friendName)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setFriendName('')
    getAudio().uiClick()
    refresh()
  }
  const doCreateGroup = (): void => {
    const r = createGroup(groupName, picked)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setGroupName(''); setPicked([])
    getAudio().uiClick()
    refresh()
  }

  return (
    <div className="mt-5 border-t border-stone-800 pt-4 space-y-4" data-rev={rev}>
      <div className="flex items-center justify-between">
        <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2">
          <Users className="w-4 h-4" /> SQUAD · FRIENDS &amp; GROUPS
        </h4>
        <span className="font-tac-md text-[9px] text-stone-600">BR is always SOLOS</span>
      </div>

      {/* friends */}
      <div>
        <div className="flex gap-2 mb-2">
          <Input
            value={friendName}
            onChange={e => { setFriendName(e.target.value); setErr('') }}
            onKeyDown={e => { if (e.key === 'Enter') doAddFriend() }}
            placeholder="Friend's operator name"
            maxLength={16}
            className="bg-stone-950/80 border-stone-600 text-white h-9 text-sm"
          />
          <Button
            onClick={doAddFriend}
            className="h-9 px-4 bg-stone-100 text-stone-900 hover:bg-amber-200 font-bold text-xs shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" /> ADD
          </Button>
        </div>
        {err && <p className="text-red-400 text-[11px] mb-1.5 font-bold">{err}</p>}
        <div className="flex flex-wrap gap-1.5">
          {p.friends.length === 0 && (
            <p className="text-stone-600 text-[11px]">No friends yet — add operators by name to build your squad.</p>
          )}
          {p.friends.map(f => (
            <div key={f} className="flex items-center gap-1.5 bg-stone-900/70 border border-stone-700 rounded pl-2.5 pr-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-tac-md text-[11px] text-stone-200">{f}</span>
              <button
                onClick={() => { removeFriend(f); refresh() }}
                className="text-stone-600 hover:text-red-300 transition-colors p-0.5"
                title="Remove friend"
              >
                <UserMinus className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* create group */}
      {p.friends.length > 0 && (
        <div className="bg-stone-900/50 border border-stone-800 rounded-md p-3.5 space-y-2.5">
          <p className="font-tac-md text-stone-400 text-[10px] uppercase tracking-widest">Create group</p>
          <div className="flex gap-2">
            <Input
              value={groupName}
              onChange={e => { setGroupName(e.target.value); setErr('') }}
              placeholder="Group name (e.g. Night Owls)"
              maxLength={22}
              className="bg-stone-950/80 border-stone-600 text-white h-9 text-sm"
            />
            <Button
              onClick={doCreateGroup}
              disabled={picked.length === 0}
              className="h-9 px-4 bg-emerald-500/90 text-stone-950 hover:bg-emerald-400 font-bold text-xs shrink-0 disabled:opacity-30"
            >
              CREATE
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.friends.map(f => {
              const on = picked.includes(f)
              return (
                <button
                  key={f}
                  onClick={() => setPicked(on ? picked.filter(x => x !== f) : [...picked, f])}
                  className={`font-tac-md text-[11px] rounded px-2.5 py-1 border transition-colors ${
                    on ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200' : 'bg-stone-950/60 border-stone-700 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* groups */}
      {p.groups.length > 0 && (
        <div className="space-y-2">
          {p.groups.map((g: SquadGroup) => {
            const active = squad === g.id
            return (
              <div
                key={g.id}
                className={`rounded-md border p-3 ${active ? 'border-amber-500/60 bg-amber-500/[0.06]' : 'border-stone-800 bg-stone-950/60'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className={`w-4 h-4 shrink-0 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
                    <span className="font-tac-md text-[12px] text-stone-100 truncate">{g.name}</span>
                    <span className="font-tac-md text-[9px] text-stone-600 shrink-0">{g.members.length}/9</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        if (active) squadClear()
                        else squadSet({ groupId: g.id, name: g.name, members: [...g.members] })
                        getAudio().uiClick()
                      }}
                      className={`font-tac-md text-[10px] tracking-widest rounded px-2.5 py-1 border transition-colors ${
                        active
                          ? 'bg-amber-500/20 border-amber-400/70 text-amber-200'
                          : 'bg-stone-900 border-stone-700 text-stone-300 hover:border-amber-500/60 hover:text-amber-200'
                      }`}
                    >
                      {active ? '★ ACTIVE' : 'DEPLOY WITH'}
                    </button>
                    <button
                      onClick={() => { deleteGroup(g.id); refresh() }}
                      className="text-stone-600 hover:text-red-300 transition-colors p-1"
                      title="Delete group"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.members.map(m => (
                    <button
                      key={m}
                      onClick={() => { toggleGroupMember(g.id, m); refresh() }}
                      className={`font-tac-md text-[11px] rounded px-2 py-0.5 border transition-colors ${
                        active ? 'bg-stone-950/70 border-stone-700 text-stone-300' : 'bg-stone-900/70 border-stone-700 text-stone-400'
                      } hover:border-red-400/50 hover:text-red-200`}
                      title="Toggle member"
                    >
                      {m} ×
                    </button>
                  ))}
                  {g.members.length === 0 && (
                    <span className="text-stone-600 text-[10px]">Empty group — pick members from your friends above.</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-stone-600 text-[10px] leading-relaxed">
        Set a group <b className="text-amber-200/80">ACTIVE</b> and it deploys with you in EVERY mode (team
        deathmatch, FFA, capture the flag, domination and the campaign): your friends fight at your side as
        named operators. <b className="text-stone-300">Battle Royale is always solos</b> — the squad waits at the menu.
      </p>
    </div>
  )
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const user = useAuth(s => s.user)
  const logout = useAuth(s => s.logout)
  if (!user) return null
  const p = getProfile()
  const rank = rankOf(p)
  const initials = user.slice(0, 2).toUpperCase()
  const time = p.timePlayed
  const hours = Math.floor(time / 3600)
  const mins = Math.floor((time % 3600) / 60)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-[min(560px,94vw)] max-h-[88vh] overflow-y-auto bg-[#0b0e11]/97 border border-stone-700 shadow-2xl rounded-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-200 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-5">
          <span
            className="w-14 h-14 rounded-md flex items-center justify-center font-tac text-xl border shrink-0"
            style={{
              background: 'linear-gradient(160deg, #20262b, #0e1114)',
              borderColor: `${rank.color}55`,
              color: rank.color,
            }}
          >
            {initials}
          </span>
          <div>
            <h3 className="font-tac text-xl tracking-[0.12em] text-stone-100 uppercase leading-none">{user}</h3>
            <p className="font-tac-md text-[10px] mt-1.5 tracking-widest" style={{ color: rank.color }}>
              {rank.label} · CAREER RECORD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatCell icon={<Skull className="w-3.5 h-3.5" />} label="TOTAL KILLS" value={String(p.kills)} />
          <StatCell icon={<Crown className="w-3.5 h-3.5" />} label="TOTAL WINS" value={String(p.wins)} />
          <StatCell icon={<Activity className="w-3.5 h-3.5" />} label="BEST WIN STREAK" value={String(p.bestWinStreak)} />
          <StatCell icon={<Swords className="w-3.5 h-3.5" />} label="K/D RATIO" value={fmtKD(p)} />
          <StatCell icon={<Crosshair className="w-3.5 h-3.5" />} label="DEATHS" value={String(p.deaths)} />
          <StatCell icon={<Target className="w-3.5 h-3.5" />} label="HEADSHOTS" value={String(p.headshots)} />
          <StatCell icon={<Package className="w-3.5 h-3.5" />} label="MATCHES" value={String(p.matches)} />
          <StatCell icon={<Trophy className="w-3.5 h-3.5" />} label="CURRENT STREAK" value={String(p.winStreak)} />
          <StatCell icon={<Clock className="w-3.5 h-3.5" />} label="TIME PLAYED" value={hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} />
          <StatCell icon={<Rocket className="w-3.5 h-3.5" />} label="BR MATCHES" value={String(p.brPlays)} />
          <StatCell icon={<Medal className="w-3.5 h-3.5" />} label="BR VICTORIES" value={String(p.brWins)} />
          <StatCell icon={<Trophy className="w-3.5 h-3.5" />} label="BEST BR PLACEMENT" value={p.brTop > 0 ? `#${p.brTop}` : '—'} />
        </div>

        {/* v10: amigos + grupos (despliegue en escuadra) */}
        <SquadSection />

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-800 pt-4">
          <p className="text-stone-600 text-[10px] leading-relaxed max-w-[300px]">
            Stats persist on this device and are recorded after every match — PvP,
            campaign and Battle Royale.
          </p>
          <Button
            variant="secondary"
            className="h-9 font-tac-md text-[11px] bg-stone-800 border border-stone-600 hover:bg-red-950/60 hover:border-red-800/70 hover:text-red-200"
            onClick={() => { onClose(); logout() }}
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> LOG OUT
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main menu — tactical tabs
// ============================================================
type MenuTab = 'deploy' | 'story' | 'br' | 'controls' | 'settings' | 'info'
type PlayMode = 'solo' | 'host' | 'guest'

export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const authUser = useAuth(s => s.user)
  const brSet = useBr(s => s.set)
  const squadName = useSquad(s => s.name)
  const squadMembers = useSquad(s => s.members)
  const [profileOpen, setProfileOpen] = useState(false)
  const [tab, setTab] = useState<MenuTab>('deploy')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<PlayMode>('solo')
  const [code, setCode] = useState('')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [fillBots, setFillBots] = useState(0)
  const [gameMode, setGameMode] = useState<GameMode>('escaramuza')
  const [error, setError] = useState('')
  // online room format + slot filling
  const [roomKind, setRoomKind] = useState<RoomKind>('1v1')
  const [fillEmpty, setFillEmpty] = useState(true)
  // co-op campaign (join code)
  const [coopCode, setCoopCode] = useState('')

  if (phase !== 'menu') return null

  // v9: el nombre del operador por defecto es el de la cuenta
  const effectiveName = name.trim() || authUser || ''

  const launch = (m: PlayMode, roomCode = '', forceMode?: GameMode, forceKind?: RoomKind) => {
    const n = effectiveName.trim() || 'Operator'
    if (n.length < 2) { setError('Name must be at least 2 characters'); return }
    setPlayerName(n)
    setError('')
    const kind = forceKind ?? roomKind
    setHud({
      mode: m,
      roomCode,
      botDifficulty: difficulty,
      fillBots,
      gameMode: forceMode ?? gameMode,
      roomKind: kind,
      fillEmptyWithBots: kind === 'coop' ? false : fillEmpty,
      lobby: null,
      netStatus: 'connecting',
      netError: '',
      story: {
        active: (forceMode ?? gameMode) === 'historia',
        chapter: 0,
        chapterTitle: '',
        objective: '',
        progress: '',
        hint: '',
        timer: 0,
        dialogue: null,
        status: 'playing',
        stats: { time: 0, kills: 0 },
      },
    })
    useGame.getState().setPhase('connecting')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <MenuBackdrop />

      <div className="relative min-h-screen flex flex-col items-center px-4 py-6 sm:py-8">
        {/* hero header + v9 user widget (top-right) */}
        <div className="w-full max-w-5xl mb-5">
          <div className="flex items-end justify-between gap-4">
            <div className="select-none">
              <h1 className="font-tac text-4xl sm:text-[52px] tracking-[0.22em] text-stone-100 leading-none uppercase"
                style={{ textShadow: '0 2px 28px rgba(0,0,0,0.8), 0 0 60px rgba(217,160,91,0.18)' }}>
                Emergency<span className="text-amber-400 ml-3">Strike</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="h-px w-14 bg-amber-500/50" />
                <p className="font-tac-md text-stone-400 text-[10px]">
                  Tactical multiplayer FPS · Operation Ashfall
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <UserWidget onOpen={() => setProfileOpen(true)} />
              <span className="font-tac-md text-[10px] text-stone-600 hidden sm:block">
                Three.js · WebRTC · 5 modes + Battle Royale
              </span>
            </div>
          </div>
        </div>

        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

        <StatusStrip />

        {/* tabs */}
        <div className="w-full max-w-5xl flex items-stretch gap-1 mb-0 border-b border-stone-800">
          <TabButton icon={Play} label="Deploy" active={tab === 'deploy'} onClick={() => setTab('deploy')} />
          <TabButton icon={Radio} label="Campaign" active={tab === 'story'} onClick={() => setTab('story')} />
          <TabButton icon={Rocket} label="Battle Royale" active={tab === 'br'} onClick={() => setTab('br')} />
          <TabButton icon={Keyboard} label="Controls" active={tab === 'controls'} onClick={() => setTab('controls')} />
          <TabButton icon={Settings} label="Settings" active={tab === 'settings'} onClick={() => setTab('settings')} />
          <TabButton icon={Info} label="Info" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        {/* content card */}
        <div className="w-full max-w-5xl bg-[#0b0e11]/92 backdrop-blur-md border-x border-b border-stone-800 shadow-2xl">

          {tab === 'deploy' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.12fr_0.88fr] gap-6">
              {/* left column: deployment */}
              <div className="space-y-5">
                <div>
                  <label className="font-tac-md text-stone-400 text-[11px] mb-2 block">
                    Operator name
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder={authUser || 'Enter your callsign'}
                    maxLength={16}
                    className="bg-stone-950/80 border-stone-600 text-white text-lg h-12 font-bold focus:border-amber-500/70 focus-visible:ring-amber-500/20"
                  />
                  {error && <p className="text-red-400 text-xs mt-2 font-bold">{error}</p>}
                </div>

                {/* connection mode selector */}
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { id: 'solo', icon: Bot, title: 'BOTS', desc: 'Team deathmatch 4v4 vs AI', meta: 'offline' },
                    { icon: Users, id: 'host', title: 'CREATE ROOM', desc: '1v1 to 5v5 with a P2P code', meta: 'online' },
                    { icon: Link2, id: 'guest', title: 'JOIN', desc: 'Enter with a code', meta: 'online' },
                  ] as const).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`rounded-lg border p-3 text-left transition-colors tac-corner ${
                        mode === m.id
                          ? 'border-amber-500/70 bg-amber-500/[0.07]'
                          : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                      }`}
                    >
                      <m.icon className={`w-5 h-5 mb-1.5 ${mode === m.id ? 'text-amber-300' : 'text-stone-500'}`} />
                      <div className={`font-tac-md text-[11px] ${mode === m.id ? 'text-white' : 'text-stone-300'}`}>
                        {m.title}
                      </div>
                      <div className="text-[10px] text-stone-500 leading-snug mt-0.5">{m.desc}</div>
                      <div className={`font-tac-md text-[9px] mt-1 ${mode === m.id ? 'text-amber-300/70' : 'text-stone-600'}`}>
                        {m.meta}
                      </div>
                    </button>
                  ))}
                </div>

                {/* game mode selector (solo/host; the guest plays the host's mode) */}
                {mode !== 'guest' && (
                  <div>
                    <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                      <Swords className="w-3.5 h-3.5" /> Game mode
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {MODE_LIST.map(id => {
                        const m = MODES[id]
                        const active = gameMode === id
                        const Icon = id === 'bandera' ? Flag : id === 'dominacion' ? Target : id === 'ffa' ? Zap : Swords
                        return (
                          <button
                            key={id}
                            onClick={() => setGameMode(id)}
                            className={`rounded-lg border p-2.5 text-left transition-colors tac-corner ${
                              active
                                ? 'border-amber-500/70 bg-amber-500/[0.07]'
                                : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                            }`}
                          >
                            <Icon className={`w-4 h-4 mb-1 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
                            <div className={`font-tac-md text-[11px] ${active ? 'text-white' : 'text-stone-300'}`}>
                              {m.name}
                            </div>
                            <div className="text-[9px] text-stone-500 leading-snug mt-0.5">{m.desc}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* mode-specific config */}
                {mode === 'solo' && (
                  <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="AI DIFFICULTY" />
                )}
                {mode === 'host' && (
                  <div className="space-y-4">
                    {/* v9: online room format — 1v1 · 2v2 · 3v3 · 4v4 · 5v5 */}
                    <div>
                      <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" /> Room format
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {(['1v1', '2v2', '3v3', '4v4', '5v5'] as const).map(k => (
                          <button
                            key={k}
                            onClick={() => setRoomKind(k)}
                            className={`rounded-lg border p-2 text-center transition-colors tac-corner ${
                              roomKind === k
                                ? 'border-amber-500/70 bg-amber-500/[0.07]'
                                : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                            }`}
                          >
                            <div className={`font-tac-md text-[11px] ${roomKind === k ? 'text-white' : 'text-stone-300'}`}>
                              {k.toUpperCase()}
                            </div>
                            <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                              {k === '1v1' ? 'duel' : `${roomCapacity(k)} players`}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {roomKind === '1v1' ? (
                      <div>
                        <p className="font-tac-md text-stone-400 text-[11px] mb-2">FILLER BOTS (PER TEAM)</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[0, 1, 2, 3].map(n => (
                            <Chip key={n} active={fillBots === n} onClick={() => setFillBots(n)}>
                              {n === 0 ? 'PURE 1v1' : `${n} vs ${n}`}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setFillEmpty(f => !f)}
                        className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                          fillEmpty
                            ? 'border-amber-500/70 bg-amber-500/[0.07]'
                            : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                        }`}
                      >
                        <div>
                          <div className={`font-tac-md text-[11px] ${fillEmpty ? 'text-white' : 'text-stone-300'}`}>
                            FILL EMPTY SLOTS WITH BOTS
                          </div>
                          <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                            Missing operators at start are covered by AI — the 2v2 never plays unbalanced
                          </div>
                        </div>
                        <span className={`w-10 h-6 rounded-full border flex items-center px-0.5 transition-colors shrink-0 ${
                          fillEmpty ? 'bg-amber-500/80 border-amber-400' : 'bg-stone-800 border-stone-600'
                        }`}>
                          <span className={`w-[18px] h-[18px] rounded-full bg-stone-100 transition-transform ${fillEmpty ? 'translate-x-[16px]' : ''}`} />
                        </span>
                      </button>
                    )}
                    <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="BOT DIFFICULTY" />
                  </div>
                )}
                {mode === 'guest' && (
                  <div>
                    <label className="font-tac-md text-stone-400 text-[11px] mb-2 block">Room code</label>
                    <Input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      onKeyDown={e => { if (e.key === 'Enter' && code.length >= 4) launch('guest', code) }}
                      placeholder="E.G. K7M2P"
                      className="bg-stone-950/80 border-stone-600 text-white text-2xl h-14 font-bold tracking-[0.3em] text-center"
                    />
                    <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
                      P2P (WebRTC) connection through the public PeerJS signaling server,
                      with up to 3 automatic retries.
                    </p>
                  </div>
                )}

                {/* v10: escuadra activa (grupo de amigos) */}
                {mode !== 'guest' && (
                  <div className={`rounded-lg border p-3 flex items-center gap-3 tac-corner ${
                    squadMembers.length > 0
                      ? 'border-amber-500/50 bg-amber-500/[0.05]'
                      : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                  }`}>
                    <div className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 ${
                      squadMembers.length > 0 ? 'border-amber-700/50 bg-amber-950/40' : 'border-stone-700 bg-stone-900'
                    }`}>
                      <Users className={`w-5 h-5 ${squadMembers.length > 0 ? 'text-amber-300' : 'text-stone-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-tac-md text-[11px] ${squadMembers.length > 0 ? 'text-white' : 'text-stone-300'}`}>
                        {squadMembers.length > 0 ? `SQUAD "${squadName}" — deploying with you` : 'NO ACTIVE SQUAD'}
                      </div>
                      <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                        {squadMembers.length > 0
                          ? `${squadMembers.join(' · ')} join your side in every mode — Battle Royale stays SOLOS`
                          : 'Add friends and create groups in your profile (top right) to deploy together'}
                      </div>
                    </div>
                    <button
                      onClick={() => { getAudio().uiClick(); setProfileOpen(true) }}
                      className="font-tac-md text-[10px] tracking-widest rounded px-3 py-2 border border-stone-600 bg-stone-900 text-stone-300 hover:border-amber-500/60 hover:text-amber-200 transition-colors shrink-0"
                    >
                      MANAGE
                    </button>
                  </div>
                )}

                {/* deploy button */}
                <button
                  onClick={() => launch(mode, mode === 'guest' ? code : '')}
                  disabled={mode === 'guest' && code.length < 4}
                  className="group w-full h-14 rounded-md font-tac text-lg tracking-[0.28em] uppercase transition-all
                    bg-stone-100 text-stone-900 hover:bg-amber-200 active:scale-[0.99]
                    disabled:opacity-30 disabled:cursor-not-allowed
                    flex items-center justify-center gap-3"
                >
                  <Play className="w-5 h-5" />
                  {mode === 'solo' ? 'Start deployment' : mode === 'host' ? 'Create room' : 'Join room'}
                  <ChevronRight className="w-5 h-5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* right column: deployment summary */}
              <div className="border-t lg:border-t-0 lg:border-l border-stone-800/80 pt-5 lg:pt-0 lg:pl-6 space-y-4">
                <h3 className="font-tac-md text-stone-200 text-[11px] flex items-center gap-2">
                  <Map className="w-4 h-4 text-amber-300/80" /> Sector Meridian
                </h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    ['Terrain', '140×140 m city with ordered districts'],
                    ['Buildings', '3-floor hotel · 4-floor tower · market · warehouses'],
                    ['Interiors', '13 enterable buildings with stairways'],
                    ['Cover', 'Containers, sandbags, explosive barrels'],
                    ['Verticality', 'Ziplines, jump pads and rooftops'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 items-baseline">
                      <span className="font-tac-md text-stone-600 text-[10px] w-24 shrink-0">{k.toUpperCase()}</span>
                      <span className="text-stone-400">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-4">
                  <h4 className="font-tac-md text-amber-200/90 text-[10px] mb-2 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> What's new in v7
                  </h4>
                  <ul className="space-y-1.5">
                    {[
                      'Full English translation across the entire game',
                      'Rebuilt OPERATION ASHFALL campaign: long Halo-style cinematics with dialogue and live battle fronts, fewer guards',
                      'Redesigned HUD, circular rotating minimap with compass, and a reworked armory',
                      'Multi-kill banners now show ONLY for your own kills',
                      'Sharper damage feedback: blood bursts, hit glow, scaled hitmarkers',
                      'Faster loading: weapon models download on demand — only what the mode you play uses',
                    ].map(t => (
                      <li key={t} className="text-stone-400 text-[11px] leading-snug flex gap-2">
                        <span className="text-amber-400/70 mt-0.5">·</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {tab === 'story' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
              <div className="space-y-5">
                <div>
                  <label className="font-tac-md text-stone-400 text-[11px] mb-2 block">
                    Operator name
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder="Enter your callsign"
                    maxLength={16}
                    className="bg-stone-950/80 border-stone-600 text-white text-lg h-12 font-bold focus:border-amber-500/70 focus-visible:ring-amber-500/20"
                  />
                  {error && <p className="text-red-400 text-xs mt-2 font-bold">{error}</p>}
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4 tac-corner">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-md border border-amber-700/50 bg-amber-950/40 flex items-center justify-center shrink-0">
                      <Radio className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="font-tac text-white text-base tracking-[0.16em] uppercase">Operation Ashfall</h3>
                      <p className="font-tac-md text-stone-500 text-[10px] mt-0.5">
                        Single-player campaign · Serene Valley
                      </p>
                    </div>
                  </div>
                  <p className="text-stone-400 text-xs leading-relaxed mt-3">
                    A valley at dusk locked in by the ridge: a river with a stone bridge, a lake
                    with a pier, a village with a square, a ruined chapel and the walled military
                    complex to the north. Six chapters with cinematic flyovers, radio dialogue,
                    live battle fronts, a rescue, a boss duel and a timed helicopter extraction.
                  </p>
                  <div className="flex flex-wrap gap-4 mt-3 font-tac-md text-[10px] text-stone-500">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-300/70" /> 25-35 min</span>
                    <span className="flex items-center gap-1.5"><Map className="w-3.5 h-3.5 text-amber-300/70" /> 140×140 valley</span>
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-300/70" /> 1 operator vs AI</span>
                  </div>
                </div>

                <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="MISSION DIFFICULTY" />

                <button
                  onClick={() => launch('solo', '', 'historia')}
                  className="group w-full h-14 rounded-md font-tac text-lg tracking-[0.28em] uppercase transition-all
                    bg-amber-400 text-stone-950 hover:bg-amber-300 active:scale-[0.99]
                    flex items-center justify-center gap-3"
                >
                  <Radio className="w-5 h-5" />
                  Begin operation
                  <ChevronRight className="w-5 h-5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* v9 — CO-OP ONLINE (hasta 5, SIN bots de relleno) */}
                <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/[0.08] p-4 space-y-3.5 tac-corner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md border border-emerald-700/50 bg-emerald-950/40 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <h4 className="font-tac text-sm tracking-[0.16em] text-stone-100 uppercase">Co-op squad · online</h4>
                      <p className="font-tac-md text-stone-500 text-[10px] mt-0.5">
                        Up to 5 operators · empty slots are NEVER filled with bots
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => launch('host', '', 'historia', 'coop')}
                    className="w-full py-3 rounded-md font-tac text-sm tracking-[0.22em] uppercase transition-all
                      bg-emerald-500/90 text-stone-950 hover:bg-emerald-400 active:scale-[0.99]
                      flex items-center justify-center gap-2.5"
                  >
                    <Users className="w-4 h-4" /> Create co-op squad
                  </button>
                  <div className="flex gap-2">
                    <Input
                      value={coopCode}
                      onChange={e => setCoopCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      onKeyDown={e => { if (e.key === 'Enter' && coopCode.length >= 4) launch('guest', coopCode, 'historia', 'coop') }}
                      placeholder="SQUAD CODE"
                      className="bg-stone-950/80 border-stone-600 text-white text-lg h-11 font-bold tracking-[0.25em] text-center"
                    />
                    <button
                      onClick={() => launch('guest', coopCode, 'historia', 'coop')}
                      disabled={coopCode.length < 4}
                      className="px-5 rounded-md font-tac text-xs tracking-[0.2em] uppercase bg-stone-100 text-stone-900 hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>

              {/* chapters */}
              <div className="border-t lg:border-t-0 lg:border-l border-stone-800/80 pt-5 lg:pt-0 lg:pl-6 space-y-2.5">
                <h3 className="font-tac-md text-stone-200 text-[11px] mb-2">
                  Mission structure
                </h3>
                {[
                  { n: '01', title: 'First Light', desc: 'Cross the ridge, ford the river and recover 3 intel caches: the mill, the chapel and the watchtower.', icon: Eye },
                  { n: '02', title: 'Hold the Line', desc: 'Defend the village uplink for 4 minutes while Red drains their defense grid.', icon: Shield },
                  { n: '03', title: 'Cut the Tower', desc: 'Plant charges on the 3 antennas (ALPHA · BRAVO · CHARLIE) and get clear of the blast.', icon: Bomb },
                  { n: '04', title: 'The Prisoner', desc: 'Open Sergeant Rivera\u2019s cell holding E and survive the alarm while he escapes.', icon: Heart },
                  { n: '05', title: 'The Commander', desc: 'Eliminate Col. Vega — armored and waiting in the heart of the complex.', icon: Crosshair },
                  { n: '06', title: 'Exfil', desc: 'Sprint to the north helipad against the clock before the helicopter leaves.', icon: Plane },
                ].map(c => (
                  <div key={c.n} className="flex gap-3.5 bg-stone-950/60 border border-stone-800 rounded-md p-3.5 tac-corner">
                    <div className="shrink-0 w-9 h-9 rounded border border-stone-700 bg-stone-900 flex items-center justify-center">
                      <c.icon className="w-4 h-4 text-amber-300/80" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-tac-md text-[10px] text-stone-600">{c.n}</span>
                        <span className="font-tac-md text-stone-200 text-[12px] uppercase">{c.title}</span>
                      </div>
                      <p className="text-stone-500 text-[11px] leading-snug mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                ))}
                <p className="text-stone-600 text-[10px] leading-relaxed pt-1">
                  If you fall, the current chapter restarts from its checkpoint — your
                  inventory is kept. Mission weapons are delivered as you go.
                </p>
              </div>
            </div>
          )}

          {tab === 'br' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
              {/* left: what BR is + play */}
              <div className="space-y-5">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-4 tac-corner">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-md border border-amber-700/50 bg-amber-950/40 flex items-center justify-center shrink-0">
                      <Rocket className="w-6 h-6 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="font-tac text-white text-lg tracking-[0.14em] uppercase">Battle Royale</h3>
                      <p className="font-tac-md text-stone-500 text-[10px] mt-0.5">
                        20 operators · last one standing · NEW standalone mode
                      </p>
                    </div>
                  </div>
                  <p className="text-stone-400 text-xs leading-relaxed mt-3">
                    Drop from a plane onto an island twice the size of Meridian City: cities,
                    mountains and lakes, drivable vehicles, weapon loot and supply crates.
                    A progressive storm closes in — outlive 19 rivals and become the
                    <b className="text-amber-200"> LAST OPERATOR STANDING</b>.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 font-tac-md text-[10px] text-stone-500">
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-300/70" /> 20 players (bots fill)</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-300/70" /> 60 s matchmaking</span>
                    <span className="flex items-center gap-1.5"><Map className="w-3.5 h-3.5 text-amber-300/70" /> 280×280 m island</span>
                    <span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5 text-amber-300/70" /> Storm damage</span>
                  </div>
                </div>

                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-4">
                  <h4 className="font-tac-md text-amber-200/90 text-[10px] mb-2.5 flex items-center gap-2">
                    <Plane className="w-3.5 h-3.5" /> How a match flows
                  </h4>
                  <ol className="space-y-2 text-stone-400 text-xs leading-relaxed">
                    <li className="flex gap-2.5"><span className="font-tac-md text-amber-400/80 shrink-0">01</span> Matchmaking on the lobby island — the countdown starts once 4 players are connected.</li>
                    <li className="flex gap-2.5"><span className="font-tac-md text-amber-400/80 shrink-0">02</span> Board the plane, pick your drop with <kbd className="bg-stone-800 px-1.5 rounded text-[10px]">SPACE</kbd> and glide down.</li>
                    <li className="flex gap-2.5"><span className="font-tac-md text-amber-400/80 shrink-0">03</span> Loot weapons, drive vehicles, fight inside the shrinking storm circle — press <kbd className="bg-stone-800 px-1.5 rounded text-[10px]">T</kbd> to chat.</li>
                    <li className="flex gap-2.5"><span className="font-tac-md text-amber-400/80 shrink-0">04</span> Survive everyone — the storm does not forgive. #1 or nothing.</li>
                  </ol>
                </div>

                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-4 space-y-2.5">
                  <h4 className="font-tac-md text-amber-200/90 text-[10px] mb-1 flex items-center gap-2">
                    <Swords className="w-3.5 h-3.5" /> Same arsenal, Fortnite rarities
                  </h4>
                  <p className="text-stone-400 text-[11px] leading-relaxed">
                    Every weapon from the normal modes spawns as loot — P9, MP-9, Breacher-12, AR-47,
                    CR-4, Eagle .50 and the FR-338 — each rolling a rarity tier:
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BR_RARITIES.map(r => (
                      <div key={r.id} className="text-center rounded border py-1.5" style={{ borderColor: `${r.css}66`, background: `${r.css}14` }}>
                        <div className="font-tac-md text-[8px] tracking-wider" style={{ color: r.css }}>{r.label}</div>
                        <div className="font-tac text-[11px] text-stone-200 tabular-nums">{Math.round(r.dmgMult * 100)}%</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-stone-500 text-[10px] leading-relaxed">
                    Supply crates always drop RARE or better. Higher tiers hit harder and burn brighter —
                    chase the golden beams.
                  </p>
                </div>

                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-3.5 flex gap-3">
                  <Gauge className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" />
                  <p className="text-stone-400 text-[11px] leading-relaxed">
                    <b className="text-stone-200">Isolated module, full graphics:</b> Battle Royale loads only
                    while you play it — and now honors every graphics profile up to
                    <b className="text-amber-200"> HIGH and ULTRA</b>: sharper resolution, 4K shadows,
                    richer dusk sky with sun and drifting clouds.
                  </p>
                </div>

                <button
                  onClick={() => {
                    getAudio().uiClick()
                    brSet({
                      active: true,
                      phase: 'queue',
                      queuePlayers: [],
                      countdown: 0,
                      countdownActive: false,
                      alive: 0,
                      kills: 0,
                      placement: 0,
                      hp: 100,
                      qualityNote: '',
                      loadingMap: true,
                      weaponRarity: -1,
                    })
                  }}
                  className="group w-full h-14 rounded-md font-tac text-lg tracking-[0.28em] uppercase transition-all
                    bg-amber-400 text-stone-950 hover:bg-amber-300 active:scale-[0.99]
                    flex items-center justify-center gap-3"
                >
                  <Rocket className="w-5 h-5" />
                  Find match
                  <ChevronRight className="w-5 h-5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* right: player's BR record */}
              <div className="border-t lg:border-t-0 lg:border-l border-stone-800/80 pt-5 lg:pt-0 lg:pl-6 space-y-4">
                <h3 className="font-tac-md text-stone-200 text-[11px] mb-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-300/80" /> Your BR record
                </h3>
                <BrRecordGrid />
                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-4 space-y-2">
                  <h4 className="font-tac-md text-amber-200/90 text-[10px] mb-1">Drop zones</h4>
                  {[ 
                    ['RIVERSIDE', 'SW city · rooftops, markets, garages'],
                    ['NORTHGATE', 'NE industrial docks and warehouses'],
                    ['SERENE LAKE', 'center lakeside loot and cabins'],
                    ['THE RIDGE', 'mountain compounds — long sightlines'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 items-baseline">
                      <span className="font-tac-md text-stone-600 text-[10px] w-24 shrink-0">{k}</span>
                      <span className="text-stone-400 text-[11px]">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-stone-600 text-[10px] leading-relaxed">
                  Vehicles spawn near the cities — press <kbd className="bg-stone-800 px-1.5 py-0.5 rounded text-[10px]">E</kbd> to
                  drive. Supply crates glow amber. The red wall is the storm: crossing it hurts more every phase.
                </p>
              </div>
            </div>
          )}

          {tab === 'controls' && (
            <div className="p-5 sm:p-7">
              <h3 className="font-tac-md text-stone-200 text-[11px] mb-4 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-amber-300/80" /> Key bindings
              </h3>
              <KeybindsPanel />
            </div>
          )}

          {tab === 'settings' && (
            <div className="p-5 sm:p-7">
              <h3 className="font-tac-md text-stone-200 text-[11px] mb-5 flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-300/80" /> Game settings
              </h3>
              <SettingsPanel />
            </div>
          )}

          {tab === 'info' && (
            <div className="p-5 sm:p-7">
              <h3 className="font-tac-md text-stone-200 text-[11px] mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-300/80" /> About the game
              </h3>
              <InfoPanel />
            </div>
          )}
        </div>

        <p className="font-tac-md text-stone-700 text-[10px] mt-6 tracking-[0.25em]">
          Emergency Strike v7 · Three.js + WebRTC (PeerJS) · 5 modes · Meridian City 140×140 · Serene Valley 140×140
        </p>
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md py-2.5 font-tac-md text-[11px] border uppercase transition-colors ${
        active
          ? 'bg-amber-500/15 border-amber-400/70 text-amber-200'
          : 'bg-stone-900/60 border-stone-700 text-stone-400 hover:text-stone-200'
      }`}
    >
      {children}
    </button>
  )
}

/** v9: récord de Battle Royale del perfil (pestaña BR) */
function BrRecordGrid() {
  const user = useAuth(s => s.user)
  const p = getProfile()
  if (!user) return null
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <StatCell icon={<Rocket className="w-3.5 h-3.5" />} label="BR MATCHES" value={String(p.brPlays)} />
      <StatCell icon={<Crown className="w-3.5 h-3.5" />} label="BR VICTORIES" value={String(p.brWins)} />
      <StatCell icon={<Trophy className="w-3.5 h-3.5" />} label="BEST PLACEMENT" value={p.brTop > 0 ? `#${p.brTop}` : '—'} />
      <StatCell icon={<Skull className="w-3.5 h-3.5" />} label="BR ELIMINATIONS" value={String(p.brKills)} />
    </div>
  )
}

function DifficultyPicker({ difficulty, setDifficulty, label }: {
  difficulty: BotDifficulty
  setDifficulty: (d: BotDifficulty) => void
  label: string
}) {
  return (
    <div>
      <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
        <Bot className="w-3.5 h-3.5" /> {label}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(DIFFICULTY_LABELS) as BotDifficulty[]).map(d => (
          <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
            {DIFFICULTY_LABELS[d]}
          </Chip>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Connecting screen (contextual per mode, room code visible)
// 2v2 shows the LOBBY with 4 slots; the host starts the match
// (or it auto-starts when 4/4 fill up)
// ============================================================
function LobbySlotCard({ name, team, you, coop }: { name: string | null; team: 'A' | 'B'; you?: boolean; coop?: boolean }) {
  const amber = team === 'A'
  return (
    <div className={`rounded-md border px-3 py-2.5 flex items-center gap-2.5 ${
      name
        ? amber ? 'border-amber-500/50 bg-amber-500/[0.08]' : 'border-emerald-600/50 bg-emerald-600/[0.08]'
        : 'border-stone-800 bg-stone-950/60'
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${name ? (amber ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-stone-700'}`} />
      <div className="min-w-0">
        <div className={`font-tac-md text-xs truncate ${name ? 'text-stone-100' : 'text-stone-600'}`}>
          {name ?? 'FREE SLOT'}
          {you && <span className="font-tac-md text-amber-300/80 ml-1.5 text-[9px]">(YOU)</span>}
        </div>
        <div className={`font-tac-md text-[9px] ${coop ? 'text-amber-300/60' : amber ? 'text-amber-300/60' : 'text-emerald-300/60'}`}>
          {coop ? 'CO-OP SQUAD' : amber ? 'AMBER TEAM' : 'GREEN TEAM'}
        </div>
      </div>
    </div>
  )
}

export function ConnectingScreen() {
  const phase = useGame(s => s.phase)
  const mode = useGame(s => s.mode)
  const roomCode = useGame(s => s.roomCode)
  const netStatus = useGame(s => s.netStatus)
  const netError = useGame(s => s.netError)
  const roomKind = useGame(s => s.roomKind)
  const lobby = useGame(s => s.lobby)
  const gameMode = useGame(s => s.gameMode)
  const playerName = useGame(s => s.playerName)
  const [copied, setCopied] = useState(false)
  if (phase !== 'connecting') return null

  const showError = mode === 'guest' && netStatus === 'error'
  const copyCode = (): void => {
    try { void navigator.clipboard.writeText(roomCode) } catch { /* no permission */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // v9: lobby generalizado — 1v1..5v5 por equipos o CO-OP (5 en ÁMBAR)
  const isCoop = roomKind === 'coop'
  const inRoomLobby = roomKind !== '1v1' && netStatus === 'waiting' && lobby
  const roomPlayers = lobby?.players ?? []
  const capacity = roomCapacity(roomKind)
  const humans = roomPlayers.length
  // huecos a mostrar: en coop 5 (anfitrión + p2..p5, todos ÁMBAR);
  // en NvN, el anfitrión + huecos por equipo
  const slotIds = isCoop
    ? ['p1', 'p2', 'p3', 'p4', 'p5']
    : ['p1', ...teamSlotsFor(roomKind).map(s => s.id)]
  const slotTeam = (id: string): 'A' | 'B' => {
    if (isCoop) return 'A'
    if (id === 'p1') return 'A'
    return teamSlotsFor(roomKind).find(s => s.id === id)?.team ?? 'B'
  }
  const slotFor = (id: string) => {
    const p = roomPlayers.find(x => x.id === id)
    const team = slotTeam(id)
    return (
      <LobbySlotCard
        key={id}
        name={p?.name ?? null}
        team={team}
        you={p?.name === playerName}
        coop={isCoop}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-4" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <MenuBackdrop />
      {showError ? (
        <div className="relative text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-full border-2 border-red-500/60 flex items-center justify-center text-red-400 text-2xl font-bold">×</div>
          <p className="font-tac text-red-300 text-xl tracking-[0.25em] uppercase">Connection failed</p>
          <p className="text-stone-500 text-sm max-w-md">{netError || 'Unknown error'}</p>
          <Button
            onClick={() => useGame.getState().setPhase('menu')}
            className="h-12 px-8 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
          >
            Back to menu
          </Button>
        </div>
      ) : inRoomLobby ? (
        <div className="relative w-[min(560px,94vw)] space-y-5">
          <div className="text-center space-y-2">
            {mode === 'host' ? (
              <>
                <p className="font-tac text-white text-lg tracking-[0.25em] uppercase">
                  {isCoop ? 'Co-op squad room' : `Tactical ${roomKind.toUpperCase()} room`}
                </p>
                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-3 px-6 py-2.5 rounded-md border border-amber-500/50 bg-amber-500/[0.07] hover:bg-amber-500/[0.14] transition-colors group"
                  title="Copy code"
                >
                  <span className="font-tac text-amber-200 text-3xl tracking-[0.3em]">{roomCode}</span>
                  {copied
                    ? <Check className="w-5 h-5 text-emerald-400" />
                    : <Copy className="w-5 h-5 text-stone-500 group-hover:text-amber-300" />}
                </button>
              </>
            ) : (
              <>
                <p className="font-tac text-white text-lg tracking-[0.25em] uppercase">
                  {isCoop ? 'Inside the co-op squad' : `Inside the ${roomKind.toUpperCase()} room`}
                </p>
                <p className="font-tac text-amber-200 text-2xl tracking-[0.3em]">{roomCode}</p>
              </>
            )}
            <p className="font-tac-md text-stone-500 text-[11px]">
              {isCoop
                ? `OPERATORS ${humans}/${capacity} — empty slots are NEVER filled with bots`
                : `OPERATORS ${humans}/${capacity} — free slots will be filled with bots${mode === 'host' ? ' at start' : ''}`}
            </p>
          </div>

          <div className={`grid gap-2.5 ${isCoop ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
            {slotIds.map(id => slotFor(id))}
          </div>

          {mode === 'host' ? (
            <button
              onClick={() => getGame()?.net.startTeamMatch()}
              className="group w-full py-3.5 rounded-md font-tac text-base tracking-[0.28em] uppercase transition-all
                bg-stone-100 text-stone-900 hover:bg-amber-200 active:scale-[0.99]
                flex items-center justify-center gap-3"
            >
              <Play className="w-5 h-5" />
              {isCoop
                ? (humans >= 5 ? 'Start co-op operation' : `Start co-op (${humans}/${capacity}) — no bots`)
                : (humans >= capacity ? `Start ${roomKind.toUpperCase()} match` : `Start ${roomKind.toUpperCase()} (${humans}/${capacity}) with bots`)}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-3 text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p className="text-sm">Waiting for the host to start the match…</p>
            </div>
          )}
          <p className="text-stone-600 text-[10px] text-center leading-relaxed">
            {isCoop
              ? (mode === 'host'
                  ? 'Share the code: up to 4 more operators join the CAMPAIGN as a squad. Slots that stay empty stay EMPTY.'
                  : 'AMBER = the whole squad. The host runs the mission.')
              : (mode === 'host'
                  ? `Share the code: up to ${capacity - 1} more operators. The room auto-starts when full.`
                  : gameMode === 'historia' ? 'AMBER = you and the host.' : 'AMBER = you and the host · GREEN = the rival team.')}
          </p>
        </div>
      ) : (
        <div className="relative text-center space-y-6">
          {mode === 'host' ? (
            <>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <div>
                <p className="font-tac text-white text-xl tracking-[0.25em] uppercase">Tactical room created</p>
                <button
                  onClick={copyCode}
                  className="mt-4 inline-flex items-center gap-3 px-6 py-3 rounded-md border border-amber-500/50 bg-amber-500/[0.07] hover:bg-amber-500/[0.14] transition-colors group"
                  title="Copy code"
                >
                  <span className="font-tac text-amber-200 text-3xl tracking-[0.3em]">{roomCode}</span>
                  {copied
                    ? <Check className="w-5 h-5 text-emerald-400" />
                    : <Copy className="w-5 h-5 text-stone-500 group-hover:text-amber-300" />}
                </button>
                <p className="text-stone-500 text-xs mt-4 leading-relaxed max-w-sm mx-auto">
                  Share the code with your rival. When they join, they enter the opposite
                  team. Meanwhile the match runs against filler bots.
                </p>
              </div>
            </>
          ) : mode === 'guest' ? (
            <>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <div>
                <p className="font-tac text-white text-xl tracking-[0.25em] uppercase">Joining room</p>
                <p className="font-tac text-amber-200 text-3xl tracking-[0.3em] mt-3">{roomCode}</p>
                <p className="text-stone-500 text-xs mt-3">Establishing the P2P link with the host…</p>
              </div>
            </>
          ) : (
            <div>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <p className="font-tac text-white text-xl tracking-[0.25em] uppercase mt-4">
                {useGame.getState().gameMode === 'historia' ? 'Starting operation' : 'Establishing tactical link'}
              </p>
              <p className="text-stone-500 text-xs mt-2">
                {useGame.getState().gameMode === 'historia'
                  ? 'Deploying into the valley…'
                  : 'Deploying AI operators across the map…'}
              </p>
            </div>
          )}
          <div className="font-tac-md text-stone-700 text-[10px] tracking-[0.3em] uppercase">Emergency Strike · v7</div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Pause menu
// ============================================================
type PauseTab = 'controls' | 'settings' | 'info'

export function PauseMenu() {
  const phase = useGame(s => s.phase)
  const [tab, setTab] = useState<PauseTab>('controls')
  if (phase !== 'paused') return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <div className="w-[min(880px,94vw)] max-h-[92vh] overflow-y-auto bg-[#0b0e11]/97 border border-stone-800 shadow-2xl rounded-xl">
        <div className="px-5 sm:px-7 pt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-tac text-2xl tracking-[0.2em] text-white uppercase">
            Game <span className="text-amber-300">paused</span>
          </h2>
          <Button
            onClick={() => getGame()?.requestLock()}
            className="h-11 px-6 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
          >
            <Play className="w-4 h-4 mr-2" /> Resume
          </Button>
        </div>

        <div className="px-5 sm:px-7 pt-4 flex gap-1 border-b border-stone-800">
          <TabButton icon={Keyboard} label="Controls" active={tab === 'controls'} onClick={() => setTab('controls')} />
          <TabButton icon={Settings} label="Settings" active={tab === 'settings'} onClick={() => setTab('settings')} />
          <TabButton icon={Info} label="Info" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'controls' && <KeybindsPanel />}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'info' && <InfoPanel />}
        </div>

        <div className="px-5 sm:px-7 pb-6 border-t border-stone-800 pt-4">
          <Button
            variant="destructive"
            className="w-full h-11 font-bold tracking-widest uppercase"
            onClick={() => {
              getGame()?.dispose()
              useGame.getState().setPhase('menu')
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Leave match
          </Button>
        </div>
      </div>
    </div>
  )
}
