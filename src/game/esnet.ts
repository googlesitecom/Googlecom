// ============================================================
// EMERGENCY STRIKE — Real online layer (v11 "esnet")
// Cross-client networking WITHOUT our own server:
//  - transport: MQTT 3.1.1 over WebSocket against PUBLIC brokers
//    (EMQX / HiveMQ, keyless) — validated packet encoding
//  - presence:  retained heartbeats + LWT (esn/v1/pres/<oid>)
//  - identity:  every account gets a 6-char OPERATOR ID (share it!)
//  - friends:   REAL request → the other operator ACCEPTS or
//               rejects (retained pair topics, works while the
//               other operator is offline too)
//  - party:     create a squad, invite ONLINE friends, they join
//               live and you deploy together in any mode
//               (Battle Royale is ALWAYS solos)
//  - BR lobby:  REAL operators only — bots NEVER trigger the
//               countdown. 4 connected real operators start the
//               60-second countdown; bots only fill to 20 AFTER.
// All messages are tiny JSON; nothing here touches render loops.
// ============================================================
import { create } from 'zustand'
import { useAuth, myOid, myOperatorName, addFriendLocal, removeFriendLocal, getFriendsSafe } from './auth'
import { getAudio } from './audio'
import { useGame } from './store'

// ------------------------------------------------------------
// Tiny MQTT 3.1.1 client over WebSocket (QoS 0 + retained)
// ------------------------------------------------------------
const enc = new TextEncoder()
const dec = new TextDecoder()

function mqStr(s: string): number[] {
  const b = enc.encode(s)
  return [b.length >> 8, b.length & 255, ...b]
}
function remainLen(len: number): number[] {
  const out: number[] = []
  do {
    let b = len % 128
    len = Math.floor(len / 128)
    if (len > 0) b |= 128
    out.push(b)
  } while (len > 0)
  return out
}
function packet(headerByte: number, body: number[]): Uint8Array {
  return new Uint8Array([headerByte, ...remainLen(body.length), ...body])
}
function buildConnect(clientId: string, will: { topic: string; payload: string }): Uint8Array {
  const flags = 0x02 | 0x04 | 0x20 // clean session + will flag + will retain (QoS 0)
  const body = [
    ...mqStr('MQTT'), 4, flags, 0, 60,
    ...mqStr(clientId),
    ...mqStr(will.topic),
    ...mqStr(will.payload),
  ]
  return packet(0x10, body)
}
let subId = 0
function buildSubscribe(topic: string): Uint8Array {
  subId++
  return packet(0x82, [(subId >> 8) & 255, subId & 255, ...mqStr(topic), 0])
}
function buildUnsubscribe(topic: string): Uint8Array {
  subId++
  return packet(0xA2, [(subId >> 8) & 255, subId & 255, ...mqStr(topic)])
}
function buildPublish(topic: string, payload: string, retain: boolean): Uint8Array {
  return packet(retain ? 0x31 : 0x30, [...mqStr(topic), ...enc.encode(payload)])
}
type Incoming =
  | { type: 'connack'; rc: number }
  | { type: 'publish'; topic: string; payload: string }
  | { type: 'other' }
function parseIncoming(buf: ArrayBuffer): Incoming {
  const u8 = new Uint8Array(buf)
  const type = u8[0] >> 4
  let mult = 1, rl = 0, i = 1
  for (;;) {
    const b = u8[i++]
    rl += (b & 127) * mult
    if (!(b & 128)) break
    mult *= 128
  }
  const body = u8.subarray(i, i + rl)
  if (type === 3) {
    const tlen = (body[0] << 8) | body[1]
    return {
      type: 'publish',
      topic: dec.decode(body.subarray(2, 2 + tlen)),
      payload: dec.decode(body.subarray(2 + tlen)),
    }
  }
  if (type === 2) return { type: 'connack', rc: body[1] }
  return { type: 'other' }
}

// ------------------------------------------------------------
// Topic namespace + helpers
// ------------------------------------------------------------
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]
const NS = 'esn/v1'

const T = {
  pres: (oid: string) => `${NS}/pres/${oid}`,
  dir: (nameLower: string) => `${NS}/dir/${nameLower}`,
  freq: (from: string, to: string) => `${NS}/f/${from}/${to}`,
  freqOut: (me: string) => `${NS}/f/${me}/+`,
  freqIn: (me: string) => `${NS}/f/+/${me}`,
  dm: (oid: string) => `${NS}/dm/${oid}`,
  party: (gid: string) => `${NS}/p/${gid}`,
  // v14: public room announcements — hosts publish their open room so
  // anyone on the network can discover it and quick-join (room browser)
  rooms: `${NS}/rooms`,
}

/** does an exact topic match a pattern that may contain '+' levels? */
function topicMatch(pattern: string, topic: string): boolean {
  const p = pattern.split('/')
  const t = topic.split('/')
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '+') continue
    if (p[i] !== t[i]) return false
  }
  return p.length === t.length
}

const now = (): number => Date.now()
const oidFromTopic = (topic: string, prefix: string): string => {
  const rest = topic.slice(prefix.length)
  return rest.split('/')[0] ?? ''
}

// ------------------------------------------------------------
// Stores
// ------------------------------------------------------------
export type NetStatus = 'offline' | 'connecting' | 'online'

