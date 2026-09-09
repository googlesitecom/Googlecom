'use client'

import { useEffect, useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Users, Link2, Bot,
  Keyboard, Info, RotateCcw, Home, TreePine, Video, Wind,
} from 'lucide-react'
import {
  DIFFICULTY_LABELS, ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel,
  type BotDifficulty, type ActionId,
} from '@/game/shared'

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
const COMBATE: ActionId[] = ['reload', 'grenadeFrag', 'grenadeSmoke', 'buy', 'lastWeapon', 'slot1', 'slot2', 'slot3']

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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture])
  return { capture, setCapture }
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
        {capturing ? 'PULSA UNA TECLA' : keyLabel(code)}
      </button>
    </div>
  )
}

export function KeybindsPanel() {
  const { capture, setCapture } = useKeyCapture()
  const reset = useGame(s => s.resetKeybinds)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-400 text-xs leading-relaxed max-w-md">
          Haz clic en una tecla y pulsa la nueva asignación. Si la tecla ya está en uso,
          la otra acción se libera automáticamente. <b className="text-slate-300">ESC</b> cancela.
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
            <Crosshair className="w-4 h-4" /> COMBATE
          </h4>
          {COMBATE.map(a => (
            <KeybindRow key={a} action={a} capture={capture} onCapture={setCapture} />
          ))}
        </div>
      </div>

      {/* fijos del ratón */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['CLIC IZQ.', 'Disparar'],
          ['CLIC DER.', 'Apuntar (ADS)'],
          ['RUEDA', 'Cambiar arma'],
        ].map(([k, v]) => (
          <div key={k} className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-800 flex items-center justify-between gap-2">
            <span className="text-slate-500 text-xs font-bold">{v}</span>
            <kbd className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-black text-[10px] tracking-wider">{k}</kbd>
          </div>
        ))}
      </div>

      {/* mando */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
        <h4 className="text-slate-300 font-black italic tracking-widest text-xs mb-3 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-cyan-300" /> MANDO (XBOX · PLAYSTATION · GENÉRICO)
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5 text-[11px]">
          {PAD_CONTROLS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-slate-800/60 pb-1">
              <span className="text-slate-500">{v}</span>
              <span className="text-cyan-200/90 font-bold">{k}</span>
            </div>
          ))}
        </div>
        <p className="text-slate-600 text-[10px] mt-2.5 leading-relaxed">
          Conecta el mando por USB o Bluetooth y pulsa cualquier botón para activarlo.
          La sensibilidad del stick se ajusta en AJUSTES.
        </p>
      </div>
    </div>
  )
}

const PAD_CONTROLS: [string, string][] = [
  ['Stick izq.', 'Moverse'], ['Stick der.', 'Apuntar'],
  ['RT', 'Disparar'], ['LT', 'Apuntar (ADS)'],
  ['A / Cruz', 'Saltar'], ['B / Círc.', 'Agacharse'],
  ['X / Cuadr.', 'Recargar'], ['Y / Triáng.', 'Cambiar arma'],
  ['LB', 'Granada MOLO'], ['RB / ↑', 'Tienda'],
  ['↓', 'Granada de humo'], ['Start', 'Pausa'],
]

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
  { icon: Gauge, title: 'Retroceso realista', desc: 'Patrones de dispersión estilo CS2: controla el spray' },
  { icon: Eye, title: 'Daño por zonas', desc: 'Headshots letales, caída por distancia, cajas y piernas' },
  { icon: Coins, title: 'Economía por rondas', desc: 'Cobra por cada baja y victoria, compra en tu base' },
  { icon: Swords, title: '8 armas + cuchillo', desc: 'Pistolas, SMG, escopeta, rifles y francotirador' },
  { icon: Shield, title: 'Vida estilo Fortnite', desc: '100 HP + 100 escudo; el escudo absorbe primero' },
  { icon: Bomb, title: 'MOLO y humo', desc: 'Granadas incendiarias y cortinas de humo de 12 s' },
  { icon: Wind, title: 'Tirolinas y saltadores', desc: 'Vuela por cables y catapúltate a los contenedores' },
  { icon: TreePine, title: 'Mapa vivo', desc: 'Pasto con viento, arbustos, flores y barriles explosivos' },
  { icon: Zap, title: 'Rachas y multimuertes', desc: 'Doble, triple, dominación… anuncios de combate' },
  { icon: Users, title: 'Salas P2P 1 vs 1', desc: 'Multijugador real por WebRTC (PeerJS) sin servidor propio' },
  { icon: Home, title: '13 edificios con interior', desc: 'Casas de dos plantas, mercado, almacenes y cuarteles' },
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
type PlayMode = 'solo' | 'host' | 'guest'

