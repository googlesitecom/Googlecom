// ============================================================
// EMERGENCY STRIKE — Cliente de red
// - solo:  simulación local con bots (sin servidor)
// - host:  simulación local + sala P2P por PeerJS
//          · 1v1: un invitado, entra directo a la partida
//          · 2v2/3v3/4v4/5v5 (v9): lobby + inicio del anfitrión,
//            huecos rellenables con bots (opcional)
//          · coop (v9): campaña cooperativa hasta 5 jugadores,
//            SIN bots de relleno bajo ninguna circunstancia
// - guest: se conecta a la sala del anfitrión por PeerJS
// ============================================================
import { Peer, type DataConnection } from 'peerjs'
import type { Game } from './engine'
import { useGame } from './store'
import { liveTally, recordMatch } from './auth'
import {
  GAME, generateRoomCode, peerIdForRoom,
  type WeaponId, type NetSnapshot, type NetRoundState, type BotDifficulty, type GrenadeKind, type GameMode, type MapId, type Team,
} from './shared'

export type NetMode = 'solo' | 'host' | 'guest'
/** v9: formato de la sala online (1v1 clásico o equipos NxN + coop) */
export type RoomKind = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | 'coop'

/** v9: huecos de invitado por formato — el anfitrión ya ocupa A.
 *  Intercalado A,B,A,B… con los B extra al final (2v2 = A,B,B como v6.2) */
export function teamSlotsFor(kind: RoomKind): { id: string; team: Team }[] {
  if (kind === 'coop') {
    // campaña cooperativa: hasta 5 operadores, TODOS en el equipo ÁMBAR
    return ['p2', 'p3', 'p4', 'p5'].map(id => ({ id, team: 'A' as Team }))
  }
  const n = Math.max(1, Number(kind[0]) || 1)
  const needA = n - 1, needB = n
  const slots: { id: string; team: Team }[] = []
  let a = 0, b = 0, i = 2
  while (a < needA || b < needB) {
    if (a < needA && (b >= needB || a <= b)) { slots.push({ id: `p${i++}`, team: 'A' }); a++ }
    else { slots.push({ id: `p${i++}`, team: 'B' }); b++ }
  }
  return slots
}

/** v9: capacidad humana total de la sala (incluye al anfitrión) */
export function roomCapacity(kind: RoomKind): number {
  if (kind === 'coop') return 5
  return Math.max(1, Number(kind[0]) || 1) * 2
}

export interface ConnectOpts {
  mode: NetMode
  roomCode?: string
  fillBots?: number
  difficulty?: BotDifficulty
  gameMode?: GameMode
  /** v6.2 */
  roomKind?: RoomKind
  fillEmpty?: boolean
}

