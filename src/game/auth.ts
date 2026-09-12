// ============================================================
// EMERGENCY STRIKE — Authentication & career profile (v9)
// Local account system with persistent profiles:
//  - unique operator name + password (salted SHA-256 via WebCrypto)
//  - career stats (kills, wins, best win streak, BR record...)
//  - v11 REAL friends: every account gets a 6-char OPERATOR ID;
//    friend requests travel the real network (esnet.ts) and the
//    OTHER operator has to ACCEPT. Battle Royale is always SOLOS.
//  - persisted in localStorage (es-accounts / es-session / es-profile-<n>)
// ============================================================
import { create } from 'zustand'

export interface SquadGroup {
  id: string
  name: string
  members: string[]
}

/** v11: a REAL friend — identified by their Operator ID */
export interface FriendEntry {
  oid: string
  name: string
  since: number
}

export interface CareerProfile {
  kills: number
  deaths: number
  headshots: number
  wins: number
  losses: number
  matches: number
  winStreak: number
  bestWinStreak: number
  brPlays: number
  brWins: number
  brTop: number            // best placement (1 = champion)
  brKills: number
  storyWins: number
  timePlayed: number       // seconds
  createdAt: number
  lastPlayed: number
  /** v11: real friends (accepted through the network) */
  friends: FriendEntry[]
  /** v10 (legacy, kept for compatibility — real squads are v11 parties) */
  groups: SquadGroup[]
}

export const EMPTY_PROFILE: CareerProfile = {
  kills: 0, deaths: 0, headshots: 0, wins: 0, losses: 0, matches: 0,
  winStreak: 0, bestWinStreak: 0, brPlays: 0, brWins: 0, brTop: 0, brKills: 0,
  storyWins: 0, timePlayed: 0, createdAt: 0, lastPlayed: 0,
  friends: [], groups: [],
}

interface AccountRow {
  name: string
  hash: string
  salt: string
  createdAt: number
  /** v11: public Operator ID — the code other operators add */
  oid?: string
}

const K_ACCOUNTS = 'es-accounts'
const K_SESSION = 'es-session'
const K_PROFILE = (name: string) => `es-profile-${name.toLowerCase()}`

// ---------------- v11: Operator ID ----------------
const OID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateOid(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += OID_ALPHABET[Math.floor(Math.random() * OID_ALPHABET.length)]
  return s
}
/** Operator ID of the logged-in account (creates one on first use) */
export function myOid(): string {
  const user = useAuth.getState().user
  if (!user) return ''
  const accounts = readJSON<Record<string, AccountRow>>(K_ACCOUNTS) ?? {}
  const row = accounts[user.toLowerCase()]
  if (!row) return ''
  if (!row.oid) {
    // migrate legacy accounts: assign an ID once
    row.oid = generateOid()
    accounts[user.toLowerCase()] = row
    writeJSON(K_ACCOUNTS, accounts)
  }
  return row.oid
}
/** display name of the logged-in operator */
export function myOperatorName(): string {
  return useAuth.getState().user ?? 'Operator'
}

// ---------------- tiny zustand auth state (always loaded) ----------------
interface AuthState {
  ready: boolean           // session restore finished
  user: string | null      // current operator name
  login: (name: string) => void
  logout: () => void
  setReady: () => void
}
export const useAuth = create<AuthState>((set) => ({
  ready: false,
  user: null,
  login: (name) => set({ user: name, ready: true }),
  logout: () => {
    try { localStorage.removeItem(K_SESSION) } catch { /* ignore */ }
    set({ user: null })
  },
  setReady: () => set({ ready: true }),
}))

// ---------------- helpers ----------------
const readJSON = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
const writeJSON = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* full */ }
}

