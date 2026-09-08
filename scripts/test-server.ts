// Prueba del protocolo del servidor: join, buy grenade, econ
import { io } from 'socket.io-client'

const socket = io('http://localhost:3003', { transports: ['websocket'] })

socket.on('connect', () => {
  console.log('conectado como', socket.id)
  socket.emit('join', { name: 'TestBot' })
})

socket.on('welcome', (d: { id: string; team: string; econ: { money: number; frags: number } }) => {
  console.log('welcome:', JSON.stringify({ id: d.id, team: d.team, econ: d.econ }))
  // esperar a estar en la zona de compra del equipo y comprar
  setTimeout(() => {
    socket.emit('buy', { itemId: 'e:frag' })
  }, 500)
})

socket.on('buyResult', (d: { ok: boolean; itemId: string; money: number; error?: string }) => {
  console.log('buyResult:', JSON.stringify(d))
})

socket.on('econ', (d: { money: number; frags?: number }) => {
  console.log('econ:', JSON.stringify(d))
})

socket.on('spawnEvent', (d: { pos: number[]; money: number; frags: number }) => {
  console.log('spawnEvent: money', d.money, 'frags', d.frags, 'pos', d.pos)
})

socket.on('snapshot', (s: { players: { id: string; name: string }[] }) => {
  if (Math.random() < 0.02) console.log('snapshot con', s.players.length, 'jugadores')
})

setTimeout(() => {
  console.log('--- fin de prueba ---')
  socket.disconnect()
  process.exit(0)
}, 3000)
