'use client'

import { useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins, Gamepad2, Users, Link2, Bot,
} from 'lucide-react'
import { DIFFICULTY_LABELS, type BotDifficulty } from '@/game/shared'

// ============================================================
// Menú principal — selección de modo
// ============================================================
type MenuView = 'home' | 'solo' | 'host' | 'guest'

export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setHud = useGame(s => s.setHud)
  const [name, setName] = useState('')
  const [view, setView] = useState<MenuView>('home')
  const [code, setCode] = useState('')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [fillBots, setFillBots] = useState(0)
  const [error, setError] = useState('')

  if (phase !== 'menu') return null

  const validateName = (): boolean => {
    const n = name.trim() || 'Operador'
    if (n.length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return false }
    setPlayerName(n)
    return true
  }

  const launch = (mode: 'solo' | 'host' | 'guest', roomCode = '') => {
    if (!validateName()) return
    setError('')
    setHud({ mode, roomCode, botDifficulty: difficulty, fillBots, netStatus: 'connecting', netError: '' })
    useGame.getState().setPhase('connecting')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950 font-mono">
      {/* fondo táctico */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse at 70% 20%, rgba(245,158,11,0.14), transparent 55%), radial-gradient(ellipse at 25% 85%, rgba(120,80,30,0.25), transparent 60%), #0c0a08',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(rgba(245,158,11,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.6) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-10">
        {/* título */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Crosshair className="w-10 h-10 text-amber-400" />
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-stone-100">
              FRONTERA <span className="text-amber-400">CERO</span>
            </h1>
          </div>
          <p className="text-amber-200/70 tracking-[0.35em] text-xs md:text-sm font-bold">
            FPS TÁCTICO MULTIJUGADOR · JUGABILIDAD CS2 · ESTÉTICA WARZONE
          </p>
        </div>

        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_1.1fr] gap-6 items-stretch">
          {/* panel de despliegue */}
          <div className="bg-stone-900/70 border border-stone-700 rounded-2xl p-8 backdrop-blur shadow-2xl flex flex-col">
            <label className="text-stone-400 text-xs font-bold tracking-widest mb-2">CALLSIGN DEL OPERADOR</label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="Introduce tu nombre de combate"
              maxLength={16}
              className="bg-stone-950 border-stone-600 text-stone-100 text-lg h-12 font-bold focus:border-amber-500"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

            {view === 'home' && (
              <div className="mt-6 space-y-3">
                <ModeButton
                  icon={Bot}
                  title="ENTRENAMIENTO CON BOTS"
                  desc="Partida rápida 4 vs 4 contra IA — elige la dificultad"
                  onClick={() => setView('solo')}
                  accent="amber"
                />
                <ModeButton
                  icon={Users}
                  title="CREAR SALA 1 vs 1"
                  desc="Genera un código y compártelo: P2P por PeerJS, sin servidores propios"
                  onClick={() => setView('host')}
                  accent="green"
                />
                <ModeButton
                  icon={Link2}
                  title="UNIRSE A SALA"
                  desc="¿Tu rival te pasó un código? Entra y combate"
                  onClick={() => setView('guest')}
                  accent="sky"
                />
              </div>
            )}

            {view === 'solo' && (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-stone-400 text-xs font-bold tracking-widest mb-2 flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5" /> DIFICULTAD DE LA IA
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(DIFFICULTY_LABELS) as BotDifficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`rounded-lg px-2 py-2.5 text-[11px] font-black tracking-widest border transition-colors ${
                          difficulty === d
                            ? 'bg-amber-950 border-amber-600 text-amber-300'
                            : 'bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {DIFFICULTY_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={() => launch('solo')}
                  size="lg"
                  className="h-13 text-xl font-black tracking-widest bg-amber-600 hover:bg-amber-500 text-stone-950"
                >
                  <Play className="w-5 h-5 mr-2" /> DESPLEGAR CONTRA BOTS
                </Button>
                <BackLink onClick={() => setView('home')} />
              </div>
            )}

            {view === 'host' && (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-stone-400 text-xs font-bold tracking-widest mb-2">BOTS DE RELLENO (POR BANDO)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setFillBots(n)}
                        className={`rounded-lg px-2 py-2.5 text-[11px] font-black tracking-widest border transition-colors ${
                          fillBots === n
                            ? 'bg-green-950 border-green-600 text-green-300'
                            : 'bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {n === 0 ? 'PURO 1v1' : `${n} vs ${n}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-stone-400 text-xs font-bold tracking-widest mb-2 flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5" /> DIFICULTAD DE LOS BOTS
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(DIFFICULTY_LABELS) as BotDifficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`rounded-lg px-2 py-2.5 text-[11px] font-black tracking-widest border transition-colors ${
                          difficulty === d
                            ? 'bg-amber-950 border-amber-600 text-amber-300'
                            : 'bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {DIFFICULTY_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={() => launch('host')}
                  size="lg"
                  className="h-13 text-xl font-black tracking-widest bg-green-600 hover:bg-green-500 text-stone-950"
                >
                  <Users className="w-5 h-5 mr-2" /> CREAR SALA
                </Button>
                <p className="text-stone-500 text-[11px] leading-relaxed">
                  Se generará un código de 5 caracteres. La partida arranca de inmediato:
                  cuando tu rival entre con el código, se unirá al bando VERDE.
                </p>
                <BackLink onClick={() => setView('home')} />
              </div>
            )}

            {view === 'guest' && (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-stone-400 text-xs font-bold tracking-widest mb-2 block">CÓDIGO DE SALA</label>
                  <Input
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    onKeyDown={e => { if (e.key === 'Enter' && code.length >= 4) launch('guest', code) }}
                    placeholder="Ej. K7M2P"
                    className="bg-stone-950 border-stone-600 text-stone-100 text-2xl h-14 font-black tracking-[0.3em] text-center focus:border-sky-500"
                  />
                </div>
                <Button
                  onClick={() => launch('guest', code)}
                  disabled={code.length < 4}
                  size="lg"
                  className="h-13 text-xl font-black tracking-widest bg-sky-600 hover:bg-sky-500 text-stone-950 disabled:opacity-40"
                >
                  <Link2 className="w-5 h-5 mr-2" /> UNIRSE AL COMBATE
                </Button>
                <p className="text-stone-500 text-[11px] leading-relaxed">
                  Conexión P2P (WebRTC) a través del servidor público de señalización PeerJS.
                </p>
                <BackLink onClick={() => setView('home')} />
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-stone-800 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-stone-400">
              {CONTROLS.map(c => (
                <div key={c[0]} className="flex justify-between gap-2">
                  <span className="text-stone-500">{c[1]}</span>
                  <kbd className="bg-stone-800 text-amber-300 px-1.5 py-0.5 rounded font-bold">{c[0]}</kbd>
                </div>
              ))}
            </div>
          </div>

          {/* mecánicas */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 backdrop-blur flex flex-col">
            <h2 className="text-stone-300 font-black tracking-widest text-sm mb-4 flex items-center gap-2">
              <Swords className="w-4 h-4 text-amber-400" /> MECÁNICAS DE COMBATE
            </h2>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {MECHANICS.map(m => (
                <div key={m.title} className="flex gap-2.5 bg-stone-950/60 border border-stone-800 rounded-lg p-3">
                  <m.icon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-stone-200 text-xs font-bold">{m.title}</div>
                    <div className="text-stone-500 text-[10px] leading-snug mt-0.5">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 flex items-start gap-2">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200/80 text-[11px] leading-relaxed">
                <b>Modo Escaramuza:</b> muerte por equipos con economía por rondas.
                Gana eliminaciones para tu escuadrón, cobra recompensas y compra mejor equipo.
                ¡Primera escuadrón en 5 rondas gana la partida!
              </p>
            </div>
            <div className="mt-3 bg-stone-950/60 border border-stone-800 rounded-lg p-3">
              <h3 className="text-stone-300 font-black tracking-widest text-[11px] mb-2 flex items-center gap-2">
                <Gamepad2 className="w-3.5 h-3.5 text-amber-400" /> COMPATIBLE CON MANDO
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-stone-400">
                {PAD_CONTROLS.map(c => (
                  <div key={c[0]} className="flex justify-between gap-2">
                    <span className="text-stone-500">{c[1]}</span>
                    <span className="text-amber-300/80 font-bold">{c[0]}</span>
                  </div>
                ))}
              </div>
              <p className="text-stone-600 text-[10px] mt-2 leading-relaxed">
                Conecta el mando por USB o Bluetooth y pulsa cualquier botón.
                Compatible con Xbox, PlayStation y genéricos (API estándar Gamepad).
              </p>
            </div>
          </div>
        </div>

        <p className="text-stone-600 text-[10px] mt-8 tracking-widest">
          PROTOTIPO DE JUEGO EN NAVEGADOR · THREE.JS + WEBRTC (PEERJS) · 100% PROCEDURAL · MAPA 110×110 M
        </p>
      </div>
    </div>
  )
}

function ModeButton({ icon: Icon, title, desc, onClick, accent }: {
  icon: typeof Bot
  title: string
  desc: string
  onClick: () => void
  accent: 'amber' | 'green' | 'sky'
}) {
  const accents = {
    amber: 'hover:border-amber-600/70 hover:bg-amber-950/20 text-amber-400',
    green: 'hover:border-green-600/70 hover:bg-green-950/20 text-green-400',
    sky: 'hover:border-sky-600/70 hover:bg-sky-950/20 text-sky-400',
  }
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border border-stone-700 bg-stone-950/60 p-4 transition-colors group ${accents[accent]}`}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6 shrink-0" />
        <div>
          <div className="text-stone-100 text-sm font-black tracking-widest group-hover:text-stone-50">{title}</div>
          <div className="text-stone-500 text-[11px] leading-snug mt-0.5">{desc}</div>
        </div>
      </div>
    </button>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-stone-500 hover:text-stone-300 text-xs font-bold tracking-widest transition-colors"
    >
      ← VOLVER
    </button>
  )
}

const CONTROLS: [string, string][] = [
  ['WASD', 'Moverse'],
  ['Shift', 'Esprintar'],
  ['Ctrl / C', 'Agacharse'],
  ['Espacio', 'Saltar'],
  ['Clic izq.', 'Disparar'],
  ['Clic der.', 'Apuntar (ADS)'],
  ['R', 'Recargar'],
  ['B', 'Menú de compra'],
  ['G', 'Granada'],
  ['Q / 1-3', 'Cambiar arma'],
  ['Tab', 'Marcador'],
  ['ESC', 'Pausa'],
]

const PAD_CONTROLS: [string, string][] = [
  ['Stick izq.', 'Moverse'],
  ['Stick der.', 'Apuntar'],
  ['RT', 'Disparar'],
  ['LT', 'Apuntar (ADS)'],
  ['A / Cruz', 'Saltar'],
  ['B / Círc.', 'Agacharse'],
  ['X / Cuadr.', 'Recargar'],
  ['Y / Triáng.', 'Cambiar arma'],
  ['LB', 'Granada'],
  ['RB', 'Comprar'],
  ['Start', 'Pausa'],
  ['Back', 'Marcador'],
]

const MECHANICS = [
  { icon: Gauge, title: 'Retroceso realista', desc: 'Patrones de dispersión estilo CS2: controla el spray' },
  { icon: Eye, title: 'Daño por zonas', desc: 'Headshots letales, armadura con casco, caída por distancia' },
  { icon: Coins, title: 'Economía por rondas', desc: 'Cobra por cada baja y victoria, gestiona tu presupuesto' },
  { icon: Swords, title: '8 armas distintas', desc: 'Pistolas, SMG, escopeta, rifles y francotirador' },
  { icon: Shield, title: 'Escudo y granadas', desc: 'Escudo de 100, pociones por el mapa, granadas MOLO' },
  { icon: Bomb, title: 'Salas P2P 1 vs 1', desc: 'Multijugador real por WebRTC (PeerJS) sin servidor propio' },
  { icon: Zap, title: 'Rachas y multimuertes', desc: 'Doble, triple, dominación… anuncios de combate' },
  { icon: Crosshair, title: 'HUD de combate', desc: 'Minimapa con pings, killfeed, hitmarkers y números de daño' },
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950 font-mono gap-6 px-4">
      {showError ? (
        <>
          <div className="w-14 h-14 rounded-full border-2 border-red-500/60 flex items-center justify-center text-red-400 text-2xl font-black">×</div>
          <div className="text-center">
            <p className="text-red-300 text-xl font-black tracking-widest">CONEXIÓN FALLIDA</p>
            <p className="text-stone-500 text-sm mt-2">{netError || 'Error desconocido'}</p>
          </div>
          <Button
            onClick={() => useGame.getState().setPhase('menu')}
            className="h-12 px-8 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black tracking-widest"
          >
            VOLVER AL MENÚ
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
          <div className="text-center">
            {mode === 'guest' ? (
              <>
                <p className="text-stone-200 text-xl font-black tracking-widest">UNIÉNDOSE A LA SALA</p>
                <p className="text-amber-300 text-3xl font-black tracking-[0.3em] mt-3">{roomCode}</p>
                <p className="text-stone-500 text-sm mt-3">Estableciendo enlace P2P con el anfitrión…</p>
              </>
            ) : mode === 'host' ? (
              <>
                <p className="text-stone-200 text-xl font-black tracking-widest">CREANDO SALA TÁCTICA</p>
                <p className="text-stone-500 text-sm mt-2">Registrando sala en el servidor público…</p>
              </>
            ) : (
              <>
                <p className="text-stone-200 text-xl font-black tracking-widest">ESTABLECIENDO ENLACE TÁCTICO</p>
                <p className="text-stone-500 text-sm mt-2">Desplegando operadores IA en el mapa…</p>
              </>
            )}
          </div>
          <div className="text-stone-600 text-xs">FRONTERA CERO · v2.0</div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Menú de pausa (configuración)
// ============================================================
export function PauseMenu() {
  const phase = useGame(s => s.phase)
  const settings = useGame(s => s.settings)
  const setSettings = useGame(s => s.setSettings)
  const [showSettings, setShowSettings] = useState(false)

  if (phase !== 'paused') return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 font-mono">
      <div className="w-[min(560px,92vw)] bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-stone-900/90 border-b border-stone-800 flex items-center gap-3">
          <Settings className="w-5 h-5 text-amber-400" />
          <h2 className="font-black tracking-widest text-stone-200">EN PAUSA</h2>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <Button
              onClick={() => getGame()?.requestLock()}
              className="h-11 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black tracking-widest"
            >
              <Play className="w-4 h-4 mr-2" /> REANUDAR
            </Button>
            <Button
              onClick={() => setShowSettings(s => !s)}
              variant="secondary"
              className="h-11 font-bold"
            >
              <Settings className="w-4 h-4 mr-2" /> AJUSTES
            </Button>
          </div>

          {showSettings && (
            <div className="space-y-5 bg-stone-950/60 border border-stone-800 rounded-xl p-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-stone-400 text-xs font-bold tracking-widest flex items-center gap-2">
                    <Mouse className="w-3.5 h-3.5" /> SENSIBILIDAD RATÓN
                  </span>
                  <span className="text-amber-300 font-black tabular-nums text-sm">{settings.sens.toFixed(2)}</span>
                </div>
                <Slider
                  min={0.2} max={3} step={0.05}
                  value={[settings.sens]}
                  onValueChange={v => setSettings({ sens: v[0] })}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-stone-400 text-xs font-bold tracking-widest flex items-center gap-2">
                    <Gamepad2 className="w-3.5 h-3.5" /> SENSIBILIDAD MANDO
                  </span>
                  <span className="text-amber-300 font-black tabular-nums text-sm">{settings.padSens.toFixed(2)}</span>
                </div>
                <Slider
                  min={0.2} max={3} step={0.05}
                  value={[settings.padSens]}
                  onValueChange={v => setSettings({ padSens: v[0] })}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-stone-400 text-xs font-bold tracking-widest flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5" /> VOLUMEN
                  </span>
                  <span className="text-amber-300 font-black tabular-nums text-sm">{Math.round(settings.volume * 100)}</span>
                </div>
                <Slider
                  min={0} max={1} step={0.05}
                  value={[settings.volume]}
                  onValueChange={v => {
                    setSettings({ volume: v[0] })
                    getGame()?.audio.setVolume(v[0])
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {(['baja', 'media', 'alta'] as const).map(q => (
                  <button
                    key={q}
                    onClick={() => setSettings({ quality: q })}
                    className={`rounded-lg px-3 py-2 font-bold tracking-widest border transition-colors ${
                      settings.quality === q
                        ? 'bg-amber-950 border-amber-600 text-amber-300'
                        : 'bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300'
                    } ${q === 'alta' ? 'col-span-2' : ''}`}
                  >
                    GRÁFICOS {q.toUpperCase()}
                  </button>
                ))}
                <p className="col-span-2 text-stone-600 text-[10px] text-center">
                  El cambio de calidad de sombras se aplica al recargar la partida
                </p>
              </div>
            </div>
          )}

          <div className="border-t border-stone-800 pt-4">
            <Button
              variant="destructive"
              className="w-full h-11 font-black tracking-widest"
              onClick={() => {
                getGame()?.dispose()
                setPhaseMenu()
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> ABANDONAR PARTIDA
            </Button>
          </div>

          <div className="text-[10px] text-stone-600 leading-relaxed">
            <b className="text-stone-500">Teclado:</b> WASD · Shift esprintar · Ctrl/C agacharse · Espacio saltar ·
            Clic disparar/apuntar · R recargar · G granada · B comprar · Tab marcador
            <br />
            <b className="text-stone-500">Mando:</b> sticks mover/apuntar · RT disparar · LT apuntar · A saltar ·
            B agacharse · X recargar · Y arma · LB granada · RB comprar · Start pausa
            <br />
            <b className="text-stone-500">Vida:</b> el escudo absorbe el daño primero · regeneras vida tras 8 s sin
            recibir daño · <span className="text-sky-400">pociones</span> y <span className="text-red-400">botiquines</span> flotan por el mapa: acércate para recogerlos
          </div>
        </div>
      </div>
    </div>
  )
}

function setPhaseMenu(): void {
  useGame.getState().setPhase('menu')
}