/** hueco de invitado en la sala 2v2 (identidad + canal + cola de salida) */
interface GuestSlot {
  id: string              // 'p2' | 'p3' | 'p4'
  team: Team              // p2→A (aliado del anfitrión), p3/p4→B
  conn: DataConnection | null
  name: string
  joined: boolean         // recibió el 'join'
  outbox: PeerMsg[]
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
    this.roomKind = opts.roomKind ?? '1v1'
    this.fillEmpty = opts.fillEmpty ?? true
    this.duoDifficulty = opts.difficulty ?? 'normal'
    this.duoGameMode = opts.gameMode ?? 'escaramuza'
    const s = useGame.getState()
    s.setPhase('connecting')
    s.setHud({ netStatus: 'connecting', netError: '', ping: 0 })
    const gameMode = opts.gameMode ?? 'escaramuza'
    // el mapa depende del modo: la misión se juega en la instalación
    this.mapId = gameMode === 'historia' ? 'instalacion' : 'ciudad'
    if (opts.mode === 'solo') {
      this.connectSolo(name, opts.difficulty ?? 'normal', gameMode)
    } else if (opts.mode === 'host') {
      this.connectHost(name, opts.roomCode || generateRoomCode(), opts.fillBots ?? 0, opts.difficulty ?? 'normal', 0, gameMode, opts.roomKind ?? '1v1', opts.fillEmpty ?? true)
    } else {
      this.connectGuest(name, opts.roomCode ?? '')
    }
  }

  private mapId: MapId = 'ciudad'

  // v9: registro de fin de partida (solo una vez por sesión)
  private matchRecorded = false
  private matchReturnTimer: ReturnType<typeof setTimeout> | null = null

  // ------------------------------------------------------------
  // SIMULACIÓN EN WEB WORKER (solo / anfitrión)
  // ------------------------------------------------------------
  private startSimWorker(difficulty: BotDifficulty, bots: number, gameMode: GameMode, botsA?: number, botsB?: number): void {
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url))
    this.worker = worker
    worker.onmessage = (ev: MessageEvent) => {
      if (this.disposed) return
      const msg = ev.data as { e: string; d: unknown; to?: string }
      if (!msg || typeof msg.e !== 'string') return
      // entregar localmente (broadcast o dirigido al anfitrión)
      if (!msg.to || msg.to === HOST_ID) this.dispatchLocal(msg.e, msg.d)
      // reenviar a los invitados P2P:
      // 1v1 → un solo canal; 2v2 → broadcast o dirigido por id de jugador
      if (this.roomKind === '2v2') {
        if (!msg.to) {
          for (const g of this.duoSlots) this.sendToSlot(g, { e: msg.e, d: msg.d })
        } else if (msg.to !== HOST_ID) {
          const g = this.duoSlots.find(s => s.id === msg.to)
          if (g) this.sendToSlot(g, { e: msg.e, d: msg.d })
        }
      } else {
        if (!msg.to || msg.to === GUEST_ID) this.forwardToGuest({ e: msg.e, d: msg.d })
      }
    }
    this.sendToSim({
      e: 'init',
      d: botsA !== undefined || botsB !== undefined
        ? { difficulty, bots, mode: gameMode, mapId: this.mapId, botsA, botsB }
        : { difficulty, bots, mode: gameMode, mapId: this.mapId },
    })
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
    const bots = gameMode === 'historia' ? 5 : Math.floor(GAME.BOT_COUNT / 2)
    this.startSimWorker(difficulty, bots, gameMode)
    this.sendToSim({ e: 'join', d: { id: HOST_ID, name, team: 'A', announce: false } })
    useGame.getState().setHud({ netStatus: 'connected' })
  }

  // ------------------------------------------------------------
  // MODO ANFITRIÓN — sala P2P por PeerJS + worker
  // · 1v1: un solo invitado, entra directo (comportamiento clásico)
  // · 2v2: hasta 3 invitados con LOBBY; el anfitrión inicia la partida
  //   (los huecos vacíos se rellenan con bots si así se configura)
  // ------------------------------------------------------------
  private connectHost(name: string, code: string, fill: number, difficulty: BotDifficulty, attempt: number, gameMode: GameMode, kind: RoomKind, fillEmpty: boolean): void {
    this.id = HOST_ID
    this.roomKind = kind
    this.fillEmpty = fillEmpty
    this.duoDifficulty = difficulty
    this.duoGameMode = gameMode
    this.hostName = name
    // sincronizar el código de sala con el store (puede haberse regenerado)
    if (useGame.getState().roomCode !== code) useGame.getState().setHud({ roomCode: code })

    if (kind !== '1v1') {
      // ---- NvN / COOP: NO arrancar la simulación todavía — primero el lobby ----
      this.duoSlots = teamSlotsFor(kind).map(s => ({ ...s, conn: null, name: '', joined: false, outbox: [] as PeerMsg[] }))
      this.pushLobby() // lobby con solo el anfitrión
      // v9: la campaña cooperativa NO rellena huecos con bots NUNCA
      if (kind === 'coop') this.fillEmpty = false
      useGame.getState().setHud({ netStatus: 'waiting' })
    } else {
      this.startSimWorker(difficulty, fill, gameMode)
      this.sendToSim({ e: 'join', d: { id: HOST_ID, name, team: 'A', announce: false } })
      useGame.getState().setHud({ netStatus: 'waiting' })
    }

    const peer = new Peer(peerIdForRoom(code), PEER_OPTS)
    this.peer = peer

    peer.on('open', () => {
      if (this.disposed) return
      useGame.getState().addAnnouncement(
        kind === 'coop'
          ? `CO-OP SQUAD ${code} CREATED — share the code (up to 4 more operators, NO bots)`
          : kind !== '1v1'
            ? `${kind.toUpperCase()} ROOM ${code} CREATED — share the code (up to ${roomCapacity(kind) - 1} more operators)`
            : `ROOM ${code} CREATED — share the code`,
        'info',
      )
    })

    // si el servidor de señalización se cae, reconectar para que la sala
    // siga admitiendo invitados (v5: fiabilidad del multijugador)
    peer.on('disconnected', () => {
      if (this.disposed || !this.peer) return
      useGame.getState().addAnnouncement('Reconnecting room to signaling server…', 'info')
      try { this.peer.reconnect() } catch { /* el peer se recrea abajo si falla */ }
    })

    peer.on('connection', (conn: DataConnection) => {
      if (this.disposed) { conn.close(); return }
      if (this.roomKind !== '1v1') {
        this.acceptDuoGuest(conn, name, code, fill, difficulty, attempt, gameMode, fillEmpty)
        return
      }
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
          useGame.getState().addAnnouncement('The rival left the room', 'info')
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
        this.connectHost(name, newCode, fill, difficulty, attempt + 1, gameMode, kind, fillEmpty)
      } else if (type === 'unavailable-id') {
        useGame.getState().addAnnouncement('Could not create the room, try again', 'info')
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        // v5: el servidor de salas falló → reintentar hasta 3 veces antes
        // de rendirse (el juego local con bots sigue funcionando)
        if (attempt < 3) {
          useGame.getState().addAnnouncement(`Room server busy, retrying (${attempt + 1}/3)…`, 'info')
          peer.destroy()
          this.peer = null
          setTimeout(() => {
            if (this.disposed) return
            this.connectHost(name, code, fill, difficulty, attempt + 1, gameMode, kind, fillEmpty)
          }, 2500)
        } else {
          useGame.getState().addAnnouncement('Room server unavailable (PeerJS) — playing against bots', 'info')
          useGame.getState().setHud({ netStatus: 'connected' })
        }
      } else {
        useGame.getState().addAnnouncement('Room server unavailable (PeerJS)', 'info')
        useGame.getState().setHud({ netStatus: 'connected' }) // el juego local sigue funcionando
      }
    })
  }

  // ------------------------------------------------------------
  // NvN / COOP — aceptar invitados, lobby e inicio de la partida
  // ------------------------------------------------------------
  /** v9: invitado conectado a sala NvN/coop: asignar hueco libre y gestionar su ciclo */
  private acceptDuoGuest(conn: DataConnection, hostName: string, code: string, fill: number, difficulty: BotDifficulty, attempt: number, gameMode: GameMode, fillEmpty: boolean): void {
    const slot = this.duoSlots.find(s => s.conn === null)
    if (!slot) {
      // sala completa (4/4): rechazar con aviso
      try { conn.send({ e: 'roomFull', d: { code } }) } catch { /* canal cerrado */ }
      setTimeout(() => { try { conn.close() } catch { /* ok */ } }, 400)
      return
    }
    slot.conn = conn
    slot.joined = false
    slot.name = ''
    slot.outbox = []

    conn.on('open', () => {
      // vaciar cola encolada mientras se abría el canal
      for (const m of slot.outbox) this.sendToPeer(conn, m)
      slot.outbox.length = 0
    })

    conn.on('data', (raw: unknown) => {
      if (this.disposed) return
      if (slot.conn !== conn) return // hueco reasignado
      const msg = raw as PeerMsg
      if (!msg || typeof msg.e !== 'string') return

      if (msg.e === 'join') {
        if (slot.joined) return
        slot.joined = true
        slot.name = String((msg.d as { name?: string })?.name ?? 'Operador').slice(0, 16).trim() || 'Operador'
        // confirmación inmediata al invitado (cancela su tiempo de espera)
        this.sendToPeer(conn, { e: 'lobbyAck', d: { id: slot.id, kind: this.roomKind, players: this.lobbyPlayers() } })
        this.pushLobby()
        useGame.getState().addAnnouncement(`${slot.name} joined the ${this.roomKind === 'coop' ? 'squad' : `room (team ${slot.team === 'A' ? 'AMBER' : 'GREEN'})`}`, 'info')
        // sala llena → inicio automático con cuenta atrás breve
        // (coop también arranca sola al llegar 5/5 operadores)
        if (this.duoSlots.every(s => s.conn && s.joined) && !this.worker) {
          useGame.getState().addAnnouncement('ROOM FULL — the match starts…', 'info')
          setTimeout(() => {
            if (this.disposed || this.worker) return
            if (!this.duoSlots.every(s => s.conn && s.joined)) return // alguien salió
            this.startTeamMatch()
          }, 2600)
        }
        return
      }
      if (msg.e === 'storyRemote') {
        // v9: interacción de campaña de un invitado → el anfitrión la resuelve
        this.game.storyRemoteComplete(msg.d as { chapter: number; label: string; kind: 'intel' | 'plant' | 'rescue' | 'extraction' })
        return
      }
      if (msg.e === 'ping') {
        this.sendToPeer(conn, { e: 'pong', d: msg.d })
        return
      }
      // entrada de juego → worker (solo si la partida ya empezó)
      if (!this.worker) return
      this.sendToSim({ e: msg.e, d: { id: slot.id, data: msg.d } })
    })

    conn.on('close', () => {
      if (slot.conn !== conn) return
      const wasJoined = slot.joined
      slot.conn = null
      slot.joined = false
      slot.name = ''
      slot.outbox = []
      if (!this.worker) {
        // antes de iniciar: simplemente sale del lobby
        this.pushLobby()
        return
      }
      if (wasJoined) {
        // durante la partida: baja…
        this.sendToSim({ e: 'leave', d: { id: slot.id } })
        // v9: …bot de reemplazo SOLO en salas PvP con relleno activado.
        // En la campaña cooperativa los huecos quedan VACÍOS (sin bots)
        if (this.fillEmpty && this.roomKind !== 'coop' && this.roomKind !== '1v1') {
          this.sendToSim({ e: 'fillBot', d: { team: slot.team } })
          useGame.getState().addAnnouncement('An operator left — a bot fills their slot', 'info')
        } else {
          useGame.getState().addAnnouncement('An operator left the squad', 'info')
        }
      }
    })
    conn.on('error', () => { /* silencioso: close() lo gestiona */ })
    void hostName; void fill; void difficulty; void attempt; void gameMode; void fillEmpty; void code
  }

  /** lista del lobby: anfitrión + invitados con hueco ocupado */
  private lobbyPlayers(): { id: string; name: string; team: Team }[] {
    const list: { id: string; name: string; team: Team }[] = [{ id: HOST_ID, name: this.hostName, team: 'A' }]
    for (const s of this.duoSlots) {
      if (s.conn && s.joined) list.push({ id: s.id, name: s.name, team: s.team })
    }
    return list
  }

  /** refleja el lobby en el store local y lo difunde a todos los invitados */
  private pushLobby(): void {
    const players = this.lobbyPlayers()
    useGame.getState().setHud({ lobby: { kind: this.roomKind, players } })
    for (const s of this.duoSlots) {
      if (s.conn) this.sendToSlot(s, { e: 'lobby', d: { kind: this.roomKind, players } })
    }
  }

  /** enviar a un hueco (encolando si el canal aún no abre) */
  private sendToSlot(slot: GuestSlot, msg: PeerMsg): void {
    const c = slot.conn
    if (!c) return
    if (c.open) {
      this.sendToPeer(c, msg)
    } else {
      slot.outbox.push(msg)
      if (slot.outbox.length > 200) slot.outbox.splice(0, 100)
    }
  }

  /** v6.2 → v9: el anfitrión inicia la partida NvN / coop (botón o sala llena).
   *  Los huecos vacíos se rellenan con bots SOLO en salas PvP con relleno
   *  activado — la campaña cooperativa queda estrictamente sin bots. */
  startDuoMatch(): void { this.startTeamMatch() }
  startTeamMatch(): void {
    if (this.disposed) return
    if (this.roomKind === '1v1' || this.worker) return // ya iniciada / no es sala con lobby
    const kind = this.roomKind
    const players = this.lobbyPlayers()
    const humansA = players.filter(p => p.team === 'A').length
    const humansB = players.filter(p => p.team === 'B').length
    if (kind === 'coop') {
      // campaña cooperativa: misión en el mapa instalación con sus
      // enemigos (equipo B) — las plazas humanas vacías QUEDAN VACÍAS
      this.mapId = 'instalacion'
      this.startSimWorker(this.duoDifficulty, 5, 'historia')
    } else {
      const n = Math.max(1, Number(kind[0]) || 1)
      const botsA = this.fillEmpty ? Math.max(0, n - humansA) : 0
      const botsB = this.fillEmpty ? Math.max(0, n - humansB) : 0
      this.startSimWorker(this.duoDifficulty, 0, this.duoGameMode, botsA, botsB)
    }
    // unir a la simulación al anfitrión y a cada invitado presente
    this.sendToSim({ e: 'join', d: { id: HOST_ID, name: this.hostName, team: 'A', announce: false } })
    for (const s of this.duoSlots) {
      if (s.conn && s.joined) {
        this.sendToSim({ e: 'join', d: { id: s.id, name: s.name, team: s.team, announce: true } })
      }
    }
    useGame.getState().setHud({ netStatus: 'connected' })
    this.matchRecorded = false
    // aviso a los invitados: la partida arranca (el welcome llega por el worker)
    for (const s of this.duoSlots) {
      if (s.conn) this.sendToSlot(s, { e: 'lobbyStart', d: { players } })
    }
    if (kind === 'coop') {
      // v9: el director de campaña del ANFITRIÓN manda — sincroniza el
      // estado de la misión con los invitados cada 400 ms
      this.startStorySync()
      useGame.getState().addAnnouncement(`CO-OP OPERATION STARTED — ${players.length} operator${players.length > 1 ? 's' : ''} (empty slots stay EMPTY)`, 'info')
    } else {
      const n = Math.max(1, Number(kind[0]) || 1)
      useGame.getState().addAnnouncement(`${kind.toUpperCase()} MATCH STARTED — AMBER ${humansA + (this.fillEmpty ? Math.max(0, n - humansA) : 0)} · GREEN ${humansB + (this.fillEmpty ? Math.max(0, n - humansB) : 0)}`, 'info')
    }
  }

  /** v9 COOP: difunde el estado del director de historia del anfitrión */
  private storySyncTimer: ReturnType<typeof setInterval> | null = null
  private startStorySync(): void {
    this.stopStorySync()
    this.storySyncTimer = setInterval(() => {
      if (this.disposed || !this.worker) { this.stopStorySync(); return }
      const payload = this.game.storySyncPayload()
      if (!payload) return
      for (const s of this.duoSlots) {
        if (s.conn) this.sendToSlot(s, { e: 'storySync', d: payload })
      }
    }, 400)
  }
  private stopStorySync(): void {
    if (this.storySyncTimer) { clearInterval(this.storySyncTimer); this.storySyncTimer = null }
  }

  /** v9 COOP: interacción de un invitado reenviada al anfitrión (guest side) */
  sendStoryRemote(d: { chapter: number; label: string; kind: string }): void {
    if (this.mode !== 'guest') return
    if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'storyRemote', d })
  }

  private guestJoined = false
  private guestOutbox: PeerMsg[] = []
  // v6.2: estado de la sala 2v2
  private roomKind: RoomKind = '1v1'
  private fillEmpty = true
  private duoSlots: GuestSlot[] = []
  private hostName = ''
  private duoDifficulty: BotDifficulty = 'normal'
  private duoGameMode: GameMode = 'escaramuza'

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
      this.fail('Invalid room code')
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
      this.retryGuest(name, clean, 'The link failed to open')
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
        if (msg.e === 'lobbyAck' || msg.e === 'lobby') {
          // v6.2 → v9: sala con lobby — el anfitrión confirmó la entrada /
          // actualiza la lista. Cancela el tiempo de espera del enlace
          if (this.welcomeTimeout) { clearTimeout(this.welcomeTimeout); this.welcomeTimeout = null }
          const d = msg.d as { id?: string; kind?: RoomKind; players?: { id: string; name: string; team: Team }[] }
          if (d.id) this.id = d.id
          useGame.getState().setHud({
            netStatus: 'waiting',
            lobby: { kind: d.kind ?? '2v2', players: d.players ?? [] },
          })
          return
        }
        if (msg.e === 'storySync') {
          // v9 COOP: estado de la misión desde el anfitrión
          this.dispatchLocal('storySync', msg.d)
          return
        }
        if (msg.e === 'lobbyStart') {
          // v6.2: el anfitrión arrancó la partida — el welcome/snapshot
          // llegan enseguida por el worker
          useGame.getState().setHud({ netStatus: 'connecting', netError: '' })
          return
        }
        if (msg.e === 'roomFull') {
          this.fail('The room is full. Ask for a new code.')
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
        useGame.getState().setHud({ netStatus: 'error', netError: 'Lost connection to the host' })
      })
      conn.on('error', () => retryOnce('Fallo del canal de datos'))
    })

    peer.on('error', (err: unknown) => {
      if (this.disposed) return
      const type = (err as { type?: string })?.type
      if (type === 'peer-unavailable') this.fail('Room not found. Check the code.')
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        retryOnce('No se puede alcanzar el servidor de salas (PeerJS)')
      } else if (type === 'unavailable-id') {
        retryOnce('Id de sala ocupada, reintentando')
      } else {
        retryOnce(`Connection error (${type ?? 'unknown'})`)
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
      this.fail(`${motivo}. Check the code or your connection.`)
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

  /** v6.4: pausa real de la simulación en partidas OFFLINE (solo) —
   *  en online el mundo sigue para los demás jugadores */
  setPaused(paused: boolean): void {
    if (this.disposed || this.mode !== 'solo') return
    if (paused === this.simPaused) return
    this.simPaused = paused
    this.sendToSim({ e: paused ? 'pause' : 'resume' })
  }

  private simPaused = false

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

  /** v6.1: equipar un arma del arsenal en el hueco 1 o 2 */
  equip(weapon: WeaponId, slot: 0 | 1): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'equip', d: { weapon, slot } })
      return
    }
    this.sendToSim({ e: 'equip', d: { id: this.id, weapon, slot } })
  }

  throwGrenade(pos: [number, number, number], vel: [number, number, number], kind: GrenadeKind = 'frag'): void {
    if (this.mode === 'guest') {
      if (this.hostConn?.open) this.sendToPeer(this.hostConn, { e: 'grenadeThrow', d: { pos, vel, kind } })
      return
    }
    this.sendToSim({ e: 'grenadeThrow', d: { id: this.id, data: { pos, vel, kind } } })
  }

  /** v8: disparar una bengala localizadora */
  useFlare(): void {
    this.sendToSim({ e: 'flareUse', d: { id: this.id } })
  }

  /** v8: inyectarse un estímulo de adrenalina */
  useStim(): void {
    this.sendToSim({ e: 'stimUse', d: { id: this.id } })
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
    if (this.matchReturnTimer) { clearTimeout(this.matchReturnTimer); this.matchReturnTimer = null }
    this.stopStorySync()
    this.stopPing()
    if (this.worker) { this.worker.terminate(); this.worker = null }
    try { this.guestConn?.close() } catch { /* ok */ }
    try { this.hostConn?.close() } catch { /* ok */ }
    for (const s of this.duoSlots) {
      try { s.conn?.close() } catch { /* ok */ }
      s.conn = null
      s.outbox.length = 0
    }
    this.guestConn = null
    this.hostConn = null
    this.duoSlots = []
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
        // v9: nueva sesión de partida → contadores de carrera a cero
        liveTally.reset()
        this.matchRecorded = false
        // v9: el invitado adopta el modo del anfitrión (objetivos CTF/DOM
        // visibles aunque el invitado entró con otro modo por defecto)
        if (this.mode === 'guest' && d.round?.mode && d.round.mode !== useGame.getState().gameMode) {
          game.applyServerMode(d.round.mode)
        }
        break
      }
      case 'spawnEvent': {
        const d = data as {
          pos: [number, number, number]; yaw: number; hp: number; armor: number
          weapons: WeaponId[]; weapon: WeaponId; frags: number; money: number; protect: number
          flares?: number; stims?: number; vest?: number; helmet?: number
        }
        game.onSpawn(d.pos, d.yaw, d.weapons, d.weapon, d.hp, d.armor, d.frags, d.money)
        // v8: equipo táctico conservado al reaparecer
        if (d.flares !== undefined || d.stims !== undefined || d.vest !== undefined || d.helmet !== undefined) {
          useGame.getState().setHud({
            flares: d.flares ?? 0,
            stims: d.stims ?? 0,
            vest: !!d.vest,
            helmet: !!d.helmet,
          })
        }
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
        liveTally.addDeath()
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
        if (d.killer === this.id) {
          game.audio.killConfirm()
          liveTally.addKill(d.headshot)
        }
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
        store.addAnnouncement(d.text, d.kind as 'kill' | 'round' | 'info' | 'multi')
        if (d.kind === 'multi') game.audio.killConfirm()
        else if (d.kind === 'round') game.audio.announceDing()
        if (d.kind === 'round') {
          if (d.text.includes('ROUND') && d.text.includes('FIGHT')) game.audio.roundStart()
          else game.audio.roundEnd()
        }
        break
      }
      case 'roundEnd': {
        const d = data as { winner: 'A' | 'B'; scoresA: number; scoresB: number }
        store.addAnnouncement(
          `ROUND WON BY ${d.winner === 'A' ? 'AMBER' : 'GREEN'} (${d.scoresA}–${d.scoresB})`,
          'round', d.winner,
        )
        break
      }
      case 'matchEnd': {
        const d = data as { winner: 'A' | 'B'; roundWinsA: number; roundWinsB: number }
        store.addAnnouncement(
          `FINAL VICTORY: ${d.winner === 'A' ? 'AMBER' : 'GREEN'} ${d.roundWinsA}–${d.roundWinsB}`,
          'round', d.winner,
        )
        // v9: estadísticas de carrera + regreso al MENÚ tras la victoria
        // definitiva (TDM/CTF/DOM/FFA) — no se repite partida automáticamente
        if (!this.matchRecorded) {
          this.matchRecorded = true
          const t = liveTally.snapshot()
          recordMatch({
            mode: useGame.getState().gameMode,
            kills: t.kills,
            deaths: t.deaths,
            headshots: t.headshots,
            win: d.winner === useGame.getState().team,
            duration: Math.max(0, (Date.now() - t.startedAt) / 1000),
          })
          store.addAnnouncement('MATCH OVER — returning to main menu…', 'round', d.winner)
          if (this.matchReturnTimer) clearTimeout(this.matchReturnTimer)
          this.matchReturnTimer = setTimeout(() => {
            if (this.disposed) return
            try { game.dispose() } catch { /* ya desechado */ }
            useGame.getState().setPhase('menu')
          }, 6500)
        }
        break
      }
      case 'econ': {
        const d = data as { money: number; frags?: number; smokes?: number; vest?: number; helmet?: number; flares?: number; stims?: number; stimUntil?: number }
        game.setMoney(d.money, d.frags, d.smokes, d)
        break
      }
      case 'healed': {
        // v8: botiquín comprado en la tienda → vida al 100 %
        const d = data as { hp: number }
        game.setHealth(d.hp, useGame.getState().armor)
        game.audio.pickup(false)
        break
      }
      case 'flareUsed': {
        // v8: revelación de enemigos para ESTE cliente
        const d = data as { until: number; flares: number }
        game.onFlareUsed(d.until)
        useGame.getState().setHud({ flares: d.flares })
        break
      }
      case 'flareFx': {
        // v8: la bengala sube al cielo (la ve todo el mundo)
        const d = data as { x: number; y: number; z: number }
        game.onFlareFx(d.x, d.y, d.z)
        break
      }
      case 'stimUsed': {
        // v8: adrenalina activa
        const d = data as { until: number; stims: number }
        game.onStimUsed(d.until)
        useGame.getState().setHud({ stims: d.stims })
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
      case 'loadout': {
        // v6.1: arsenal + huecos + arma en mano (compra / equipar / entrega)
        const d = data as { owned: WeaponId[]; armory: WeaponId[]; slots: [WeaponId | null, WeaponId | null]; weapon: WeaponId }
        game.onLoadout(d.owned, d.armory, d.slots, d.weapon)
        break
      }
      case 'refillAmmo': {
        const d = data as { weapon: WeaponId }
        game.refillAmmo(d.weapon)
        break
      }
      case 'playerJoined': {
        const d = data as { name: string; team: 'A' | 'B' }
        store.addAnnouncement(`${d.name} joined ${d.team === 'A' ? 'AMBER' : 'GREEN'}`, 'info')
        break
      }
      case 'playerLeft': {
        const d = data as { name: string }
        store.addAnnouncement(`${d.name} left the match`, 'info')
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
      case 'storySync': {
        // v9 COOP: el anfitrión difunde el estado del director de misión
        const d = data as {
          chapter: number; chapterLive: boolean; cine: boolean
          objective: string; progress: string; timer: number; hint: string
          dialogue: { who: string; text: string } | null
          status: 'playing' | 'victory'
          doneLabels: string[]
        }
        game.onStorySync(d)
        break
      }
      default:
        break
    }
  }
}

