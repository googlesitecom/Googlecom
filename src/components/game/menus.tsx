'use client'

import { useState } from 'react'
import { useGame } from '@/game/store'
import { getGame } from '@/game/game-instance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Crosshair, Play, Settings, Volume2, Mouse, Swords, Trophy, Zap,
  Shield, Bomb, Eye, Gauge, LogOut, Loader2, Coins,
} from 'lucide-react'

// ============================================================
// Menú principal
// ============================================================
export function MainMenu() {
  const phase = useGame(s => s.phase)
  const setPlayerName = useGame(s => s.setPlayerName)
  const setPhase = useGame(s => s.setPhase)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  if (phase !== 'menu') return null

  const deploy = () => {
    const n = name.trim() || 'Operador'
    if (n.length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setPlayerName(n)
    setPhase('connecting')
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
        <div className="text-center mb-10">
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
          <div className="bg-stone-900/70 border border-stone-700 rounded-2xl p-8 backdrop-blur shadow-2xl flex flex-col justify-center">
            <label className="text-stone-400 text-xs font-bold tracking-widest mb-2">CALLSIGN DEL OPERADOR</label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') deploy() }}
              placeholder="Introduce tu nombre de combate"
              maxLength={16}
              className="bg-stone-950 border-stone-600 text-stone-100 text-lg h-12 font-bold focus:border-amber-500"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <Button
              onClick={deploy}
              size="lg"
              className="mt-6 h-14 text-xl font-black tracking-widest bg-amber-600 hover:bg-amber-500 text-stone-950"
            >
              <Play className="w-6 h-6 mr-2" /> DESPLEGAR
            </Button>
            <p className="text-stone-500 text-xs mt-4 leading-relaxed">
              Te unirás a una partida en curso con 8 operadores IA en combate.
              Se recomienda ratón y teclado · Chrome/Edge/Firefox.
            </p>
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
          <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 backdrop-blur">
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
                ¡Primera escuadra en 5 rondas gana la partida!
              </p>
            </div>
          </div>
        </div>

        <p className="text-stone-600 text-[10px] mt-8 tracking-widest">
          PROTOTIPO DE JUEGO EN NAVEGADOR · THREE.JS + WEBSOCKET · 100% PROCEDURAL
        </p>
      </div>
    </div>
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

const MECHANICS = [
  { icon: Gauge, title: 'Retroceso realista', desc: 'Patrones de dispersión estilo CS2: controla el spray' },
  { icon: Eye, title: 'Daño por zonas', desc: 'Headshots letales, armadura con casco, caída por distancia' },
  { icon: Coins, title: 'Economía por rondas', desc: 'Cobra por cada baja y victoria, gestiona tu presupuesto' },
  { icon: Swords, title: '8 armas distintas', desc: 'Pistolas, SMG, escopeta, rifles y francotirador' },
  { icon: Shield, title: 'Blindaje y granadas', desc: 'Chaleco+casco, granadas MOLO de área' },
  { icon: Bomb, title: 'Multijugador real', desc: 'Servidor Socket.io con bots IA, 15 Hz de snapshots' },
  { icon: Zap, title: 'Rachas y multimuertes', desc: 'Doble, triple, dominación… anuncios de combate' },
  { icon: Crosshair, title: 'HUD de combate', desc: 'Minimapa con pings, killfeed, hitmarkers y números de daño' },
]

// ============================================================
// Pantalla de conexión
// ============================================================
export function ConnectingScreen() {
  const phase = useGame(s => s.phase)
  if (phase !== 'connecting') return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950 font-mono gap-6">
      <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
      <div className="text-center">
        <p className="text-stone-200 text-xl font-black tracking-widest">ESTABLECIENDO ENLACE TÁCTICO</p>
        <p className="text-stone-500 text-sm mt-2">Conectando con el servidor de combate…</p>
      </div>
      <div className="text-stone-600 text-xs">FRONTERA CERO · v1.0</div>
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
  const setPhase = useGame(s => s.setPhase)
  const [showSettings, setShowSettings] = useState(false)

  if (phase !== 'paused' && phase !== 'playing') return null
  // el menú de pausa en sí lo dibuja GameMount; aquí solo va el panel de ajustes
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
                    <Mouse className="w-3.5 h-3.5" /> SENSIBILIDAD
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
                setPhase('menu')
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> ABANDONAR PARTIDA
            </Button>
          </div>

          <div className="text-[10px] text-stone-600 leading-relaxed">
            <b className="text-stone-500">Controles:</b> WASD mover · Shift esprintar · Ctrl/C agacharse · Espacio saltar ·
            Clic izq. disparar · Clic der. apuntar · R recargar · G granada · B comprar · Q/1-3/rueda armas · Tab marcador
          </div>
        </div>
      </div>
    </div>
  )
}
