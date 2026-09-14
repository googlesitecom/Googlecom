'use client'

// ============================================================
// EMERGENCY STRIKE — Main menu (v7)
// Full-bleed combat artwork background (img/menu.jpg) with a
// tactical dark grade, Rajdhani typography, refined tabs and
// detailed deploy/story panels. All copy in English.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { getAudio } from '@/game/audio'
import { ASSET_BASE, GAME } from '@/game/shared'
import { useAuth, getProfile, fmtKD, myOid, MODE_STAT_KEYS, MODE_STAT_LABELS, getModeStats, type CareerProfile } from '@/game/auth'
import { esNet, useNet, useFriends, useParty, useNetToasts, useRooms, type FriendEntryUI, type PartyMemberUI } from '@/game/esnet'
import { useVoice, voiceChat } from '@/game/voice'
import { teamSlotsFor, roomCapacity, type RoomKind } from '@/game/net'
import { LobbyStage, type LobbyChar } from '@/components/game/lobby-stage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Users, Link2, Bot,
  Heart, Plane,
  Keyboard, Info, RotateCcw, Home, TreePine, Video, Wind, Flag, Target, Radio,
  Map, Clock, ChevronRight, Copy, Check, Music2, Footprints, Package,
  User, UserPlus, UserMinus, Trash2, Skull, Medal, Crown, Activity, Rocket, X, Wifi, WifiOff, Mic,
  ChevronUp,
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
const COMBAT: ActionId[] = ['shoot', 'aim', 'reload', 'grenadeFrag', 'grenadeSmoke', 'flare', 'stim', 'buy', 'lastWeapon', 'slot1', 'slot2', 'slot3', 'voice']

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
          Music plays in the menu and ducks during combat — v12: <b className="text-stone-300">two tracks
          alternate</b> (Musica → Musica2 → back again). Gunshots use the repository MP3s
          (Pistol · SMG · Rifle · Sniper). Settings save automatically.
        </p>

        {/* v12 — VOICE CHAT (proximity, real operators only) */}
        <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-tac-md text-amber-200/90 text-[11px] flex items-center gap-2">
              <Mic className="w-4 h-4" /> Voice chat · proximity
            </h4>
            <button
              onClick={() => {
                const v = useVoice.getState()
                v.set({ enabled: !v.enabled })
                if (v.enabled && v.mic === 'ready') voiceChat.disable()
              }}
              className={`rounded px-3 py-1.5 font-tac-md text-[10px] border transition-colors ${
                useVoice.getState().enabled
                  ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                  : 'bg-stone-900/60 border-stone-700 text-stone-400'
              }`}
            >
              {useVoice.getState().enabled ? 'ENABLED' : 'MUTED'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['ptt', 'open'] as const).map(m => (
              <button
                key={m}
                onClick={() => useVoice.getState().set({ mode: m })}
                className={`rounded-md py-2 font-tac-md text-[10px] border uppercase tracking-widest transition-colors ${
                  useVoice.getState().mode === m
                    ? 'bg-amber-500/15 border-amber-400/70 text-amber-200'
                    : 'bg-stone-900/60 border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                {m === 'ptt' ? 'PUSH TO TALK [V]' : 'OPEN MIC'}
              </button>
            ))}
          </div>
          <SliderRow
            icon={<Volume2 className="w-4 h-4" />}
            label="VOICE VOLUME"
            value={useVoice.getState().volume} min={0} max={1} step={0.05}
            format={v => `${Math.round(v * 100)}%`}
            onChange={v => voiceChat.setVolume(v)}
          />
          <p className="text-stone-600 text-[10px] leading-relaxed">
            Proximity voice between <b className="text-stone-300">REAL online operators</b> in team matches and
            co-op: hold <b className="text-stone-300">[V]</b> to talk (or switch to open mic). Voices fade with
            distance and pan left/right around you — silent past 26 m. Bots never speak.
          </p>
        </div>
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
  if (p.wins >= 30 || p.storyWins >= 3) return { label: 'LEGEND', color: '#fbbf24' }
  if (p.wins >= 15 || p.storyWins >= 1) return { label: 'VETERAN', color: '#f59e0b' }
  if (p.wins >= 5) return { label: 'OPERATOR', color: '#d99a2b' }
  if (p.matches >= 3) return { label: 'SOLDIER', color: '#a8a29e' }
  return { label: 'RECRUIT', color: '#78716c' }
}

function UserWidget({ onOpen }: { onOpen: () => void }) {
  const user = useAuth(s => s.user)
  const netStatus = useNet(s => s.status)
  const partyName = useParty(s => s.name)
  const partyActive = useParty(s => s.active)
  const partyMembers = useParty(s => s.members)
  if (!user) return null
  const p = getProfile()
  const rank = rankOf(p)
  const initials = user.slice(0, 2).toUpperCase()
  return (
    <button
      onClick={onOpen}
      className="relative flex items-center gap-3 bg-[#0b0e11]/92 border border-stone-700/70 rounded-lg pl-2 pr-4 py-2 shadow-xl hover:border-amber-500/60 transition-colors tac-corner group"
      title="Career profile · real friends & squad"
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
        <span className="font-tac-md text-[9px] block truncate max-w-[130px]">
          <span className={netStatus === 'online' ? 'text-emerald-400' : 'text-stone-600'}>
            {netStatus === 'online' ? '●' : '○'} NET {netStatus === 'online' ? 'ON' : netStatus === 'connecting' ? '…' : 'OFF'}
          </span>
          {partyActive && partyMembers.length > 0 && (
            <span className="text-amber-300/80"> · SQUAD {partyMembers.length}</span>
          )}
        </span>
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
// v11 — REAL SQUAD: friends with request/acceptance + parties
// Real cross-account networking (esnet): you add an operator by
// their 6-char OPERATOR ID (or exact name if online), they get a
// request and ACCEPT or decline. Accepted friends show live
// online status, you build a squad and deploy together — Battle
// Royale is ALWAYS solos.
// ============================================================
function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        try { navigator.clipboard?.writeText(value) } catch { /* older browsers */ }
        setDone(true)
        getAudio().uiClick()
        setTimeout(() => setDone(false), 1600)
      }}
      className="font-tac-md text-[10px] tracking-widest rounded px-2.5 py-1.5 border border-stone-600 bg-stone-900 text-stone-300 hover:border-amber-500/60 hover:text-amber-200 transition-colors shrink-0 flex items-center gap-1.5"
      title={`Copy ${label ?? 'code'}`}
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {done ? 'COPIED' : label ?? 'COPY'}
    </button>
  )
}

function SquadSection(): React.ReactElement | null {
  const user = useAuth(s => s.user)
  const netStatus = useNet(s => s.status)
  const friends = useFriends(s => s.friends)
  const incoming = useFriends(s => s.incoming)
  const outgoing = useFriends(s => s.outgoing)
  const partyActive = useParty(s => s.active)
  const partyName = useParty(s => s.name)
  const partyLeader = useParty(s => s.leaderOid)
  const partyMembers = useParty(s => s.members)
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [partyInput, setPartyInput] = useState('')
  const [partyErr, setPartyErr] = useState('')
  if (!user) return null
  const oid = myOid()
  const online = netStatus === 'online'
  const isLeader = partyActive && partyLeader === oid

  const doAdd = (): void => {
    const clean = input.trim()
    if (!clean) return
    esNet.requestFriend(clean).then(r => {
      if (!r.ok) { setErr(r.error ?? ''); return }
      setErr('')
      setInput('')
      getAudio().uiClick()
    })
  }

  const doInvite = (f: FriendEntryUI): void => {
    if (!partyActive) {
      const r = esNet.createParty(partyInput.trim() || `${user}'s squad`)
      if (!r.ok) { setPartyErr(r.error ?? ''); return }
    }
    esNet.inviteToParty(f.oid, partyName || `${user}'s squad`)
    setPartyInput('')
    setPartyErr('')
    getAudio().uiClick()
  }

  const doCreateParty = (): void => {
    const r = esNet.createParty(partyInput.trim() || `${user}'s squad`)
    if (!r.ok) { setPartyErr(r.error ?? ''); return }
    setPartyErr('')
    setPartyInput('')
    getAudio().uiClick()
  }

  return (
    <div className="mt-5 border-t border-stone-800 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-tac text-amber-200/90 text-[11px] flex items-center gap-2">
          <Users className="w-4 h-4" /> SQUAD · REAL FRIENDS
        </h4>
        <span className={`font-tac-md text-[9px] flex items-center gap-1.5 ${online ? 'text-emerald-400' : 'text-stone-600'}`}>
          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {online ? 'ONLINE' : netStatus === 'connecting' ? 'CONNECTING…' : 'OFFLINE'}
        </span>
      </div>

      {/* my operator code — this is what friends add */}
      <div className="bg-stone-900/60 border border-stone-800 rounded-md p-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-tac-md text-stone-500 text-[9px] tracking-widest mb-1">YOUR OPERATOR ID — SHARE IT</p>
          <p className="font-tac text-xl text-amber-200 tracking-[0.32em] tabular-nums">{oid || '——————'}</p>
        </div>
        {oid && <CopyBtn value={oid} label="COPY ID" />}
      </div>

      {/* add friend */}
      <div>
        <div className="flex gap-2 mb-2">
          <Input
            value={input}
            onChange={e => { setInput(e.target.value); setErr('') }}
            onKeyDown={e => { if (e.key === 'Enter') doAdd() }}
            placeholder="Friend's Operator ID (e.g. K7X2M9) or name"
            maxLength={24}
            className="bg-stone-950/80 border-stone-600 text-white h-9 text-sm"
          />
          <Button
            onClick={doAdd}
            disabled={!online || !input.trim()}
            className="h-9 px-4 bg-stone-100 text-stone-900 hover:bg-amber-200 font-bold text-xs shrink-0 disabled:opacity-30"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" /> ADD
          </Button>
        </div>
        {err && <p className="text-red-400 text-[11px] mb-1.5 font-bold">{err}</p>}
        {!online && (
          <p className="text-stone-600 text-[10px] leading-relaxed">
            The social service connects automatically while you are in the menu — it uses public
            real-time brokers. If it says OFFLINE, just wait a couple of seconds.
          </p>
        )}
      </div>

      {/* incoming requests — THEY have to be accepted */}
      {incoming.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-md p-3 space-y-2">
          <p className="font-tac-md text-amber-200/90 text-[10px] uppercase tracking-widest">
            Friend requests ({incoming.length}) — waiting for YOUR acceptance
          </p>
          {incoming.map(r => (
            <div key={r.oid} className="flex items-center gap-2 bg-stone-950/70 border border-stone-700 rounded px-2.5 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="font-tac-md text-[11px] text-stone-200 flex-1 truncate">{r.name}</span>
              <span className="font-tac-md text-[9px] text-stone-600">{r.oid}</span>
              <button
                onClick={() => { esNet.acceptFriend(r.oid); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-2.5 py-1 border bg-emerald-500/80 border-emerald-400 text-stone-950 font-bold hover:bg-emerald-400"
              >
                ACCEPT
              </button>
              <button
                onClick={() => { esNet.rejectFriend(r.oid); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-2.5 py-1 border border-stone-600 bg-stone-900 text-stone-300 hover:border-red-500/60 hover:text-red-300"
              >
                DECLINE
              </button>
            </div>
          ))}
        </div>
      )}

      {/* outgoing pending */}
      {outgoing.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-tac-md text-stone-500 text-[9px] uppercase tracking-widest">Sent — pending their acceptance</p>
          {outgoing.map(r => (
            <div key={r.oid} className="flex items-center gap-2 bg-stone-900/70 border border-stone-800 rounded px-2.5 py-1.5">
              <Loader2 className="w-3 h-3 text-stone-500 animate-spin" />
              <span className="font-tac-md text-[11px] text-stone-300 flex-1 truncate">{r.name}</span>
              <span className="font-tac-md text-[9px] text-stone-600">{r.oid}</span>
              <button
                onClick={() => { esNet.cancelRequest(r.oid); getAudio().uiClick() }}
                className="text-stone-600 hover:text-red-300 transition-colors p-0.5"
                title="Cancel request"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* friends — with LIVE presence */}
      <div>
        <p className="font-tac-md text-stone-500 text-[9px] uppercase tracking-widest mb-2">
          Friends ({friends.length})
        </p>
        {friends.length === 0 && (
          <p className="text-stone-600 text-[11px] leading-relaxed">
            No friends yet. Share your Operator ID, or add theirs — the request arrives on
            their screen and they must <b className="text-stone-400">accept</b> it.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-1.5">
          {friends.map(f => (
            <div key={f.oid} className="flex items-center gap-2 bg-stone-900/70 border border-stone-700 rounded pl-2.5 pr-1 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${f.online ? 'bg-emerald-400 animate-pulse' : 'bg-stone-600'}`} />
              <span className="font-tac-md text-[11px] text-stone-200 truncate flex-1">{f.name}</span>
              {isLeader && f.online && (
                <button
                  onClick={() => doInvite(f)}
                  className="font-tac-md text-[9px] rounded px-2 py-0.5 border border-amber-600/60 bg-amber-500/10 text-amber-200 hover:bg-amber-500/25"
                  title="Invite to squad"
                >
                  INVITE
                </button>
              )}
              <button
                onClick={() => { esNet.removeFriend(f.oid); getAudio().uiClick() }}
                className="text-stone-600 hover:text-red-300 transition-colors p-0.5"
                title="Remove friend"
              >
                <UserMinus className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* squad / party */}
      <div className="bg-stone-900/50 border border-stone-800 rounded-md p-3.5 space-y-2.5">
        {!partyActive ? (
          <>
            <p className="font-tac-md text-stone-400 text-[10px] uppercase tracking-widest">Create squad</p>
            <div className="flex gap-2">
              <Input
                value={partyInput}
                onChange={e => { setPartyInput(e.target.value); setPartyErr('') }}
                placeholder="Squad name (e.g. Night Owls)"
                maxLength={22}
                onKeyDown={e => { if (e.key === 'Enter') doCreateParty() }}
                className="bg-stone-950/80 border-stone-600 text-white h-9 text-sm"
              />
              <Button
                onClick={doCreateParty}
                disabled={!online}
                className="h-9 px-4 bg-emerald-500/90 text-stone-950 hover:bg-emerald-400 font-bold text-xs shrink-0 disabled:opacity-30"
              >
                CREATE
              </Button>
            </div>
            {partyErr && <p className="text-red-400 text-[11px] font-bold">{partyErr}</p>}
            <p className="text-stone-600 text-[10px] leading-relaxed">
              Invite online friends — they get a live invite and join. When you (leader) create an
              online room, the whole squad auto-joins it.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="font-tac-md text-[12px] text-stone-100 truncate">{partyName}</span>
                <span className="font-tac-md text-[9px] text-stone-600 shrink-0">{partyMembers.length}/5</span>
              </div>
              <button
                onClick={() => { esNet.leaveParty(); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-2.5 py-1 border border-stone-600 bg-stone-900 text-stone-300 hover:border-red-500/60 hover:text-red-200"
              >
                {isLeader ? 'DISBAND' : 'LEAVE'}
              </button>
            </div>
            <div className="space-y-1">
              {partyMembers.map((m: PartyMemberUI) => (
                <div key={m.u} className="flex items-center gap-2 bg-stone-950/70 border border-stone-800 rounded px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="font-tac-md text-[11px] text-stone-200 flex-1 truncate">{m.n}</span>
                  {m.leader ? <Crown className="w-3 h-3 text-amber-300" /> : null}
                  {m.u === oid && <span className="text-amber-300/70 text-[9px] font-tac-md">(YOU)</span>}
                </div>
              ))}
            </div>
            <p className="text-stone-600 text-[10px] leading-relaxed">
              {isLeader
                ? 'Create a room in the DEPLOY tab — your squad auto-joins with the code. Battle Royale is ALWAYS solos.'
                : 'Waiting for the leader to deploy… Battle Royale is ALWAYS solos.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}


function ProfileModal({ onClose }: { onClose: () => void }) {
  const user = useAuth(s => s.user)
  const logout = useAuth(s => s.logout)
  if (!user) return null
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
        <ProfileContent user={user} showLogout onLogout={() => { onClose(); logout() }} />
      </div>
    </div>
  )
}

// ============================================================
// v12 — CAREER PROFILE content (shared by the main-menu modal
// AND the pause menu's PROFILE tab): stat grid + PER-MODE
// breakdown (team combat, FFA, CTF, domination, campaign, BR)
// + friends/squad panel.
// ============================================================
export function ProfileContent({ user, showLogout, onLogout }: {
  user: string
  showLogout?: boolean
  onLogout?: () => void
}) {
  const p = getProfile()
  const rank = rankOf(p)
  const initials = user.slice(0, 2).toUpperCase()
  const time = p.timePlayed
  const hours = Math.floor(time / 3600)
  const mins = Math.floor((time % 3600) / 60)
  const fmtTime = (s: number): string => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  return (
    <div>
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
        <StatCell icon={<Medal className="w-3.5 h-3.5" />} label="CAMPAIGN WINS" value={String(p.storyWins)} />
      </div>

      {/* v12: per-mode stats — team combat, FFA, CTF, domination, campaign */}
      <div className="mt-5">
        <h4 className="font-tac-md text-amber-200/90 text-[11px] tracking-[0.22em] uppercase mb-2.5 flex items-center gap-2">
          <Swords className="w-4 h-4" /> Stats by game mode
        </h4>
        <div className="overflow-x-auto rounded-lg border border-stone-800">
          <table className="w-full text-left font-tac-md text-[11px]">
            <thead>
              <tr className="bg-stone-900/80 text-stone-500 text-[9px] tracking-[0.18em] uppercase">
                <th className="px-3 py-2">Mode</th>
                <th className="px-2 py-2 text-center">Played</th>
                <th className="px-2 py-2 text-center">W</th>
                <th className="px-2 py-2 text-center">K</th>
                <th className="px-2 py-2 text-center">D</th>
                <th className="px-2 py-2 text-center">HS</th>
                <th className="px-3 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {MODE_STAT_KEYS.map((k, i) => {
                const m = getModeStats(p, k)
                const fresh = m.plays > 0
                return (
                  <tr
                    key={k}
                    className={`${i % 2 ? 'bg-stone-950/60' : 'bg-stone-900/40'} ${fresh ? 'text-stone-200' : 'text-stone-600'}`}
                  >
                    <td className="px-3 py-2 tracking-[0.14em]">{MODE_STAT_LABELS[k]}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{m.plays}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-amber-200/90">{m.wins}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{m.kills}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{m.deaths}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{m.headshots}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-stone-500">{fmtTime(m.timePlayed)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
          Every mode feeds this table: team combat, free-for-all, CTF, domination, the campaign and
          Battle Royale — wins, kills, deaths, headshots and time per mode, saved on this device.
        </p>
      </div>

      {/* v10: amigos + grupos (despliegue en escuadra) */}
      <SquadSection />

      {showLogout && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-800 pt-4">
          <p className="text-stone-600 text-[10px] leading-relaxed max-w-[300px]">
            Stats persist on this device and are recorded after every match — PvP,
            campaign and Battle Royale.
          </p>
          <Button
            variant="secondary"
            className="h-9 font-tac-md text-[11px] bg-stone-800 border border-stone-600 hover:bg-red-950/60 hover:border-red-800/70 hover:text-red-200"
            onClick={onLogout}
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> LOG OUT
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// v11 — NET TOASTS: friend requests + squad invites anywhere
// ============================================================
export function NetToasts() {
  const toasts = useNetToasts(s => s.toasts)
  const drop = useNetToasts(s => s.drop)
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[90] space-y-2 w-[min(320px,90vw)] pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-2xl backdrop-blur-md tac-corner ${
            t.kind === 'freq'
              ? 'bg-amber-950/90 border-amber-700/70'
              : t.kind === 'pinvite'
                ? 'bg-emerald-950/90 border-emerald-700/70'
                : t.kind === 'error'
                  ? 'bg-red-950/90 border-red-800/70'
                  : 'bg-stone-950/90 border-stone-700/70'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-tac text-[12px] tracking-[0.18em] text-amber-200 uppercase">{t.title}</p>
              {t.body && <p className="text-stone-300 text-[11px] mt-1 leading-snug">{t.body}</p>}
            </div>
            <button
              onClick={() => drop(t.id)}
              className="text-stone-500 hover:text-stone-200 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {t.kind === 'freq' && t.oid && (
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => { esNet.acceptFriend(t.oid!); drop(t.id); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-3 py-1.5 border bg-emerald-500/80 border-emerald-400 text-stone-950 font-bold hover:bg-emerald-400"
              >
                ACCEPT
              </button>
              <button
                onClick={() => { esNet.rejectFriend(t.oid!); drop(t.id); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-3 py-1.5 border border-stone-600 bg-stone-900 text-stone-300 hover:border-red-500/60 hover:text-red-300"
              >
                DECLINE
              </button>
            </div>
          )}
          {t.kind === 'pinvite' && t.gid && (
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => { esNet.joinParty(t.gid!, t.from); drop(t.id); getAudio().uiClick() }}
                className="font-tac-md text-[10px] rounded px-3 py-1.5 border bg-emerald-500/80 border-emerald-400 text-stone-950 font-bold hover:bg-emerald-400"
              >
                JOIN SQUAD
              </button>
              <button
                onClick={() => drop(t.id)}
                className="font-tac-md text-[10px] rounded px-3 py-1.5 border border-stone-600 bg-stone-900 text-stone-300 hover:border-red-500/60 hover:text-red-300"
              >
                NOT NOW
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Main menu — tactical tabs
// ============================================================
type MenuOverlay = 'controls' | 'settings' | 'info'
type PlaySource = 'bots' | 'room' | 'join' | 'quick'

// ============================================================
// v14 — FORTNITE-STYLE LOBBY
// Your operator in 3D with the username above, the squad standing
// beside you, a mode picker that drops UP from the bottom bar with
// every mode in the game, and one big PLAY / READY button that
// adapts to the squad (leader launches, members ready up).
// ============================================================
export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const authUser = useAuth(s => s.user)
  // ---- squad / network ----
  const partyActive = useParty(s => s.active)
  const partyName = useParty(s => s.name)
  const partyMembers = useParty(s => s.members)
  const partyLeaderOid = useParty(s => s.leaderOid)
  const partyReady = useParty(s => s.ready)
  const squadRoomCode = useParty(s => s.roomCode)
  const squadRoomKind = useParty(s => s.roomKind)
  const netStatus = useNet(s => s.status)
  const rooms = useRooms(s => s.rooms)

  // ---- menu state ----
  const [profileOpen, setProfileOpen] = useState(false)
  const [overlay, setOverlay] = useState<MenuOverlay | null>(null)
  const [modeOpen, setModeOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [gameMode, setGameMode] = useState<GameMode>('escaramuza')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [fillBots, setFillBots] = useState(0)
  const [roomKind, setRoomKind] = useState<RoomKind>('2v2')
  const [fillEmpty, setFillEmpty] = useState(true)
  const [code, setCode] = useState('')
  const [coop, setCoop] = useState(false)
  const [source, setSource] = useState<PlaySource>('bots')
  const [quickState, setQuickState] = useState<'' | 'scanning' | 'joining'>('')
  const quickIv = useRef<ReturnType<typeof setInterval> | null>(null)

  // v11: the squad leader opened a room → auto-join with the shared code
  useEffect(() => {
    if (!squadRoomCode || phase !== 'menu') return
    useParty.getState().clearRoom()
    const n = (name.trim() || authUser || 'Operator').slice(0, 16)
    setPlayerName(n)
    setHud({
      mode: 'guest',
      roomCode: squadRoomCode,
      botDifficulty: 'normal',
      fillBots: 0,
      gameMode: 'escaramuza',
      roomKind: (squadRoomKind as RoomKind) || '2v2',
      fillEmptyWithBots: true,
      lobby: null,
      netStatus: 'connecting',
      netError: '',
      story: {
        active: false, chapter: 0, chapterTitle: '', objective: '', progress: '', hint: '',
        timer: 0, dialogue: null, status: 'playing', stats: { time: 0, kills: 0 },
      },
    })
    useGame.getState().setPhase('connecting')
  }, [squadRoomCode, phase])

  // v14: live room browser while the mode picker is open
  useEffect(() => {
    if (modeOpen && esNet.status === 'online') esNet.roomsBrowse()
    return () => { esNet.roomsStopBrowse() }
  }, [modeOpen, netStatus])

  // v14: never leave a quick-match scan running
  useEffect(() => () => { if (quickIv.current) clearInterval(quickIv.current) }, [])

  // v14: ESC cierra el panel de modos / los overlays del lobby
  useEffect(() => {
    if (phase !== 'menu') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return
      if (modeOpen) { setModeOpen(false); getAudio().uiClick() }
      else if (overlay) setOverlay(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, modeOpen, overlay])

  if (phase !== 'menu') return null

  const oid = myOid()
  const effectiveName = name.trim() || authUser || ''
  const amLeader = !partyActive || (partyActive && partyLeaderOid === oid)
  const readyCount = partyMembers.filter(m => partyReady[m.u]).length
  const iAmReady = !!partyReady[oid]

  const launch = (m: 'solo' | 'host' | 'guest', roomCode = '', forceMode?: GameMode, forceKind?: RoomKind) => {
    const n = effectiveName.trim() || 'Operator'
    if (n.length < 2) { setError('Name must be at least 2 characters'); setModeOpen(true); return }
    setPlayerName(n)
    setError('')
    const kind = forceKind ?? (m === 'host' ? roomKind : '1v1')
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

  // v14: QUICK PLAY — scan the public rooms for a few seconds; join the
  // first one playing your selected mode, otherwise host a fresh room.
  const quickPlay = (): void => {
    if (esNet.status !== 'online') { launch('host'); return }
    setQuickState('scanning')
    esNet.roomsBrowse()
    const t0 = Date.now()
    if (quickIv.current) clearInterval(quickIv.current)
    quickIv.current = setInterval(() => {
      if (useGame.getState().phase !== 'menu') { clearInterval(quickIv.current!); quickIv.current = null; return }
      const live = useRooms.getState().rooms.filter(r => r.players < r.cap && r.mode === gameMode)
      if (live.length) {
        clearInterval(quickIv.current!); quickIv.current = null
        setQuickState('joining')
        launch('guest', live[0].code)
      } else if (Date.now() - t0 > 6000) {
        clearInterval(quickIv.current!); quickIv.current = null
        setQuickState('')
        launch('host')
      }
    }, 600)
  }

  const onPlay = (): void => {
    getAudio().uiClick()
    // squad member → READY toggle (the leader launches for everyone)
    if (partyActive && !amLeader) { esNet.setPartyReady(!iAmReady); return }
    if (gameMode === 'historia') {
      if (coop) launch('host', '', 'historia', 'coop')
      else launch('solo', '', 'historia')
      return
    }
    if (source === 'quick') { quickPlay(); return }
    launch(source === 'bots' ? 'solo' : source === 'room' ? 'host' : 'guest', source === 'join' ? code : '')
  }

  // ---- labels for the mode card / play button ----
  const modeInfo = MODES[gameMode]
  const sourceLabel = gameMode === 'historia'
    ? (coop ? 'CO-OP · ONLINE' : 'SOLO MISSION')
    : source === 'bots' ? 'OFFLINE · VS BOTS'
      : source === 'room' ? `ONLINE · ${roomKind.toUpperCase()}`
        : source === 'join' ? 'JOIN BY CODE'
          : 'QUICK MATCH · ONLINE'
  const playLabel = partyActive && !amLeader
    ? (iAmReady ? 'READY ✓' : 'READY')
    : quickState === 'scanning'
      ? 'SEARCHING…'
      : quickState === 'joining'
        ? 'JOINING…'
        : gameMode === 'historia'
          ? (coop ? 'CREATE CO-OP' : 'BEGIN OPERATION')
          : source === 'bots'
            ? 'PLAY'
            : source === 'room'
              ? 'CREATE ROOM'
              : source === 'join'
                ? 'JOIN ROOM'
                : 'QUICK PLAY'

  const lobbyChars: LobbyChar[] = [
    { id: 'me', name: effectiveName || 'Operator', leader: amLeader, you: true },
    ...partyMembers
      .filter(m => m.u !== oid)
      .map(m => ({ id: m.u, name: m.n, leader: m.leader, you: false })),
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <MenuBackdrop />

      {/* ============ TOP BAR: title (left) · tools + user (right) ============ */}
      <div className="absolute top-0 left-0 right-0 z-20 px-4 sm:px-6 py-4 flex items-start justify-between gap-3 pointer-events-none">
        <div className="select-none pointer-events-auto">
          <h1 className="font-tac text-3xl sm:text-[44px] tracking-[0.22em] text-stone-100 leading-none uppercase"
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
        <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
          {([
            { id: 'controls' as const, icon: Keyboard, label: 'CONTROLS' },
            { id: 'settings' as const, icon: Settings, label: 'SETTINGS' },
            { id: 'info' as const, icon: Info, label: 'INFO' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { getAudio().uiClick(); setOverlay(t.id) }}
              className="w-10 h-10 rounded-md border border-stone-700/70 bg-[#0b0e11]/85 flex items-center justify-center text-stone-400 hover:text-amber-200 hover:border-amber-500/60 transition-colors shadow-xl"
              title={t.label}
            >
              <t.icon className="w-4.5 h-4.5" />
            </button>
          ))}
          <UserWidget onOpen={() => setProfileOpen(true)} />
        </div>
      </div>

      {/* ============ CENTER: the 3D lobby stage ============ */}
      <div className="absolute inset-0 z-10">
        <LobbyStage chars={lobbyChars} />
      </div>

      {/* ============ LEFT: squad panel (adapts to the people) ============ */}
      <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-[228px] hidden md:block">
        {partyActive ? (
          <div className="rounded-lg border border-amber-700/40 bg-[#0b0e11]/88 backdrop-blur-md shadow-2xl overflow-hidden tac-corner">
            <div className="px-3.5 py-2.5 border-b border-stone-800/80 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-tac-md text-[10px] text-amber-300/90 tracking-[0.18em] truncate">SQUAD · {readyCount}/{partyMembers.length} READY</div>
                <div className="font-tac-md text-[9px] text-stone-600 truncate">{partyName || 'SQUAD'}</div>
              </div>
              <Users className="w-4 h-4 text-amber-400/70 shrink-0" />
            </div>
            <div className="p-2 space-y-1.5 max-h-[38vh] overflow-y-auto">
              {partyMembers.map(m => (
                <div key={m.u}
                  className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 ${
                    m.u === oid
                      ? 'border-amber-500/50 bg-amber-500/[0.07]'
                      : 'border-stone-800 bg-stone-950/60'
                  }`}>
                  <span className={`w-7 h-7 rounded border flex items-center justify-center font-tac text-[10px] shrink-0 ${
                    m.u === oid ? 'border-amber-600/50 bg-amber-950/40 text-amber-300' : 'border-stone-700 bg-stone-900 text-stone-400'
                  }`}>
                    {m.n.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-tac-md text-[11px] text-stone-200 truncate">
                      {m.n}
                      {m.u === oid && <span className="text-amber-300/80 text-[8px] ml-1">(YOU)</span>}
                    </div>
                    <div className="font-tac-md text-[8px] text-stone-600 tracking-widest">
                      {m.leader ? 'LEADER' : 'OPERATOR'} · {MODES[gameMode].short}
                    </div>
                  </div>
                  {partyReady[m.u] && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </div>
              ))}
              {partyMembers.length < 5 && (
                <button
                  onClick={() => { getAudio().uiClick(); setProfileOpen(true) }}
                  className="w-full flex items-center gap-2 rounded-md border border-dashed border-stone-700/80 bg-stone-950/40 px-2.5 py-2 text-stone-500 hover:text-amber-200 hover:border-amber-500/50 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="font-tac-md text-[10px] tracking-widest">INVITE OPERATOR</span>
                </button>
              )}
            </div>
            <button
              onClick={() => { getAudio().uiClick(); esNet.leaveParty() }}
              className="w-full font-tac-md text-[10px] tracking-widest px-3 py-2.5 text-stone-500 hover:text-red-300 border-t border-stone-800/80 transition-colors"
            >
              LEAVE SQUAD
            </button>
          </div>
        ) : (
          <button
            onClick={() => { getAudio().uiClick(); setProfileOpen(true) }}
            className="w-full rounded-lg border border-stone-700/70 bg-[#0b0e11]/88 backdrop-blur-md shadow-2xl p-4 text-left hover:border-amber-500/60 transition-colors tac-corner"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md border border-stone-700 bg-stone-900 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-stone-500" />
              </div>
              <div className="min-w-0">
                <div className="font-tac-md text-[11px] text-stone-200">PLAY WITH FRIENDS</div>
                <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                  Build a squad — they stand here and deploy with you
                </div>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ============ RIGHT: online status (quick glance) ============ */}
      <div className="absolute right-4 sm:right-6 top-24 z-20 hidden lg:flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="font-tac-md text-[9px] tracking-widest px-2.5 py-1.5 rounded border bg-[#0b0e11]/80 flex items-center gap-2"
          style={{ borderColor: netStatus === 'online' ? 'rgba(52,211,153,0.4)' : 'rgba(120,113,108,0.4)' }}>
          {netStatus === 'online' ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-stone-500" />}
          <span className={netStatus === 'online' ? 'text-emerald-300' : 'text-stone-500'}>
            {netStatus === 'online' ? `NETWORK · ${rooms.length} OPEN ROOM${rooms.length === 1 ? '' : 'S'}` : 'NETWORK OFFLINE'}
          </span>
        </div>
        {modeOpen && netStatus === 'online' && rooms.length > 0 && (
          <div className="font-tac-md text-[9px] text-stone-500 tracking-widest">
            LIVE ROOMS ON THE MODE PANEL ↓
          </div>
        )}
      </div>

      {/* ============ BOTTOM BAR: mode card + PLAY ============ */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 sm:px-6 pb-5 pt-16 bg-gradient-to-t from-[#050709]/95 via-[#050709]/55 to-transparent">
        <div className="max-w-6xl mx-auto flex items-end justify-between gap-3">
          {/* left: live strip (compact) */}
          <div className="hidden sm:flex items-center gap-2 select-none pb-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="font-tac-md text-[10px] text-stone-500">LIVE · WEBGL COMBAT SIMULATION</span>
          </div>
          <div className="flex-1" />

          {/* mode selector card — click to open the full picker (drops UP) */}
          <button
            onClick={() => { getAudio().uiClick(); setModeOpen(true) }}
            className="group w-[min(280px,44vw)] rounded-lg border border-stone-700/70 bg-[#0b0e11]/92 backdrop-blur-md shadow-2xl p-3.5 text-left hover:border-amber-500/70 transition-colors tac-corner"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-tac-md text-[9px] tracking-[0.22em] text-stone-500">SELECTED MODE</span>
              <ChevronUp className="w-4 h-4 text-amber-400/80 group-hover:text-amber-300 transition-colors" />
            </div>
            <div className="font-tac text-[15px] tracking-[0.12em] text-stone-100 uppercase truncate">
              {modeInfo.name}
            </div>
            <div className="font-tac-md text-[9px] text-amber-300/70 tracking-widest mt-0.5 truncate">
              {sourceLabel}
            </div>
          </button>

          {/* the big play / ready button */}
          <button
            onClick={onPlay}
            disabled={(source === 'join' && code.length < 4) || quickState !== ''}
            className={`group h-[64px] w-[min(220px,38vw)] rounded-lg font-tac text-[17px] tracking-[0.24em] uppercase transition-all active:scale-[0.99]
              flex items-center justify-center gap-3 shadow-2xl border-b-4
              ${partyActive && !amLeader
                ? iAmReady
                  ? 'bg-emerald-400 text-stone-950 border-emerald-600 hover:bg-emerald-300'
                  : 'bg-stone-200 text-stone-900 border-stone-400 hover:bg-white'
                : 'bg-amber-400 text-stone-950 border-amber-600 hover:bg-amber-300'}
              disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {quickState === 'scanning' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {playLabel}
          </button>
        </div>

        {/* sub-line under the play bar */}
        <div className="max-w-6xl mx-auto mt-2 flex items-center justify-between gap-3">
          <p className="font-tac-md text-[9px] text-stone-600 tracking-[0.2em] hidden sm:block">
            EMERGENCY STRIKE v14 · THREE.JS · WEBRTC P2P · MQTT PRESENCE
          </p>
          <p className="font-tac-md text-[9px] text-stone-500 tracking-widest truncate">
            {partyActive && !amLeader
              ? 'THE LEADER LAUNCHES THE MATCH FOR THE WHOLE SQUAD'
              : partyActive && amLeader && partyMembers.length > 1
                ? `${readyCount}/${partyMembers.length - 1} SQUADMATES READY — LAUNCH WHEN YOU WANT`
                : 'PICK A MODE ↑ · INVITE FRIENDS FROM THE SQUAD PANEL'}
          </p>
        </div>
      </div>

      {/* ============ MODE SELECT PANEL (drops up, Fortnite-style) ============ */}
      {modeOpen && (
        <ModeSelectPanel
          onClose={() => { getAudio().uiClick(); setModeOpen(false) }}
          gameMode={gameMode}
          setGameMode={setGameMode}
          source={source}
          setSource={setSource}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          roomKind={roomKind}
          setRoomKind={setRoomKind}
          fillEmpty={fillEmpty}
          setFillEmpty={setFillEmpty}
          fillBots={fillBots}
          setFillBots={setFillBots}
          code={code}
          setCode={setCode}
          coop={coop}
          setCoop={setCoop}
          coopCode={code}
          name={name}
          setName={setName}
          error={error}
          rooms={rooms}
          netStatus={netStatus}
          onJoinRoom={(c) => launch('guest', c)}
          onQuickPlay={quickPlay}
          onLaunchCoopJoin={() => launch('guest', code, 'historia', 'coop')}
          partyActive={partyActive}
          amLeader={amLeader}
        />
      )}

      {/* ============ modals ============ */}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {overlay && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setOverlay(null)}>
          <div className="w-[min(880px,94vw)] max-h-[90vh] overflow-y-auto bg-[#0b0e11]/97 border border-stone-800 shadow-2xl rounded-xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 sm:px-7 pt-5 flex items-center justify-between gap-3 sticky top-0 bg-[#0b0e11]/97 z-10 pb-3">
              <h2 className="font-tac text-xl tracking-[0.2em] text-white uppercase">
                {overlay === 'controls' ? 'Controls' : overlay === 'settings' ? 'Settings' : 'About the game'}
              </h2>
              <button onClick={() => setOverlay(null)}
                className="w-9 h-9 rounded-md border border-stone-700 flex items-center justify-center text-stone-400 hover:text-white hover:border-amber-500/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 sm:px-7 pb-6">
              {overlay === 'controls' && <KeybindsPanel />}
              {overlay === 'settings' && <SettingsPanel />}
              {overlay === 'info' && <InfoPanel />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// v14 — MODE SELECT PANEL: drops up over the lobby with EVERY
// mode in the game, the deploy config, the live room browser
// and the loadout preview for your lobby character.
// ============================================================
function ModeSelectPanel(p: {
  onClose: () => void
  gameMode: GameMode
  setGameMode: (m: GameMode) => void
  source: PlaySource
  setSource: (s: PlaySource) => void
  difficulty: BotDifficulty
  setDifficulty: (d: BotDifficulty) => void
  roomKind: RoomKind
  setRoomKind: (k: RoomKind) => void
  fillEmpty: boolean
  setFillEmpty: (v: boolean) => void
  fillBots: number
  setFillBots: (n: number) => void
  code: string
  setCode: (c: string) => void
  coop: boolean
  setCoop: (v: boolean) => void
  coopCode: string
  name: string
  setName: (n: string) => void
  error: string
  rooms: { code: string; host: string; kind: string; mode: string; players: number; cap: number; t: number }[]
  netStatus: string
  onJoinRoom: (code: string) => void
  onQuickPlay: () => void
  onLaunchCoopJoin: () => void
  partyActive: boolean
  amLeader: boolean
}) {
  const modeIds: GameMode[] = ['escaramuza', 'ffa', 'bandera', 'dominacion', 'historia']
  const modeIcon = (id: GameMode): typeof Play => (
    id === 'bandera' ? Flag : id === 'dominacion' ? Target : id === 'ffa' ? Zap : id === 'historia' ? Radio : Swords
  )
  const isCampaign = p.gameMode === 'historia'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[3px]"
      onClick={p.onClose}>
      <div className="w-[min(1060px,96vw)] max-h-[92vh] overflow-y-auto bg-[#0b0e11]/97 border-x border-t border-stone-800 shadow-2xl rounded-t-2xl animate-[slideUp_0.18s_ease-out]"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp .18s ease-out' }}>
        <div className="px-5 sm:px-7 pt-5 flex items-center justify-between gap-3 sticky top-0 bg-[#0b0e11]/97 z-10 pb-3 border-b border-stone-800/80">
          <div className="flex items-center gap-3">
            <Swords className="w-5 h-5 text-amber-300/90" />
            <h2 className="font-tac text-xl tracking-[0.2em] text-white uppercase">Select <span className="text-amber-300">mode</span></h2>
          </div>
          <button onClick={p.onClose}
            className="w-9 h-9 rounded-md border border-stone-700 flex items-center justify-center text-stone-400 hover:text-white hover:border-amber-500/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ---- the modes ---- */}
        <div className="p-5 sm:p-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {modeIds.map(id => {
            const m = MODES[id]
            const Icon = modeIcon(id)
            const active = p.gameMode === id
            return (
              <button key={id}
                onClick={() => { getAudio().uiClick(); p.setGameMode(id) }}
                className={`rounded-lg border p-3 text-left transition-colors tac-corner ${
                  active ? 'border-amber-500/70 bg-amber-500/[0.07]' : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                }`}>
                <Icon className={`w-5 h-5 mb-1.5 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
                <div className={`font-tac-md text-[11px] ${active ? 'text-white' : 'text-stone-300'}`}>{m.name}</div>
                <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                  {id === 'historia' ? '6 chapters · solo or co-op' : m.teams ? 'team vs team' : 'everyone vs everyone'}
                </div>
                {active && <span className="absolute" />}
              </button>
            )
          })}
        </div>

        {/* ---- campaign detail ---- */}
        {isCampaign && (
          <div className="px-5 sm:px-7 pb-5 grid lg:grid-cols-[1.05fr_0.95fr] gap-5">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4 space-y-3 tac-corner">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-md border border-amber-700/50 bg-amber-950/40 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-tac text-white text-base tracking-[0.16em] uppercase">Operation Ashfall</h3>
                  <p className="font-tac-md text-stone-500 text-[10px] mt-0.5">Single-player campaign · Serene Valley</p>
                </div>
              </div>
              <p className="text-stone-400 text-xs leading-relaxed">
                Six chapters with cinematic flyovers, radio dialogue, live battle fronts, a rescue,
                a boss duel and a timed helicopter extraction. Falling restarts the chapter with your inventory.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={!p.coop} onClick={() => p.setCoop(false)}>SOLO MISSION</Chip>
                <Chip active={p.coop} onClick={() => p.setCoop(true)}>CO-OP · ONLINE</Chip>
              </div>
              {p.coop && (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={p.code}
                    onChange={e => p.setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    onKeyDown={e => { if (e.key === 'Enter' && p.code.length >= 4) p.onLaunchCoopJoin() }}
                    placeholder="SQUAD CODE"
                    className="bg-stone-950/80 border-stone-600 text-white text-lg h-11 font-bold tracking-[0.25em] text-center"
                  />
                  <button
                    onClick={p.onLaunchCoopJoin}
                    disabled={p.code.length < 4}
                    className="px-5 rounded-md font-tac text-xs tracking-[0.2em] uppercase bg-stone-100 text-stone-900 hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Join
                  </button>
                </div>
              )}
              <DifficultyPicker difficulty={p.difficulty} setDifficulty={p.setDifficulty} label="MISSION DIFFICULTY" />
            </div>
            <div className="space-y-2.5">
              <h3 className="font-tac-md text-stone-200 text-[11px] mb-1">Mission structure</h3>
              {[
                { n: '01', title: 'First Light', desc: 'Recover 3 intel caches: the mill, the chapel, the watchtower.' },
                { n: '02', title: 'Hold the Line', desc: 'Defend the village uplink for 4 minutes.' },
                { n: '03', title: 'Cut the Tower', desc: 'Plant charges on the 3 antennas and get clear.' },
                { n: '04', title: 'The Prisoner', desc: 'Open Sergeant Rivera\u2019s cell and survive the alarm.' },
                { n: '05', title: 'The Commander', desc: 'Eliminate Col. Vega — armored, in the heart of the complex.' },
                { n: '06', title: 'Exfil', desc: 'Sprint to the north helipad before the helicopter leaves.' },
              ].map(c => (
                <div key={c.n} className="flex gap-3.5 bg-stone-950/60 border border-stone-800 rounded-md p-3 tac-corner">
                  <span className="font-tac-md text-[10px] text-stone-600 pt-0.5">{c.n}</span>
                  <div>
                    <span className="font-tac-md text-stone-200 text-[12px] uppercase">{c.title}</span>
                    <p className="text-stone-500 text-[11px] leading-snug mt-0.5">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- PvP deploy config ---- */}
        {!isCampaign && (
          <div className="px-5 sm:px-7 pb-5 space-y-5">
            <div>
              <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5" /> How do you want to play
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { id: 'bots' as const, icon: Bot, title: 'VS BOTS', desc: 'offline · instant' },
                  { id: 'room' as const, icon: Users, title: 'CREATE ROOM', desc: 'P2P code · 1v1-5v5' },
                  { id: 'join' as const, icon: Link2, title: 'JOIN', desc: 'enter a code' },
                  { id: 'quick' as const, icon: Zap, title: 'QUICK MATCH', desc: 'auto-find or host' },
                ]).map(s => {
                  const active = p.source === s.id
                  return (
                    <button key={s.id}
                      onClick={() => { getAudio().uiClick(); p.setSource(s.id) }}
                      className={`rounded-lg border p-3 text-left transition-colors tac-corner ${
                        active ? 'border-amber-500/70 bg-amber-500/[0.07]' : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                      }`}>
                      <s.icon className={`w-5 h-5 mb-1.5 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
                      <div className={`font-tac-md text-[11px] ${active ? 'text-white' : 'text-stone-300'}`}>{s.title}</div>
                      <div className="text-[9px] text-stone-500 leading-snug mt-0.5">{s.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {p.source === 'bots' && (
              <DifficultyPicker difficulty={p.difficulty} setDifficulty={p.setDifficulty} label="AI DIFFICULTY" />
            )}

            {p.source === 'room' && (
              <div className="space-y-4">
                <div>
                  <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Room format
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {(['1v1', '2v2', '3v3', '4v4', '5v5'] as const).map(k => (
                      <Chip key={k} active={p.roomKind === k} onClick={() => p.setRoomKind(k)}>
                        {k.toUpperCase()}
                      </Chip>
                    ))}
                  </div>
                </div>
                {p.roomKind === '1v1' ? (
                  <div>
                    <p className="font-tac-md text-stone-400 text-[11px] mb-2">FILLER BOTS (PER TEAM)</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 1, 2, 3].map(n => (
                        <Chip key={n} active={p.fillBots === n} onClick={() => p.setFillBots(n)}>
                          {n === 0 ? 'PURE 1v1' : `${n} vs ${n}`}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => p.setFillEmpty(!p.fillEmpty)}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                      p.fillEmpty ? 'border-amber-500/70 bg-amber-500/[0.07]' : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                    }`}>
                    <div>
                      <div className={`font-tac-md text-[11px] ${p.fillEmpty ? 'text-white' : 'text-stone-300'}`}>
                        FILL EMPTY SLOTS WITH BOTS
                      </div>
                      <div className="text-[9px] text-stone-500 leading-snug mt-0.5">
                        Missing operators at start are covered by AI — the match never plays unbalanced
                      </div>
                    </div>
                    <span className={`w-10 h-6 rounded-full border flex items-center px-0.5 transition-colors shrink-0 ${
                      p.fillEmpty ? 'bg-amber-500/80 border-amber-400' : 'bg-stone-800 border-stone-600'
                    }`}>
                      <span className={`w-[18px] h-[18px] rounded-full bg-stone-100 transition-transform ${p.fillEmpty ? 'translate-x-[16px]' : ''}`} />
                    </span>
                  </button>
                )}
                <DifficultyPicker difficulty={p.difficulty} setDifficulty={p.setDifficulty} label="BOT DIFFICULTY" />
              </div>
            )}

            {p.source === 'join' && (
              <div className="space-y-3">
                <div>
                  <label className="font-tac-md text-stone-400 text-[11px] mb-2 block">Room code</label>
                  <Input
                    value={p.code}
                    onChange={e => p.setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    onKeyDown={e => { if (e.key === 'Enter' && p.code.length >= 4) p.onJoinRoom(p.code) }}
                    placeholder="E.G. K7M2P"
                    className="bg-stone-950/80 border-stone-600 text-white text-2xl h-14 font-bold tracking-[0.3em] text-center"
                  />
                  <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
                    P2P (WebRTC) connection through the public PeerJS signaling server, with up to 3 automatic retries.
                  </p>
                </div>
                {p.error && <p className="text-red-400 text-xs font-bold">{p.error}</p>}
              </div>
            )}

            {p.source === 'quick' && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4 flex items-center gap-3.5 tac-corner">
                <Zap className="w-5 h-5 text-amber-300 shrink-0" />
                <p className="text-stone-400 text-xs leading-relaxed">
                  <b className="text-stone-200">Quick match:</b> the game scans the public rooms on the network for
                  ~6 seconds looking for someone playing <b className="text-amber-200">{MODES[p.gameMode].name}</b>.
                  Found → you join them instantly. Not found → you become the host and your room appears
                  in everyone else&apos;s browser.
                </p>
              </div>
            )}

            {/* ---- live room browser (dynamic online) ---- */}
            {p.netStatus === 'online' && (
              <div>
                <p className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Public rooms right now
                  <span className="text-stone-600">· live on the network</span>
                </p>
                {p.rooms.length === 0 ? (
                  <div className="rounded-md border border-stone-800 bg-stone-950/60 px-4 py-3 text-stone-500 text-[11px]">
                    No public rooms open — create one (or quick match) and it appears here for everyone.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {p.rooms.slice(0, 6).map(r => (
                      <div key={r.code} className="rounded-md border border-stone-800 bg-stone-950/60 px-3.5 py-2.5 flex items-center gap-3 tac-corner">
                        <span className="font-tac-md text-[10px] text-amber-300/80 tracking-[0.18em] w-16 shrink-0">{r.code}</span>
                        <span className="font-tac-md text-[11px] text-stone-300 truncate flex-1">
                          {r.host}&apos;s {MODES[r.mode as GameMode]?.name ?? r.mode}
                        </span>
                        <span className="font-tac-md text-[9px] text-stone-500 shrink-0">{r.kind.toUpperCase()} · {r.players}/{r.cap}</span>
                        <button
                          onClick={() => { getAudio().uiClick(); p.onJoinRoom(r.code) }}
                          disabled={r.players >= r.cap}
                          className="font-tac text-[10px] tracking-[0.18em] uppercase rounded px-3.5 py-1.5 bg-stone-100 text-stone-900 hover:bg-amber-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---- operator name ---- */}
            <div>
              <label className="font-tac-md text-stone-400 text-[11px] mb-2 block">Operator name</label>
              <Input
                value={p.name}
                onChange={e => { p.setName(e.target.value); }}
                placeholder="Enter your callsign"
                maxLength={16}
                className="bg-stone-950/80 border-stone-600 text-white text-lg h-12 font-bold focus:border-amber-500/70 focus-visible:ring-amber-500/20"
              />
              {p.error && <p className="text-red-400 text-xs mt-2 font-bold">{p.error}</p>}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(28px); opacity: 0.4 } to { transform: translateY(0); opacity: 1 } }`}</style>
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
  // v11.2: the lobby's kind (sent by the host) wins over the local guess —
  // guests joining a team room used to see a plain loading screen
  const lobbyKind = lobby?.kind ?? roomKind
  const isCoop = lobbyKind === 'coop'
  const inRoomLobby = lobbyKind !== '1v1' && netStatus === 'waiting' && lobby
  const roomPlayers = lobby?.players ?? []
  const capacity = roomCapacity(lobbyKind)
  const humans = roomPlayers.length
  // huecos a mostrar: en coop 5 (anfitrión + p2..p5, todos ÁMBAR);
  // en NvN, el anfitrión + huecos por equipo
  const slotIds = isCoop
    ? ['p1', 'p2', 'p3', 'p4', 'p5']
    : ['p1', ...teamSlotsFor(lobbyKind).map(s => s.id)]
  const slotTeam = (id: string): 'A' | 'B' => {
    if (isCoop) return 'A'
    if (id === 'p1') return 'A'
    return teamSlotsFor(lobbyKind).find(s => s.id === id)?.team ?? 'B'
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
          <div className="font-tac-md text-stone-700 text-[10px] tracking-[0.3em] uppercase">Emergency Strike · v13</div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Pause menu
// ============================================================
type PauseTab = 'profile' | 'controls' | 'settings' | 'info'

export function PauseMenu() {
  const phase = useGame(s => s.phase)
  const user = useAuth(s => s.user)
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
          {user && <TabButton icon={User} label="Profile" active={tab === 'profile'} onClick={() => setTab('profile')} />}
          <TabButton icon={Keyboard} label="Controls" active={tab === 'controls'} onClick={() => setTab('controls')} />
          <TabButton icon={Settings} label="Settings" active={tab === 'settings'} onClick={() => setTab('settings')} />
          <TabButton icon={Info} label="Info" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'profile' && user && <ProfileContent user={user} />}
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
