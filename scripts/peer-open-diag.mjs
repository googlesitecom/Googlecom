// ¿Abre el cloud de PeerJS un peer ahora mismo? (con nuestros PEER_OPTS)
import pkg from 'peerjs'
const { Peer } = pkg

const t0 = Date.now()
const peer = new Peer('emstrike1-diag' + Math.floor(Math.random() * 1000), {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
    ],
  },
})

peer.on('open', (id) => {
  console.log('OPEN', id, `${Date.now() - t0}ms`)
  peer.destroy()
  process.exit(0)
})
peer.on('error', (e) => {
  console.log('ERROR', e.type, String(e.message).slice(0, 120), `${Date.now() - t0}ms`)
  peer.destroy()
  process.exit(1)
})
peer.on('disconnected', () => console.log('DISCONNECTED'))

setTimeout(() => { console.log('TIMEOUT 20s'); peer.destroy(); process.exit(2) }, 20000)