interface NetState {
  status: NetStatus
  broker: string
  oid: string
  setStatus: (s: NetStatus, broker?: string) => void
}
export const useNet = create<NetState>((set) => ({
  status: 'offline',
  broker: '',
  oid: '',
  setStatus: (status, broker) => set(broker ? { status, broker } : { status }),
}))

export interface FriendEntryUI {
  oid: string
  name: string
  online: boolean
}
export interface FriendReqUI {
  oid: string
  name: string
  t: number
}

interface FriendsState {
  friends: FriendEntryUI[]
  incoming: FriendReqUI[]
  outgoing: FriendReqUI[]
  rev: number
  setFriends: (f: FriendEntryUI[]) => void
  setIncoming: (r: FriendReqUI[]) => void
  setOutgoing: (r: FriendReqUI[]) => void
  bump: () => void
}
export const useFriends = create<FriendsState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  rev: 0,
  setFriends: (friends) => set({ friends }),
  setIncoming: (incoming) => set({ incoming }),
  setOutgoing: (outgoing) => set({ outgoing }),
  bump: () => set((s) => ({ rev: s.rev + 1 })),
}))

export interface PartyMemberUI {
  u: string
  n: string
  leader: boolean
}
/** v15: the leader's mode pick, synced live to the whole squad (Fortnite-style) */
export interface PartyModeUI {
  mode: string    // GameMode
  source: string  // deploy source ('room' | 'quick' | 'bots'…)
  kind: string    // RoomKind
}
interface PartyState {
  active: boolean
  gid: string
  name: string
  leaderOid: string
  leaderName: string
  members: PartyMemberUI[]
  /** v14: who pressed READY (lobby, estilo Fortnite) */
  ready: Record<string, boolean>
  /** v15: the leader's current mode pick (null until the first sync) */
  partyMode: PartyModeUI | null
  /** v15: epoch-ms when the squad match auto-deploys (0 = idle) */
  launchAt: number
  /** room code auto-received from the leader to deploy together */
  roomCode: string
  roomKind: string
  setParty: (p: Partial<Omit<PartyState, 'setParty' | 'clear' | 'setRoom' | 'clearRoom' | 'setReady' | 'setPartyMode' | 'setLaunchAt'>>) => void
  setMembers: (m: PartyMemberUI[]) => void
  setReady: (u: string, v: boolean) => void
  setPartyMode: (m: PartyModeUI | null) => void
  setLaunchAt: (t: number) => void
  setRoom: (code: string, kind: string) => void
  clearRoom: () => void
  clear: () => void
}
export const useParty = create<PartyState>((set) => ({
  active: false,
  gid: '',
  name: '',
  leaderOid: '',
  leaderName: '',
  members: [],
  ready: {},
  partyMode: null,
  launchAt: 0,
  roomCode: '',
  roomKind: '',
  setParty: (p) => set(p),
  setMembers: (members) => set((s) => {
    // v15: ready flags of operators who left the squad don't linger
    const ids = new Set(members.map(m => m.u))
    const ready: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(s.ready)) if (ids.has(k)) ready[k] = v
    return { members, ready }
  }),
  setReady: (u, v) => set((s) => ({ ready: { ...s.ready, [u]: v } })),
  setPartyMode: (partyMode) => set({ partyMode }),
  setLaunchAt: (launchAt) => set({ launchAt }),
  setRoom: (roomCode, roomKind) => set({ roomCode, roomKind }),
  clearRoom: () => set({ roomCode: '', roomKind: '' }),
  clear: () => set({ active: false, gid: '', name: '', leaderOid: '', leaderName: '', members: [], ready: {}, partyMode: null, launchAt: 0, roomCode: '', roomKind: '' }),
}))

// ------------------------------------------------------------
// v14: PUBLIC ROOMS — live room browser + quick match
// ------------------------------------------------------------
export interface PublicRoomUI {
  code: string
  host: string
  kind: string
  mode: string
  players: number
  cap: number
  t: number
}
interface RoomsState {
  rooms: PublicRoomUI[]
  setRooms: (r: PublicRoomUI[]) => void
}
export const useRooms = create<RoomsState>((set) => ({
  rooms: [],
  setRooms: (rooms) => set({ rooms }),
}))

// ------------------------------------------------------------
// Global toasts (friend requests / party invites / events)
// ------------------------------------------------------------
export interface NetToast {
  id: number
  kind: 'freq' | 'pinvite' | 'info' | 'error'
  title: string
  body?: string
  /** for actionable toasts */
  oid?: string
  gid?: string
  partyName?: string
  from?: string
  ttl: number
}
interface ToastState {
  toasts: NetToast[]
  push: (t: Omit<NetToast, 'id' | 'ttl'> & { ttl?: number }) => number
  drop: (id: number) => void
}
let toastId = 0
export const useNetToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++toastId
    const ttl = t.ttl ?? 30000
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, ttl }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })), ttl)
    return id
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}))

const toast = (t: Omit<NetToast, 'id' | 'ttl'> & { ttl?: number }): void => {
  useNetToasts.getState().push(t)
}

// ------------------------------------------------------------
// loose JSON helpers
// ------------------------------------------------------------
type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {})
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)

// ------------------------------------------------------------
// The network singleton
// ------------------------------------------------------------
type Handler = (payload: Rec, topic: string) => void

