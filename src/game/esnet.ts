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
  brLobby: `${NS}/br/q`,
  brmPose: (mid: string) => `${NS}/brm/${mid}/pose/+`,
  brmEv: (mid: string) => `${NS}/brm/${mid}/ev`,
  brmChat: (mid: string) => `${NS}/brm/${mid}/chat`,
  brmBots: (mid: string) => `${NS}/brm/${mid}/bots`,
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
interface PartyState {
  active: boolean
  gid: string
  name: string
  leaderOid: string
  leaderName: string
  members: PartyMemberUI[]
  /** room code auto-received from the leader to deploy together */
  roomCode: string
  roomKind: string
  setParty: (p: Partial<Omit<PartyState, 'setParty' | 'clear' | 'setRoom' | 'clearRoom'>>) => void
  setMembers: (m: PartyMemberUI[]) => void
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
  roomCode: '',
  roomKind: '',
  setParty: (p) => set(p),
  setMembers: (members) => set({ members }),
  setRoom: (roomCode, roomKind) => set({ roomCode, roomKind }),
  clearRoom: () => set({ roomCode: '', roomKind: '' }),
  clear: () => set({ active: false, gid: '', name: '', leaderOid: '', leaderName: '', members: [], roomCode: '', roomKind: '' }),
}))

export interface BrQueueOp { u: string; n: string }
export interface BrCountInfo { t0: number; seed: number; mid: string }

