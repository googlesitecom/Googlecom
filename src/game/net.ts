// ============================================================
// FRONTERA CERO — Cliente de red
// - solo:  simulación local con bots (sin servidor)
// - host:  simulación local + sala 1v1 por PeerJS (P2P)
// - guest: se conecta a la sala del anfitrión por PeerJS
// ============================================================
import { Peer, type DataConnection } from 'peerjs'
import type { Game } from './engine'
import { useGame } from './store'
import {
  GAME, generateRoomCode, peerIdForRoom,
  type WeaponId, type NetSnapshot, type NetRoundState, type BotDifficulty, type GrenadeKind, type GameMode, type MapId,
} from './shared'

export type NetMode = 'solo' | 'host' | 'guest'

export interface ConnectOpts {
  mode: NetMode
  roomCode?: string
  fillBots?: number
  difficulty?: BotDifficulty
  gameMode?: GameMode
}

/** servidores STUN públicos para atravesar NAT (fiabilidad P2P) */
const PEER_OPTS = {
  debug: 0 as const,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
}

interface InputMsg {
  pos: [number, number, number]; yaw: number; pitch: number
  crouch: boolean; speed: number; weapon: string
}

interface PeerMsg { e: string; d: unknown }

const HOST_ID = 'p1'
const GUEST_ID = 'p2'

export class NetClient {
  id = ''
  game: Game
  mode: NetMode = 'solo'
  private worker: Worker | null = null
  private peer: Peer | null = null
  private guestConn: DataConnection | null = null  // host → invitado
  private hostConn: DataConnection | null = null   // invitado → anfitrión
  private lastInput: InputMsg | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private welcomeTimeout: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(game: Game) {
    this.game = game
  }

  connect(name: string, opts: ConnectOpts): void {
    this.mode = opts.mode
    const s = useGame.getState()
    s.setPhase('connecting')
    s.setHud({ netStatus: 'connecting', netError: '', ping: 0 })
    const gameMode = opts.gameMode ?? 'escaramuza'
    // el mapa depende del modo: la misión se juega en la instalación
    this.mapId = gameMode === 'historia' ? 'instalacion' : 'ciudad'
    if (opts.mode === 'solo') {
      this.connectSolo(name, opts.difficulty ?? 'normal', gameMode)
    } else if (opts.mode === 'host') {
      this.connectHost(name, opts.roomCode || generateRoomCode(), opts.fillBots ?? 0, opts.difficulty ?? 'normal', 0, gameMode)
    } else {
      this.connectGuest(name, opts.roomCode ?? '')
    }
  }

  private mapId: MapId = 'ciudad'

