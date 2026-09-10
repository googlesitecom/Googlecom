'use client'

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Bot,
  Keyboard, Info, RotateCcw, Home, TreePine, Video, Wind, Flag, Target, BookOpen, Music,
} from 'lucide-react'
import {
  DIFFICULTY_LABELS, ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel, MODES, MODE_LIST, padButtonLabel, PAD_ACTION_LABELS,
  type BotDifficulty, type ActionId, type GameMode, type PadAction,
} from '@/game/shared'
import { music } from '@/game/music'

// ============================================================
// Estilo compartido: Fortnite — fondo azul profundo + rayos
// ============================================================
function MenuBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(165deg, #070a1d 0%, #10173a 48%, #1a1030 100%)',
        }}
      />
      {/* rayos de luz diagonales */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'repeating-linear-gradient(115deg, transparent 0 90px, rgba(99,140,255,0.10) 90px 200px)',
        }}
      />
      {/* orbes de resplandor */}
      <div className="absolute -top-40 -left-40 w-[34rem] h-[34rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(64,120,255,0.22), transparent 65%)' }} />
      <div className="absolute -bottom-52 -right-40 w-[38rem] h-[38rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,184,46,0.14), transparent 65%)' }} />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.10), transparent 60%)' }} />
      {/* retícula sutil */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,180,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(148,180,255,0.7) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
    </>
  )
}

