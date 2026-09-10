'use client'

// ============================================================
// EMERGENCY STRIKE — Pantalla de carga (v6.2)
// Al abrir la página: 3 segundos exactos, diseño sobrio y
// fino (militar/táctico): logo con trazo, barra fina de
// progreso, consejos rotativos y porcentaje.
// ============================================================
import { useEffect, useRef, useState } from 'react'

const TIPS = [
  'Consejo: agáchate mientras corres para deslizarte por las rampas',
  'Consejo: el escudo absorbe el daño antes que la vida',
  'Consejo: compra dos armas y equípalas en el hueco que quieras — no se pierden al caer',
  'Consejo: mantén la calma al apuntar: la retícula se cierra al frenar',
  'Consejo: la música se ajusta en AJUSTES · AUDIO',
  'Consejo: los barriles rojos explotan: úsalos a tu favor',
  'Consejo: la tecla E agarra tirolinas y coloca cargas',
]

const DURATION = 3000   // ms — pantalla fina de 3 segundos

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  // el consejo inicial NO se aleatoriza en el primer render (el HTML
  // prerenderizado debe coincidir para que la hidratación no falle)
  const [tip, setTip] = useState(0)
  const [fading, setFading] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    // aleatorizar SOLO en el cliente (ya montado)
    setTip(Math.floor(Math.random() * TIPS.length))
    const start = performance.now()
    let raf = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION)
      // easing suave (rápido al inicio, preciso al final)
      const eased = 1 - (1 - t) ** 2.2
      setProgress(eased)
      if (t < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setFading(true)
        setTimeout(() => {
          if (!doneRef.current) {
            doneRef.current = true
            onDone()
          }
        }, 550)
      }
    }
    raf = requestAnimationFrame(step)
    const tipTimer = setInterval(() => setTip(i => (i + 1) % TIPS.length), 950)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tipTimer)
    }
  }, [onDone])

  const pct = Math.round(progress * 100)

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none transition-opacity duration-500"
      style={{
        background: 'radial-gradient(120% 90% at 50% 30%, #101418 0%, #070809 60%, #040506 100%)',
        opacity: fading ? 0 : 1,
      }}
    >
      {/* retícula sutil de fondo */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(190,200,210,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(190,200,210,0.8) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* logo */}
      <div className="relative text-center">
        <h1
          className="text-4xl sm:text-5xl font-extrabold tracking-[0.34em] text-stone-100"
          style={{ textShadow: '0 2px 30px rgba(217,160,91,0.25)' }}
        >
          EMERGENCY
        </h1>
        <div className="mt-1 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-stone-600" />
          <span className="text-xs font-bold tracking-[0.55em] text-amber-200/80">STRIKE</span>
          <span className="h-px w-10 bg-stone-600" />
        </div>
        <p className="mt-4 text-[10px] font-semibold tracking-[0.4em] text-stone-500 uppercase">
          Operación Ceniza · v6.2
        </p>
      </div>

      {/* barra de progreso fina */}
      <div className="relative mt-10 w-64 sm:w-80">
        <div className="h-[3px] w-full rounded-full bg-stone-800/90 overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, #8a6b3d, #e7b56a)',
              boxShadow: '0 0 12px rgba(231,181,106,0.55)',
            }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[0.3em] text-stone-500">
            {pct < 100 ? 'CARGANDO SISTEMAS' : 'LISTO'}
          </span>
          <span className="text-[10px] font-bold tabular-nums tracking-widest text-amber-200/70">
            {pct}%
          </span>
        </div>
      </div>

      {/* consejo rotativo */}
      <div className="absolute bottom-12 px-8 text-center max-w-md">
        <p key={tip} className="text-[11px] leading-relaxed text-stone-500 animate-pulse">
          {TIPS[tip]}
        </p>
      </div>

      {/* marca de esquina */}
      <div className="absolute bottom-4 right-5 text-[9px] font-semibold tracking-[0.3em] text-stone-700">
        EMS // WEBGL
      </div>
    </div>
  )
}
