// Diagnóstico PeerJS con las URLs EXACTAS que construye peerjs 1.5.5
const results = []

// 1) retrieveId (lo primero que hace el cliente)
async function testId() {
  const u = 'https://0.peerjs.com/peerjs/id?ts=' + Date.now() + Math.random() + '&version=1.5.5'
  try {
    const t0 = Date.now()
    const r = await fetch(u, { headers: { 'Peer-Version': '1' }, referrerPolicy: 'strict-origin-when-cross-origin' })
    const txt = await r.text()
    results.push({ step: 'retrieveId', ok: r.ok, status: r.status, ms: Date.now() - t0, body: txt.slice(0, 200) })
    return txt
  } catch (e) {
    results.push({ step: 'retrieveId', ok: false, error: e.message })
    return null
  }
}

// 2) socket de señalización (wss) con el id obtenido
async function testSocket(id) {
  return new Promise((resolve) => {
    const wsUrl = `wss://0.peerjs.com:443/peerjs?key=peerjs&id=${id}&token=${Math.random().toString(36).slice(2)}&version=1.5.5`
    let done = false
    const finish = (ok, info) => { if (!done) { done = true; try { ws.close() } catch {}; results.push({ step: 'signaling-ws', ok, info }); resolve() } }
    let ws
    try { ws = new WebSocket(wsUrl) } catch (e) { results.push({ step: 'signaling-ws', ok: false, info: 'throw ' + e.message }); return resolve() }
    const to = setTimeout(() => finish(false, 'timeout 8s'), 8000)
    ws.onopen = () => { /* abierto */ }
    ws.onmessage = (ev) => {
      const txt = String(ev.data)
      if (txt.includes('OPEN')) { clearTimeout(to); finish(true, 'server OPEN recibido') }
    }
    ws.onerror = () => { clearTimeout(to); finish(false, 'ws error') }
    ws.onclose = () => { clearTimeout(to); finish(false, 'closed ' + ws.readyState) }
  })
}

const id = await testId()
if (id) await testSocket(id.trim())

// 3) probar con un peer id fijo (como hace el host: peerIdForRoom)
async function testFixedId() {
  const u = 'https://0.peerjs.com/peerjs/peerjs/id?ts=' + Date.now() + Math.random() + '&version=1.5.5'
  try {
    const r = await fetch(u, { headers: { 'Peer-Version': '1' } })
    const txt = await r.text()
    results.push({ step: 'retrieveId-old-path', ok: r.ok, status: r.status, body: txt.slice(0, 80) })
  } catch (e) { results.push({ step: 'retrieveId-old-path', ok: false, error: e.message }) }
}
await testFixedId()

console.log(JSON.stringify(results, null, 2))
