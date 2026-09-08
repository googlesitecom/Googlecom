// ============================================================
// FRONTERA CERO — Cliente de red (Socket.io)
// ============================================================
import { io, type Socket } from 'socket.io-client'
import type { Game } from './engine'
import { useGame } from './store'
import { WEAPONS, type WeaponId, type NetSnapshot, type NetRoundState } from './shared'

export class NetClient {
  socket: Socket | null = null
  id = ''
  game: Game
  private lastInput: {
    pos: [number, number, number]; yaw: number; pitch: number
    crouch: boolean; speed: number; weapon: string
  } | null = null

  constructor(game: Game) {
    this.game = game
  }

  connect(name: string): void {
    const s = useGame.getState()
    s.setPhase('connecting')
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      timeout: 12000,
    })
    this.socket = socket

    socket.on('connect', () => {
      this.id = socket.id ?? ''
      socket.emit('join', { name })
    })

    socket.on('disconnect', () => {
      useGame.getState().setConnected(false)
    })

    socket.on('welcome', (data: {
      id: string; team: 'A' | 'B'; players: unknown[]; round: NetRoundState; econ: { money: number; frags: number }
    }) => {
      this.id = data.id
      useGame.getState().setConnected(true)
      useGame.getState().setHud({ round: data.round, playerId: data.id })
      this.game.onWelcome(data.team, data.econ.money)
    })

    socket.on('spawnEvent', (data: {
      pos: [number, number, number]; yaw: number; hp: number; armor: number
      weapons: WeaponId[]; weapon: WeaponId; frags: number; money: number; protect: number
    }) => {
      this.game.onSpawn(data.pos, data.yaw, data.weapons, data.weapon, data.hp, data.armor, data.frags, data.money)
    })

    socket.on('snapshot', (snap: NetSnapshot) => {
      this.game.onSnapshot(snap)
      // actualizar hp local desde el servidor
      const me = snap.players.find(p => p.id === this.id)
      if (me) {
        this.game.setHealth(me.hp, me.armor)
      }
    })

    socket.on('hitConfirm', (data: { victim: string; dmg: number; part: string; weapon: WeaponId; headshot: boolean }) => {
      this.game.onHitConfirm(data.dmg, data.headshot)
    })

    socket.on('takeDamage', (data: { attacker: string; dmg: number; part: string; weapon: WeaponId; dir: [number, number]; attackerPos: [number, number, number] }) => {
      this.game.onTakeDamage(data.dmg, data.attackerPos)
    })

    socket.on('deathEvent', (data: { killer: string; killerName: string; weapon: WeaponId; respawnIn: number }) => {
      this.game.onDeath(data.killerName, data.respawnIn)
    })

    socket.on('kill', (data: {
      killer: string; killerName: string; killerTeam: 'A' | 'B'
      victim: string; victimName: string; victimTeam: 'A' | 'B'
      weapon: WeaponId; headshot: boolean
    }) => {
      useGame.getState().addKill({
        killer: data.killerName, killerTeam: data.killerTeam,
        victim: data.victimName, victimTeam: data.victimTeam,
        weapon: data.weapon, headshot: data.headshot,
      })
      if (data.killer === this.id) {
        this.game.audio.killConfirm()
      }
    })

    socket.on('shotFired', (data: { playerId: string; origin: [number, number, number]; hit: [number, number, number]; weapon: WeaponId }) => {
      if (data.playerId === this.id) return
      this.game.onShotFired(data.playerId, data.origin, data.hit, data.weapon)
    })

    socket.on('grenadeExplode', (data: { id: string; pos: [number, number, number] }) => {
      this.game.onGrenadeExplode(data.pos)
    })

    socket.on('damageFX', (data: { x: number; y: number; z: number; part: string }) => {
      // sonido de impacto en carne cercano
      const d = Math.hypot(data.x - this.game.pos.x, data.z - this.game.pos.z)
      if (d < 30 && d > 2) this.game.audio.fleshHit(d)
    })

    socket.on('announce', (data: { text: string; kind: string; team?: 'A' | 'B' }) => {
      useGame.getState().addAnnouncement(data.text, data.kind as 'kill' | 'round' | 'info')
      if (data.kind === 'kill' || data.kind === 'round') this.game.audio.announceDing()
      if (data.kind === 'round') {
        if (data.text.includes('RONDA') && data.text.includes('COMBATE')) this.game.audio.roundStart()
        else this.game.audio.roundEnd()
      }
    })

    socket.on('roundStart', (data: { roundNumber: number }) => {
      void data
    })

    socket.on('roundEnd', (data: { winner: 'A' | 'B'; scoresA: number; scoresB: number }) => {
      useGame.getState().addAnnouncement(
        `RONDA GANADA POR ${data.winner === 'A' ? 'ÁMBAR' : 'VERDE'} (${data.scoresA}–${data.scoresB})`,
        'round', data.winner,
      )
    })

    socket.on('matchEnd', (data: { winner: 'A' | 'B'; roundWinsA: number; roundWinsB: number }) => {
      useGame.getState().addAnnouncement(
        `VICTORIA FINAL: ${data.winner === 'A' ? 'ÁMBAR' : 'VERDE'} ${data.roundWinsA}–${data.roundWinsB}`,
        'round', data.winner,
      )
    })

    socket.on('econ', (data: { money: number; frags?: number }) => {
      this.game.setMoney(data.money, data.frags)
    })

    socket.on('buyResult', (data: { ok: boolean; itemId: string; money: number; error?: string }) => {
      const s = useGame.getState()
      if (data.ok) {
        this.game.audio.buy()
        this.game.setMoney(data.money)
      } else if (data.error) {
        s.addAnnouncement(data.error, 'info')
      }
    })

    socket.on('giveWeapon', (data: { weapon: WeaponId }) => {
      this.game.giveWeapon(data.weapon)
    })

    socket.on('refillAmmo', (data: { weapon: WeaponId }) => {
      this.game.refillAmmo(data.weapon)
    })

    socket.on('playerJoined', (data: { id: string; name: string; team: 'A' | 'B' }) => {
      useGame.getState().addAnnouncement(`${data.name} se unió al ${data.team === 'A' ? 'ÁMBAR' : 'VERDE'}`, 'info')
    })

    socket.on('playerLeft', (data: { id: string; name: string }) => {
      useGame.getState().addAnnouncement(`${data.name} abandonó`, 'info')
    })

    socket.on('connect_error', () => {
      const s = useGame.getState()
      if (s.phase === 'connecting') {
        s.setPhase('menu')
        s.addAnnouncement('No se pudo conectar al servidor', 'info')
      }
    })
  }

  sendInput(): void {
    if (!this.socket || !this.socket.connected) return
    this.lastInput = this.game.inputState()
    this.socket.emit('input', this.lastInput)
  }

  sendHits(weapon: WeaponId, hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number }[]): void {
    if (!this.socket || !this.socket.connected) return
    const w = WEAPONS[weapon]
    this.socket.emit('hits', {
      weapon,
      hits: hits.map(h => ({ target: h.target, part: h.part, dist: Math.round(h.dist) })),
      pellets: w.pellets,
    })
  }

  buy(itemId: string): void {
    this.socket?.emit('buy', { itemId })
  }

  throwGrenade(pos: [number, number, number], vel: [number, number, number]): void {
    this.socket?.emit('grenadeThrow', { pos, vel })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }
}
