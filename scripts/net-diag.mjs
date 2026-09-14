// Diagnóstico de red: brokers MQTT (esnet) + PeerJS cloud (net.ts)
const results = []

// 1) MQTT brokers con handshake real (CONNECT → CONNACK)
async function testMqtt(url) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    let done = false
    const finish = (ok, info) => { if (!done) { done = true; try { ws.close() } catch {} ; resolve({ url, ok, ms: Date.now() - t0, info }) } }
    let ws
    try { ws = new WebSocket(url, 'mqtt') } catch (e) { return resolve({ url, ok: false, info: 'throw: ' + e.message }) }
    ws.binaryType = 'arraybuffer'
    const to = setTimeout(() => finish(false, 'timeout 8s'), 8000)
    ws.onopen = () => {
      // MQTT 3.1.1 CONNECT (clean session, no will) — clientId diag_xxx
      const cid = 'diag_' + Math.random().toString(36).slice(2, 8)
      const mq = (s) => { const b = Buffer.from(s); return [b.length >> 8, b.length & 255, ...b] }
      const body = [...mq('MQTT'), 4, 0x02, 0, 60, ...mq(cid)]
      const len = body.length
      const rl = []
      let l = len
      do { let b = l % 128; l = Math.floor(l / 128); if (l > 0) b |= 128; rl.push(b) } while (l > 0)
      ws.send(new Uint8Array([0x10, ...rl, ...body]))
    }
    ws.onmessage = (ev) => {
      const u8 = new Uint8Array(ev.data)
      const type = u8[0] >> 4
      if (type === 2) { clearTimeout(to); finish(true, 'CONNACK rc=' + u8[3]) }
    }
    ws.onerror = () => { clearTimeout(to); finish(false, 'ws error') }
    ws.onclose = () => { clearTimeout(to); finish(false, 'closed before connack') }
  })
}

// 2) PeerJS cloud signaling (misma llamada que hace la librería al abrir)
async function testPeerjs() {
  const urls = [
    'https://0.peerjs.com/peerjs/peerjs/id?ts=abc123.456',
  ]
  for (const u of urls) {
    try {
      const t0 = Date.now()
      const r = await fetch(u, { headers: { 'Peer-Version': '1' } })
      const txt = await r.text()
      results.push({ url: u, ok: r.ok, status: r.status, ms: Date.now() - t0, body: txt.slice(0, 120) })
    } catch (e) {
      results.push({ url: u, ok: false, error: e.message })
    }
  }
}

const brokers = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]
for (const b of brokers) results.push(await testMqtt(b))
await testPeerjs()

console.log(JSON.stringify(results, null, 2))