  // ------------------------------------------------------------
  // SIMULACIÓN EN WEB WORKER (solo / anfitrión)
  // ------------------------------------------------------------
  private startSimWorker(difficulty: BotDifficulty, bots: number, gameMode: GameMode): void {
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url))
    this.worker = worker
    worker.onmessage = (ev: MessageEvent) => {
      if (this.disposed) return
      const msg = ev.data as { e: string; d: unknown; to?: string }
      if (!msg || typeof msg.e !== 'string') return
      // entregar localmente (broadcast o dirigido al anfitrión)
      if (!msg.to || msg.to === HOST_ID) this.dispatchLocal(msg.e, msg.d)
      // reenviar al invitado P2P (broadcast o dirigido a él)
      if (!msg.to || msg.to === GUEST_ID) this.forwardToGuest({ e: msg.e, d: msg.d })
    }
    this.sendToSim({ e: 'init', d: { difficulty, bots, mode: gameMode, mapId: this.mapId } })
  }

  private sendToSim(msg: unknown): void {
    this.worker?.postMessage(msg)
  }

  /** Reenvía un mensaje al invitado, encolando si el canal aún no abre */
  private forwardToGuest(msg: PeerMsg): void {
    const c = this.guestConn
    if (!c) return
    if (c.open) {
      this.sendToPeer(c, msg)
    } else {
      this.guestOutbox.push(msg)
      if (this.guestOutbox.length > 200) this.guestOutbox.splice(0, 100)
    }
  }

  // ------------------------------------------------------------
  // MODO SOLO — simulación local con bots (en worker)
  // ------------------------------------------------------------
  private connectSolo(name: string, difficulty: BotDifficulty, gameMode: GameMode): void {
    this.id = HOST_ID
    // modo historia: 7 enemigos del bando B en el mapa instalación
    const bots = gameMode === 'historia' ? 7 : Math.floor(GAME.BOT_COUNT / 2)
    this.startSimWorker(difficulty, bots, gameMode)
    this.sendToSim({ e: 'join', d: { id: HOST_ID, name, team: 'A', announce: false } })
    useGame.getState().setHud({ netStatus: 'connected' })
  }

  // ------------------------------------------------------------
  // MODO ANFITRIÓN — sala 1v1 por PeerJS + worker
  // ------------------------------------------------------------
  private connectHost(name: string, code: string, fill: number, difficulty: BotDifficulty, attempt: number, gameMode: GameMode): void {
    this.id = HOST_ID
    // sincronizar el código de sala con el store (puede haberse regenerado)
    if (useGame.getState().roomCode !== code) useGame.getState().setHud({ roomCode: code })
    this.startSimWorker(difficulty, fill, gameMode)
    this.sendToSim({ e: 'join', d: { id: HOST_ID, name, team: 'A', announce: false } })
    useGame.getState().setHud({ netStatus: 'waiting' })

    const peer = new Peer(peerIdForRoom(code), PEER_OPTS)
    this.peer = peer

    peer.on('open', () => {
      if (this.disposed) return
      useGame.getState().addAnnouncement(`SALA ${code} CREADA — comparte el código`, 'info')
    })

    // si el servidor de señalización se cae, reconectar para que la sala
    // siga admitiendo invitados (v5: fiabilidad del multijugador)
    peer.on('disconnected', () => {
      if (this.disposed || !this.peer) return
      useGame.getState().addAnnouncement('Reconectando la sala con el servidor…', 'info')
      try { this.peer.reconnect() } catch { /* el peer se recrea abajo si falla */ }
    })

    peer.on('connection', (conn: DataConnection) => {
      if (this.disposed) { conn.close(); return }
      if (this.guestConn) { conn.close(); return } // 1v1: un solo invitado

      // asignar inmediatamente (el open puede llegar después de datos)
      this.guestConn = conn

      conn.on('open', () => {
        // vaciar mensajes encolados mientras se abría el canal
        for (const m of this.guestOutbox) this.sendToPeer(conn, m)
        this.guestOutbox.length = 0
      })

      conn.on('data', (raw: unknown) => {
        if (this.disposed) return
        const msg = raw as PeerMsg
        if (!msg || typeof msg.e !== 'string') return

        if (msg.e === 'join') {
          if (!this.guestJoined) {
            this.guestJoined = true
            const gname = String((msg.d as { name?: string })?.name ?? 'Rival').slice(0, 16) || 'Rival'
            this.sendToSim({ e: 'join', d: { id: GUEST_ID, name: gname, team: 'B', announce: true } })
            // el welcome para el invitado llega por la ruta del worker (to='p2')
            useGame.getState().setHud({ netStatus: 'connected' })
          }
          return
        }
        if (msg.e === 'ping') {
          this.sendToPeer(conn, { e: 'pong', d: msg.d })
          return
        }
        // entradas de juego del invitado → worker
        this.sendToSim({ e: msg.e, d: { id: GUEST_ID, data: msg.d } })
      })

      conn.on('close', () => {
        if (this.guestConn === conn) {
          this.guestConn = null
          this.guestJoined = false
          this.guestOutbox.length = 0
          this.sendToSim({ e: 'leave', d: { id: GUEST_ID } })
          useGame.getState().setHud({ netStatus: 'waiting' })
          useGame.getState().addAnnouncement('El rival abandonó la sala', 'info')
        }
      })
      conn.on('error', () => { /* silencioso */ })
    })

    peer.on('error', (err: unknown) => {
      if (this.disposed) return
      const type = (err as { type?: string })?.type
      if (type === 'unavailable-id' && attempt < 3) {
        // código ocupado → regenerar sala con otro código
        peer.destroy()
        this.peer = null
        const newCode = generateRoomCode()
        useGame.getState().setHud({ roomCode: newCode })
        this.connectHost(name, newCode, fill, difficulty, attempt + 1, gameMode)
      } else if (type === 'unavailable-id') {
        useGame.getState().addAnnouncement('No se pudo crear la sala, inténtalo de nuevo', 'info')
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        // v5: el servidor de salas falló → reintentar hasta 3 veces antes
        // de rendirse (el juego local con bots sigue funcionando)
        if (attempt < 3) {
          useGame.getState().addAnnouncement(`Servidor de salas ocupado, reintentando (${attempt + 1}/3)…`, 'info')
          peer.destroy()
          this.peer = null
          setTimeout(() => {
            if (this.disposed) return
            this.connectHost(name, code, fill, difficulty, attempt + 1, gameMode)
          }, 2500)
        } else {
          useGame.getState().addAnnouncement('Servidor de salas no disponible (PeerJS) — juega contra bots', 'info')
          useGame.getState().setHud({ netStatus: 'connected' })
        }
      } else {
        useGame.getState().addAnnouncement('Servidor de salas no disponible (PeerJS)', 'info')
        useGame.getState().setHud({ netStatus: 'connected' }) // el juego local sigue funcionando
      }
    })
  }

  private guestJoined = false
  private guestOutbox: PeerMsg[] = []

  // ------------------------------------------------------------
  // MODO INVITADO — se une a la sala del anfitrión
  // v5: hasta 3 intentos (peer nuevo en cada uno) con tiempo límite
  // por intento y mensajes de error claros
  // ------------------------------------------------------------
  private guestAttempt = 0

  private connectGuest(name: string, code: string): void {
    this.id = GUEST_ID
    this.mode = 'guest'
    const clean = code.trim().toUpperCase()
    if (clean.length < 4 || clean.length > 8) {
      this.fail('Código de sala inválido')
      return
    }
    useGame.getState().setHud({ roomCode: clean })
    this.guestAttempt = 0
    this.guestAttemptConnect(name, clean)
  }

  private guestAttemptConnect(name: string, clean: string): void {
    // tiempo límite del intento (12 s): cubre la señalización + ICE
    const attemptTimer = setTimeout(() => {
      if (useGame.getState().netStatus === 'connected') return
      this.retryGuest(name, clean, 'El enlace no llegó a abrirse')
    }, 12000)
    this.welcomeTimeout = attemptTimer

    const peer = new Peer(PEER_OPTS) // id aleatorio
    this.peer = peer
    let retried = false
    const retryOnce = (msg: string): void => {
      if (retried || this.disposed) return
      retried = true
      clearTimeout(attemptTimer)
      this.retryGuest(name, clean, msg)
    }

    peer.on('open', () => {
      if (this.disposed) return
      const conn = peer.connect(peerIdForRoom(clean), { reliable: true, serialization: 'json' })
      this.hostConn = conn

      conn.on('open', () => {
        if (this.disposed) return
        this.sendToPeer(conn, { e: 'join', d: { name } })
      })

      conn.on('data', (raw: unknown) => {
        if (this.disposed) return
        const msg = raw as PeerMsg
        if (!msg || typeof msg.e !== 'string') return
        if (msg.e === 'welcome') {
          if (this.welcomeTimeout) { clearTimeout(this.welcomeTimeout); this.welcomeTimeout = null }
          useGame.getState().setHud({ netStatus: 'connected' })
          useGame.getState().setConnected(true)
          this.dispatchLocal('welcome', msg.d)
          this.startPing()
          return
        }
        if (msg.e === 'pong') {
          const t = (msg.d as { t?: number })?.t
          if (t) useGame.getState().setHud({ ping: Math.max(0, Math.round(performance.now() - t)) })
          return
        }
        this.dispatchLocal(msg.e, msg.d)
      })

      conn.on('close', () => {
        if (this.disposed) return
        useGame.getState().setConnected(false)
        useGame.getState().setHud({ netStatus: 'error', netError: 'Se perdió la conexión con el anfitrión' })
      })
      conn.on('error', () => retryOnce('Fallo del canal de datos'))
    })

    peer.on('error', (err: unknown) => {
      if (this.disposed) return
      const type = (err as { type?: string })?.type
      if (type === 'peer-unavailable') this.fail('Sala no encontrada. Revisa el código.')
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        retryOnce('No se puede alcanzar el servidor de salas (PeerJS)')
      } else if (type === 'unavailable-id') {
        retryOnce('Id de sala ocupada, reintentando')
      } else {
        retryOnce(`Error de conexión (${type ?? 'desconocido'})`)
      }
    })
  }

  private retryGuest(name: string, clean: string, motivo: string): void {
    this.guestAttempt++
    try { this.hostConn?.close() } catch { /* ok */ }
    this.hostConn = null
    try { this.peer?.destroy() } catch { /* ok */ }
    this.peer = null
    if (this.guestAttempt >= 3) {
      this.fail(`${motivo}. Revisa el código o tu conexión.`)
      return
    }
    useGame.getState().setHud({ netStatus: 'connecting' })
    useGame.getState().addAnnouncement(`Reintentando unirse (${this.guestAttempt + 1}/3)…`, 'info')
    setTimeout(() => {
      if (this.disposed) return
      if (useGame.getState().netStatus === 'connected') return
      this.guestAttemptConnect(name, clean)
    }, 1200)
  }

  private fail(msg: string): void {
    if (this.welcomeTimeout) { clearTimeout(this.welcomeTimeout); this.welcomeTimeout = null }
    useGame.getState().setHud({ netStatus: 'error', netError: msg })
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.hostConn?.open) {
        this.sendToPeer(this.hostConn, { e: 'ping', d: { t: Math.round(performance.now()) } })
      }
    }, 2000)
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
  }

  private sendToPeer(conn: DataConnection, msg: PeerMsg): void {
    try { conn.send(msg) } catch { /* conexión cerrada */ }
  }

  // ------------------------------------------------------------
  // Entradas hacia la simulación (worker local o anfitrión remoto)
  // ------------------------------------------------------------
  sendInput(): void {
    this.lastInput = this.game.inputState()
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'input', d: this.lastInput })
      return
    }
    this.sendToSim({ e: 'input', d: { id: this.id, data: this.lastInput } })
  }

  sendHits(weapon: WeaponId, hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number }[]): void {
    const payload = {
      weapon,
      hits: hits.map(h => ({ target: h.target, part: h.part, dist: Math.round(h.dist) })),
    }
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'hits', d: payload })
      return
    }
    this.sendToSim({ e: 'hits', d: { id: this.id, data: payload } })
  }

  buy(itemId: string): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'buy', d: { itemId } })
      return
    }
    this.sendToSim({ e: 'buy', d: { id: this.id, itemId } })
  }

  throwGrenade(pos: [number, number, number], vel: [number, number, number], kind: GrenadeKind = 'frag'): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'grenadeThrow', d: { pos, vel, kind } })
      return
    }
    this.sendToSim({ e: 'grenadeThrow', d: { id: this.id, data: { pos, vel, kind } } })
  }

  /** Disparo del jugador local (para que los demás vean traza + animación de disparo) */
  sendShot(origin: [number, number, number], hit: [number, number, number]): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'playerShot', d: { origin, hit } })
      return
    }
    this.sendToSim({ e: 'playerShot', d: { id: this.id, data: { origin, hit } } })
  }

  /** El jugador local ha reventado un barril explosivo (daño de área autoritativo) */
  sendBarrel(pos: [number, number, number]): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'barrelShot', d: { pos } })
      return
    }
    this.sendToSim({ e: 'barrelShot', d: { id: this.id, data: { pos } } })
  }

  /** Comandos del director del modo historia (jefe, entrega de armas) */
  sendStoryCmd(data: { cmd: string; botId?: string; weapon?: WeaponId; count?: number; x?: number; z?: number }): void {
    if (this.mode === 'guest') return   // la misión es local
    this.sendToSim({ e: 'storyCmd', d: { id: this.id, data } })
  }

  disconnect(): void {
    this.disposed = true
    if (this.welcomeTimeout) { clearTimeout(this.welcomeTimeout); this.welcomeTimeout = null }
    this.stopPing()
    if (this.worker) { this.worker.terminate(); this.worker = null }
    try { this.guestConn?.close() } catch { /* ok */ }
    try { this.hostConn?.close() } catch { /* ok */ }
    this.guestConn = null
    this.hostConn = null
    try { this.peer?.destroy() } catch { /* ok */ }
    this.peer = null
  }

  // ------------------------------------------------------------
  // Distribución local de eventos del servidor/simulación
  // (mismos nombres de evento que el protocolo original)
  // ------------------------------------------------------------
  private dispatchLocal(ev: string, data: unknown): void {
    const game = this.game
    const store = useGame.getState()
    switch (ev) {
      case 'welcome': {
        const d = data as { id: string; team: 'A' | 'B'; round: NetRoundState; econ: { money: number; frags: number } }
        this.id = d.id
        store.setConnected(true)
        store.setHud({ round: d.round, playerId: d.id, team: d.team })
        game.onWelcome(d.team, d.econ.money)
        break
      }
      case 'spawnEvent': {
        const d = data as {
          pos: [number, number, number]; yaw: number; hp: number; armor: number
          weapons: WeaponId[]; weapon: WeaponId; frags: number; money: number; protect: number
        }
        game.onSpawn(d.pos, d.yaw, d.weapons, d.weapon, d.hp, d.armor, d.frags, d.money)
        break
      }
      case 'snapshot': {
        const snap = data as NetSnapshot
        game.onSnapshot(snap)
        const me = snap.players.find(p => p.id === this.id)
        if (me) game.setHealth(me.hp, me.armor)
        break
      }
      case 'hitConfirm': {
        const d = data as { dmg: number; headshot: boolean }
        game.onHitConfirm(d.dmg, d.headshot)
        break
      }
      case 'takeDamage': {
        const d = data as { dmg: number; attackerPos: [number, number, number] }
        game.onTakeDamage(d.dmg, d.attackerPos)
        break
      }
      case 'deathEvent': {
        const d = data as { killerName: string; respawnIn: number }
        game.onDeath(d.killerName, d.respawnIn)
        break
      }
      case 'kill': {
        const d = data as {
          killer: string; killerName: string; killerTeam: 'A' | 'B'
          victim: string; victimName: string; victimTeam: 'A' | 'B'
          weapon: WeaponId; headshot: boolean
        }
        store.addKill({
          killer: d.killerName, killerTeam: d.killerTeam,
          victim: d.victimName, victimTeam: d.victimTeam,
          weapon: d.weapon, headshot: d.headshot,
        })
        if (d.killer === this.id) game.audio.killConfirm()
        break
      }
      case 'shotFired': {
        const d = data as { playerId: string; origin: [number, number, number]; hit: [number, number, number]; weapon: WeaponId }
        if (d.playerId === this.id) return
        game.onShotFired(d.playerId, d.origin, d.hit, d.weapon)
        break
      }
      case 'grenadeExplode': {
        const d = data as { pos: [number, number, number] }
        game.onGrenadeExplode(d.pos)
        break
      }
      case 'smokeSpawn': {
        const d = data as { id: string; pos: [number, number, number]; duration: number }
        game.onSmokeSpawn(d.id, d.pos, d.duration)
        break
      }
      case 'barrelExplode': {
        const d = data as { playerId: string; pos: [number, number, number] }
        if (d.playerId === this.id) break   // el tirador ya reprodujo el efecto localmente
        game.onBarrelExplode(d.pos)
        break
      }
      case 'damageFX': {
        const d = data as { x: number; z: number }
        const dist = Math.hypot(d.x - game.pos.x, d.z - game.pos.z)
        if (dist < 30 && dist > 2) game.audio.fleshHit(dist)
        break
      }
      case 'announce': {
        const d = data as { text: string; kind: string; team?: 'A' | 'B' }
        store.addAnnouncement(d.text, d.kind as 'kill' | 'round' | 'info')
        if (d.kind === 'kill' || d.kind === 'round') game.audio.announceDing()
        if (d.kind === 'round') {
          if (d.text.includes('RONDA') && d.text.includes('COMBATE')) game.audio.roundStart()
          else game.audio.roundEnd()
        }
        break
      }
      case 'roundEnd': {
        const d = data as { winner: 'A' | 'B'; scoresA: number; scoresB: number }
        store.addAnnouncement(
          `RONDA GANADA POR ${d.winner === 'A' ? 'ÁMBAR' : 'VERDE'} (${d.scoresA}–${d.scoresB})`,
          'round', d.winner,
        )
        break
      }
      case 'matchEnd': {
        const d = data as { winner: 'A' | 'B'; roundWinsA: number; roundWinsB: number }
        store.addAnnouncement(
          `VICTORIA FINAL: ${d.winner === 'A' ? 'ÁMBAR' : 'VERDE'} ${d.roundWinsA}–${d.roundWinsB}`,
          'round', d.winner,
        )
        break
      }
      case 'econ': {
        const d = data as { money: number; frags?: number; smokes?: number }
        game.setMoney(d.money, d.frags, d.smokes)
        break
      }
      case 'buyResult': {
        const d = data as { ok: boolean; money: number; error?: string }
        if (d.ok) {
          game.audio.buy()
          game.setMoney(d.money)
        } else if (d.error) {
          store.addAnnouncement(d.error, 'info')
        }
        break
      }
      case 'pickupEvent': {
        const d = data as { kind: string; hpGain: number; shieldGain: number }
        game.onPickup(d.kind as 'medkit' | 'bandage' | 'shieldSmall' | 'shieldBig', d.hpGain, d.shieldGain)
        break
      }
      case 'giveWeapon': {
        const d = data as { weapon: WeaponId }
        game.giveWeapon(d.weapon)
        break
      }
      case 'refillAmmo': {
        const d = data as { weapon: WeaponId }
        game.refillAmmo(d.weapon)
        break
      }
      case 'playerJoined': {
        const d = data as { name: string; team: 'A' | 'B' }
        store.addAnnouncement(`${d.name} se unió al ${d.team === 'A' ? 'ÁMBAR' : 'VERDE'}`, 'info')
        break
      }
      case 'playerLeft': {
        const d = data as { name: string }
        store.addAnnouncement(`${d.name} abandonó`, 'info')
        break
      }
      case 'flagEvent': {
        const d = data as { flag: 'a' | 'b'; type: string; x?: number; z?: number; carrier?: string }
        game.onFlagEvent(d.flag, d.type, d.x, d.z)
        break
      }
      case 'zoneEvent': {
        const d = data as { zone: 'A' | 'B' | 'C'; owner: 'A' | 'B' | null }
        game.onZoneEvent(d.zone, d.owner)
        break
      }
      case 'captureFX': {
        const d = data as { x: number; z: number; team: 'A' | 'B' }
        game.onCaptureFX(d.x, d.z, d.team)
        break
      }
      default:
        break
    }
  }
}

