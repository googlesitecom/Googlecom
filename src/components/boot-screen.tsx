'use client'

// ============================================================
// EMERGENCY STRIKE — Loading screen (v7)
// Full-bleed combat artwork (img/carga.jpg) with tactical
// typography, thin progress bar, rotating English tips and
// percentage readout.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { ASSET_BASE } from '@/game/shared'

const TIPS = [
  'TIP: crouch while sprinting to slide down ramps',
  'TIP: your shield absorbs damage before health',
  'TIP: buy two weapons and equip them in any slot — they are kept on death',
  'TIP: stay calm when aiming: the crosshair tightens when you stand still',
  'TIP: music can be adjusted in SETTINGS · AUDIO',
  'TIP: red barrels explode — use them to your advantage',
  'TIP: press E to grab ziplines and plant charges',
  'TIP: headshots deal up to 4x damage',
]

const DURATION = 3000   // ms — 3 second loading screen

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  // the initial tip is NOT randomized on first render (prerendered HTML
  // must match so hydration doesn't fail)
  const [tip, setTip] = useState(0)
  const [fading, setFading] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    // randomize ONLY on the client (already mounted)
    setTip(Math.floor(Math.random() * TIPS.length))
    const start = performance.now()
    let raf = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION)
      // smooth easing (fast at the start, precise at the end)
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
      style={{ opacity: fading ? 0 : 1 }}
    >
      {/* combat artwork background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${ASSET_BASE}/img/carga.jpg)` }}
      />
      {/* dark tactical grade over the artwork */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,8,10,0.66) 0%, rgba(6,8,10,0.42) 40%, rgba(4,5,6,0.9) 100%)' }} />
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 82% 74% at 50% 46%, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />
      {/* subtle technical grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(190,200,210,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(190,200,210,0.8) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* logo */}
      <div className="relative text-center">
        <h1
          className="font-tac text-5xl sm:text-6xl tracking-[0.30em] text-stone-100 uppercase"
          style={{ textShadow: '0 2px 34px rgba(217,160,91,0.35), 0 1px 3px rgba(0,0,0,0.9)' }}
        >
          Emergency
        </h1>
        <div className="mt-1 flex items-center justify-center gap-3">
          <span className="h-px w-12 bg-stone-500/70" />
          <span className="font-tac-md text-sm tracking-[0.55em] text-amber-200/90">Strike</span>
          <span className="h-px w-12 bg-stone-500/70" />
        </div>
        <p className="font-tac-md mt-4 text-[11px] tracking-[0.4em] text-stone-400">
          Operation Ashfall · v7
        </p>
      </div>

      {/* thin progress bar */}
      <div className="relative mt-10 w-72 sm:w-96">
        <div className="h-[3px] w-full rounded-full bg-stone-800/90 overflow-hidden">
          <div
            className="h-full rounded-full transition-none tac-glow"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, #8a6b3d, #e7b56a)',
            }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-tac-md text-[10px] text-stone-400">
            {pct < 100 ? 'LOADING SYSTEMS' : 'READY'}
          </span>
          <span className="font-tac text-[11px] tabular-nums tracking-widest text-amber-200/80">
            {pct}%
          </span>
        </div>
      </div>

      {/* rotating tip */}
      <div className="absolute bottom-12 px-8 text-center max-w-md">
        <p key={tip} className="font-tac-md text-[11px] leading-relaxed text-stone-400 animate-pulse">
          {TIPS[tip]}
        </p>
      </div>

      {/* corner marks */}
      <div className="absolute inset-4 border border-stone-700/25 rounded-sm pointer-events-none" />
      <div className="absolute bottom-4 right-5 font-tac-md text-[9px] tracking-[0.3em] text-stone-600">
        EMS // WEBGL
      </div>
    </div>
  )
}
