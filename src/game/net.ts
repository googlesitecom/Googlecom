// ============================================================
// FRONTERA CERO — Cliente de red
// La simulación local corre en un Web Worker (30 Hz). El
// multijugador P2P (PeerJS) se RETIRÓ porque no funcionaba en
// el despliegue estático de GitHub Pages y pedía lag extra.
// ============================================================
import type { Game } from './engine'
import { useGame } from './store'
import {
  GAME,
  type WeaponId, type NetSnapshot, type NetRoundState, type BotDifficulty, type GrenadeKind, type GameMode,
} from './shared'
import type { StoryState } from './story-director'

export type NetMode = 'solo'

export interface ConnectOpts {
  mode: NetMode
  difficulty?: BotDifficulty
  gameMode?: GameMode
}

interface InputMsg {
  pos: [number, number, number]; yaw: number; pitch: number
  crouch: boolean; speed: number; weapon: string
}

const HOST_ID = 'p1'

export class NetClient {
  id = HOST_ID
  game: Game
  mode: NetMode = 'solo'
  private worker: Worker | null = null
  private lastInput: InputMsg | null = null
  private disposed = false

  constructor(game: Game) {
    this.game = game
  }

  connect(name: string, opts: ConnectOpts): void {
    this.mode = 'solo'
    const s = useGame.getState()
    s.setPhase('connecting')
    s.setHud({ netStatus: 'connecting', netError: '', ping: 0 })
    // simulación local con bots (en worker, sin estrangular la pestaña)
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url))
    this.worker = worker
    worker.onmessage = (ev: MessageEvent) => {
      if (this.disposed) return
      const msg = ev.data as { e: string; d: unknown; to?: string }
      if (!msg || typeof msg.e !== 'string') return
      if (!msg.to || msg.to === HOST_ID) this.dispatchLocal(msg.e, msg.d)
    }
    // bots: el modo historia NO usa el reparto clásico de equipos
    // (sus enemigos los genera el director de fases)
    const gameMode = opts.gameMode ?? 'escaramuza'
    const bots = gameMode === 'historia' ? 0 : Math.floor(GAME.BOT_COUNT / 2)
    this.sendToSim({ e: 'init', d: { difficulty: opts.difficulty ?? 'normal', bots, mode: gameMode } })
    this.sendToSim({ e: 'join', d: { id: HOST_ID, name, team: 'A', announce: false } })
    useGame.getState().setHud({ netStatus: 'connected' })
  }

  private sendToSim(msg: unknown): void {
    this.worker?.postMessage(msg)
  }

  // ------------------------------------------------------------
  // Entradas hacia la simulación (worker local)
  // ------------------------------------------------------------
  sendInput(): void {
    this.lastInput = this.game.inputState()
    this.sendToSim({ e: 'input', d: { id: this.id, data: this.lastInput } })
  }

  sendHits(weapon: WeaponId, hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number }[]): void {
    const payload = {
      weapon,
      hits: hits.map(h => ({ target: h.target, part: h.part, dist: Math.round(h.dist) })),
    }
    this.sendToSim({ e: 'hits', d: { id: this.id, data: payload } })
  }

  buy(itemId: string): void {
    this.sendToSim({ e: 'buy', d: { id: this.id, itemId } })
  }

  throwGrenade(pos: [number, number, number], vel: [number, number, number], kind: GrenadeKind = 'frag'): void {
    this.sendToSim({ e: 'grenadeThrow', d: { id: this.id, data: { pos, vel, kind } } })
  }

  /** Disparo del jugador local (para que los demás vean traza + animación de disparo) */
  sendShot(origin: [number, number, number], hit: [number, number, number]): void {
    this.sendToSim({ e: 'playerShot', d: { id: this.id, data: { origin, hit } } })
  }

  /** El jugador local ha reventado un barril explosivo (daño de área autoritativo) */
  sendBarrel(pos: [number, number, number]): void {
    this.sendToSim({ e: 'barrelShot', d: { id: this.id, data: { pos } } })
  }

  /** Daño del jugador local a un objetivo de la historia (generador) */
  sendStoryHit(targetId: string, dmg: number): void {
    this.sendToSim({ e: 'storyHit', d: { id: this.id, data: { targetId, dmg } } })
  }

  disconnect(): void {
    this.disposed = true
    if (this.worker) { this.worker.terminate(); this.worker = null }
  }

  // ------------------------------------------------------------
  // Distribución local de eventos de la simulación
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
      case 'storyEvent': {
        const d = data as StoryState
        game.onStoryEvent(d)
        break
      }
      case 'storyTargetDestroyed': {
        const d = data as { id: string; pos: [number, number, number] }
        game.onStoryTargetDestroyed(d.id, d.pos)
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
