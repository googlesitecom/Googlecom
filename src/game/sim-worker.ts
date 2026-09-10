// ============================================================
// FRONTERA CERO — Web Worker de simulación
// Ejecuta la simulación autoritativa fuera del hilo principal
// para evitar la limitación de temporizadores en pestañas
// ocultas o sin foco (los workers no se estrangulan).
// El MAPA se elige al iniciar: solo se construye el del modo
// jugado (PvP o historia).
// ============================================================
import { GameSim, initSimMap } from './sim'
import { setActiveMap } from './map-types'
import { buildPvpMap } from './map-pvp'
import { buildStoryMap } from './map-story'
import type { BotDifficulty, Team, WeaponId, GameMode } from './shared'

interface JoinCmd { id: string; name: string; team: Team; announce?: boolean }
interface InputCmd {
  id: string
  data: {
    pos: [number, number, number]; yaw: number; pitch: number
    crouch: boolean; speed: number; weapon: string
  }
}
interface HitsCmd {
  id: string
  data: { weapon: WeaponId; hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number }[] }
}
interface GrenadeCmd { id: string; data: { pos: [number, number, number]; vel: [number, number, number]; kind?: 'frag' | 'smoke' } }
interface PlayerShotCmd { id: string; data: { origin: [number, number, number]; hit: [number, number, number] } }
interface BarrelCmd { id: string; data: { pos: [number, number, number] } }
interface StoryHitCmd { id: string; data: { targetId: string; dmg: number } }

let sim: GameSim | null = null

const post = (e: string, d: unknown, to?: string): void => {
  ;(self as unknown as Worker).postMessage({ e, d, to })
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { e: string; d: unknown }
  if (!msg || typeof msg.e !== 'string') return
  const d = msg.d

  switch (msg.e) {
    case 'init': {
      const cfg = d as { difficulty: BotDifficulty; bots: number; mode?: GameMode }
      // MAPA SEGÚN EL MODO: la historia usa su propio mapa.
      // initSimMap puebla los datos perezosos del módulo de simulación
      // (NUNCA se leen en la carga del módulo, solo tras fijar el mapa)
      setActiveMap(cfg.mode === 'historia' ? buildStoryMap() : buildPvpMap())
      initSimMap()
      sim?.stop()
      sim = new GameSim(cfg.difficulty, cfg.mode ?? 'escaramuza')
      sim.onRoute((e, data, to) => post(e, data, to))
      if (cfg.bots > 0) sim.addBots(cfg.bots)
      sim.start()
      break
    }
    case 'join': {
      const j = d as JoinCmd
      if (!sim) return
      sim.join(j.id, j.name, j.team, j.announce ?? false)
      post('welcome', sim.getWelcomeData(j.id), j.id)
      break
    }
    case 'input': {
      const c = d as InputCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim) sim.handleInput(p, c.data)
      break
    }
    case 'hits': {
      const c = d as HitsCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim) sim.handleHits(p, c.data)
      break
    }
    case 'buy': {
      const c = d as { id: string; itemId?: string; data?: { itemId?: string } }
      const itemId = c.itemId ?? c.data?.itemId ?? ''
      const p = sim?.getPlayer(c.id)
      if (p && sim) sim.handleBuy(p, itemId)
      break
    }
    case 'grenadeThrow': {
      const c = d as GrenadeCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim) sim.handleGrenadeThrow(p, c.data.pos, c.data.vel, c.data.kind ?? 'frag')
      break
    }
    case 'playerShot': {
      const c = d as PlayerShotCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim && c.data) sim.handlePlayerShot(p, c.data.origin, c.data.hit)
      break
    }
    case 'barrelShot': {
      const c = d as BarrelCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim && c.data) sim.handleBarrelShot(p, c.data.pos)
      break
    }
    case 'storyHit': {
      const c = d as StoryHitCmd
      const p = sim?.getPlayer(c.id)
      if (p && sim && c.data) sim.handleStoryTargetHit(p, c.data.targetId, c.data.dmg)
      break
    }
    case 'leave': {
      const c = d as { id: string }
      sim?.leave(c.id)
      break
    }
    case 'snapshot': {
      sim?.emitSnapshotOnce()
      break
    }
    default:
      break
  }
}