/** Pestaña estilo Fortnite (comprimida en diagonal) */
function TabButton({ icon: Icon, label, active, onClick }: {
  icon: typeof Play
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative -skew-x-12 px-5 sm:px-7 py-2.5 font-black italic tracking-wider text-sm sm:text-base uppercase
        transition-all duration-150 border-t-2 ${active
          ? 'bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 border-yellow-200 shadow-[0_0_24px_rgba(255,200,40,0.45)]'
          : 'bg-slate-800/80 text-slate-300 border-slate-600/60 hover:bg-slate-700/80 hover:text-white'}`}
    >
      <span className="skew-x-12 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </span>
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
    <div className="flex items-center justify-between gap-3 bg-slate-900/70 rounded-lg px-3.5 py-2 border border-slate-700/70">
      <span className="text-slate-300 text-xs font-bold tracking-wide">{ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-black text-xs tracking-wider border transition-all ${
          capturing
            ? 'bg-amber-500/25 border-amber-400 text-amber-200 animate-pulse'
            : code
              ? 'bg-slate-800 border-slate-600 text-cyan-200 hover:border-cyan-400/70 hover:text-white'
              : 'bg-red-950/60 border-red-700/60 text-red-300'
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
    <div className="flex items-center justify-between gap-3 bg-slate-900/70 rounded-lg px-3.5 py-2 border border-slate-700/70">
      <span className="text-slate-300 text-xs font-bold tracking-wide">{PAD_ACTION_LABELS[action]}</span>
      <button
        onClick={() => onCapture(action)}
        className={`min-w-[7.5rem] px-3 py-1.5 rounded-md font-black text-xs tracking-wider border transition-all ${
          capturing
            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 animate-pulse'
            : btn >= 0
              ? 'bg-slate-800 border-slate-600 text-cyan-200 hover:border-cyan-400/70 hover:text-white'
              : 'bg-red-950/60 border-red-700/60 text-red-300'
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
        <p className="text-slate-400 text-xs leading-relaxed max-w-md">
          Haz clic en una tecla y pulsa la nueva asignación — <b className="text-slate-300">teclado o botón del
          ratón</b> (disparar y apuntar ya se pueden cambiar). Si ya está en uso, la otra acción se libera
          automáticamente. <b className="text-slate-300">ESC</b> cancela.
        </p>
        <Button
          onClick={reset}
          variant="secondary"
          className="h-9 font-bold text-xs tracking-widest bg-slate-800 border border-slate-600 hover:bg-slate-700"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> RESTAURAR POR DEFECTO
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <h4 className="text-cyan-300 font-black italic tracking-widest text-xs flex items-center gap-2">
            <Mouse className="w-4 h-4" /> MOVIMIENTO
          </h4>
          {MOVIMIENTO.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-amber-300 font-black italic tracking-widest text-xs flex items-center gap-2">
            <Crosshair className="w-4 h-4" /> COMBATE (RATÓN Y TECLADO)
          </h4>
          {COMBATE.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
      </div>

      {/* mando (rebindable) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
        <h4 className="text-slate-300 font-black italic tracking-widest text-xs mb-3 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-cyan-300" /> MANDO — BOTONES REASIGNABLES (XBOX · PS · GENÉRICO)
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(Object.keys(PAD_ACTION_LABELS) as PadAction[]).map(a => (
            <PadRow key={a} action={a} capture={padCapture} onCapture={setPadCapture} />
          ))}
        </div>
        <p className="text-slate-600 text-[10px] mt-2.5 leading-relaxed">
          Haz clic en una acción y pulsa el botón del mando que quieras. Correr va en <b>L3</b> (pulsar el
          stick izquierdo) por defecto; también corre empujando el stick a fondo. La sensibilidad se ajusta
          en AJUSTES.
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Panel de AJUSTES — compartido menú/pausa
// ============================================================
export function SettingsPanel() {
  const settings = useGame(s => s.settings)
  const setSettings = useGame(s => s.setSettings)
  return (
    <div className="space-y-6 max-w-xl">
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
      <SliderRow
        icon={<Volume2 className="w-4 h-4" />}
        label="VOLUMEN GENERAL"
        value={settings.volume} min={0} max={1} step={0.05}
        format={v => `${Math.round(v * 100)}%`}
        onChange={v => {
          setSettings({ volume: v })
          getGame()?.audio.setVolume(v)
          music.setVolume(v)
        }}
      />
      <div>
        <p className="text-slate-400 text-xs font-black tracking-widest mb-2.5 flex items-center gap-2">
          <Gauge className="w-4 h-4" /> CALIDAD GRÁFICA
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(['baja', 'media', 'alta'] as const).map(q => (
            <button
              key={q}
              onClick={() => setSettings({ quality: q })}
              className={`rounded-lg py-2.5 font-black italic tracking-widest text-xs border transition-all -skew-x-6 ${
                settings.quality === q
                  ? 'bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 border-yellow-300'
                  : 'bg-slate-900/70 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              <span className="skew-x-6">{q.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <p className="text-slate-600 text-[10px] mt-2">
          La calidad de sombras y vegetación se aplica al iniciar una partida. Los ajustes se guardan automáticamente.
        </p>
      </div>
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
        <span className="text-slate-400 text-xs font-black tracking-widest flex items-center gap-2">{icon} {label}</span>
        <span className="text-yellow-300 font-black italic tabular-nums text-sm">{format(value)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={v => onChange(v[0])} />
    </div>
  )
}

// ============================================================
// Panel de INFORMACIÓN — mecánicas y ayuda
// ============================================================
const MECHANICS = [
  { icon: BookOpen, title: 'Modo HISTORIA', desc: 'Operación Isla Gallo: 5 fases, jefe y extracción (15-20 min)' },
  { icon: Swords, title: '4 modos PvP', desc: 'FFA · equipos · capturar la bandera · dominación' },
  { icon: Eye, title: 'Daño por zonas', desc: 'Headshots letales, caída por distancia, cajas y piernas' },
  { icon: Coins, title: '2 armas permanentes', desc: 'Compra dos y consérvalas aunque caigas (huecos 1 y 2)' },
  { icon: Bot, title: 'Armas GLB reales', desc: 'Pistola, SMG, rifle y francotirador del repositorio' },
  { icon: Shield, title: 'Vida estilo Fortnite', desc: '100 HP + 100 escudo; el escudo absorbe primero' },
  { icon: Bomb, title: 'MOLO y humo', desc: 'Granadas incendiarias y cortinas de humo de 12 s' },
  { icon: Wind, title: 'Tirolinas y saltadores', desc: 'Vuela por cables y catapúltate a los edificios' },
  { icon: TreePine, title: 'Mapas separados por modo', desc: 'Ciudadela PvP e Isla Gallo: solo se carga el que juegas' },
  { icon: Zap, title: 'Deslizamiento', desc: 'Agáchate mientras corres para deslizarte con impulso' },
  { icon: Home, title: 'Ciudad con interiores', desc: 'Núcleo central, hotel, torre, mercado, canchas, almacenes' },
  { icon: Video, title: 'Cinemática de entrada', desc: 'Sobrevuelo del mapa al desplegarte por primera vez' },
]

export function InfoPanel() {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {MECHANICS.map(m => (
          <div key={m.title} className="flex gap-2.5 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <m.icon className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
            <div>
              <div className="text-slate-200 text-xs font-bold">{m.title}</div>
              <div className="text-slate-500 text-[10px] leading-snug mt-0.5">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-xl p-4 max-w-2xl">
        <h4 className="text-cyan-200 font-black italic tracking-widest text-xs mb-2 flex items-center gap-2">
          <Trophy className="w-4 h-4" /> MODO ESCARAMUZA
        </h4>
        <p className="text-cyan-100/70 text-xs leading-relaxed">
          Combate por equipos con economía por rondas: gana eliminaciones para tu escuadrón,
          cobra recompensas, compra mejor equipo en tu base y sube al tejado de las casas.
          ¡El primer escuadrón en ganar 5 rondas se lleva la partida!
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Menú principal — pestañas estilo Fortnite
// ============================================================
type MenuTab = 'jugar' | 'controles' | 'ajustes' | 'info'
type PlayMode = 'solo' | 'historia'

export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const [tab, setTab] = useState<MenuTab>('jugar')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<PlayMode>('solo')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [gameMode, setGameMode] = useState<GameMode>('escaramuza')
  const [error, setError] = useState('')

  if (phase !== 'menu') return null

  const launch = (m: PlayMode) => {
    const n = name.trim() || 'Operador'
    if (n.length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setPlayerName(n)
    setError('')
    music.play()   // arranca la música con el gesto del usuario
    music.duck(true)
    setHud({
      mode: 'solo',
      botDifficulty: difficulty,
      gameMode: m === 'historia' ? 'historia' : gameMode,
      netStatus: 'connecting',
      netError: '',
      story: null,
    })
    useGame.getState().setPhase('connecting')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <MenuBackdrop />

      <div className="relative min-h-screen flex flex-col items-center px-4 py-6 sm:py-10">
        {/* logo */}
        <div className="text-center mb-4 select-none">
          <h1 className="font-black italic text-5xl md:text-6xl tracking-tighter -skew-x-6 drop-shadow-[0_4px_24px_rgba(64,120,255,0.35)]">
            <span className="text-white">FRONTERA</span>{' '}
            <span className="bg-gradient-to-b from-yellow-200 to-amber-500 bg-clip-text text-transparent">CERO</span>
          </h1>
          <p className="text-cyan-300/70 tracking-[0.42em] text-[10px] md:text-xs font-black italic mt-1.5">
            FPS TÁCTICO · CAMPAÑA + 4 MODOS PVP · TEMPORADA 4
          </p>
        </div>

        {/* pestañas */}
        <div className="flex items-stretch gap-1.5 sm:gap-2 mb-5">
          <TabButton icon={Play} label="Jugar" active={tab === 'jugar'} onClick={() => setTab('jugar')} />
          <TabButton icon={Keyboard} label="Controles" active={tab === 'controles'} onClick={() => setTab('controles')} />
          <TabButton icon={Settings} label="Ajustes" active={tab === 'ajustes'} onClick={() => setTab('ajustes')} />
          <TabButton icon={Info} label="Información" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        {/* contenido */}
        <div className="w-full max-w-6xl rounded-2xl border border-indigo-400/20 bg-[#0b1030]/90 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-cyan-400/60 via-indigo-400/60 to-yellow-400/60" />

          {tab === 'jugar' && (
            <div className="p-5 sm:p-7 grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
              {/* columna izquierda: despliegue */}
              <div className="space-y-5">
                <div>
                  <label className="text-slate-400 text-[11px] font-black tracking-widest mb-2 block">
                    NOMBRE DEL OPERADOR
                  </label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder="Introduce tu nombre de combate"
                    maxLength={16}
                    className="bg-slate-950/80 border-slate-600 text-white text-lg h-12 font-bold focus:border-yellow-400 focus-visible:ring-yellow-400/30"
                  />
                  {error && <p className="text-red-400 text-xs mt-2 font-bold">{error}</p>}
                </div>

                {/* selector de modo: BOTS (PvP) o HISTORIA (campaña) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { id: 'solo', icon: Bot, title: 'PARTIDA VS BOTS', desc: '4 modos PvP contra IA' },
                    { id: 'historia', icon: BookOpen, title: 'HISTORIA', desc: 'Operación Isla Gallo · 15-20 min' },
                  ] as const).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        mode === m.id
                          ? 'border-yellow-400/80 bg-amber-500/10 shadow-[0_0_18px_rgba(255,200,40,0.15)]'
                          : 'border-slate-700/70 bg-slate-950/50 hover:border-slate-500'
                      }`}
                    >
                      <m.icon className={`w-5 h-5 mb-1.5 ${mode === m.id ? 'text-yellow-300' : 'text-slate-400'}`} />
                      <div className={`text-xs font-black italic tracking-wider ${mode === m.id ? 'text-white' : 'text-slate-300'}`}>
                        {m.title}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>

                {/* selector de modo de juego (solo en partida vs bots) */}
                {mode === 'solo' && (
                  <div>
                    <p className="text-slate-400 text-[11px] font-black tracking-widest mb-2 flex items-center gap-2">
                      <Swords className="w-3.5 h-3.5" /> MODO DE JUEGO
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
                            className={`rounded-xl border p-2.5 text-left transition-all ${
                              active
                                ? 'border-yellow-400/80 bg-amber-500/10 shadow-[0_0_18px_rgba(255,200,40,0.15)]'
                                : 'border-slate-700/70 bg-slate-950/50 hover:border-slate-500'
                            }`}
                          >
                            <Icon className={`w-4 h-4 mb-1 ${active ? 'text-yellow-300' : 'text-slate-400'}`} />
                            <div className={`text-[11px] font-black italic tracking-wider ${active ? 'text-white' : 'text-slate-300'}`}>
                              {m.name}
                            </div>
                            <div className="text-[9px] text-slate-500 leading-snug mt-0.5">{m.desc}</div>
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
                {mode === 'historia' && (
                  <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="DIFICULTAD DE LA CAMPAÑA" />
                )}

                {/* botón grande */}
                <button
                  onClick={() => launch(mode)}
                  className="w-full h-16 -skew-x-6 rounded-xl font-black italic text-2xl tracking-widest transition-all
                    bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 shadow-[0_8px_30px_rgba(255,190,40,0.35)]
                    hover:brightness-110 hover:shadow-[0_8px_38px_rgba(255,190,40,0.55)] active:scale-[0.99]"
                >
                  <span className="skew-x-6 flex items-center justify-center gap-2.5">
                    <Play className="w-6 h-6" />
                    {mode === 'solo' ? '¡A COMBATIR!' : '¡EMPEZAR CAMPAÑA!'}
                  </span>
                </button>
              </div>

              {/* columna derecha: novedades */}
              <div className="border-t lg:border-t-0 lg:border-l border-slate-800/70 pt-5 lg:pt-0 lg:pl-6">
                <h3 className="text-white font-black italic tracking-widest text-sm mb-3.5 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-300" /> NOVEDADES DE LA TEMPORADA 4
                </h3>
                <div className="space-y-2.5">
                  {NEWS.map(n => (
                    <div key={n.title} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-600 transition-colors">
                      <div className="flex items-center gap-2">
                        <n.icon className="w-4 h-4 text-cyan-300 shrink-0" />
                        <div className="text-slate-200 text-xs font-bold">{n.title}</div>
                      </div>
                      <p className="text-slate-500 text-[10px] leading-snug mt-1 pl-6">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'controles' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-white font-black italic tracking-widest text-sm mb-4 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-yellow-300" /> ASIGNACIÓN DE TECLAS
              </h3>
              <KeybindsPanel />
            </div>
          )}

          {tab === 'ajustes' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-white font-black italic tracking-widest text-sm mb-5 flex items-center gap-2">
                <Settings className="w-4 h-4 text-yellow-300" /> AJUSTES DEL JUEGO
              </h3>
              <SettingsPanel />
            </div>
          )}

          {tab === 'info' && (
            <div className="p-5 sm:p-7">
              <h3 className="text-white font-black italic tracking-widest text-sm mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-yellow-300" /> MECÁNICAS DEL JUEGO
              </h3>
              <InfoPanel />
            </div>
          )}
        </div>

        <p className="text-slate-600 text-[10px] mt-6 tracking-widest font-bold">
          FRONTERA CERO v5.0 · THREE.JS · CAMPAÑA + 4 MODOS PVP · MAPA POR MODO (CARGA PEREZOSA)
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
      className={`rounded-lg py-2.5 font-black italic text-[11px] tracking-widest border transition-all -skew-x-6 ${
        active
          ? 'bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 border-yellow-300'
          : 'bg-slate-900/70 border-slate-700 text-slate-400 hover:text-white'
      }`}
    >
      <span className="skew-x-6">{children}</span>
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
      <p className="text-slate-400 text-[11px] font-black tracking-widest mb-2 flex items-center gap-2">
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

const NEWS = [
  { icon: BookOpen, title: 'MODO HISTORIA NUEVO', desc: 'Operación Isla Gallo: 5 fases, jefe final y extracción · 15-20 min' },
  { icon: Home, title: 'Ciudadela Meridiano', desc: 'Núcleo central de 2 plantas, canchas, mercado y red de tirolinas' },
  { icon: Coins, title: '2 ARMAS PERMANENTES', desc: 'Compra dos armas y no las pierdas al morir · huecos 1 y 2' },
  { icon: Zap, title: 'DESLIZAMIENTO', desc: 'Agáchate corriendo para deslizarte (salto con impulso incluido)' },
  { icon: Gauge, title: 'MENOS LAG', desc: 'Vegetación del suelo retirada, mapas por carga perezosa y P2P fuera' },
  { icon: Bot, title: 'Armas y árbol reales (GLB)', desc: 'Modelos del repositorio integrados: pistola, SMG, rifle, francotirador y árboles' },
  { icon: Music, title: 'Sonidos y música reales', desc: 'Disparos y banda sonora con los MP3 subidos al repositorio' },
]

// ============================================================
// Pantalla de conexión (contextual por modo)
// ============================================================
export function ConnectingScreen() {
  const phase = useGame(s => s.phase)
  const gameMode = useGame(s => s.gameMode)
  const netStatus = useGame(s => s.netStatus)
  const netError = useGame(s => s.netError)
  if (phase !== 'connecting') return null

  const showError = netStatus === 'error'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-4">
      <MenuBackdrop />
      {showError ? (
        <div className="relative text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-full border-2 border-red-500/60 flex items-center justify-center text-red-400 text-2xl font-black italic">×</div>
          <p className="text-red-300 text-xl font-black italic tracking-widest">CONEXIÓN FALLIDA</p>
          <p className="text-slate-500 text-sm">{netError || 'Error desconocido'}</p>
          <Button
            onClick={() => useGame.getState().setPhase('menu')}
            className="h-12 px-8 bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 font-black italic tracking-widest hover:brightness-110"
          >
            VOLVER AL MENÚ
          </Button>
        </div>
      ) : (
        <div className="relative text-center space-y-5">
          <Loader2 className="w-12 h-12 text-yellow-300 animate-spin mx-auto" />
          <div>
            <p className="text-white text-xl font-black italic tracking-widest">
              {gameMode === 'historia' ? 'CARGANDO ISLA GALLO' : 'ESTABLECIENDO ENLACE TÁCTICO'}
            </p>
            <p className="text-slate-500 text-sm mt-2">
              {gameMode === 'historia' ? 'Preparando la operación de 5 fases…' : 'Desplegando operadores IA en el mapa…'}
            </p>
          </div>
          <div className="text-slate-600 text-xs font-bold tracking-widest">FRONTERA CERO · v5.0</div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Menú de pausa — mismas pestañas compactas
// ============================================================
type PauseTab = 'controles' | 'ajustes' | 'info'

export function PauseMenu() {
  const phase = useGame(s => s.phase)
  const [tab, setTab] = useState<PauseTab>('controles')
  if (phase !== 'paused') return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-[min(880px,94vw)] max-h-[92vh] overflow-y-auto bg-[#0b1030]/95 border border-indigo-400/25 rounded-2xl shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-cyan-400/60 via-indigo-400/60 to-yellow-400/60" />
        <div className="px-5 sm:px-7 pt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-black italic text-2xl tracking-tight text-white">
            EN <span className="text-yellow-300">PAUSA</span>
          </h2>
          <Button
            onClick={() => getGame()?.requestLock()}
            className="h-11 px-6 bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 font-black italic tracking-widest hover:brightness-110"
          >
            <Play className="w-4 h-4 mr-2" /> REANUDAR
          </Button>
        </div>

        <div className="px-5 sm:px-7 pt-4 flex gap-1.5 sm:gap-2">
          <TabButton icon={Keyboard} label="Controles" active={tab === 'controles'} onClick={() => setTab('controles')} />
          <TabButton icon={Settings} label="Ajustes" active={tab === 'ajustes'} onClick={() => setTab('ajustes')} />
          <TabButton icon={Info} label="Información" active={tab === 'info'} onClick={() => setTab('info')} />
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'controles' && <KeybindsPanel />}
          {tab === 'ajustes' && <SettingsPanel />}
          {tab === 'info' && <InfoPanel />}
        </div>

        <div className="px-5 sm:px-7 pb-6 border-t border-slate-800/70 pt-4">
          <Button
            variant="destructive"
            className="w-full h-11 font-black italic tracking-widest"
            onClick={() => {
              getGame()?.dispose()
              music.duck(false)
              useGame.getState().setPhase('menu')
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> ABANDONAR PARTIDA
          </Button>
        </div>
      </div>
    </div>
  )
}