export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const [tab, setTab] = useState<MenuTab>('jugar')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<PlayMode>('solo')
  const [code, setCode] = useState('')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [fillBots, setFillBots] = useState(0)
  const [error, setError] = useState('')

  if (phase !== 'menu') return null

  const launch = (m: PlayMode, roomCode = '') => {
    const n = name.trim() || 'Operador'
    if (n.length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setPlayerName(n)
    setError('')
    setHud({
      mode: m,
      roomCode,
      botDifficulty: difficulty,
      fillBots,
      netStatus: 'connecting',
      netError: '',
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
            FPS TÁCTICO MULTIJUGADOR · TEMPORADA 3
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

                {/* selector de modo */}
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { id: 'solo', icon: Bot, title: 'BOTS', desc: 'Escaramuza 4v4 contra IA' },
                    { icon: Users, id: 'host', title: 'CREAR SALA', desc: '1v1 con código P2P' },
                    { icon: Link2, id: 'guest', title: 'UNIRSE', desc: 'Entra con un código' },
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

                {/* configuración según modo */}
                {mode === 'solo' && (
                  <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} label="DIFICULTAD DE LA IA" />
                )}
                {mode === 'host' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 text-[11px] font-black tracking-widest mb-2">BOTS DE RELLENO (POR BANDO)</p>
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
                    <label className="text-slate-400 text-[11px] font-black tracking-widest mb-2 block">CÓDIGO DE SALA</label>
                    <Input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      onKeyDown={e => { if (e.key === 'Enter' && code.length >= 4) launch('guest', code) }}
                      placeholder="EJ. K7M2P"
                      className="bg-slate-950/80 border-slate-600 text-white text-2xl h-14 font-black tracking-[0.3em] text-center"
                    />
                    <p className="text-slate-600 text-[10px] mt-2 leading-relaxed">
                      Conexión P2P (WebRTC) a través del servidor público de señalización PeerJS.
                    </p>
                  </div>
                )}

                {/* botón grande */}
                <button
                  onClick={() => launch(mode, mode === 'guest' ? code : '')}
                  disabled={mode === 'guest' && code.length < 4}
                  className="w-full h-16 -skew-x-6 rounded-xl font-black italic text-2xl tracking-widest transition-all
                    bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 shadow-[0_8px_30px_rgba(255,190,40,0.35)]
                    hover:brightness-110 hover:shadow-[0_8px_38px_rgba(255,190,40,0.55)] active:scale-[0.99]
                    disabled:opacity-40 disabled:shadow-none"
                >
                  <span className="skew-x-6 flex items-center justify-center gap-2.5">
                    <Play className="w-6 h-6" />
                    {mode === 'solo' ? '¡A COMBATIR!' : mode === 'host' ? '¡CREAR SALA!' : '¡UNIRSE!'}
                  </span>
                </button>
              </div>

              {/* columna derecha: novedades */}
              <div className="border-t lg:border-t-0 lg:border-l border-slate-800/70 pt-5 lg:pt-0 lg:pl-6">
                <h3 className="text-white font-black italic tracking-widest text-sm mb-3.5 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-300" /> NOVEDADES DE LA TEMPORADA 3
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
          FRONTERA CERO v3.0 · THREE.JS + WEBRTC (PEERJS) · 100% PROCEDURAL · MAPA 140×140 M
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
  { icon: Home, title: 'Ciudad ordenada, 13 edificios', desc: 'Colonias con casas de dos plantas, calles limpias y depósitos alineados' },
  { icon: Keyboard, title: 'Menú estilo Fortnite', desc: 'Pestañas JUGAR · CONTROLES · AJUSTES · INFO con teclas reasignables' },
  { icon: Bomb, title: 'Granadas de humo', desc: 'Cortinas tácticas de 12 s que bloquean la visión de los bots' },
  { icon: TreePine, title: 'Más vegetación', desc: '14.000 briznas de pasto con viento, arbustos y flores silvestres' },
  { icon: Video, title: 'Cinemática de entrada', desc: 'Sobrevuelo del mapa al desplegarte — clic para omitir' },
  { icon: Shield, title: 'IA rebalanceada', desc: 'Cuatro dificultades con reacción, puntería y error escalados' },
]

// ============================================================
// Pantalla de conexión (contextual por modo)
// ============================================================
export function ConnectingScreen() {
  const phase = useGame(s => s.phase)
  const mode = useGame(s => s.mode)
  const roomCode = useGame(s => s.roomCode)
  const netStatus = useGame(s => s.netStatus)
  const netError = useGame(s => s.netError)
  if (phase !== 'connecting') return null

  const showError = mode === 'guest' && netStatus === 'error'

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
          {mode === 'guest' ? (
            <div>
              <p className="text-white text-xl font-black italic tracking-widest">UNIÉNDOSE A LA SALA</p>
              <p className="text-yellow-300 text-3xl font-black italic tracking-[0.3em] mt-3">{roomCode}</p>
              <p className="text-slate-500 text-sm mt-3">Estableciendo enlace P2P con el anfitrión…</p>
            </div>
          ) : mode === 'host' ? (
            <div>
              <p className="text-white text-xl font-black italic tracking-widest">CREANDO SALA TÁCTICA</p>
              <p className="text-slate-500 text-sm mt-2">Registrando sala en el servidor público…</p>
            </div>
          ) : (
            <div>
              <p className="text-white text-xl font-black italic tracking-widest">ESTABLECIENDO ENLACE TÁCTICO</p>
              <p className="text-slate-500 text-sm mt-2">Desplegando operadores IA en el mapa…</p>
            </div>
          )}
          <div className="text-slate-600 text-xs font-bold tracking-widest">FRONTERA CERO · v3.0</div>
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
