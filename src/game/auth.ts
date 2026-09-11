// ============================================================
// EMERGENCY STRIKE — Authentication & career profile (v9)
// Local account system with persistent profiles:
//  - unique operator name + password (salted SHA-256 via WebCrypto)
//  - career stats (kills, wins, best win streak, BR record...)
//  - FRIENDS & GROUPS (v10): add friends by name, build groups and
//    deploy together in any mode — Battle Royale is always SOLOS
//  - persisted in localStorage (es-accounts / es-session / es-profile-<n>)
// ============================================================
import { create } from 'zustand'

export interface SquadGroup {
  id: string
  name: string
  members: string[]   // friend names (without the local operator)
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
  /** v10: social graph (names of friends on this device) */
  friends: string[]
  /** v10: deploy groups */
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
}

const K_ACCOUNTS = 'es-accounts'
const K_SESSION = 'es-session'
const K_PROFILE = (name: string) => `es-profile-${name.toLowerCase()}`

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
    useSquad.getState().clear()   // v10: sin grupo al cerrar sesión
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
      restoreSquad()   // v10: también el último grupo activo
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
// v10 — FRIENDS & GROUPS (per profile, persisted)
// ------------------------------------------------------------
const socialProfile = (): CareerProfile => getProfile()

export function addFriend(name: string): { ok: boolean; error?: string } {
  const clean = name.trim().slice(0, 16)
  if (clean.length < 2) return { ok: false, error: 'Name must be at least 2 characters' }
  const me = useAuth.getState().user
  if (me && clean.toLowerCase() === me.toLowerCase()) return { ok: false, error: 'That is you' }
  const p = socialProfile()
  if (p.friends.some(f => f.toLowerCase() === clean.toLowerCase())) return { ok: false, error: 'Already in your friends' }
  p.friends = [...p.friends, clean].slice(0, 40)
  saveProfile(p)
  return { ok: true }
}

export function removeFriend(name: string): void {
  const p = socialProfile()
  p.friends = p.friends.filter(f => f !== name)
  // also pull them out of any group
  p.groups = p.groups.map(g => ({ ...g, members: g.members.filter(m => m !== name) }))
  saveProfile(p)
  syncSquadFromProfile()
}

export function createGroup(name: string, members: string[]): { ok: boolean; error?: string } {
  const clean = name.trim().slice(0, 22)
  if (clean.length < 2) return { ok: false, error: 'Group name must be at least 2 characters' }
  const p = socialProfile()
  if (p.groups.some(g => g.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: 'You already have a group with that name' }
  const validMembers = members.filter(m => p.friends.includes(m)).slice(0, 9)
  if (validMembers.length === 0) return { ok: false, error: 'Pick at least one friend' }
  const g: SquadGroup = { id: `g${Date.now().toString(36)}`, name: clean, members: validMembers }
  p.groups = [...p.groups, g]
  saveProfile(p)
  return { ok: true }
}

export function deleteGroup(id: string): void {
  const p = socialProfile()
  p.groups = p.groups.filter(g => g.id !== id)
  saveProfile(p)
  syncSquadFromProfile()
}

export function toggleGroupMember(id: string, member: string): void {
  const p = socialProfile()
  const g = p.groups.find(x => x.id === id)
  if (!g) return
  g.members = g.members.includes(member)
    ? g.members.filter(m => m !== member)
    : [...g.members, member].slice(0, 9)
  p.groups = [...p.groups]
  saveProfile(p)
  syncSquadFromProfile()
}

// ---------------- active squad (the group you deploy with) ----------------
interface SquadState {
  groupId: string | null
  name: string
  members: string[]
  /** BR is ALWAYS solos — the squad never enters the island with you */
  set: (s: { groupId: string | null; name: string; members: string[] }) => void
  clear: () => void
}

export const useSquad = create<SquadState>((set) => ({
  groupId: null,
  name: '',
  members: [],
  set: (s) => {
    set(s)
    const user = useAuth.getState().user
    if (user) {
      try { localStorage.setItem(`es-squad-${user.toLowerCase()}`, JSON.stringify(s)) } catch { /* ignore */ }
    }
  },
  clear: () => {
    set({ groupId: null, name: '', members: [] })
    const user = useAuth.getState().user
    if (user) {
      try { localStorage.removeItem(`es-squad-${user.toLowerCase()}`) } catch { /* ignore */ }
    }
  },
}))

/** keeps the active squad valid when groups change / on login */
export function syncSquadFromProfile(): void {
  const cur = useSquad.getState()
  if (!cur.groupId) return
  const g = socialProfile().groups.find(x => x.id === cur.groupId)
  if (!g || g.members.length === 0) useSquad.getState().clear()
  else useSquad.getState().set({ groupId: g.id, name: g.name, members: [...g.members] })
}

/** restores the persisted squad selection (called on session restore) */
export function restoreSquad(): void {
  const user = useAuth.getState().user
  if (!user) return
  try {
    const raw = localStorage.getItem(`es-squad-${user.toLowerCase()}`)
    if (!raw) return
    const s = JSON.parse(raw) as { groupId: string | null; name: string; members: string[] }
    if (s?.groupId) {
      const g = socialProfile().groups.find(x => x.id === s.groupId)
      if (g && g.members.length > 0) {
        useSquad.setState({ groupId: g.id, name: g.name, members: [...g.members] })
        return
      }
    }
  } catch { /* ignore */ }
  useSquad.getState().clear()
}

/** members of the active group, ready to deploy (empty = no group) */
export function activeSquadMembers(): string[] {
  return useSquad.getState().members.slice(0, 4)
}