class EsNet {
  status: NetStatus = 'offline'
  private ws: WebSocket | null = null
  // v11.1: everyone tries the PRIMARY broker first — clients on different
  // brokers can't see each other, so the order must be deterministic
  private brokerIdx = 0
  private clientId = ''
  private patterns = new Map<string, Set<Handler>>()
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = 1200
  private presTimer: ReturnType<typeof setInterval> | null = null
  private friendPres = new Map<string, { n: string; t: number; off: boolean }>()
  private presTick: ReturnType<typeof setInterval> | null = null
  private partyHb: ReturnType<typeof setInterval> | null = null
  private partyGid = ''
  /** v15.1: when I joined/created the party (grace window before any
   *  leader-election attempt — a fresh joiner's roster still lacks the
   *  leader and must NOT steal leadership from their own join echo) */
  private partyJoinedAt = 0
  /** v15.1: last time a message from the CURRENT leader was seen */
  private leaderLastSeen = 0
  private outgoing = new Map<string, { name: string; t: number }>()
  private incoming = new Map<string, { name: string; t: number }>()
  private dirWaiters = new Map<string, (oid: string | null) => void>()
  private dmHandler: ((p: Rec) => void) | null = null

  // ---------------- transport ----------------
  connect(): void {
    if (typeof window === 'undefined') return
    const oid = myOid()
    if (!oid) return // not logged in
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.status = 'connecting'
    useNet.getState().setStatus('connecting')
    useNet.getState().setStatus('connecting', BROKERS[this.brokerIdx % BROKERS.length])
    this.clientId = `escli_${oid}_${Math.random().toString(36).slice(2, 8)}`
    const url = BROKERS[this.brokerIdx % BROKERS.length]
    let ws: WebSocket
    try {
      ws = new WebSocket(url, 'mqtt')
    } catch {
      this.scheduleReconnect()
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      // CONNECT with LWT: if we vanish, the broker retains "offline" on our presence
      this.send(buildConnect(this.clientId, {
        topic: T.pres(oid),
        payload: JSON.stringify({ u: oid, n: myOperatorName(), off: 1, t: now() }),
      }))
    }
    ws.onmessage = (ev: MessageEvent) => {
      const m = parseIncoming(ev.data as ArrayBuffer)
      if (m.type === 'connack') {
        if (m.rc !== 0) { ws.close(); this.scheduleReconnect(); return }
        this.onOnline()
        return
      }
      if (m.type === 'publish') {
        if (!m.payload) return // cleared retain
        let data: unknown
        try { data = JSON.parse(m.payload) } catch { return }
        this.dispatch(m.topic, asRec(data))
      }
    }
    ws.onerror = () => { /* close follows */ }
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null
      this.onOfflineNet()
      this.scheduleReconnect()
    }
  }

  private send(u8: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(u8) } catch { /* dropped */ }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.backoff = Math.min(this.backoff * 1.7, 9000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.brokerIdx++ // round-robin brokers
      this.connect()
    }, this.backoff)
  }

  private onOnline(): void {
    this.backoff = 1200
    this.status = 'online'
    useNet.getState().setStatus('online', BROKERS[this.brokerIdx % BROKERS.length])
    // (re)subscribe everything
    for (const pat of this.patterns.keys()) this.send(buildSubscribe(pat))
    // keepalive
    this.pingTimer = setInterval(() => {
      this.send(new Uint8Array([0xC0, 0x00]))
    }, 20000)
    // identity + presence
    this.startPresence()
    this.initSocial()
    if (this.partyGid) this.resumeParty()
  }

  private onOfflineNet(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this.status = 'offline'
    useNet.getState().setStatus('offline')
    if (this.presTimer) { clearInterval(this.presTimer); this.presTimer = null }
  }

  disconnect(): void {
    // graceful: mark offline, then drop the socket
    const oid = myOid()
    if (oid && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.pub(T.pres(oid), { u: oid, n: myOperatorName(), off: 1, t: now() }, true)
      this.send(new Uint8Array([0xE0, 0x00])) // DISCONNECT
    }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.presTimer) { clearInterval(this.presTimer); this.presTimer = null }
    if (this.presTick) { clearInterval(this.presTick); this.presTick = null }
    if (this.partyHb) { clearInterval(this.partyHb); this.partyHb = null }
    this.leavePartySilent()
    this.stopRoomPublish()
    try { this.ws?.close() } catch { /* ok */ }
    this.ws = null
    this.status = 'offline'
    useNet.getState().setStatus('offline')
    useFriends.getState().setFriends([])
    this.outgoing.clear()
    this.incoming.clear()
    this.friendPres.clear()
  }

  // ---------------- pub/sub ----------------
  sub(pattern: string, h: Handler): void {
    let set = this.patterns.get(pattern)
    if (!set) {
      set = new Set()
      this.patterns.set(pattern, set)
      if (this.status === 'online') this.send(buildSubscribe(pattern))
    }
    set.add(h)
  }
  unsub(pattern: string, h: Handler): void {
    const set = this.patterns.get(pattern)
    if (!set) return
    set.delete(h)
    if (set.size === 0) {
      this.patterns.delete(pattern)
      if (this.status === 'online') this.send(buildUnsubscribe(pattern))
    }
  }
  pub(topic: string, obj: Rec | string, retain = false): void {
    const payload = typeof obj === 'string' ? obj : JSON.stringify(obj)
    this.send(buildPublish(topic, payload, retain))
  }
  clearRetained(topic: string): void {
    this.pub(topic, '', true)
  }
  private dispatch(topic: string, payload: Rec): void {
    for (const [pat, set] of this.patterns) {
      if (!topicMatch(pat, topic)) continue
      for (const h of set) {
        try { h(payload, topic) } catch { /* handler error */ }
      }
    }
  }

  // ---------------- presence + identity ----------------
  private startPresence(): void {
    const oid = myOid()
    if (!oid) return
    const publish = (): void => {
      this.pub(T.pres(oid), { u: oid, n: myOperatorName(), t: now() }, true)
    }
    publish()
    if (this.presTimer) clearInterval(this.presTimer)
    this.presTimer = setInterval(publish, 15000)
    // name → oid directory (so friends can add you by name)
    const name = myOperatorName()
    if (name) this.pub(T.dir(name.toLowerCase()), { u: oid, n: name, t: now() }, true)
  }

  private initSocial(): void {
    const oid = myOid()
    if (!oid) return
    this.sub(T.freqOut(oid), this.onFriendTopic)
    this.sub(T.freqIn(oid), this.onFriendTopic)
    this.sub(T.dm(oid), this.onDm)
    // rebuild friends UI + watch their presence
    this.refreshFriendSubs()
  }

  /** recompute friends list with live presence flags */
  private refreshFriendSubs(): void {
    const friends = getFriendsSafe()
    for (const f of friends) {
      const topic = T.pres(f.oid)
      if (!this.patterns.has(topic)) {
        this.sub(topic, (p) => {
          this.friendPres.set(str(p.u, f.oid), {
            n: str(p.n, f.name),
            t: num(p.t, now()),
            off: p.off === 1,
          })
          this.pushFriendsUI()
        })
      }
    }
    // drop presence subs for removed friends
    for (const pat of [...this.patterns.keys()]) {
      if (pat.startsWith(`${NS}/pres/`)) {
        const o = pat.split('/')[3]
        if (!friends.some(f => f.oid === o)) this.patterns.delete(pat)
      }
    }
    this.pushFriendsUI()
  }

  private pushFriendsUI(): void {
    const t = now()
    const friends = getFriendsSafe().map(f => {
      const p = this.friendPres.get(f.oid)
      const online = !!p && !p.off && t - p.t < 45000
      return { oid: f.oid, name: p?.n ?? f.name, online }
    })
    useFriends.getState().setFriends(friends)
  }

  // ---------------- friends (real, with acceptance) ----------------
  private onFriendTopic = (p: Rec, topic: string): void => {
    const oid = myOid()
    if (!oid) return
    const f = str(p.f)
    const g = str(p.g)
    const s = str(p.s)
    const ts = num(p.t, now())
    if (now() - ts > 45 * 86400 * 1000) {
      // stale (>45 days) → clear the retained ghost quietly
      if (s === 'pending') this.clearRetained(topic)
      return
    }
    const fn = str(p.fn, 'Operator')
    const gn = str(p.gn, 'Operator')

    if (s === 'pending') {
      if (g === oid && f !== oid) {
        // someone wants to be YOUR friend → needs your acceptance
        if (!this.incoming.has(f)) {
          getAudio().uiClick()
          toast({ kind: 'freq', title: 'FRIEND REQUEST', body: `${fn} wants to add you as a friend`, oid: f, from: fn })
        }
        this.incoming.set(f, { name: fn, t: ts })
        this.pushReqsUI()
      } else if (f === oid && g !== oid) {
        this.outgoing.set(g, { name: gn !== 'Operator' ? gn : str(p.gn) || 'Operator', t: ts })
        this.pushReqsUI()
      }
      return
    }
    if (s === 'accepted') {
      const other = f === oid ? { oid: g, name: gn } : g === oid ? { oid: f, name: fn } : null
      if (!other) return
      // ALWAYS persist (idempotent) — the retained 'accepted' is what
      // re-syncs both sides after a page reload
      const added = addFriendLocal(other.oid, other.name)
      this.outgoing.delete(other.oid)
      this.incoming.delete(other.oid)
      this.refreshFriendSubs()
      this.pushReqsUI()
      if (added) {
        getAudio().killConfirm()
        toast({ kind: 'info', title: 'FRIEND ADDED', body: `${other.name} is now your friend` })
      }
      return
    }
    if (s === 'rejected') {
      if (f === oid) {
        this.outgoing.delete(g)
        toast({ kind: 'info', title: 'REQUEST DECLINED', body: `${gn !== 'Operator' ? gn : 'The operator'} declined your friend request` })
      }
      if (g === oid) this.incoming.delete(f)
      this.pushReqsUI()
      return
    }
    if (s === 'cancelled') {
      if (g === oid) this.incoming.delete(f)
      if (f === oid) this.outgoing.delete(g)
      this.pushReqsUI()
      return
    }
    if (s === 'removed') {
      if (f === oid) this.outgoing.delete(g)
      if (g === oid) this.incoming.delete(f)
      if (removeFriendLocal(f === oid ? g : f)) {
        toast({ kind: 'info', title: 'FRIEND REMOVED', body: f === oid ? gn : fn })
      }
      this.refreshFriendSubs()
      this.pushReqsUI()
    }
  }

  private pushReqsUI(): void {
    const inc = [...this.incoming.entries()].map(([oid, v]) => ({ oid, name: v.name, t: v.t }))
    const out = [...this.outgoing.entries()].map(([oid, v]) => ({ oid, name: v.name, t: v.t }))
    useFriends.getState().setIncoming(inc)
    useFriends.getState().setOutgoing(out)
    useFriends.getState().bump()
  }

  /** add a REAL operator: by Operator ID (6 chars) or by exact name */
  async requestFriend(input: string): Promise<{ ok: boolean; error?: string }> {
    const oid = myOid()
    const name = myOperatorName()
    if (!oid) return { ok: false, error: 'Log in first' }
    const clean = input.trim()
    if (!clean) return { ok: false, error: 'Enter an Operator ID or name' }
    if (/^[A-Za-z2-9]{6}$/.test(clean)) {
      return this.sendRequest(oid, name, clean.toUpperCase(), clean.toUpperCase())
    }
    if (clean.length < 3) return { ok: false, error: 'Name must be at least 3 characters' }
    const target = await this.lookupByName(clean)
    if (!target) return { ok: false, error: 'Operator not found — they must be online once, or use their 6-char ID' }
    return this.sendRequest(oid, name, target.oid, target.name)
  }

  private sendRequest(from: string, fromName: string, to: string, toName: string): { ok: boolean; error?: string } {
    if (to === from) return { ok: false, error: 'That is you' }
    if (getFriendsSafe().some(f => f.oid === to)) return { ok: false, error: 'Already your friend' }
    if (this.outgoing.has(to)) return { ok: false, error: 'Request already sent' }
    if (this.incoming.has(to)) return { ok: false, error: 'They already sent YOU a request — accept it below' }
    this.pub(T.freq(from, to), { f: from, fn: fromName, g: to, gn: toName, s: 'pending', t: now() }, true)
    return { ok: true }
  }

  private lookupByName(name: string): Promise<{ oid: string; name: string } | null> {
    return new Promise((resolve) => {
      if (this.status !== 'online') { resolve(null); return }
      const lower = name.trim().toLowerCase()
      const topic = T.dir(lower)
      let done = false
      const finish = (v: { oid: string; name: string } | null): void => {
        if (done) return
        done = true
        this.unsub(topic, h)
        clearTimeout(kill)
        resolve(v)
      }
      const h = (p: Rec): void => {
        const u = str(p.u)
        if (u) finish({ oid: u, name: str(p.n, name) })
      }
      const kill = setTimeout(() => finish(null), 1600)
      this.sub(topic, h)
      // force fresh retained delivery: re-subscribe is implicit (fresh topic)
    })
  }

  acceptFriend(other: string): void {
    const oid = myOid()
    if (!oid) return
    const req = this.incoming.get(other)
    this.pub(T.freq(other, oid), {
      f: other, fn: req?.name ?? 'Operator', g: oid, gn: myOperatorName(),
      s: 'accepted', t: now(),
    }, true)
    this.incoming.delete(other)
    this.pushReqsUI()
  }

  rejectFriend(other: string): void {
    const oid = myOid()
    if (!oid) return
    const req = this.incoming.get(other)
    this.pub(T.freq(other, oid), {
      f: other, fn: req?.name ?? 'Operator', g: oid, gn: myOperatorName(),
      s: 'rejected', t: now(),
    }, true)
    this.incoming.delete(other)
    this.pushReqsUI()
  }

  cancelRequest(other: string): void {
    const oid = myOid()
    if (!oid) return
    this.pub(T.freq(oid, other), {
      f: oid, fn: myOperatorName(), g: other, gn: this.outgoing.get(other)?.name ?? 'Operator',
      s: 'cancelled', t: now(),
    }, true)
    this.outgoing.delete(other)
    this.pushReqsUI()
  }

  removeFriend(other: string): void {
    const oid = myOid()
    if (!oid) return
    const entry = getFriendsSafe().find(f => f.oid === other)
    const name = entry?.name ?? 'Operator'
    // overwrite BOTH pair directions so nobody re-adds from a stale 'accepted'
    this.pub(T.freq(other, oid), { f: other, fn: name, g: oid, gn: myOperatorName(), s: 'removed', t: now() }, true)
    this.pub(T.freq(oid, other), { f: oid, fn: myOperatorName(), g: other, gn: name, s: 'removed', t: now() }, true)
    removeFriendLocal(other)
    this.refreshFriendSubs()
    this.pushReqsUI()
  }

  // ---------------- direct messages (invites…) ----------------
  private onDm = (p: Rec): void => {
    const ty = str(p.ty)
    if (ty === 'pinvite') {
      const gid = str(p.gid)
      const from = str(p.from)
      const fromName = str(p.fromName)
      const pname = str(p.pname)
      getAudio().uiClick()
      toast({ kind: 'pinvite', title: 'SQUAD INVITE', body: `${fromName} invites you to squad "${pname}"`, gid, oid: from, from: fromName, partyName: pname, ttl: 45000 })
      return
    }
    if (ty === 'pcode') {
      // the squad leader opened a room — auto-join it
      const code = str(p.code)
      const kind = str(p.kind, '2v2')
      if (code) {
        useParty.getState().setRoom(code, kind)
      }
      return
    }
    if (ty === 'pdisband') {
      if (useParty.getState().active) {
        useParty.getState().clear()
        toast({ kind: 'info', title: 'SQUAD DISBANDED', body: 'The leader disbanded the squad' })
      }
    }
  }

  // ---------------- party (squad) ----------------
  createParty(name: string): { ok: boolean; error?: string } {
    const oid = myOid()
    if (!oid) return { ok: false, error: 'Log in first' }
    if (useParty.getState().active) return { ok: false, error: 'You are already in a squad' }
    const gid = `p${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const clean = name.trim().slice(0, 22) || 'SQUAD'
    this.partyGid = gid
    this.partyJoinedAt = now()
    this.leaderLastSeen = now()
    this.sub(T.party(gid), this.onPartyMsg)
    useParty.getState().setParty({
      active: true, gid, name: clean, leaderOid: oid, leaderName: myOperatorName(),
      members: [{ u: oid, n: myOperatorName(), leader: true }],
    })
    // retained meta + heartbeat
    this.pub(T.party(gid), { ty: 'meta', gid, name: clean, leader: oid, leaderName: myOperatorName(), t: now() }, true)
    this.startPartyHb(true)
    return { ok: true }
  }

  joinParty(gid: string, leaderName?: string): void {
    const oid = myOid()
    if (!oid || !gid) return
    if (useParty.getState().active) return
    this.partyGid = gid
    this.partyJoinedAt = now()
    this.leaderLastSeen = 0
    this.sub(T.party(gid), this.onPartyMsg)
    useParty.getState().setParty({
      active: true, gid, name: 'SQUAD', leaderOid: '', leaderName: leaderName ?? '',
      members: [{ u: oid, n: myOperatorName(), leader: false }],
    })
    this.pub(T.party(gid), { ty: 'join', u: oid, n: myOperatorName(), t: now() })
    this.startPartyHb(false)
  }

  private startPartyHb(_leader: boolean): void {
    if (this.partyHb) clearInterval(this.partyHb)
    const oid = myOid()
    this.partyHb = setInterval(() => {
      if (!this.partyGid) return
      // v15.1: leadership is computed LIVE per beat (it used to be captured
      // at start — a stale host kept beating ldr=1 after losing leadership)
      const leader = useParty.getState().leaderOid === oid
      const beat: Rec = { ty: 'hb', u: oid, n: myOperatorName(), ldr: leader ? 1 : 0, t: now() }
      if (leader) {
        const pm = useParty.getState().partyMode
        if (pm) { beat.m = pm.mode; beat.s = pm.source; beat.k = pm.kind }
      }
      this.pub(T.party(this.partyGid), beat)
      this.pruneParty()
    }, 3000)
  }

  private pruneParty(): void {
    const t = now()
    const oid = myOid()
    const st = useParty.getState()
    const alive = new Map<string, { n: string; leader: boolean }>()
    for (const [u, m] of this.partyRoster) {
      if (t - m.t < 9000) alive.set(u, { n: m.n, leader: m.leader })
    }
    // v15.1: SELF is always alive — the roster only fills from RECEIVED
    // heartbeats, so a fresh host (or a fresh joiner before the first
    // echo) used to vanish from its OWN squad list
    const me = alive.get(oid)
    alive.set(oid, { n: myOperatorName(), leader: (me?.leader ?? false) || st.leaderOid === oid })
    const members = [...alive.entries()].map(([u, v]) => ({ u, n: v.n, leader: v.leader }))
    st.setMembers(members)
    // v15.1: LEADER-ELECTION FIX — the leader is only "gone" when we KNOW
    // one (retained meta / heartbeats) and nothing from them arrived for
    // >12s, with a 15s grace window after joining. Before this guard, every
    // fresh joiner's own join echo triggered a self-promotion that STOLE
    // leadership and flipped host/member roles. A party with NO known
    // leader NEVER elects one blindly — createParty always publishes a
    // retained meta, so the real leader is always revealed within seconds.
    const leaderHere = members.some(m => m.leader)
    if (!leaderHere && members.length > 0) {
      const known = st.leaderOid
      const leaderSeenRecently = !!known && t - this.leaderLastSeen < 12000
      const joinedRecently = t - this.partyJoinedAt < 15000
      if (known && !leaderSeenRecently && !joinedRecently) {
        const lowest = [...members].sort((a, b) => a.u.localeCompare(b.u))[0]
        if (lowest && lowest.u === oid) {
          st.setParty({ leaderOid: oid, leaderName: myOperatorName() })
          // v15: the promoted leader takes over the protocol — restart the
          // heartbeat as leader (it now carries the mode pick) and re-publish
          // the squad meta so everyone learns who leads now
          this.leaderLastSeen = now()
          this.startPartyHb(true)
          this.pub(T.party(this.partyGid!), { ty: 'meta', gid: this.partyGid, name: st.name, leader: oid, leaderName: myOperatorName(), t: now() }, true)
        }
      }
    }
  }
  private partyRoster = new Map<string, { n: string; t: number; leader: boolean }>()

  private onPartyMsg = (p: Rec): void => {
    const oid = myOid()
    const ty = str(p.ty)
    if (ty === 'hb' || ty === 'join') {
      const u = str(p.u)
      if (!u) return
      const isFirst = ty === 'join' && !this.partyRoster.has(u) && u !== oid
      this.partyRoster.set(u, { n: str(p.n, 'Operator'), t: now(), leader: p.ldr === 1 })
      // v15.1: track leader liveness for the fixed leader election
      if (u === useParty.getState().leaderOid) this.leaderLastSeen = now()
      // v15: a (re)joining operator starts NOT ready
      if (ty === 'join') useParty.getState().setReady(u, false)
      if (isFirst) {
        getAudio().uiClick()
        toast({ kind: 'info', title: 'SQUAD', body: `${str(p.n)} joined the squad` })
      }
      // v15: the leader's heartbeat carries the live mode pick
      if (p.ldr === 1 && p.m !== undefined) {
        const st = useParty.getState()
        if (!st.leaderOid || st.leaderOid === u) {
          st.setPartyMode({ mode: str(p.m, 'escaramuza'), source: str(p.s, 'room'), kind: str(p.k, '2v2') })
        }
      }
      this.pruneParty()
      return
    }
    if (ty === 'ready') {
      // v14: estado LISTO de un miembro del escuadrón (lobby estilo Fortnite)
      const u = str(p.u)
      if (u) useParty.getState().setReady(u, p.v === 1)
      return
    }
    if (ty === 'mode') {
      // v15: el líder cambió el modo — la selección es SUYA y se sincroniza
      const u = str(p.u)
      const st = useParty.getState()
      if (u && (!st.leaderOid || st.leaderOid === u)) {
        st.setPartyMode({ mode: str(p.m, 'escaramuza'), source: str(p.s, 'room'), kind: str(p.k, '2v2') })
      }
      return
    }
    if (ty === 'launch') {
      // v15: todo el escuadrón listo — despliegue automático con cuenta atrás
      useParty.getState().setLaunchAt(now() + Math.max(1, num(p.d, 5)) * 1000)
      return
    }
    if (ty === 'launchx') {
      // v15: someone un-readied → countdown cancelled
      useParty.getState().setLaunchAt(0)
      return
    }
    if (ty === 'pcode') {
      // v15.1 FIX (THE squad-deploy bug): the leader's room code travels
      // on the PARTY channel — this used to be handled ONLY on the DM
      // channel, so members NEVER received the code and hung at the
      // deploy countdown forever ("it never starts when you hit ready",
      // "the non-host never connects"). Now members auto-join the room.
      const code = str(p.code)
      const kind = str(p.kind, '2v2')
      if (code && useParty.getState().active) {
        useParty.getState().setRoom(code, kind)
      }
      return
    }
    if (ty === 'meta') {
      const leader = str(p.leader)
      useParty.getState().setParty({ name: str(p.name, 'SQUAD'), leaderOid: leader, leaderName: str(p.leaderName) })
      // v15.1: retained meta → seed the leader into the roster so a fresh
      // joiner's squad list includes them IMMEDIATELY (and leadership
      // never looks "missing" before the leader's first heartbeat)
      if (leader) {
        this.leaderLastSeen = now()
        this.partyRoster.set(leader, { n: str(p.leaderName, 'Operator'), t: now(), leader: true })
        this.pruneParty()
      }
      return
    }
    if (ty === 'leave') {
      const u = str(p.u)
      this.partyRoster.delete(u)
      if (u === str(p.leader)) {
        // leader left → disband
        this.leavePartySilent()
        useParty.getState().clear()
        toast({ kind: 'info', title: 'SQUAD DISBANDED', body: 'The leader left the squad' })
        return
      }
      this.pruneParty()
      return
    }
    if (ty === 'disband') {
      this.leavePartySilent()
      if (useParty.getState().active) {
        useParty.getState().clear()
        toast({ kind: 'info', title: 'SQUAD DISBANDED', body: 'The leader disbanded the squad' })
      }
    }
  }

  private resumeParty(): void {
    if (!this.partyGid) return
    if (!this.partyJoinedAt) this.partyJoinedAt = now()
    this.sub(T.party(this.partyGid), this.onPartyMsg)
    this.startPartyHb(useParty.getState().leaderOid === myOid())
  }

  /** v14: marca tu estado LISTO en el lobby (miembros del escuadrón).
   *  v15: el estado local SIEMPRE se actualiza (aunque el transporte no
   *  esté suscrito aún) — el broadcast es best-effort */
  setPartyReady(v: boolean): void {
    const oid = myOid()
    const st = useParty.getState()
    if (!oid || !st.active) return
    st.setReady(oid, v)
    if (this.partyGid) this.pub(T.party(this.partyGid), { ty: 'ready', u: oid, v: v ? 1 : 0, t: now() })
  }

  /** v15: LEADER — publish the mode pick to the whole squad (Fortnite-style:
   *  the host picks the mode, everyone else sees it live and readies up) */
  setPartyModeSel(m: PartyModeUI): void {
    const oid = myOid()
    const st = useParty.getState()
    if (!oid || !st.active || st.leaderOid !== oid) return
    st.setPartyMode(m)
    if (this.partyGid) this.pub(T.party(this.partyGid), { ty: 'mode', u: oid, m: m.mode, s: m.source, k: m.kind, t: now() })
  }

  /** v15: LEADER — start (dn>0 seconds) or cancel (dn=0) the auto-deploy
   *  countdown that fires when the WHOLE squad is ready */
  partyLaunchCountdown(dn: number): void {
    const st = useParty.getState()
    if (!st.active) return
    if (dn > 0) {
      st.setLaunchAt(now() + dn * 1000)
      if (this.partyGid) this.pub(T.party(this.partyGid), { ty: 'launch', d: dn, t: now() })
    } else {
      st.setLaunchAt(0)
      if (this.partyGid) this.pub(T.party(this.partyGid), { ty: 'launchx', t: now() })
    }
  }

  /** v15: humans deploying together (leader's party size, 1 if solo) —
   *  used by the room host to keep the squad on the AMBER team */
  squadDeploySize(): number {
    const st = useParty.getState()
    if (!st.active || st.leaderOid !== myOid()) return 1
    return Math.max(1, Math.min(5, st.members.length))
  }

  inviteToParty(oid: string, pname: string): void {
    const me = myOid()
    if (!me) return
    this.pub(T.dm(oid), { ty: 'pinvite', gid: this.partyGid, from: me, fromName: myOperatorName(), pname, t: now() })
  }

  /** leader opened an online room → members auto-join with the code */
  shareRoomCode(code: string, kind: string): void {
    if (!this.partyGid) return
    this.pub(T.party(this.partyGid), { ty: 'pcode', code, kind, t: now() })
  }

  leaveParty(): void {
    if (!this.partyGid) return
    const oid = myOid()
    const st = useParty.getState()
    this.pub(T.party(this.partyGid), {
      ty: 'leave', u: oid, leader: st.leaderOid === oid ? oid : '', t: now(),
    })
    this.leavePartySilent()
    useParty.getState().clear()
  }

  private leavePartySilent(): void {
    if (this.partyHb) { clearInterval(this.partyHb); this.partyHb = null }
    if (this.partyGid) {
      this.unsub(T.party(this.partyGid), this.onPartyMsg)
      this.partyGid = ''
    }
    this.partyRoster.clear()
  }

  // ---------------- v14: PUBLIC ROOMS — dynamic matchmaking ----------------
  // Hosts publish their open room on a shared topic; the menu shows a
  // live browser (mode · format · occupancy) and QUICK PLAY joins the
  // first matching room — or hosts one after a short scan. This is the
  // "dynamic online" layer: rooms appear/disappear as hosts open/close.
  private roomHb: ReturnType<typeof setInterval> | null = null
  private roomsCheck: ReturnType<typeof setInterval> | null = null
  private roomInfo: { code: string; kind: string; mode: string; players: number; cap: number } | null = null
  private browsing = false

  private onRoomsMsg = (p: Rec): void => {
    const ty = str(p.ty)
    const code = str(p.code)
    if (!code) return
    const rooms = useRooms.getState().rooms
    if (ty === 'room') {
      if (this.roomInfo && code === this.roomInfo.code) return   // our own echo
      const entry: PublicRoomUI = {
        code, host: str(p.n, 'Operator'), kind: str(p.kind, '2v2'), mode: str(p.mode, 'escaramuza'),
        players: num(p.players, 1), cap: num(p.cap, 4), t: now(),
      }
      const i = rooms.findIndex(r => r.code === code)
      const next = i >= 0 ? rooms.with(i, entry) : [...rooms, entry]
      useRooms.getState().setRooms(next)
    } else if (ty === 'close') {
      useRooms.getState().setRooms(rooms.filter(r => r.code !== code))
    }
  }

  /** subscribe to the public rooms feed (room browser / quick match) */
  roomsBrowse(): void {
    if (this.browsing) return
    this.browsing = true
    this.sub(T.rooms, this.onRoomsMsg)
    if (!this.roomsCheck) {
      this.roomsCheck = setInterval(() => {
        const t = now()
        useRooms.getState().setRooms(useRooms.getState().rooms.filter(r => t - r.t < 12000))
      }, 4000)
    }
  }

  roomsStopBrowse(): void {
    if (!this.browsing) return
    this.browsing = false
    this.unsub(T.rooms, this.onRoomsMsg)
    if (this.roomsCheck) { clearInterval(this.roomsCheck); this.roomsCheck = null }
    useRooms.getState().setRooms([])
  }

  /** host: announce our room so others can discover it */
  roomPublish(code: string, kind: string, mode: string, players: number, cap: number): void {
    this.roomInfo = { code, kind, mode, players, cap }
    if (this.roomHb) return
    const beat = (): void => {
      const r = this.roomInfo
      if (!r) return
      this.pub(T.rooms, { ty: 'room', code: r.code, kind: r.kind, mode: r.mode, players: r.players, cap: r.cap, n: myOperatorName(), u: myOid(), t: now() })
    }
    this.roomHb = setInterval(beat, 4000)
    if (this.status === 'online') beat()
  }

  /** host: live occupancy updates while players join/leave the lobby */
  roomUpdate(players: number): void {
    if (!this.roomInfo) return
    this.roomInfo.players = players
  }

  stopRoomPublish(): void {
    if (this.roomHb) { clearInterval(this.roomHb); this.roomHb = null }
    if (this.roomInfo) {
      this.pub(T.rooms, { ty: 'close', code: this.roomInfo.code }, true)
      this.roomInfo = null
    }
  }

  /** recompute the friends list online dots (presence re-evaluation) */
  refreshPresenceUI(): void {
    this.pushFriendsUI()
  }
}

export const esNet = new EsNet()

// graceful exit: mark offline when the page goes away (LWT is the backup)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      if (esNet.status === 'online') esNet.disconnect()
    } catch { /* best effort */ }
  })
  // periodic presence re-evaluation (drives the online dots)
  setInterval(() => {
    if (useNet.getState().status === 'online') esNet.refreshPresenceUI()
  }, 12000)
  // v15.1 E2E hook (?netdebug=1): expose the network singleton + stores so
  // automated tests can drive REAL MQTT party flows end to end (the fake
  // ?partytest= seeds can't exercise the actual network path)
  if (new URLSearchParams(window.location.search).get('netdebug') === '1') {
    ;(window as unknown as Record<string, unknown>).__esNet = { esNet, useParty, useNet, useRooms, useGame }
  }
}