interface BrNetState {
  queuing: boolean
  status: NetStatus
  roster: BrQueueOp[]
  countInfo: BrCountInfo | null
  setQueuing: (q: boolean) => void
  setStatus: (s: NetStatus) => void
  setRoster: (r: BrQueueOp[]) => void
  setCount: (c: BrCountInfo | null) => void
}
export const useBrNet = create<BrNetState>((set) => ({
  queuing: false,
  status: 'offline',
  roster: [],
  countInfo: null,
  setQueuing: (queuing) => set({ queuing }),
  setStatus: (status) => set({ status }),
  setRoster: (roster) => set({ roster }),
  setCount: (countInfo) => set({ countInfo }),
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
  private brHb: ReturnType<typeof setInterval> | null = null
  private brRoster = new Map<string, { n: string; t: number }>()
  private brCountCheck: ReturnType<typeof setInterval> | null = null
  private brCallbacks: {
    onRoster?: (ops: BrQueueOp[]) => void
    onCountdown?: (c: BrCountInfo) => void
    onOffline?: () => void
  } = {}
  private brMid = ''
  private brInMatch = false
  private matchHandlers: {
    pose?: (u: string, p: Rec) => void
    ev?: (p: Rec) => void
    chat?: (p: Rec) => void
    bots?: (p: Rec) => void
  } = {}
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
    if (this.brHb) this.resumeBrQueue()
    if (this.brInMatch && this.brMid) this.subscribeMatch(this.brMid)
  }

  private onOfflineNet(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this.status = 'offline'
    useNet.getState().setStatus('offline')
    if (this.presTimer) { clearInterval(this.presTimer); this.presTimer = null }
    if (this.brHb) {
      useBrNet.getState().setStatus('offline')
      this.brCallbacks.onOffline?.()
    }
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
    if (this.brHb) { clearInterval(this.brHb); this.brHb = null }
    if (this.brCountCheck) { clearInterval(this.brCountCheck); this.brCountCheck = null }
    this.leavePartySilent()
    this.brLeaveQueue()
    this.brMatchLeave()
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
    this.sub(T.party(gid), this.onPartyMsg)
    useParty.getState().setParty({
      active: true, gid, name: 'SQUAD', leaderOid: '', leaderName: leaderName ?? '',
      members: [{ u: oid, n: myOperatorName(), leader: false }],
    })
    this.pub(T.party(gid), { ty: 'join', u: oid, n: myOperatorName(), t: now() })
    this.startPartyHb(false)
  }

  private startPartyHb(leader: boolean): void {
    if (this.partyHb) clearInterval(this.partyHb)
    const oid = myOid()
    this.partyHb = setInterval(() => {
      if (!this.partyGid) return
      this.pub(T.party(this.partyGid), { ty: 'hb', u: oid, n: myOperatorName(), ldr: leader ? 1 : 0, t: now() })
      this.pruneParty()
    }, 3000)
  }

  private pruneParty(): void {
    const t = now()
    const alive = new Map<string, { n: string; leader: boolean }>()
    for (const [u, m] of this.partyRoster) {
      if (t - m.t < 9000) alive.set(u, { n: m.n, leader: m.leader })
    }
    const oid = myOid()
    const me = alive.get(oid)
    if (me) alive.set(oid, { ...me, leader: me.leader || useParty.getState().leaderOid === oid })
    const members = [...alive.entries()].map(([u, v]) => ({ u, n: v.n, leader: v.leader }))
    useParty.getState().setMembers(members)
    // leader gone and I'm the lowest remaining member → promote myself
    const leaderHere = members.some(m => m.leader)
    if (!leaderHere && members.length > 0) {
      const lowest = [...members].sort((a, b) => a.u.localeCompare(b.u))[0]
      if (lowest && lowest.u === oid) {
        useParty.getState().setParty({ leaderOid: oid, leaderName: myOperatorName() })
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
      if (isFirst) {
        getAudio().uiClick()
        toast({ kind: 'info', title: 'SQUAD', body: `${str(p.n)} joined the squad` })
      }
      this.pruneParty()
      return
    }
    if (ty === 'meta') {
      useParty.getState().setParty({ name: str(p.name, 'SQUAD'), leaderOid: str(p.leader), leaderName: str(p.leaderName) })
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
    this.sub(T.party(this.partyGid), this.onPartyMsg)
    this.startPartyHb(useParty.getState().leaderOid === myOid())
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

  // ---------------- BR LOBBY — REAL operators only ----------------
  brQueueEnter(cbs: {
    onRoster?: (ops: BrQueueOp[]) => void
    onCountdown?: (c: BrCountInfo) => void
    onOffline?: () => void
  }): void {
    this.brCallbacks = cbs
    const oid = myOid()
    if (!oid) return
    useBrNet.getState().setQueuing(true)
    useBrNet.getState().setStatus(this.status === 'online' ? 'online' : this.status)
    this.brRoster.clear()
    this.brRoster.set(oid, { n: myOperatorName(), t: now() })
    this.sub(T.brLobby, this.onBrLobbyMsg)
    if (this.status === 'online') this.resumeBrQueue()
    else this.brCallbacks.onOffline?.()
  }

  private resumeBrQueue(): void {
    const oid = myOid()
    if (!oid) return
    if (!this.brHb) {
      this.brHb = setInterval(() => {
        this.pub(T.brLobby, { ty: 'hb', u: oid, n: myOperatorName(), t: now() })
      }, 2500)
      this.pub(T.brLobby, { ty: 'hb', u: oid, n: myOperatorName(), t: now() })
    }
    useBrNet.getState().setStatus('online')
    // watch the roster + trigger countdown when 4 REAL operators are in
    if (!this.brCountCheck) {
      this.brCountCheck = setInterval(() => this.brTick(), 1000)
    }
  }

  /** bots NEVER count: only real heartbeats live in brRoster */
  private brTick(): void {
    if (!this.brHb) return
    const t = now()
    for (const [u, v] of [...this.brRoster]) {
      if (u !== myOid() && t - v.t > 10000) this.brRoster.delete(u)
    }
    const ops = [...this.brRoster.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([u, v]) => ({ u, n: v.n }))
    useBrNet.getState().setRoster(ops)
    this.brCallbacks.onRoster?.(ops)
    // leader = lowest oid among REAL operators
    const countActive = useBrNet.getState().countInfo
    const fresh = countActive && countActive.t0 > t - 15000
    if (!fresh && ops.length >= 4 && ops[0].u === myOid()) {
      // I am the lobby leader → start the 60 s countdown for everyone
      const seed = (Math.random() * 0x7fffffff) | 0
      const mid = `m${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      this.pub(T.brLobby, { ty: 'count', mid, seed, t0: now() + 61000, t: now() }, true)
    }
  }

  private onBrLobbyMsg = (p: Rec): void => {
    const oid = myOid()
    const ty = str(p.ty)
    if (ty === 'hb') {
      const u = str(p.u)
      if (u) this.brRoster.set(u, { n: str(p.n, 'Operator'), t: now() })  // ours too
      return
    }
    if (ty === 'count') {
      const t0 = num(p.t0)
      const seed = num(p.seed)
      const mid = str(p.mid)
      if (!t0 || !mid) return
      if (t0 < now() - 12000) return // stale retained copy from an old match
      const info = { t0, seed, mid }
      useBrNet.getState().setCount(info)
      this.brCallbacks.onCountdown?.(info)
      return
    }
    if (ty === 'cancel') {
      const c = useBrNet.getState().countInfo
      if (c && c.mid === str(p.mid)) {
        useBrNet.getState().setCount(null)
        // engine returns to waiting state via onRoster ticks
      }
    }
  }

  brLeaveQueue(): void {
    if (this.brHb) { clearInterval(this.brHb); this.brHb = null }
    if (this.brCountCheck) { clearInterval(this.brCountCheck); this.brCountCheck = null }
    if (this.brCallbacks.onRoster || this.brCallbacks.onCountdown) {
      this.unsub(T.brLobby, this.onBrLobbyMsg)
    }
    this.brCallbacks = {}
    this.brRoster.clear()
    useBrNet.getState().setQueuing(false)
    useBrNet.getState().setRoster([])
    useBrNet.getState().setCount(null)
  }

  // ---------------- BR MATCH channels ----------------
  /** subscribe match channels at COUNTDOWN time so no message is lost;
   *  the lobby heartbeat keeps running until brMatchGo() */
  brMatchEnter(mid: string, handlers: {
    pose?: (u: string, p: Rec) => void
    ev?: (p: Rec) => void
    chat?: (p: Rec) => void
    bots?: (p: Rec) => void
  }): void {
    this.brMid = mid
    this.brInMatch = true
    this.matchHandlers = handlers
    this.subscribeMatch(mid)
  }

  /** countdown ended — match is live: stop the lobby heartbeat */
  brMatchGo(): void {
    if (this.brHb) { clearInterval(this.brHb); this.brHb = null }
    if (this.brCountCheck) { clearInterval(this.brCountCheck); this.brCountCheck = null }
  }

  private brPoseH = (p: Rec, topic: string): void => {
    const u = oidFromTopic(topic, `${NS}/brm/${this.brMid}/pose/`)
    this.matchHandlers.pose?.(u, p)
  }
  private brEvH = (p: Rec): void => { this.matchHandlers.ev?.(p) }
  private brChatH = (p: Rec): void => { this.matchHandlers.chat?.(p) }
  private brBotsH = (p: Rec): void => { this.matchHandlers.bots?.(p) }

  private subscribeMatch(mid: string): void {
    this.sub(T.brmPose(mid), this.brPoseH)
    this.sub(T.brmEv(mid), this.brEvH)
    this.sub(T.brmChat(mid), this.brChatH)
    this.sub(T.brmBots(mid), this.brBotsH)
  }

  brMatchLeave(): void {
    if (this.brMid) {
      const mid = this.brMid
      this.unsub(T.brmPose(mid), this.brPoseH)
      this.unsub(T.brmEv(mid), this.brEvH)
      this.unsub(T.brmChat(mid), this.brChatH)
      this.unsub(T.brmBots(mid), this.brBotsH)
    }
    this.brMid = ''
    this.brInMatch = false
    this.matchHandlers = {}
  }

  brPublishPose(pos: [number, number, number], yaw: number, moving: number, weapon: string, st: string, veh: number): void {
    if (!this.brMid) return
    this.pub(`${NS}/brm/${this.brMid}/pose/${myOid()}`, {
      u: myOid(), n: myOperatorName(), p: [r1(pos[0]), r1(pos[1]), r1(pos[2])],
      y: r2(yaw), m: moving, w: weapon, st, veh,
    })
  }
  brPublishEv(ev: Rec): void {
    if (!this.brMid) return
    this.pub(T.brmEv(this.brMid), { ...ev, t: now() })
  }
  brPublishBots(payload: string): void {
    if (!this.brMid) return
    this.pub(T.brmBots(this.brMid), payload)
  }
  brChatSend(text: string): boolean {
    if (!this.brMid) return false
    this.pub(T.brmChat(this.brMid), { u: myOid(), n: myOperatorName(), text })
    return true
  }

  /** recompute the friends list online dots (presence re-evaluation) */
  refreshPresenceUI(): void {
    this.pushFriendsUI()
  }
}

const r1 = (v: number): number => Math.round(v * 10) / 10
const r2 = (v: number): number => Math.round(v * 100) / 100

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
}
