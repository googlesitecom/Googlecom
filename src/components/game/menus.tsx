'use client'

// ============================================================
// FRONTERA CERO — Menú principal (v5: rediseño táctico)
// Estética sobria militar: panel oscuro, tipografía condensada,
// ámbar de acento y detalle por sección (sin look arcade).
// ============================================================

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { getAudio } from '@/game/audio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Users, Link2, Bot,
  Keyboard, Info, RotateCcw, Home, TreePine, Video, Wind, Flag, Target, Radio,
  Map, Clock, ChevronRight, Copy, Check, Music2, Footprints, Package,
} from 'lucide-react'
import {
  DIFFICULTY_LABELS, ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel, MODES, MODE_LIST, padButtonLabel, PAD_ACTION_LABELS,
  type BotDifficulty, type ActionId, type GameMode, type PadAction,
} from '@/game/shared'

// ============================================================
// Fondo táctico: negro azulado + bruma + retícula tenue
// ============================================================
function MenuBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 100% at 70% 18%, #131a1f 0%, #0b0e12 45%, #070809 100%)',
        }}
      />
      {/* bruma cálida del atardecer (esquina del sol) */}
      <div
        className="absolute -top-32 right-[-10rem] w-[42rem] h-[42rem] rounded-full blur-3xl opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(196,128,54,0.16), transparent 62%)' }}
      />
      <div
        className="absolute bottom-[-14rem] left-[-12rem] w-[36rem] h-[36rem] rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(52,84,96,0.16), transparent 62%)' }}
      />
      {/* retícula técnica */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(170,190,200,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(170,190,200,0.8) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />
      {/* esquinas de encuadre */}
      <div className="absolute inset-4 border border-stone-800/40 rounded-sm" />
    </>
  )
}

