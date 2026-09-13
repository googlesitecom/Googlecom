'use client'

// ============================================================
// EMERGENCY STRIKE — Login / Register screen (v9)
// Shows right after the loading screen: pick a unique operator
// name + password. Accounts and career profiles persist in the
// browser (localStorage). All copy in English.
// ============================================================
import { useState } from 'react'
import { login, register, validateName, validatePass } from '@/game/auth'
import { getAudio } from '@/game/audio'
import { ASSET_BASE } from '@/game/shared'
import { Crosshair, Loader2, LogIn, ShieldCheck, UserPlus, Lock, User } from 'lucide-react'

export function AuthScreen() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (busy) return
    setError('')
    getAudio().uiClick()
    if (tab === 'register') {
      const nv = validateName(name)
      if (nv) { setError(nv); return }
      const pv = validatePass(pass)
      if (pv) { setError(pv); return }
      if (pass !== pass2) { setError('Passwords do not match'); return }
      setBusy(true)
      const r = await register(name, pass)
      setBusy(false)
      if (!r.ok) { setError(r.error ?? 'Registration failed'); return }
    } else {
      setBusy(true)
      const r = await login(name, pass)
      setBusy(false)
      if (!r.ok) { setError(r.error ?? 'Login failed'); return }
    }
  }

  const canSubmit = name.trim().length > 0 && pass.length > 0 && (tab === 'login' || pass2.length > 0)

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center select-none">
      {/* combat artwork backdrop (same as the loading screen) */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${ASSET_BASE}/img/carga.jpg)` }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(4,6,8,0.88) 0%, rgba(4,6,8,0.72) 45%, rgba(3,4,5,0.94) 100%)' }} />
      <div className="absolute inset-4 border border-stone-700/25 rounded-sm pointer-events-none" />

      <div className="relative w-[min(430px,94vw)] bg-[#0b0e11]/95 backdrop-blur-md border border-stone-800 shadow-2xl rounded-xl p-6 sm:p-8">
        {/* header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-md border border-amber-700/50 bg-amber-950/30 flex items-center justify-center shrink-0">
            <Crosshair className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="font-tac text-xl tracking-[0.18em] text-stone-100 uppercase leading-none">
              Operator <span className="text-amber-300">Access</span>
            </h2>
            <p className="font-tac-md text-[10px] text-stone-500 mt-1 tracking-wider">
              CREATE YOUR IDENTITY · TRACK YOUR CAREER
            </p>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 mb-5 border-b border-stone-800">
          {([
            { id: 'login', label: 'LOG IN', icon: LogIn },
            { id: 'register', label: 'REGISTER', icon: UserPlus },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(''); getAudio().uiClick() }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-tac-md text-[12px] border-t-2 transition-colors ${
                tab === t.id
                  ? 'text-amber-200 border-amber-500/80 bg-stone-100/[0.04]'
                  : 'text-stone-400 border-transparent hover:text-stone-200'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* form */}
        <div className="space-y-4">
          <div>
            <label className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Operator name
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) void submit() }}
              maxLength={16}
              autoComplete="username"
              placeholder="E.G. NIGHTHAWK"
              className="w-full h-12 rounded-md bg-stone-950/80 border border-stone-600 text-white text-lg font-bold px-4 focus:border-amber-500/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 tracking-wider"
            />
          </div>
          <div>
            <label className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Password
            </label>
            <input
              type="password"
              value={pass}
              onChange={e => { setPass(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) void submit() }}
              maxLength={64}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              className="w-full h-12 rounded-md bg-stone-950/80 border border-stone-600 text-white text-lg font-bold px-4 focus:border-amber-500/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 tracking-widest"
            />
          </div>
          {tab === 'register' && (
            <div>
              <label className="font-tac-md text-stone-400 text-[11px] mb-2 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" /> Confirm password
              </label>
              <input
                type="password"
                value={pass2}
                onChange={e => { setPass2(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && canSubmit) void submit() }}
                maxLength={64}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-12 rounded-md bg-stone-950/80 border border-stone-600 text-white text-lg font-bold px-4 focus:border-amber-500/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 tracking-widest"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs font-bold bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={!canSubmit || busy}
            className="w-full h-13 py-3.5 rounded-md font-tac text-base tracking-[0.28em] uppercase transition-all
              bg-stone-100 text-stone-900 hover:bg-amber-200 active:scale-[0.99]
              disabled:opacity-30 disabled:cursor-not-allowed
              flex items-center justify-center gap-3"
          >
            {busy
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : tab === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {tab === 'login' ? 'Enter the fight' : 'Create operator'}
          </button>
        </div>

        <p className="text-stone-600 text-[10px] leading-relaxed mt-5 text-center">
          Your account and career stats (kills · wins · win streak record · Battle Royale
          placements) are stored on this device and restored on every visit.
        </p>
      </div>
    </div>
  )
}