const hashPassword = async (pass: string, salt: string): Promise<string> => {
  const data = new TextEncoder().encode(`${salt}:${pass}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const randomSalt = (): string => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const validateName = (name: string): string | null => {
  const n = name.trim()
  if (n.length < 3) return 'Name must be at least 3 characters'
  if (n.length > 16) return 'Name must be 16 characters or less'
  if (!/^[A-Za-z0-9_\-. ]+$/.test(n)) return 'Only letters, numbers, spaces, - _ . allowed'
  return null
}
export const validatePass = (pass: string): string | null => {
  if (pass.length < 4) return 'Password must be at least 4 characters'
  if (pass.length > 64) return 'Password too long (max 64)'
  return null
}

// ---------------- register / login ----------------
export async function register(name: string, pass: string): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim()
  const err = validateName(clean)
  if (err) return { ok: false, error: err }
  const perr = validatePass(pass)
  if (perr) return { ok: false, error: perr }

  const accounts = readJSON<Record<string, AccountRow>>(K_ACCOUNTS) ?? {}
  const key = clean.toLowerCase()
  if (accounts[key]) return { ok: false, error: 'That operator name is already taken' }

  const salt = randomSalt()
  const hash = await hashPassword(pass, salt)
  accounts[key] = { name: clean, hash, salt, createdAt: Date.now() }
  writeJSON(K_ACCOUNTS, accounts)

  // fresh profile + open session
  const profile: CareerProfile = { ...EMPTY_PROFILE, createdAt: Date.now(), lastPlayed: Date.now() }
  writeJSON(K_PROFILE(clean), profile)
  writeJSON(K_SESSION, { name: clean })
  useAuth.getState().login(clean)
  return { ok: true }
}

export async function login(name: string, pass: string): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Enter your operator name' }
  const accounts = readJSON<Record<string, AccountRow>>(K_ACCOUNTS) ?? {}
  const row = accounts[clean.toLowerCase()]
  if (!row) return { ok: false, error: 'Account not found — create one first' }
  const hash = await hashPassword(pass, row.salt)
  if (hash !== row.hash) return { ok: false, error: 'Wrong password' }
  writeJSON(K_SESSION, { name: row.name })
  useAuth.getState().login(row.name)
  return { ok: true }
}

/** restores the persisted session on boot (after the loading screen) */
export function restoreSession(): void {
  const s = readJSON<{ name: string }>(K_SESSION)
  if (s?.name) {
    const accounts = readJSON<Record<string, AccountRow>>(K_ACCOUNTS) ?? {}
    if (accounts[s.name.toLowerCase()]) {
      useAuth.getState().login(s.name)
      myOid()   // v11: asegura el Operator ID (migración de cuentas viejas)
      return
    }
  }
  useAuth.getState().setReady()
}

// ---------------- career profile ----------------
export function getProfile(): CareerProfile {
  const user = useAuth.getState().user
  if (!user) return { ...EMPTY_PROFILE }
  const p = readJSON<CareerProfile>(K_PROFILE(user))
  return { ...EMPTY_PROFILE, ...p }
}

const saveProfile = (p: CareerProfile): void => {
  const user = useAuth.getState().user
  if (!user) return
  writeJSON(K_PROFILE(user), p)
}

export interface MatchResult {
  mode: string
  kills: number
  deaths: number
  headshots: number
  win: boolean
  story?: boolean
  duration: number      // seconds
}

/** records a finished PvP / story match into the career profile */
export function recordMatch(r: MatchResult): void {
  if (!useAuth.getState().user) return
  const p = getProfile()
  p.kills += r.kills
  p.deaths += r.deaths
  p.headshots += r.headshots
  p.matches += 1
  p.timePlayed += Math.round(r.duration)
  p.lastPlayed = Date.now()
  if (r.story && r.win) p.storyWins += 1
  if (r.win) {
    p.wins += 1
    p.winStreak += 1
    if (p.winStreak > p.bestWinStreak) p.bestWinStreak = p.winStreak
  } else {
    p.losses += 1
    p.winStreak = 0
  }
  saveProfile(p)
}

export interface BrResult {
  placement: number
  kills: number
  duration: number
}

/** records a Battle Royale match (placement 1 = champion) */
export function recordBr(r: BrResult): void {
  if (!useAuth.getState().user) return
  const p = getProfile()
  p.brPlays += 1
  p.brKills += r.kills
  p.kills += r.kills
  p.matches += 1
  p.timePlayed += Math.round(r.duration)
  p.lastPlayed = Date.now()
  if (r.placement === 1) {
    p.brWins += 1
    p.wins += 1
    p.winStreak += 1
    if (p.winStreak > p.bestWinStreak) p.bestWinStreak = p.winStreak
  } else {
    p.losses += 1
    p.winStreak = 0
  }
  if (p.brTop === 0 || r.placement < p.brTop) p.brTop = r.placement
  saveProfile(p)
}

/** runtime kill/death tally for the CURRENT match (reset per match) */
export interface LiveTally {
  kills: number
  deaths: number
  headshots: number
  startedAt: number
}
const live: LiveTally = { kills: 0, deaths: 0, headshots: 0, startedAt: 0 }

export const liveTally = {
  reset(): void { live.kills = 0; live.deaths = 0; live.headshots = 0; live.startedAt = Date.now() },
  addKill(headshot: boolean): void { live.kills++; if (headshot) live.headshots++ },
  addDeath(): void { live.deaths++ },
  snapshot(): LiveTally { return { ...live } },
}

export const fmtKD = (p: CareerProfile): string =>
  p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills > 0 ? p.kills.toFixed(2) : '0.00'

// ------------------------------------------------------------
// v11 — REAL FRIENDS (persisted per profile; the network layer
// in esnet.ts does the request/accept handshake)
// ------------------------------------------------------------
const socialProfile = (): CareerProfile => getProfile()

/** profile friends normalized to FriendEntry[] (legacy strings dropped) */
export function getFriendsSafe(): FriendEntry[] {
  const raw = socialProfile().friends as unknown
  if (!Array.isArray(raw)) return []
  const out: FriendEntry[] = []
  for (const f of raw) {
    if (typeof f === 'object' && f !== null) {
      const e = f as Partial<FriendEntry>
      if (typeof e.oid === 'string' && e.oid.length === 6 && e.oid !== myOid()) {
        out.push({ oid: e.oid, name: String(e.name ?? 'Operator').slice(0, 16), since: Number(e.since) || 0 })
      }
    }
    // legacy v10 string entries were fake local labels — dropped
  }
  return out.slice(0, 60)
}

/** returns true when actually added */
export function addFriendLocal(oid: string, name: string): boolean {
  if (!oid || oid === myOid()) return false
  const p = socialProfile()
  const friends = getFriendsSafe()
  if (friends.some(f => f.oid === oid)) return false
  friends.push({ oid, name: name.slice(0, 16), since: Date.now() })
  p.friends = friends
  saveProfile(p)
  return true
}

/** returns true when actually removed */
export function removeFriendLocal(oid: string): boolean {
  const p = socialProfile()
  const friends = getFriendsSafe()
  if (!friends.some(f => f.oid === oid)) return false
  p.friends = friends.filter(f => f.oid !== oid)
  saveProfile(p)
  return true
}
