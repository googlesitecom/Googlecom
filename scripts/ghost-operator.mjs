// Ghost operator simulator: acts as REAL remote operators on the public
// MQTT broker (presence, BR lobby heartbeat, friend requests).
// Usage:
//   node scripts/ghost-operator.mjs --oid K7X2M9 --name Ghost1 [--br] [--freq <targetOid>]
const enc = new TextEncoder()
const dec = new TextDecoder()
const args = process.argv.slice(2)
const arg = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null }
const OID = arg('oid') || 'GH' + Math.random().toString(36).slice(2, 6).toUpperCase()
const NAME = arg('name') || 'Ghost' + OID.slice(0, 3)
const DO_BR = args.includes('--br')
const FRIEND_TARGET = arg('freq')
const NS = 'esn/v1'
const URL = 'wss://broker.emqx.io:8084/mqtt'

function mqStr(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b] }
function remainLen(len) { const out = []; do { let b = len % 128; len = Math.floor(len / 128); if (len > 0) b |= 128; out.push(b) } while (len > 0); return out }
function packet(h, body) { return new Uint8Array([h, ...remainLen(body.length), ...body]) }
let subId = 0
function buildSubscribe(topic) { subId++; return packet(0x82, [(subId >> 8) & 255, subId & 255, ...mqStr(topic), 0]) }
function buildPublish(topic, payload, retain) { return packet(retain ? 0x31 : 0x30, [...mqStr(topic), ...enc.encode(payload)]) }
function parseIncoming(buf) {
  const u8 = new Uint8Array(buf)
  const type = u8[0] >> 4
  let mult = 1, rl = 0, i = 1
  for (;;) { const b = u8[i++]; rl += (b & 127) * mult; if (!(b & 128)) break; mult *= 128 }
  const body = u8.subarray(i, i + rl)
  if (type === 3) {
    const tlen = (body[0] << 8) | body[1]
    return { type: 'publish', topic: dec.decode(body.subarray(2, 2 + tlen)), payload: dec.decode(body.subarray(2 + tlen)) }
  }
  if (type === 2) return { type: 'connack', rc: body[1] }
  return { type: 'other' }
}

const ws = new WebSocket(URL, 'mqtt')
ws.binaryType = 'arraybuffer'
const pub = (topic, obj, retain = false) => ws.send(buildPublish(topic, JSON.stringify(obj), retain))
const log = (...a) => console.log(`[${NAME}/${OID}]`, ...a)

ws.onopen = () => {
  ws.send(packet(0x10, [...mqStr('MQTT'), 4, 0x02, 0, 60, ...mqStr('ghost_' + OID + Math.random().toString(36).slice(2, 6))]))
}
ws.onmessage = (ev) => {
  const m = parseIncoming(ev.data)
  if (m.type === 'connack') {
    if (m.rc !== 0) { log('CONNACK FAIL', m.rc); process.exit(1) }
    log('connected to broker')
    ws.send(buildSubscribe(`${NS}/f/+/+`))
    ws.send(buildSubscribe(`${NS}/dm/${OID}`))
    ws.send(buildSubscribe(`${NS}/br/q`))
    // presence heartbeat
    pub(`${NS}/pres/${OID}`, { u: OID, n: NAME, t: Date.now() }, true)
    setInterval(() => pub(`${NS}/pres/${OID}`, { u: OID, n: NAME, t: Date.now() }, true), 15000)
    // friend request?
    if (FRIEND_TARGET) {
      pub(`${NS}/f/${OID}/${FRIEND_TARGET}`, { f: OID, fn: NAME, g: FRIEND_TARGET, gn: 'Target', s: 'pending', t: Date.now() }, true)
      log('friend request sent to', FRIEND_TARGET)
    }
    if (DO_BR) {
      const hb = () => pub(`${NS}/br/q`, { ty: 'hb', u: OID, n: NAME, t: Date.now() })
      hb()
      setInterval(hb, 2500)
      log('BR lobby heartbeat ON')
    }
    // keep alive
    setInterval(() => ws.send(new Uint8Array([0xC0, 0x00])), 20000)
  }
  if (m.type === 'publish' && m.payload) {
    let d
    try { d = JSON.parse(m.payload) } catch { return }
    if (m.topic.startsWith(`${NS}/f/`) && d.s) {
      log('friend topic:', m.topic, '→', d.s, d.s === 'accepted' ? '(now friends)' : '')
    }
    if (m.topic.startsWith(`${NS}/dm/${OID}`)) {
      log('DM:', JSON.stringify(d))
    }
    if (m.topic === `${NS}/br/q`) {
      if (d.ty === 'count') log('COUNT received — countdown to', new Date(d.t0).toISOString(), 'seed', d.seed, 'mid', d.mid)
      else if (d.ty === 'hb' && d.u !== OID) log('lobby hb from', d.u, d.n)
    }
  }
}
ws.onclose = () => { log('closed'); process.exit(0) }
ws.onerror = () => { log('ws error') }
log('starting… OID', OID)