/** Pestaña táctica (recta, sobria) */
function TabButton({ icon: Icon, label, active, onClick }: {
  icon: typeof Play
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative px-5 sm:px-6 py-2.5 text-xs sm:text-[13px] font-bold uppercase tracking-[0.18em]
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
// Panel de CONTROLES (rebindable) — compartido menú/pausa
// ============================================================
const MOVIMIENTO: ActionId[] = ['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'jump', 'zipline']
const COMBATE: ActionId[] = ['shoot', 'aim', 'reload', 'grenadeFrag', 'grenadeSmoke', 'buy', 'lastWeapon', 'slot1', 'slot2', 'slot3']

function useKeyCapture() {
  const [capture, setCapture] = useState<ActionId | null>(null)
  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Escape cancela · el resto reasigna
      if (e.code !== 'Escape') useGame.getState().setKeybind(capture, e.code)
      setCapture(null)
    }
    // los botones del RATÓN también se pueden asignar (disparar/apuntar)
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

/** captura de botones del MANDO (sondeo de gamepads) */
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
      <span className="text-stone-300 text-xs font-semibold tracking-wide">{ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-bold text-[11px] tracking-widest border transition-colors ${
          capturing
            ? 'bg-amber-500/15 border-amber-400/70 text-amber-200 animate-pulse'
            : code
              ? 'bg-stone-800 border-stone-600 text-stone-200 hover:border-amber-500/50 hover:text-white'
              : 'bg-red-950/50 border-red-800/60 text-red-300'
        }`}
      >
        {capturing ? 'TECLA O CLIC' : keyLabel(code)}
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
      <span className="text-stone-300 text-xs font-semibold tracking-wide">{PAD_ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-bold text-[11px] tracking-widest border transition-colors ${
          capturing
            ? 'bg-amber-500/15 border-amber-400/70 text-amber-200 animate-pulse'
            : btn >= 0
              ? 'bg-stone-800 border-stone-600 text-stone-200 hover:border-amber-500/50 hover:text-white'
              : 'bg-red-950/50 border-red-800/60 text-red-300'
        }`}
      >
        {capturing ? 'PULSA UN BOTÓN' : btn >= 0 ? padButtonLabel(btn) : '—'}
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
          Haz clic en una tecla y pulsa la nueva asignación — <b className="text-stone-300">teclado o botón del
          ratón</b> (disparar y apuntar ya se pueden cambiar). Si ya está en uso, la otra acción se libera
          automáticamente. <b className="text-stone-300">ESC</b> cancela.
        </p>
        <Button
          onClick={reset}
          variant="secondary"
          className="h-9 font-bold text-[11px] tracking-widest bg-stone-800 border border-stone-600 hover:bg-stone-700"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> RESTAURAR POR DEFECTO
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] flex items-center gap-2 uppercase">
            <Mouse className="w-4 h-4" /> Movimiento
          </h4>
          {MOVIMIENTO.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] flex items-center gap-2 uppercase">
            <Crosshair className="w-4 h-4" /> Combate (ratón y teclado)
          </h4>
          {COMBATE.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
      </div>

      {/* mando (rebindable) */}
      <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4">
        <h4 className="text-stone-300 font-bold tracking-[0.22em] text-[11px] mb-3 flex items-center gap-2 uppercase">
          <Gamepad2 className="w-4 h-4 text-amber-200/80" /> Mando — botones reasignables (Xbox · PS · genérico)
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(Object.keys(PAD_ACTION_LABELS) as PadAction[]).map(a => (
            <PadRow key={a} action={a} capture={padCapture} onCapture={setPadCapture} />
          ))}
        </div>
        <p className="text-stone-600 text-[10px] mt-2.5 leading-relaxed">
          Haz clic en una acción y pulsa el botón del mando que quieras. Correr va en <b>L3</b> (pulsar el
          stick izquierdo) por defecto; también corre empujando el stick a fondo. La sensibilidad se ajusta
          en AJUSTES.
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Panel de AJUSTES — con AUDIO (música y efectos por separado)
// ============================================================
export function SettingsPanel() {
  const settings = useGame(s => s.settings)
  const setSettings = useGame(s => s.setSettings)
  return (
    <div className="space-y-7 max-w-xl">
      {/* ---- AUDIO ---- */}
      <section className="space-y-4">
        <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] flex items-center gap-2 uppercase border-b border-stone-800 pb-2">
          <Volume2 className="w-4 h-4" /> Audio
        </h4>
        <SliderRow
          icon={<Volume2 className="w-4 h-4" />}
          label="VOLUMEN GENERAL"
          value={settings.volume} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ volume: v })
            getAudio().setVolume(v)
          }}
        />
        <SliderRow
          icon={<Music2 className="w-4 h-4" />}
          label="VOLUMEN DE LA MÚSICA"
          value={settings.musicVol} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ musicVol: v })
            getAudio().setMusicVolume(v)
          }}
        />
        <SliderRow
          icon={<Bomb className="w-4 h-4" />}
          label="VOLUMEN DE EFECTOS"
          value={settings.sfxVol} min={0} max={1} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => {
            setSettings({ sfxVol: v })
            getAudio().setSfxVolume(v)
          }}
        />
        <p className="text-stone-600 text-[10px] leading-relaxed">
          La música (Musica.mp3) suena en el menú y se atenúa en combate. Los disparos usan los
          MP3 del repositorio (Pistola · SMG · Rifle · Sniper). Se guarda automáticamente.
        </p>
      </section>

      {/* ---- CONTROL ---- */}
      <section className="space-y-4">
        <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] flex items-center gap-2 uppercase border-b border-stone-800 pb-2">
          <Mouse className="w-4 h-4" /> Control
        </h4>
        <SliderRow
          icon={<Mouse className="w-4 h-4" />}
          label="SENSIBILIDAD DEL RATÓN"
          value={settings.sens} min={0.2} max={3} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setSettings({ sens: v })}
        />
        <SliderRow
          icon={<Crosshair className="w-4 h-4" />}
          label="SENSIBILIDAD AL APUNTAR (ADS)"
          value={settings.adsSens} min={0.3} max={1.5} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => setSettings({ adsSens: v })}
        />
        <SliderRow
          icon={<Gamepad2 className="w-4 h-4" />}
          label="SENSIBILIDAD DEL MANDO"
          value={settings.padSens} min={0.2} max={3} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setSettings({ padSens: v })}
        />
      </section>

      {/* ---- GRÁFICOS ---- */}
      <section>
        <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] flex items-center gap-2 uppercase border-b border-stone-800 pb-2 mb-3">
          <Gauge className="w-4 h-4" /> Gráficos
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {(['baja', 'media', 'alta'] as const).map(q => (
            <button
              key={q}
              onClick={() => setSettings({ quality: q })}
              className={`rounded-md py-2.5 font-bold tracking-widest text-[11px] border uppercase transition-colors ${
                settings.quality === q
                  ? 'bg-amber-500/15 border-amber-400/70 text-amber-200'
                  : 'bg-stone-900/60 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              {q.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
          Baja: sombras suaves y sin floritura (máx. FPS) · Media: sombras 2K · Alta: sombras 4K
          y bloom. La calidad se aplica al iniciar una partida.
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
        <span className="text-stone-400 text-[11px] font-bold tracking-[0.18em] flex items-center gap-2 uppercase">{icon} {label}</span>
        <span className="text-amber-200 font-bold tabular-nums text-xs">{format(value)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={v => onChange(v[0])} />
    </div>
  )
}

// ============================================================
// Panel de INFORMACIÓN — mecánicas v5
// ============================================================
const MECHANICS = [
  { icon: Swords, title: '5 modos de juego', desc: 'Equipos · FFA · bandera · dominación · OPERACIÓN CENIZA (historia)' },
  { icon: Radio, title: 'Modo historia', desc: '4 capítulos, ~15-20 min, mapa militar nuevo con jefe final' },
  { icon: Eye, title: 'Daño por zonas', desc: 'Headshots letales, caída por distancia, cajas y piernas' },
  { icon: Coins, title: 'Economía por rondas', desc: 'Cobra por cada baja y victoria, compra en tu base' },
  { icon: Package, title: 'Dos armas en el inventario', desc: 'Cómpralas y consérvalas aunque caigas: no se pierden' },
  { icon: Footprints, title: 'Deslizamiento', desc: 'Agáchate mientras corres para derraparte por el suelo' },
  { icon: Shield, title: 'Vida estilo Fortnite', desc: '100 HP + 100 escudo; el escudo absorbe primero' },
  { icon: Volume2, title: 'Audio real', desc: 'Disparos y música en MP3 del repositorio, con mezclador' },
  { icon: Bomb, title: 'MOLO y humo', desc: 'Granadas incendiarias y cortinas de humo de 12 s' },
  { icon: Wind, title: 'Tirolinas y saltadores', desc: 'Vuela por cables y catapúltate a los tejados' },
  { icon: Users, title: 'Salas P2P 1 vs 1', desc: 'Multijugador real por WebRTC (PeerJS) sin servidor propio' },
  { icon: TreePine, title: 'Mapa vivo', desc: 'Árboles GLB, barriles explosivos y neones' },
  { icon: Home, title: 'Ciudad con interiores', desc: 'Hotel de 3 plantas, torre de 4, mercado, almacenes, casas' },
  { icon: Video, title: 'Cinemática de entrada', desc: 'Sobrevuelo del mapa al desplegarte por primera vez' },
]

export function InfoPanel() {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {MECHANICS.map(m => (
          <div key={m.title} className="flex gap-2.5 bg-stone-950/60 border border-stone-800 rounded-md p-3.5">
            <m.icon className="w-4 h-4 text-amber-300/80 shrink-0 mt-0.5" />
            <div>
              <div className="text-stone-200 text-xs font-bold">{m.title}</div>
              <div className="text-stone-500 text-[10px] leading-snug mt-0.5">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-stone-900/40 border border-stone-800 rounded-md p-4 max-w-2xl">
        <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[11px] mb-2 flex items-center gap-2 uppercase">
          <Trophy className="w-4 h-4" /> Modo escaramuza
        </h4>
        <p className="text-stone-400 text-xs leading-relaxed">
          Combate por equipos con economía por rondas: gana eliminaciones para tu escuadrón,
          cobra recompensas, compra mejor equipo en tu base y sube al tejado de las casas.
          ¡El primer escuadrón en ganar 5 rondas se lleva la partida!
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Menú principal — pestañas tácticas
// ============================================================
type MenuTab = 'desplegar' | 'historia' | 'controles' | 'ajustes' | 'info'
type PlayMode = 'solo' | 'host' | 'guest'

export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const [tab, setTab] = useState<MenuTab>('desplegar')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<PlayMode>('solo')
  const [code, setCode] = useState('')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [fillBots, setFillBots] = useState(0)
  const [gameMode, setGameMode] = useState<GameMode>('escaramuza')
  const [error, setError] = useState('')

  if (phase !== 'menu') return null

  const launch = (m: PlayMode, roomCode = '', forceMode?: GameMode) => {
    const n = name.trim() || 'Operador'
    if (n.length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setPlayerName(n)
    setError('')
    setHud({
      mode: m,
      roomCode,
      botDifficulty: difficulty,
      fillBots,
      gameMode: forceMode ?? gameMode,
      netStatus: 'connecting',
      netError: '',
      story: {
        active: forceMode === 'historia',
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <MenuBackdrop />

      <div className="relative min-h-screen flex flex-col items-center px-4 py-6 sm:py-8">
        {/* cabecera */}
        <div className="w-full max-w-5xl mb-5">
          <div className="flex items-end justify-between">
            <div className="select-none">
              <h1 className="font-extrabold text-4xl sm:text-5xl tracking-[0.18em] text-stone-100 leading-none">
                FRONTERA<span className="text-amber-400 ml-3">CERO</span>
              </h1>
              <p className="text-stone-500 tracking-[0.42em] text-[10px] font-bold uppercase mt-2">
                FPS táctico multijugador · Operación Ceniza
              </p>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold tracking-[0.3em] text-amber-300/70 uppercase">v5.0</span>
              <span className="text-[10px] font-semibold tracking-[0.2em] text-stone-600 uppercase">
                Three.js · WebRTC · 5 modos
              </span>
            </div>
          </div>
        </div>

        {/* pestañas */}
        <div className="w-full max-w-5xl flex items-stretch gap-1 mb-0 border-b border-stone-800">
          <TabButton icon={Play} label="Desplegar" active={tab === 'desplegar'} onClick={() => setTab('desplegar')} />
          <TabButton icon={Radio} label="Operación" active={tab === 'historia'} onClick={() => setTab('historia')} />
          <TabButton icon={Keyboard} label="Controles" active={tab === 'controles'} onClick={() => setTab('controles')} />
          <TabButton icon={Settings} label="Ajustes" active={tab === 'ajustes'} onClick={() => setTab('ajustes')} />
          <TabButton icon={Info} label="Información" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        {/* contenido */}
        <div className="w-full max-w-5xl bg-[#0d1013]/95 backdrop-blur-sm border-x border-b border-stone-800 shadow-2xl">

          {tab === 'desplegar' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.12fr_0.88fr] gap-6">
              {/* columna izquierda: despliegue */}
              <div className="space-y-5">
                <div>
                  <label className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 block uppercase">
                    Nombre del operador
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder="Introduce tu nombre de combate"
                    maxLength={16}
                    className="bg-stone-950/80 border-stone-600 text-white text-lg h-12 font-bold focus:border-amber-500/70 focus-visible:ring-amber-500/20"
                  />
                  {error && <p className="text-red-400 text-xs mt-2 font-bold">{error}</p>}
                </div>

                {/* selector de modo de conexión */}
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { id: 'solo', icon: Bot, title: 'BOTS', desc: 'Escaramuza 4v4 contra IA', meta: 'offline' },
                    { icon: Users, id: 'host', title: 'CREAR SALA', desc: '1v1 con código P2P', meta: 'online' },
                    { icon: Link2, id: 'guest', title: 'UNIRSE', desc: 'Entra con un código', meta: 'online' },
                  ] as const).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        mode === m.id
                          ? 'border-amber-500/70 bg-amber-500/[0.07]'
                          : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                      }`}
                    >
                      <m.icon className={`w-5 h-5 mb-1.5 ${mode === m.id ? 'text-amber-300' : 'text-stone-500'}`} />
                      <div className={`text-xs font-bold tracking-wider ${mode === m.id ? 'text-white' : 'text-stone-300'}`}>
                        {m.title}
                      </div>
                      <div className="text-[10px] text-stone-500 leading-snug mt-0.5">{m.desc}</div>
                      <div className={`text-[9px] font-bold tracking-widest mt-1 uppercase ${mode === m.id ? 'text-amber-300/70' : 'text-stone-600'}`}>
                        {m.meta}
                      </div>
                    </button>
                  ))}
                </div>

                {/* selector de modo de juego (solo/anfitrión; el invitado juega el del anfitrión) */}
                {mode !== 'guest' && (
                  <div>
                    <p className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 flex items-center gap-2 uppercase">
                      <Swords className="w-3.5 h-3.5" /> Modo de juego
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
                            className={`rounded-lg border p-2.5 text-left transition-colors ${
                              active
                                ? 'border-amber-500/70 bg-amber-500/[0.07]'
                                : 'border-stone-700/60 bg-stone-950/50 hover:border-stone-500'
                            }`}
                          >
                            <Icon className={`w-4 h-4 mb-1 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
                            <div className={`text-[11px] font-bold tracking-wider ${active ? 'text-white' : 'text-stone-300'}`}>
                              {m.name}
                            </div>
                            <div className="text-[9px] text-stone-500 leading-snug mt-0.5">{m.desc}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* configuración según modo */}
                {mode === 'solo' && (
                  <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="DIFICULTAD DE LA IA" />
                )}
                {mode === 'host' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 uppercase">BOTS DE RELLENO (POR BANDO)</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[0, 1, 2, 3].map(n => (
                          <Chip key={n} active={fillBots === n} onClick={() => setFillBots(n)}>
                            {n === 0 ? 'PURO 1v1' : `${n} vs ${n}`}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="DIFICULTAD DE LOS BOTS" />
                  </div>
                )}
                {mode === 'guest' && (
                  <div>
                    <label className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 block uppercase">Código de sala</label>
                    <Input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      onKeyDown={e => { if (e.key === 'Enter' && code.length >= 4) launch('guest', code) }}
                      placeholder="EJ. K7M2P"
                      className="bg-stone-950/80 border-stone-600 text-white text-2xl h-14 font-bold tracking-[0.3em] text-center"
                    />
                    <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
                      Conexión P2P (WebRTC) a través del servidor público de señalización PeerJS,
                      con hasta 3 reintentos automáticos.
                    </p>
                  </div>
                )}

                {/* botón de despliegue */}
                <button
                  onClick={() => launch(mode, mode === 'guest' ? code : '')}
                  disabled={mode === 'guest' && code.length < 4}
                  className="group w-full h-14 rounded-md font-bold text-lg tracking-[0.28em] uppercase transition-all
                    bg-stone-100 text-stone-900 hover:bg-amber-200 active:scale-[0.99]
                    disabled:opacity-30 disabled:cursor-not-allowed
                    flex items-center justify-center gap-3"
                >
                  <Play className="w-5 h-5" />
                  {mode === 'solo' ? 'Iniciar despliegue' : mode === 'host' ? 'Crear sala' : 'Unirse a la sala'}
                  <ChevronRight className="w-5 h-5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* columna derecha: resumen del despliegue */}
              <div className="border-t lg:border-t-0 lg:border-l border-stone-800/80 pt-5 lg:pt-0 lg:pl-6 space-y-4">
                <h3 className="text-stone-200 font-bold tracking-[0.22em] text-[11px] uppercase flex items-center gap-2">
                  <Map className="w-4 h-4 text-amber-300/80" /> Sector Meridiano
                </h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    ['Terreno', 'Ciudad 140×140 m con distritos ordenados'],
                    ['Edificios', 'Hotel 3 plantas · torre 4 · mercado · almacenes'],
                    ['Interiores', '13 edificios practicables con escaleras'],
                    ['Cobertura', 'Contenedores, sacos, barriles explosivos'],
                    ['Verticalidad', 'Tirolinas, saltadores y azoteas'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 items-baseline">
                      <span className="text-stone-600 font-bold uppercase text-[10px] tracking-widest w-24 shrink-0">{k}</span>
                      <span className="text-stone-400">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-stone-900/50 border border-stone-800 rounded-md p-4">
                  <h4 className="text-amber-200/90 font-bold tracking-[0.22em] text-[10px] mb-2 uppercase flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Novedades v5.0
                  </h4>
                  <ul className="space-y-1.5">
                    {[
                      'Audio real: disparos y música en MP3, con volumen ajustable',
                      'OPERACIÓN CENIZA: modo historia de 15-20 min con mapa nuevo',
                      'Multijugador P2P reforzado (reintentos y reconexión)',
                      'Sol de atardecer rehecho y gráficos mejorados sin coste de FPS',
                      'Sin vegetación de suelo: menos lag, mismos modelos',
                      'Dos armas en el inventario y se conservan al morir',
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

          {tab === 'historia' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
              <div className="space-y-5">
                <div>
                  <label className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 block uppercase">
                    Nombre del operador
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder="Introduce tu nombre de combate"
                    maxLength={16}
                    className="bg-stone-950/80 border-stone-600 text-white text-lg h-12 font-bold focus:border-amber-500/70 focus-visible:ring-amber-500/20"
                  />
                  {error && <p className="text-red-400 text-xs mt-2 font-bold">{error}</p>}
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4">
                  <div className="flex items-center gap-3">
                    <Radio className="w-6 h-6 text-amber-300" />
                    <div>
                      <h3 className="text-white font-bold tracking-[0.2em] text-sm uppercase">Operación Ceniza</h3>
                      <p className="text-stone-500 text-[10px] tracking-widest uppercase mt-0.5">
                        Campaña en solitario · instalación militar
                      </p>
                    </div>
                  </div>
                  <p className="text-stone-400 text-xs leading-relaxed mt-3">
                    La red enemiga opera desde una instalación amurallada. Infiltra, sabotea y
                    elimina a su comandante. Un mapa completamente distinto — comando central,
                    radar, depósito de combustible, cuarteles, torretas y helipuerto — con
                    diálogos de radio y jefe final.
                  </p>
                  <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-bold tracking-widest uppercase text-stone-500">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-300/70" /> 15-20 min</span>
                    <span className="flex items-center gap-1.5"><Map className="w-3.5 h-3.5 text-amber-300/70" /> Instalación 112×112</span>
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-300/70" /> 1 jugador vs IA</span>
                  </div>
                </div>

                <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="DIFICULTAD DE LA MISIÓN" />

                <button
                  onClick={() => launch('solo', '', 'historia')}
                  className="group w-full h-14 rounded-md font-bold text-lg tracking-[0.28em] uppercase transition-all
                    bg-amber-400 text-stone-950 hover:bg-amber-300 active:scale-[0.99]
                    flex items-center justify-center gap-3"
                >
                  <Radio className="w-5 h-5" />
                  Comenzar operación
                  <ChevronRight className="w-5 h-5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* capítulos */}
              <div className="border-t lg:border-t-0 lg:border-l border-stone-800/80 pt-5 lg:pt-0 lg:pl-6 space-y-2.5">
                <h3 className="text-stone-200 font-bold tracking-[0.22em] text-[11px] uppercase mb-2">
                  Estructura de la misión
                </h3>
                {[
                  { n: '01', title: 'Infiltración', desc: 'Cruza la brecha sur y recupera 3 inteligencias: comando, radar y cuartel.', icon: Eye },
                  { n: '02', title: 'El sitio', desc: 'Defiende el enlace de comunicaciones 4 minutos mientras la Red descarga el plan.', icon: Shield },
                  { n: '03', title: 'Sabotaje', desc: 'Coloca cargas en las 3 antenas (ALFA · BRAVO · CHARLIE) y apártate de la explosión.', icon: Bomb },
                  { n: '04', title: 'El comandante', desc: 'Elimina al Cnel. Vega y corre al helipuerto para la extracción.', icon: Crosshair },
                ].map(c => (
                  <div key={c.n} className="flex gap-3.5 bg-stone-950/60 border border-stone-800 rounded-md p-3.5">
                    <div className="shrink-0 w-9 h-9 rounded border border-stone-700 bg-stone-900 flex items-center justify-center">
                      <c.icon className="w-4 h-4 text-amber-300/80" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold tracking-widest text-stone-600">{c.n}</span>
                        <span className="text-stone-200 text-xs font-bold uppercase tracking-wider">{c.title}</span>
                      </div>
                      <p className="text-stone-500 text-[11px] leading-snug mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                ))}
                <p className="text-stone-600 text-[10px] leading-relaxed pt-1">
                  Si caes, el capítulo en curso se repite desde su punto de control — el
                  inventario se conserva. Las armas de la misión se entregan sobre la marcha.
                </p>
              </div>
            </div>
          )}

          {tab === 'controles' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-stone-200 font-bold tracking-[0.22em] text-[11px] mb-4 uppercase flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-amber-300/80" /> Asignación de teclas
              </h3>
              <KeybindsPanel />
            </div>
          )}

          {tab === 'ajustes' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-stone-200 font-bold tracking-[0.22em] text-[11px] mb-5 uppercase flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-300/80" /> Ajustes del juego
              </h3>
              <SettingsPanel />
            </div>
          )}

          {tab === 'info' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-stone-200 font-bold tracking-[0.22em] text-[11px] mb-4 uppercase flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-300/80" /> Mecánicas del juego
              </h3>
              <InfoPanel />
            </div>
          )}
        </div>

        <p className="text-stone-700 text-[10px] mt-6 tracking-[0.25em] font-bold uppercase">
          Frontera Cero v5.0 · Three.js + WebRTC (PeerJS) · 5 modos · Ciudad 140×140 + Instalación 112×112
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
      className={`rounded-md py-2.5 font-bold text-[11px] tracking-widest border uppercase transition-colors ${
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
      <p className="text-stone-400 text-[11px] font-bold tracking-[0.22em] mb-2 flex items-center gap-2 uppercase">
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
// Pantalla de conexión (contextual por modo, con sala visible)
// ============================================================
export function ConnectingScreen() {
  const phase = useGame(s => s.phase)
  const mode = useGame(s => s.mode)
  const roomCode = useGame(s => s.roomCode)
  const netStatus = useGame(s => s.netStatus)
  const netError = useGame(s => s.netError)
  const [copied, setCopied] = useState(false)
  if (phase !== 'connecting') return null

  const showError = mode === 'guest' && netStatus === 'error'
  const copyCode = (): void => {
    try { void navigator.clipboard.writeText(roomCode) } catch { /* sin permiso */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-4">
      <MenuBackdrop />
      {showError ? (
        <div className="relative text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-full border-2 border-red-500/60 flex items-center justify-center text-red-400 text-2xl font-bold">×</div>
          <p className="text-red-300 text-xl font-bold tracking-[0.25em] uppercase">Conexión fallida</p>
          <p className="text-stone-500 text-sm max-w-md">{netError || 'Error desconocido'}</p>
          <Button
            onClick={() => useGame.getState().setPhase('menu')}
            className="h-12 px-8 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
          >
            Volver al menú
          </Button>
        </div>
      ) : (
        <div className="relative text-center space-y-6">
          {mode === 'host' ? (
            <>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <div>
                <p className="text-white text-xl font-bold tracking-[0.25em] uppercase">Sala táctica creada</p>
                <button
                  onClick={copyCode}
                  className="mt-4 inline-flex items-center gap-3 px-6 py-3 rounded-md border border-amber-500/50 bg-amber-500/[0.07] hover:bg-amber-500/[0.14] transition-colors group"
                  title="Copiar código"
                >
                  <span className="text-amber-200 text-3xl font-bold tracking-[0.3em]">{roomCode}</span>
                  {copied
                    ? <Check className="w-5 h-5 text-emerald-400" />
                    : <Copy className="w-5 h-5 text-stone-500 group-hover:text-amber-300" />}
                </button>
                <p className="text-stone-500 text-xs mt-4 leading-relaxed max-w-sm mx-auto">
                  Comparte el código con tu rival. Cuando se una, entrará en el bando
                  contrario. Mientras, la partida funciona contra bots de relleno.
                </p>
              </div>
            </>
          ) : mode === 'guest' ? (
            <>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <div>
                <p className="text-white text-xl font-bold tracking-[0.25em] uppercase">Uniéndose a la sala</p>
                <p className="text-amber-200 text-3xl font-bold tracking-[0.3em] mt-3">{roomCode}</p>
                <p className="text-stone-500 text-xs mt-3">Estableciendo enlace P2P con el anfitrión…</p>
              </div>
            </>
          ) : (
            <div>
              <Loader2 className="w-12 h-12 text-amber-300 animate-spin mx-auto" />
              <p className="text-white text-xl font-bold tracking-[0.25em] uppercase mt-4">
                {useGame.getState().gameMode === 'historia' ? 'Iniciando operación' : 'Estableciendo enlace táctico'}
              </p>
              <p className="text-stone-500 text-xs mt-2">
                {useGame.getState().gameMode === 'historia'
                  ? 'Desplegando en la instalación…'
                  : 'Desplegando operadores IA en el mapa…'}
              </p>
            </div>
          )}
          <div className="text-stone-700 text-[10px] font-bold tracking-[0.3em] uppercase">Frontera Cero · v5.0</div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Menú de pausa
// ============================================================
type PauseTab = 'controles' | 'ajustes' | 'info'

export function PauseMenu() {
  const phase = useGame(s => s.phase)
  const [tab, setTab] = useState<PauseTab>('controles')
  if (phase !== 'paused') return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[min(880px,94vw)] max-h-[92vh] overflow-y-auto bg-[#0d1013]/97 border border-stone-800 shadow-2xl">
        <div className="px-5 sm:px-7 pt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-2xl tracking-[0.2em] text-white uppercase">
            En <span className="text-amber-300">pausa</span>
          </h2>
          <Button
            onClick={() => getGame()?.requestLock()}
            className="h-11 px-6 bg-stone-100 text-stone-900 font-bold tracking-widest uppercase hover:bg-amber-200"
          >
            <Play className="w-4 h-4 mr-2" /> Reanudar
          </Button>
        </div>

        <div className="px-5 sm:px-7 pt-4 flex gap-1 border-b border-stone-800">
          <TabButton icon={Keyboard} label="Controles" active={tab === 'controles'} onClick={() => setTab('controles')} />
          <TabButton icon={Settings} label="Ajustes" active={tab === 'ajustes'} onClick={() => setTab('ajustes')} />
          <TabButton icon={Info} label="Información" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'controles' && <KeybindsPanel />}
          {tab === 'ajustes' && <SettingsPanel />}
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
            <LogOut className="w-4 h-4 mr-2" /> Abandonar partida
          </Button>
        </div>
      </div>
    </div>
  )
}
