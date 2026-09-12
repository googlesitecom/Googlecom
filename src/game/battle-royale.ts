// ============================================================
// EMERGENCY STRIKE — BATTLE ROYALE (v10)
// Standalone 20-operator battle royale module.
//
// ISOLATION BY DESIGN (per requirement): this module is only
// fetched + evaluated when the player enters BR (dynamic import
// from components/game/br-mount.tsx → separate webpack chunk),
// and everything it allocates (renderer, scenes, geometries,
// listeners) is disposed on exit, so it never affects the rest
// of the game. The main engine chunks are NOT loaded while BR
// runs and vice versa.
//
// v9.1: BR runs on the SAME real assets as the rest of the game
// (user request) — soldier1.glb for every operator, GLB weapons
// in hands + viewmodel, Pared/Piso.jpg on buildings and Arbol.glb
// forests — with per-instance loading so nothing leaks on exit.
//
// v10: — SAME ARSENAL as the normal modes (shared WEAPONS) with
// FORTNITE-STYLE RARITIES: every looted weapon rolls a tier
// (common → legendary) that colors its beam and boosts damage.
// — FULL graphics profiles: LOW / MEDIUM / HIGH / ULTRA (no more
// cap): per-tier pixel ratio, AA, shadow map size, fog distance,
// sun disc + drifting clouds on HIGH/ULTRA.
// — REBUILT visuals: detailed multi-floor buildings with framed
// windows, balconies, awnings, rooftop props, textured roads
// with lane markings + sidewalks, terrain micro-detail texture,
// richer dusk sky.
// — MATCH CHAT ([T]) with operator chatter.
//
// Map: 280×280 (twice the 140×140 Team Deathmatch city) with
// 2 cities, mountains, 2 lakes, forests, drivable vehicles,
// weapon loot, supply crates and a progressive storm.
// Flow: lobby island (matchmaking) → plane drop → glider →
// live → last operator standing.
// ============================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GAME, WEAPONS, ASSET_BASE, type WeaponId } from './shared'
import { useBr, BR_RARITIES, rollBrRarity, type BrQueuePlayer } from './br-store'
import { useGame } from './store'
import { useAuth, recordBr, myOid } from './auth'
import { useChat, startAmbientChat, pushNetChatLine } from './chat'
import { esNet, useBrNet, type BrQueueOp } from './esnet'
import { getAudio } from './audio'
import {
  getRepoTextures, getTreeTemplate, preloadAssets,
  buildGLBWeapon, ensureWeaponGLB, onWeaponGLBsReady,
  type TreeTemplate,
} from './assets'
import { buildWeaponModel, weaponPose } from './viewmodel'

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const MAP = GAME.BR_MAP_HALF            // 140 → 280×280 island
const TOTAL = GAME.BR_PLAYERS           // 20 operators
const REAL_TARGET = GAME.BR_REAL_FOR_COUNTDOWN   // 4 → countdown starts
const COUNTDOWN_S = GAME.BR_COUNTDOWN   // 60 s
const EYE = 1.62

const WEAPON_POOL: WeaponId[] = ['p9', 'mp9', 'breacher', 'ar47', 'cr4', 'aguila', 'awp338']

const PEAKS = [
  { x: -95, z: -100, r: 46, h: 44 },   // NW ridge — THE RIDGE
  { x: 5, z: -112, r: 50, h: 50 },     // N wall
  { x: 92, z: -98, r: 44, h: 40 },     // NE massif
  { x: -108, z: 40, r: 42, h: 26 },    // W hill
  { x: 102, z: 88, r: 40, h: 28 },     // E hill
]
const CITIES = [
  { x: -58, z: 42, r: 36, name: 'RIVERSIDE' },
  { x: 60, z: -56, r: 36, name: 'NORTHGATE' },
]
const LAKES = [
  { x: 34, z: 40, r: 17, depth: -3.0 },
  { x: -70, z: -18, r: 11, depth: -2.4 },
]
const POIS = [
  { x: 34, z: 40, r: 22, name: 'SERENE LAKE' },       // lakeside cabins
  { x: -20, z: -20, r: 16, name: 'MILL FARM' },       // central farm
  { x: 80, z: 60, r: 16, name: 'PUMP STATION' },
  { x: -100, z: -70, r: 18, name: 'RIDGE COMPOUND' },
  { x: 0, z: 95, r: 16, name: 'SOUTH DOCKS' },
]

const STORM_PHASES = [
  { wait: 32, shrink: 26, r: 96, dps: 1 },
  { wait: 28, shrink: 22, r: 68, dps: 2 },
  { wait: 24, shrink: 20, r: 46, dps: 3 },
  { wait: 20, shrink: 18, r: 30, dps: 5 },
  { wait: 16, shrink: 15, r: 17, dps: 7 },
  { wait: 14, shrink: 13, r: 9, dps: 10 },
  { wait: 12, shrink: 18, r: 4, dps: 14 },
]

const SIM_NAMES = [
  'Kero', 'Kilo', 'Delta', 'Hex', 'Nova', 'Sixto', 'Vante', 'Rojo', 'Zumo',
  'Mora', 'Iris', 'Tadeo', 'Vera', 'Rayo', 'Nico', 'Danna', 'Enzo', 'Pablo',
  'Milo', 'Ares', 'Rune', 'Ciro', 'Otto', 'Nyx',
]

// ------------------------------------------------------------
// v9.1 — Real soldier rig (soldier1.glb, same as the main game)
// ------------------------------------------------------------
const SOLDIER_HEIGHT = 1.84
// pose de reposo (bajar brazos de la T-pose) — ejes verificados en el rig mixamo
const ARM_REST_X = 1.28
const FORE_BEND_X = -0.45
// pose de APUNTADO a dos manos (calibrada visualmente contra el rig):
// trigger = brazo derecho (−X) · apoyo = brazo izquierdo (+X)
const SOLDIER_AIM = {
  tArm: { x: 1.45, y: -0.59, z: -1.17 },
  tFore: { x: -0.34, z: -0.24 },
  sArm: { x: 1.5, y: 0.43, z: 1.5 },
  sFore: { x: -0.01, z: 0.05 },
}
// el soldado empaqueta la ropa en estos materiales → teñibles por operador
const TINTABLE_MATS = new Set([
  'Topmat', 'Hatmat', 'Bottommat',
  'PackedMaterial1mat', 'PackedMaterial2mat',
])
/** FFA: cada operador lleva un uniforme militar distinto */
const BR_TINTS = [
  0xc79a4a, // tan
  0x5a9a6a, // verde
  0x4a6a7a, // azul grisáceo
  0x8a6a4a, // marrón
  0x6a7a5a, // oliva
  0x7a5a4a, // tierra rojiza
  0x5a5a6a, // gris
]

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const UP_AXIS = new THREE.Vector3(0, 1, 0)

/** busca un hueso por nombre dentro del rig (prefijo mixamorig…) */
function findBone(root: THREE.Object3D, pattern: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse(o => {
    if (!found && pattern.test(o.name)) found = o
  })
  return found
}

/** libera un subtree respetando los recursos COMPARTIDOS con la caché
 *  global (armas GLB, plantilla de árboles) y las texturas Pared/Piso */
function disposeTree(root: THREE.Object3D): void {
  root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry && !mesh.userData.sharedGeo) mesh.geometry.dispose()
    if (mesh.material && !mesh.userData.sharedMat) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const mm = m as THREE.MeshStandardMaterial
        if (!(mm.userData as Record<string, unknown> | undefined)?.sharedMap) mm.map?.dispose?.()
        mm.dispose()
      }
    }
  })
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const rand = (a: number, b: number): number => a + Math.random() * (b - a)

// ------------------------------------------------------------
// v11 — SEEDED world RNG: every client generates the SAME island,
// loot, vehicles, storm and bot roster from the shared match seed
// (the lobby leader broadcasts it with the countdown). Bots use a
// SEPARATE stream so world-build timing can never desync them.
// ------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let wrng: (() => number) | null = null      // world stream (build order matters)
let brng: (() => number) | null = null      // bot roster stream (order-free)
const wrnd = (): number => (wrng ? wrng() : Math.random())
const wrand = (a: number, b: number): number => a + wrnd() * (b - a)
const brnd = (): number => (brng ? brng() : Math.random())
const brand = (a: number, b: number): number => a + brnd() * (b - a)
const R1 = (v: number): number => Math.round(v * 10) / 10
const R2 = (v: number): number => Math.round(v * 100) / 100
const smooth = (t: number): number => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x) }

// ------------------------------------------------------------
// v10 — procedural detail textures (canvas, one-shot per match)
// ------------------------------------------------------------
/** malla de manchas suaves en escala de grises para multiplicar sobre
 *  el color por vértice del terreno: grano sin coste de red */
function makeNoiseDetailTexture(repeat: number): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128
    const y = Math.random() * 128
    const r = 2 + Math.random() * 7
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const v = Math.random() < 0.5 ? '210,205,190' : '120,118,105'
    g.addColorStop(0, `rgba(${v},0.28)`)
    g.addColorStop(1, `rgba(${v},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** asfalto con línea central discontinua y bordes marcados */
function makeAsphaltTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3c4046'
  ctx.fillRect(0, 0, 128, 128)
  // grain
  for (let i = 0; i < 420; i++) {
    const v = 40 + Math.floor(Math.random() * 36)
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},0.5)`
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5)
  }
  // edge lines
  ctx.fillStyle = 'rgba(215,210,190,0.75)'
  ctx.fillRect(6, 0, 3, 128)
  ctx.fillRect(119, 0, 3, 128)
  // dashed center line
  ctx.fillStyle = 'rgba(230,200,90,0.8)'
  for (let y = 6; y < 128; y += 32) ctx.fillRect(62, y, 4, 18)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ------------------------------------------------------------
// Terrain height (analytic — player, bots, vehicles, meshes)
// ------------------------------------------------------------
function terrainH(x: number, z: number): number {
  let h = 0
  // mountains (gaussian masses)
  for (const p of PEAKS) {
    const d2 = (x - p.x) ** 2 + (z - p.z) ** 2
    h += p.h * Math.exp(-d2 / (p.r * p.r * 0.42))
  }
  // gentle valley noise
  h += Math.sin(x * 0.031) * Math.cos(z * 0.027) * 1.4
  // cities: flatten to a plateau
  for (const c of CITIES) {
    const d = Math.hypot(x - c.x, z - c.z)
    if (d < c.r + 12) h *= 1 - smooth((c.r + 12 - d) / 16) * 0.94
  }
  // lake basins
  for (const l of LAKES) {
    const d = Math.hypot(x - l.x, z - l.z)
    if (d < l.r + 8) {
      const k = smooth((l.r + 8 - d) / 12)
      h = h * (1 - k) + l.depth * k
    }
  }
  // boundary ridge (natural walls at the island edge)
  const edge = Math.max(Math.abs(x), Math.abs(z))
  if (edge > MAP - 6) h += 26 * smooth((edge - (MAP - 6)) / 16)
  return h
}

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h: number }

// ------------------------------------------------------------
// v12 — FORTNITE-STYLE BUILDING (BR)
// Grid 4 m × levels of 3 m. Pieces: wall (4×3, edge), ramp
// (4×4 cell rising 3 m) and floor (4×4 slab). Ghost preview +
// turbo build (hold LMB), materials economy, destructible HP,
// walkable floors/ramps, network replication.
// ------------------------------------------------------------
const GRID = 4                // m per build cell
const RISE = 3                // m of vertical grid per level
const BUILD_COST = 10         // materials per piece
const BUILD_MAX = 120         // max pieces per player
const MATS_START = 300        // starting materials
const MATS_PER_KILL = 60      // materials per elimination
const MATS_CRATE = 80         // supply crate bonus
const MATS_AMMO = 40          // ammo box bonus
const MATS_PALLET = 60        // material pallet pickup
const BUILD_HP: Record<BuildKind, number> = { wall: 260, ramp: 200, floor: 200 }
type BuildKind = 'wall' | 'ramp' | 'floor'
const BUILD_KEYS: Record<string, BuildKind> = { KeyQ: 'wall', KeyC: 'ramp', KeyZ: 'floor' }
const BUILD_LABEL: Record<BuildKind, string> = { wall: 'WALL', ramp: 'RAMP', floor: 'FLOOR' }

interface BuildPiece {
  id: string
  kind: BuildKind
  cx: number; cz: number       // grid cell (integer coords)
  edge: number                 // wall edge 0..3 (N E S W) / ramp facing 0..3
  lv: number                   // vertical level (baseY = lv * RISE)
  baseY: number
  hp: number
  mesh: THREE.Group
  owner: string
  mine: boolean
  dead: boolean
}
/** collision box registered by a build piece (bullets always, walls also block movement) */
interface BuildCol {
  piece: BuildPiece
  minX: number; maxX: number
  minZ: number; maxZ: number
  y0: number; y1: number
  blocks: boolean
}
interface TreeCol { x: number; z: number; r: number }
interface LootSpot {
  x: number; z: number
  kind: 'weapon' | 'ammo' | 'med' | 'crate' | 'mats'
  weapon: WeaponId
  /** v10: índice de rareza (BR_RARITIES) para loot de armas/cajas */
  rarity: number
  taken: boolean
  mesh: THREE.Group | null
  /** v9.1: objeto flotante (para reemplazarlo por el arma GLB real) */
  item: THREE.Group | null
}
interface BrVehicle {
  x: number; z: number; yaw: number
  speed: number
  group: THREE.Group
  occupied: boolean
  wheelPhase: number
}
interface BrBot {
  id: number
  name: string
  alive: boolean
  x: number; y: number; z: number
  yaw: number
  hp: number
  weapon: WeaponId
  destX: number; destZ: number
  thinkAt: number
  nextShotAt: number
  accuracy: number
  targetBot: number
  targetPlayer: boolean
  mesh: THREE.Group | null
  /** v9.1: cuerpo articulado (soldado GLB o low-poly) */
  rig: BodyRig | null
  /** v10: rareza del arma que porta (multiplicador de daño) */
  rarity: number
  /** uniforme distinto por operador (FFA) */
  tint: number
  legPhase: number
  deadAt: number
  dropAt: number     // becomes active when landed
  landed: boolean
  dropX: number; dropZ: number
  /** v11 net puppet fields (followers interpolate toward these) */
  tx: number; tz: number; tyaw: number
  moving: boolean
  snapped: boolean
  /** v11: current REAL-operator target (leader simulation only) */
  targetOp: string | null
}

/** v11 — a REAL remote operator, driven by network poses */
interface RemoteOp {
  u: string
  n: string
  rig: BodyRig | null
  x: number; y: number; z: number
  tx: number; ty: number; tz: number
  yaw: number; tyaw: number
  st: string          // 'plane' | 'freefall' | 'live' | 'dead'
  alive: boolean
  weapon: WeaponId | null
  moving: boolean
  legPhase: number
  veh: number         // vehicle index while driving, else -1
  lastPose: number
  deadAt: number
}

/** v9.1 — cuerpo de operador: soldado1.glb con huesos o fallback low-poly */
interface BodyRig {
  root: THREE.Group
  body: THREE.Group          // se voltea al morir / se balancea al andar
  weaponHolder: THREE.Group  // arma agarrada a las manos (IK)
  legs: [THREE.Object3D, THREE.Object3D]
  knees: [THREE.Object3D, THREE.Object3D]
  arms: [THREE.Object3D, THREE.Object3D]
  forearms: [THREE.Object3D, THREE.Object3D]
  usingSoldier: boolean
  /** para regenerar al llegar el GLB / mantener el uniforme */
  tintIdx: number
  weaponId: WeaponId
  /** piernas/brazos del fallback low-poly */
  pLegs?: THREE.Mesh[]
  pArms?: THREE.Mesh[]
}

// ------------------------------------------------------------
// Main class
// ------------------------------------------------------------
export class BattleRoyaleGame {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene            // active scene (lobby / map)
  private lobbyScene!: THREE.Scene
  private mapScene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private minimapCanvas: HTMLCanvasElement
  private mapBase!: HTMLCanvasElement    // pre-rendered map for the minimap

  private raf = 0
  private disposed = false
  private lastT = performance.now()
  private clock = 0

  // input
  private keys = new Set<string>()
  private locked = false
  private yaw = 0
  private pitch = 0
  private wantJump = false

  // player state
  private phase: 'queue' | 'plane' | 'freefall' | 'live' | 'dead' | 'victory' = 'queue'
  private px = 0; private py = 0; private pz = 0
  private vy = 0
  private onGround = true
  private hp = 100
  private weapon: WeaponId | null = null
  /** v10: rareza del arma actual (índice en BR_RARITIES, -1 = sin arma) */
  private weaponRarity = -1
  private mag = 0
  private reserve = 0
  private nextShotAt = 0
  private reloading = false
  private reloadEndAt = 0
  private kills = 0
  private inVehicle: BrVehicle | null = null
  private vmGroup: THREE.Group | null = null
  private vmKick = 0
  private hurtFlash = 0

  // ------------------------------------------------------------
  // v11.2 — SAME aiming/controls as the normal modes (ADS, spread,
  // sprint FOV, spray, pause menu with settings)
  // ------------------------------------------------------------
  private ads = false
  private adsAmt = 0
  private sprintAmt = 0
  private sprayIdx = 0
  private lastShotTime = 0
  private paused = false

  // plane / drop
  private planeT = 0
  private planeDur = 14
  private planeA = new THREE.Vector3()
  private planeB = new THREE.Vector3()
  private planeMesh: THREE.Group | null = null
  private jumped = false
  private glide = false

  // storm
  private stormIdx = 0
  private stormState: 'wait' | 'shrink' = 'wait'
  private stormTimer = STORM_PHASES[0].wait
  private stormR = 220
  private stormTargetR = 220
  private stormFromR = 220
  private stormCX = 0
  private stormCZ = 0
  private stormTargetC: [number, number] = [0, 0]
  private stormMesh: THREE.Mesh | null = null
  private stormTick = 0

  // world data
  private aabbs: AABB[] = []
  private trees: TreeCol[] = []
  private loot: LootSpot[] = []
  private vehicles: BrVehicle[] = []
  private bots: BrBot[] = []
  private tracers: { line: THREE.Line; born: number }[] = []
  private pings: { x: number; z: number; t: number }[] = []
  private muzzle: THREE.PointLight | null = null
  private muzzleUntil = 0

  // matchmaking
  private queue: BrQueuePlayer[] = []
  private countdown = 0
  private countdownRunning = false
  private matchStartAt = 0

  // ------------------------------------------------------------
  // v11 — REAL networking (esnet: MQTT lobby + match channels)
  // ------------------------------------------------------------
  private practice = false                 // offline practice (bots only, no ranking)
  private worldSeed: number | null = null  // match seed (null = still waiting)
  private matchId = ''
  private netCountT0 = 0                   // wall-clock countdown target
  private netRoster: BrQueueOp[] = []      // REAL operators in the lobby
  private remoteOps = new Map<string, RemoteOp>()
  private botLeader = false                // this client simulates the bots
  private botsBuilt = false
  private lastBotsMsg = 0                  // bot-leader liveness (failover)
  private poseAt = 0
  private botsPubAt = 0
  private netHkAt = 0
  private mcountTimer: ReturnType<typeof setTimeout> | null = null
  private lastDamager: { u: string; n: string } | null = null
  private planeAngle = 0
  private stormPlan: [number, number][] = []

  // map build queue (spread over frames during the countdown)
  private buildQueue: (() => void)[] = []
  private mapReady = false

  // lobby extras
  private lobbyWalkers: { rig: BodyRig; phase: number; dest: [number, number] }[] = []
  // v12: construcción estilo Fortnite
  private builds: BuildPiece[] = []
  private buildCols: BuildCol[] = []
  private buildMode: BuildKind | null = null
  private buildGhost: THREE.Group | null = null
  private buildGhostKind: BuildKind | null = null
  private buildGhostOk = false
  private buildAt = 0                    // turbo-build rate limiter
  private buildSeq = 0
  private mats = MATS_START
  private mouseHeld = false
  private buildMats: { wall: THREE.Material | null; floor: THREE.Material | null; ramp: THREE.Material | null; frame: THREE.Material | null } = { wall: null, floor: null, ramp: null, frame: null }
  private buildGhostMats: THREE.MeshBasicMaterial[] = []
  // v12: lobby set profesional — pantalla en vivo, gaviotas, olas, baliza, fuego, bandera
  private lobbyBoard: THREE.CanvasTexture | null = null
  private lobbyBoardAt = -1
  private lobbyGulls: { mesh: THREE.Group; r: number; a: number; h: number; s: number }[] = []
  private lobbyWaves: { mesh: THREE.Mesh; ph: number }[] = []
  private lobbyBeacon: THREE.PointLight | null = null
  private lobbyBeaconMat: THREE.MeshStandardMaterial | null = null
  private lobbyFlag: THREE.Mesh | null = null
  private lobbyFire: THREE.PointLight | null = null
  private lobbyFireMat: THREE.MeshBasicMaterial | null = null

  private hudAt = 0
  private botThink = 0
  private endTime = 0

  // ---- v9.1: real assets (soldier1.glb, GLB weapons, Pared/Piso, Arbol) ----
  /** v10: perfil gráfico COMPLETO (baja/media/alta/ultra) — sin tope */
  private effQuality: 'baja' | 'media' | 'alta' | 'ultra' = 'media'
  private soldierTemplate: THREE.Group | null = null
  private soldierLoading = false
  /** materiales teñidos por variante de uniforme (compartidos entre clones) */
  private tintCache: Map<THREE.Material, THREE.Material>[] = BR_TINTS.map(() => new Map())
  private weaponGLBUnsub: (() => void) | null = null
  /** muros/tejados creados sin textura aún — se parchean al llegar Pared/Piso.
   *  v13: + kinds pasto/arena/asfalto/concreto/roca/contenedor/madera/
   *  ladrillo/metal (texturas nuevas del usuario) y flag `force` para
   *  reemplazar un mapa provisional (p.ej. el ruido del terreno) cuando
   *  llega la textura real */
  private texMats: { mat: THREE.MeshStandardMaterial; kind: 'wall' | 'roof' | 'pasto' | 'arena' | 'asfalto' | 'concreto' | 'roca' | 'contenedor' | 'madera' | 'ladrillo' | 'metal'; rx: number; ry: number; force?: boolean }[] = []
  private repoTexTries = 0
  private forestIsProcedural = false
  private procForestMeshes: THREE.Mesh[] = []
  private glbForestMeshes: THREE.Mesh[] = []
  // viewmodel base pose (weaponPose del arma actual)
  private vmBase = new THREE.Vector3(0.2, -0.24, -0.5)
  private vmBaseRot = new THREE.Euler()
  private vmIsProcedural = true

  // ---- v10: chat de partida + atmósfera (sol, nubes) ----
  private chatStop: (() => void) | null = null
  private clouds: THREE.Sprite[] = []
  private sunSprite: THREE.Sprite | null = null

  constructor(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.minimapCanvas = minimapCanvas
  }

  // ----------------------------------------------------------
  // INIT
  // ----------------------------------------------------------
  init(): void {
    const brSet = useBr.getState().set
    // v10: perfil gráfico COMPLETO — HIGH y ULTRA ya están disponibles
    // en Battle Royale (por-tier: pixelRatio, AA, sombras, niebla, extras)
    const q = useGame.getState().settings.quality
    this.effQuality = q
    brSet({
      qualityNote: q === 'alta' || q === 'ultra'
        ? `Graphics profile ${q === 'ultra' ? 'ULTRA' : 'HIGH'} active — Battle Royale looks its best`
        : '',
    })

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'baja' })
    this.renderer.setPixelRatio(
      q === 'baja' ? 0.75
        : q === 'media' ? Math.min(devicePixelRatio, 1)
          : q === 'alta' ? Math.min(devicePixelRatio, 1.5)
            : Math.min(devicePixelRatio, 2),
    )
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = q === 'baja' ? 1.0 : q === 'media' ? 1.04 : q === 'alta' ? 1.09 : 1.12

    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 900)

    // ---- LOBBY SCENE (island) ----
    this.lobbyScene = this.buildLobbyScene()

    // ---- MAP SCENE (built progressively) ----
    this.mapScene = new THREE.Scene()
    this.mapScene.background = new THREE.Color(0x0c1420)
    this.mapScene.fog = new THREE.FogExp2(
      0x0c1420,
      q === 'baja' ? 0.0032 : q === 'media' ? 0.0024 : q === 'alta' ? 0.0016 : 0.0013,
    )
    this.buildMapSky(this.mapScene)
    this.buildMapLights(this.mapScene, q)
    this.enqueueMapBuild(q)

    this.scene = this.lobbyScene
    // spawn on the island
    this.px = 0; this.pz = 0; this.py = EYE

    // v11 — REAL matchmaking: only actual operators appear in the queue.
    // Bots NEVER join the lobby; they fill to 20 AFTER the countdown,
    // which only starts when 4 REAL operators are connected.
    const me = useAuth.getState().user ?? useGame.getState().playerName ?? 'Operator'
    this.queue = [{ name: me, real: true }]
    this.practice = useBr.getState().practice
    if (this.practice) {
      useBr.getState().set({ netStatus: 'offline' })
      this.beginPractice()
    } else {
      esNet.brQueueEnter({
        onRoster: ops => this.onNetRoster(ops),
        onCountdown: c => this.onNetCountdown(c),
        onOffline: () => { /* overlay shows the error + practice option */ },
      })
      useBr.getState().set({ netStatus: esNet.status === 'online' ? 'online' : esNet.status })
    }
    brSet({
      active: true,
      phase: 'queue',
      queuePlayers: [...this.queue],
      countdown: 0,
      countdownActive: false,
      loadingMap: true,
      totalPlayers: TOTAL,
      hp: 100,
      kills: 0,
      placement: 0,
      weaponRarity: -1,
    })

    getAudio().setDuck(true)   // music ducks down during BR

    // ---- v10: chat de partida (modo BR, canal propio) ----
    useChat.getState().setMode('br')
    useChat.getState().reset()
    this.chatStop = startAmbientChat()

    // ---- v9.1: the user's real assets (models + textures) in BR too ----
    // texturas Pared/Piso + plantilla de Arbol.glb (caché compartida; si ya
    // las bajó el juego principal, aquí están al instante)
    preloadAssets({ trees: true }).then(() => this.onRepoAssetsReady())
    // armas GLB del pool: la descarga se reparte durante la cuenta atrás
    // (carga perezosa por arma) y al llegar se sustituyen los modelos
    for (const w of WEAPON_POOL) ensureWeaponGLB(w)
    this.weaponGLBUnsub = onWeaponGLBsReady(() => this.refreshWeaponModels())
    // soldado1.glb (plantilla por instancia: se libera al salir del BR)
    this.loadSoldier()

    this.bindInput()
    this.lastT = performance.now()
    // gancho de depuración (tests automatizados), como el __game del motor
    ;(window as unknown as Record<string, unknown>).__brGame = this
    this.raf = requestAnimationFrame(this.loop)
  }

  // ----------------------------------------------------------
  // INPUT
  // ----------------------------------------------------------
  private onKeyDown = (e: KeyboardEvent): void => {
    // v10: mientras el chat está abierto, las teclas son del input
    if (useChat.getState().open) return
    this.keys.add(e.code)
    if (e.code === 'Space') {
      e.preventDefault()
      if (this.phase === 'plane') this.jumpFromPlane()
    }
    if (e.code === 'KeyR' && this.phase === 'live') this.startReload()
    if (e.code === 'KeyE') this.wantJump = true   // interaction flag
    // v12: construcción estilo Fortnite — Q wall · C ramp · Z floor
    // (la misma tecla de la pieza activa sale del modo construcción)
    if (this.phase === 'live' && !this.inVehicle && BUILD_KEYS[e.code]) {
      const kind = BUILD_KEYS[e.code]
      this.setBuildMode(this.buildMode === kind ? null : kind)
    }
    // v11.2: ESC opens the SAME pause menu as the normal modes
    if (e.code === 'Escape') {
      if (this.paused) {
        this.setPaused(false)
        this.requestLock()
      } else if (this.phase !== 'queue') {
        this.setPaused(true)
      }
    }
  }
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code) }
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.paused) return
    const s = useGame.getState().settings
    // v11.2: identical feel to the normal modes (ADS zoom scaling + sprint)
    const zoomFactor = this.adsAmt > 0.05 ? Math.max(0.28, this.camera.fov / 74) * (s.adsSens ?? 0.75) : 1
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && this.movingFast()
    const sens = 0.0022 * s.sens * (this.ads ? zoomFactor : 1) * (sprinting ? 1.12 : 1)
    this.yaw -= e.movementX * sens
    this.pitch = clamp(this.pitch - e.movementY * sens, -1.35, 1.35)
  }
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) { this.requestLock(); return }
    if (this.paused) return
    if (e.button === 0) {
      this.mouseHeld = true
      // v12: en modo construcción el clic COLOCA la pieza (turbo al mantener)
      if (this.buildMode && this.phase === 'live' && !this.inVehicle) { this.tryPlaceBuild(); return }
      this.tryShoot()
    }
    if (e.button === 2) {
      // v12: RMB con construcción activa → salir del modo (como soltar la herramienta)
      if (this.buildMode) { this.setBuildMode(null); return }
      this.ads = true      // v11.2: aim down sights
    }
  }
  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseHeld = false
    if (e.button === 2) this.ads = false
  }
  private onContextMenu = (e: Event): void => { e.preventDefault() }

  /** v11.2: pause overlay (menu/controls/settings — like the normal modes) */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    useBr.getState().set({ paused })
    if (paused && document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas
    if (this.locked && this.paused) this.setPaused(false)   // resume on re-lock
  }
  private onResize = (): void => {
    if (this.disposed) return
    this.renderer.setSize(innerWidth, innerHeight)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
  }
  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('resize', this.onResize)
    document.addEventListener('pointerlockchange', this.onLockChange)
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    this.canvas.addEventListener('mouseup', this.onMouseUp)
    this.canvas.addEventListener('contextmenu', this.onContextMenu)
  }
  requestLock(): void {
    if (this.phase === 'dead' || this.phase === 'victory') return
    void this.canvas.requestPointerLock?.()
  }

  // ----------------------------------------------------------
  // LOBBY ISLAND (v12: Professional staging area — command plaza
  // with a LIVE countdown board, helipad, dock, watchtower,
  // tents + campfire, sandbags, antenna, gulls and shore waves)
  // ----------------------------------------------------------
  private buildLobbyScene(): THREE.Scene {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87a8c2)
    scene.fog = new THREE.FogExp2(0x9db8cd, 0.0038)

    // dusk sun
    const sun = new THREE.DirectionalLight(0xffd9a8, 1.6)
    sun.position.set(-60, 80, -40)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x54462e, 0.75))

    // ocean
    const ocean = new THREE.Mesh(
      new THREE.CircleGeometry(600, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a6a8f, roughness: 0.25, metalness: 0.15 }),
    )
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -0.4
    scene.add(ocean)

    // island disc (sand ring + grass core)
    // v13: texturas reales del usuario (Arena.jpg / Pasto.jpg) — parcheadas
    // en vivo cuando termina preloadAssets (applyRepoTexToBr)
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xc9b483, roughness: 1 })
    this.texMats.push({ mat: sandMat, kind: 'arena', rx: 14, ry: 14 })
    const sand = new THREE.Mesh(new THREE.CircleGeometry(34, 44), sandMat)
    sand.rotation.x = -Math.PI / 2
    sand.position.y = 0.02
    scene.add(sand)
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x6d8a4c, roughness: 1 })
    this.texMats.push({ mat: grassMat, kind: 'pasto', rx: 11, ry: 11 })
    const grass = new THREE.Mesh(new THREE.CircleGeometry(27, 40), grassMat)
    grass.rotation.x = -Math.PI / 2
    grass.position.y = 0.06
    scene.add(grass)

    // ---------------- COMMAND PLAZA (concrete, painted) ----------------
    // canvas-painted concrete: grid + amber ring + EMS emblem
    const plzC = document.createElement('canvas')
    plzC.width = plzC.height = 512
    const pc = plzC.getContext('2d')!
    pc.fillStyle = '#585c60'
    pc.fillRect(0, 0, 512, 512)
    // panel tiles
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      pc.fillStyle = (tx + ty) % 2 ? '#5b5f63' : '#54585c'
      pc.fillRect(tx * 128 + 3, ty * 128 + 3, 122, 122)
    }
    // subtle noise
    for (let i = 0; i < 900; i++) {
      pc.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
      pc.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
    }
    // amber tactical ring
    pc.strokeStyle = '#e7b56a'
    pc.lineWidth = 7
    pc.beginPath(); pc.arc(256, 256, 215, 0, Math.PI * 2); pc.stroke()
    pc.strokeStyle = 'rgba(231,181,106,0.35)'
    pc.lineWidth = 2
    pc.beginPath(); pc.arc(256, 256, 190, 0, Math.PI * 2); pc.stroke()
    // center emblem
    pc.fillStyle = 'rgba(231,181,106,0.9)'
    pc.font = 'bold 56px monospace'
    pc.textAlign = 'center'
    pc.fillText('E M S', 256, 250)
    pc.font = '16px monospace'
    pc.fillText('STAGING · ASHFALL', 256, 286)
    const plazaTex = new THREE.CanvasTexture(plzC)
    plazaTex.anisotropy = 4
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(10.5, 40),
      new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.94 }),
    )
    plaza.rotation.x = -Math.PI / 2
    plaza.position.y = 0.09
    scene.add(plaza)
    // path: plaza → dock / plaza → helipad (darker gravel strips)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x8a7f66, roughness: 1 })
    for (const [ax, az, bx, bz, w] of [
      [0, 9, 0, 22, 2.4],        // plaza → dock
      [7.5, 7.5, 19, 19, 2.0],   // plaza → helipad
      [-7.5, -7.5, -19, -15, 1.8], // plaza → watchtower
    ] as const) {
      const len = Math.hypot(bx - ax, bz - az)
      const path = new THREE.Mesh(new THREE.PlaneGeometry(w, len), pathMat)
      path.rotation.x = -Math.PI / 2
      path.rotation.z = Math.atan2(bx - ax, bz - az)
      path.position.set((ax + bx) / 2, 0.085, (az + bz) / 2)
      scene.add(path)
    }

    // ---------------- LIVE COUNTDOWN BOARD (north) ----------------
    // 6×3 m screen on a mast frame; a CanvasTexture refreshed 1×/s
    const bdC = document.createElement('canvas')
    bdC.width = 512; bdC.height = 288
    const boardTex = new THREE.CanvasTexture(bdC)
    boardTex.anisotropy = 4
    this.lobbyBoard = boardTex
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.3 })
    const board = new THREE.Group()
    for (const lx of [-2.9, 2.9]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 5.4, 8), frameMat)
      leg.position.set(lx, 2.7, 0)
      board.add(leg)
    }
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 3.2),
      new THREE.MeshBasicMaterial({ map: boardTex }),
    )
    screen.position.set(0, 5.6, 0.12)
    board.add(screen)
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 3.6, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.4 }),
    )
    bezel.position.set(0, 5.6, 0)
    board.add(bezel)
    board.position.set(0, 0, -15.5)
    board.rotation.y = 0
    scene.add(board)

    // ---------------- HELIPAD (SE) ----------------
    const hpC = document.createElement('canvas')
    hpC.width = hpC.height = 256
    const hc = hpC.getContext('2d')!
    hc.fillStyle = '#3f4448'; hc.fillRect(0, 0, 256, 256)
    hc.strokeStyle = '#e7e2d5'; hc.lineWidth = 10
    hc.beginPath(); hc.arc(128, 128, 108, 0, Math.PI * 2); hc.stroke()
    hc.fillStyle = '#e7e2d5'
    hc.font = 'bold 110px monospace'; hc.textAlign = 'center'
    hc.fillText('H', 128, 166)
    hc.strokeStyle = '#e7b56a'; hc.lineWidth = 6
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      hc.beginPath()
      hc.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96)
      hc.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118)
      hc.stroke()
    }
    const hpTex = new THREE.CanvasTexture(hpC)
    hpTex.anisotropy = 4
    const helipad = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 32),
      new THREE.MeshStandardMaterial({ map: hpTex, roughness: 0.9 }),
    )
    helipad.rotation.x = -Math.PI / 2
    helipad.position.set(19, 0.085, 19)
    scene.add(helipad)
    // windsock
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), frameMat)
    pole.position.set(23.5, 2.1, 15.5)
    scene.add(pole)
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.2, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe77a3f, roughness: 0.8, side: THREE.DoubleSide }),
    )
    sock.rotation.z = Math.PI / 2.3
    sock.rotation.y = -0.5
    sock.position.set(23.5, 4.0, 15.5)
    scene.add(sock)

    // ---------------- DOCK + BOAT (S) ----------------
    const dock = new THREE.Group()
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.85 })
    for (let i = 0; i < 9; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 1.55), dockMat)
      plank.position.set(0, 0.9, i * 1.6)
      dock.add(plank)
      if (i % 3 === 1) {
        for (const px of [-1.55, 1.55]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 6), dockMat)
          post.position.set(px, -0.3, i * 1.6)
          dock.add(post)
        }
      }
    }
    dock.position.set(0, 0, 20)
    scene.add(dock)
    // small boat moored at the dock end
    const boat = new THREE.Group()
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 0.7, 4.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xd9d4c5, roughness: 0.6 }),
    )
    hull.rotation.x = Math.PI / 2
    hull.rotation.z = Math.PI / 6
    hull.position.y = 0.25
    boat.add(hull)
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x2f4a5f, roughness: 0.5 }),
    )
    cabin.position.set(0, 0.85, -0.4)
    boat.add(cabin)
    boat.position.set(2.6, -0.05, 33)
    boat.rotation.y = 0.6
    scene.add(boat)

    // ---------------- WATCHTOWER (NW) + blinking beacon ----------------
    const tower = new THREE.Group()
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.85 })
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7.2, 6), legMat)
      leg.position.set(lx * 0.82, 3.6, lz * 0.82)
      leg.rotation.x = -lz * 0.045
      leg.rotation.z = -lx * 0.045
      tower.add(leg)
    }
    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.25, 4),
      new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.9 }),
    )
    plat.position.y = 7.2
    tower.add(plat)
    for (let i = 0; i <= 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.34), legMat)
      step.position.set(1.55, 0.8 + i * 0.78, -1.55 + i * 0.38)
      tower.add(step)
    }
    for (let i = 0; i < 4; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 0.08), legMat)
      rail.position.y = 8.15
      rail.rotation.y = (i / 4) * Math.PI * 2
      if (i % 2 === 0) rail.rotation.y = i === 0 ? 0 : Math.PI / 2
      rail.scale.set(i % 2 === 0 ? 1 : 1, 1, 1)
      rail.position.x = i % 2 === 0 ? 0 : 0
      rail.position.z = i % 2 === 0 ? (i === 0 ? 2 : -2) : 0
      tower.add(rail)
    }
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 1.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x54462e, roughness: 1 }),
    )
    roof.position.y = 9.4
    roof.rotation.y = Math.PI / 4
    tower.add(roof)
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2,
    })
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), beaconMat)
    beacon.position.set(0, 10.4, 0)
    tower.add(beacon)
    const beaconLight = new THREE.PointLight(0xff3b30, 0, 26)
    beaconLight.position.copy(beacon.position)
    tower.add(beaconLight)
    this.lobbyBeacon = beaconLight
    this.lobbyBeaconMat = beaconMat
    tower.position.set(-19, 0, -15)
    tower.rotation.y = 0.4
    scene.add(tower)

    // ---------------- TENT CAMP + CAMPFIRE (E) ----------------
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x4a5b3c, roughness: 0.95, side: THREE.DoubleSide })
    for (const [tx, tz, ry] of [[15, -6, 0.3], [17.5, -1.5, -0.2], [13, 9.5, 0.9]] as const) {
      const tent = new THREE.Group()
      for (const half of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), tentMat)
        side.position.set(0, 1.0, half * 0.85)
        side.rotation.x = -half * 0.62
        tent.add(side)
      }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.2), tentMat)
      back.position.set(-1.6, 0.9, 0)
      back.rotation.y = Math.PI / 2
      tent.add(back)
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 1 }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0.05
      tent.add(floor)
      tent.position.set(tx, 0, tz)
      tent.rotation.y = ry
      scene.add(tent)
    }
    // campfire: logs + emissive flame + flickering light
    const fire = new THREE.Group()
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 })
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), logMat)
      log.rotation.z = Math.PI / 2.4
      log.rotation.y = (i / 4) * Math.PI * 2
      log.position.y = 0.16
      fire.add(log)
    }
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa03c, transparent: true, opacity: 0.9 })
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 8), fireMat)
    flame.position.y = 0.62
    fire.add(flame)
    const fireLight = new THREE.PointLight(0xff9040, 2.2, 12)
    fireLight.position.y = 1.0
    fire.add(fireLight)
    // stone ring
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 1, flatShading: true })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat)
      st.position.set(Math.cos(a) * 1.05, 0.14, Math.sin(a) * 1.05)
      st.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3))
      fire.add(st)
    }
    fire.position.set(11.5, 0, 2.5)
    scene.add(fire)
    this.lobbyFire = fireLight
    this.lobbyFireMat = fireMat

    // ---------------- SANDBAGS + BARRELS + CRATES (plaza ring) ----------------
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x9a8a5e, roughness: 1 })
    const bagGeo = new THREE.CapsuleGeometry(0.2, 0.42, 4, 8)
    const sandbagRow = (x: number, z: number, ry: number, n: number): void => {
      const row = new THREE.Group()
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < n; i++) {
        const bag = new THREE.Mesh(bagGeo, bagMat)
        bag.rotation.z = Math.PI / 2
        bag.rotation.y = (i % 2) * 0.06
        bag.position.set((i - n / 2) * 0.62 + (layer % 2) * 0.3, 0.22 + layer * 0.38, 0)
        row.add(bag)
      }
      row.position.set(x, 0, z)
      row.rotation.y = ry
      scene.add(row)
    }
    sandbagRow(-6.5, -8.5, 1.35, 5)
    sandbagRow(6.5, -8.5, -1.35, 5)
    sandbagRow(-8.8, 5, 0.5, 4)
    sandbagRow(8.8, 5, -0.5, 4)
    // barrels
    const barrelRed = new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: 0.55, metalness: 0.35 })
    const barrelGray = new THREE.MeshStandardMaterial({ color: 0x5d6a72, roughness: 0.55, metalness: 0.35 })
    for (const [bx, bz, m] of [
      [12.5, -11, 0], [13.6, -10.2, 1], [13, -12, 0], [-12.8, -10.5, 1], [-11.9, -9.4, 0],
    ] as const) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12), m ? barrelGray : barrelRed)
      b.position.set(bx, 0.58, bz)
      b.rotation.y = rand(0, 3)
      scene.add(b)
    }
    // supply crate stacks + weapon racks (flank the board)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.85 })
    const strpMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.7 })
    for (const [cx, cz, rot, stack] of [
      [-6, -13.5, 0.3, 2], [-5, -12.6, 0.9, 1], [6, 4, 0.2, 3], [5.6, 3, 1.2, 1],
      [-13, 12, 0.5, 2], [18.5, 11.5, 1.1, 2],
    ] as const) {
      for (let s = 0; s < stack; s++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), crateMat)
        c.position.set(cx + rand(-0.12, 0.12), 0.5 + s * 1.02, cz + rand(-0.12, 0.12))
        c.rotation.y = rot + rand(-0.15, 0.15)
        const strp = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.14, 1.44), strpMat)
        strp.position.y = 0
        c.add(strp)
        scene.add(c)
      }
    }
    // weapon rack: frame + 3 rifles at rest
    const rack = new THREE.Group()
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x4c423a, roughness: 0.9 })
    const rackBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.5), rackMat)
    rackBase.position.y = 0.06
    rack.add(rackBase)
    for (const rx of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.4), rackMat)
      post.position.set(rx, 0.75, 0)
      rack.add(post)
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), rackMat)
    bar.position.y = 1.45
    rack.add(bar)
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.5, metalness: 0.5 })
    for (const gx of [-0.7, 0, 0.7]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.2), gunMat)
      g.position.set(gx, 0.78, 0.05)
      g.rotation.z = -0.28
      rack.add(g)
    }
    rack.position.set(6.2, 0, -14.2)
    rack.rotation.y = 0.2
    scene.add(rack)

    // ---------------- ANTENNA MAST (W) ----------------
    const mast = new THREE.Group()
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.4, metalness: 0.7 })
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 12, 8), mastMat)
    pole2.position.y = 6
    mast.add(pole2)
    for (let i = 0; i < 4; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.8 - i * 0.3, 0.07, 0.07), mastMat)
      cross.position.y = 4.5 + i * 2.2
      mast.add(cross)
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd9d4c5, roughness: 0.4, side: THREE.DoubleSide }),
      )
      dish.position.set(0.9 - i * 0.15, 5.2 + i * 2.2, 0)
      dish.rotation.z = -1.2
      mast.add(dish)
    }
    const topLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.5 }),
    )
    topLight.position.y = 12.2
    mast.add(topLight)
    mast.position.set(-21, 0, 10)
    scene.add(mast)

    // ---------------- FLAG POLE (plaza center) ----------------
    const fpole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 8.5, 8), mastMat)
    fpole.position.set(0, 4.25, 0)
    scene.add(fpole)
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.4, 6, 3),
      new THREE.MeshStandardMaterial({
        color: 0xe7b56a, roughness: 0.8, side: THREE.DoubleSide,
        emissive: 0x3d2c12, emissiveIntensity: 0.4,
      }),
    )
    flag.position.set(1.28, 7.6, 0)
    scene.add(flag)
    this.lobbyFlag = flag

    // ---------------- STRING LIGHTS (plaza ↔ camp) ----------------
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a8, emissive: 0xffc678, emissiveIntensity: 1.6 })
    const bulbGeo = new THREE.SphereGeometry(0.07, 6, 5)
    for (const [sxA, szA, sxB, szB] of [
      [8, -8, 14.5, -4], [8, 8, 15.5, 6],
    ] as const) {
      for (let i = 1; i < 9; i++) {
        const t = i / 9
        const bx = sxA + (sxB - sxA) * t
        const bz = szA + (szB - szA) * t
        const sag = Math.sin(t * Math.PI) * 0.55
        const bulb = new THREE.Mesh(bulbGeo, bulbMat)
        bulb.position.set(bx, 3.1 - sag, bz)
        scene.add(bulb)
      }
    }

    // palms (trunk + fan of leaves + coconuts)
    const palmPositions: [number, number][] = [
      [-20, 8], [18, -12], [-14, -18], [22, 14], [0, 24], [-24, -4], [12, 22], [4, -24],
      [-26, 20], [24, -20], [-8, 26], [26, 2],
    ]
    const cocoMat = new THREE.MeshStandardMaterial({ color: 0x5a4526, roughness: 0.9 })
    for (const [tx, tz] of palmPositions) {
      const palm = new THREE.Group()
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.3, 5.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x7a5b38, roughness: 0.9 }),
      )
      trunk.position.y = 2.6
      trunk.rotation.z = rand(-0.08, 0.08)
      palm.add(trunk)
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, side: THREE.DoubleSide })
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75, 4, 1), leafMat)
        leaf.position.y = 5.2
        leaf.rotation.y = (i / 6) * Math.PI * 2
        leaf.rotation.z = -0.55
        leaf.position.x = Math.cos((i / 6) * Math.PI * 2) * 1.0
        leaf.position.z = Math.sin((i / 6) * Math.PI * 2) * 1.0
        palm.add(leaf)
      }
      for (let i = 0; i < 3; i++) {
        const coco = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), cocoMat)
        coco.position.set(Math.cos(i * 2.1) * 0.3, 4.95, Math.sin(i * 2.1) * 0.3)
        palm.add(coco)
      }
      palm.position.set(tx, 0, tz)
      scene.add(palm)
    }

    // bushes + rocks (scattered detail)
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x46663a, roughness: 1, flatShading: true })
    const rockMat2 = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 1, flatShading: true })
    // v13: Roca.jpg real en las rocas del lobby
    this.texMats.push({ mat: rockMat2, kind: 'roca', rx: 1.5, ry: 1.5 })
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), r = rand(11, 24)
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.45, 0.85), 0), bushMat)
      bush.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r)
      bush.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3))
      scene.add(bush)
    }
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2), r = rand(12, 25)
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.7), 0), rockMat2)
      rock.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r)
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3))
      scene.add(rock)
    }

    // ---------------- SEAGULLS (circling) ----------------
    for (let i = 0; i < 5; i++) {
      const gull = new THREE.Group()
      const wingMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee, side: THREE.DoubleSide })
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), wingMat)
      body.rotation.x = Math.PI / 2
      gull.add(body)
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.26), wingMat)
        wing.position.x = s * 0.45
        wing.rotation.y = s * 0.12
        gull.add(wing)
      }
      scene.add(gull)
      this.lobbyGulls.push({
        mesh: gull, r: rand(14, 26), a: rand(0, Math.PI * 2),
        h: rand(11, 19), s: rand(0.14, 0.3) * (Math.random() < 0.5 ? -1 : 1),
      })
    }

    // ---------------- SHORE WAVES (expanding rings) ----------------
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0xe8f2f6, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    })
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(26, 26.7, 40), waveMat.clone())
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.16
      scene.add(ring)
      this.lobbyWaves.push({ mesh: ring, ph: i * 1.9 })
    }

    // waiting operators on the island as they "connect"
    // (v9.1: soldier1.glb con uniforme propio por operador; fallback low-poly
    //  mientras baja el GLB — swap en cascada al llegar)
    for (let i = 0; i < 10; i++) {
      const rig = this.buildBotBody(i, WEAPON_POOL[i % WEAPON_POOL.length])
      rig.root.position.set(rand(-18, 18), 0, rand(-16, 16))
      rig.root.rotation.y = rand(0, Math.PI * 2)
      scene.add(rig.root)
      this.lobbyWalkers.push({ rig, phase: rand(0, 10), dest: [rand(-16, 16), rand(-16, 16)] })
    }

    // far ridge silhouette for depth
    const ridge = new THREE.Mesh(
      new THREE.CylinderGeometry(240, 260, 60, 12, 1, true, Math.PI * 0.15, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x46607a, roughness: 1, flatShading: true }),
    )
    ridge.position.y = 18
    scene.add(ridge)

    return scene
  }

  /** v12: paints the lobby countdown board (1 Hz — operators + countdown) */
  private updateLobbyBoard(): void {
    if (!this.lobbyBoard) return
    const c = this.lobbyBoard.image as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) return
    const real = this.queue.filter(p => p.real).length
    ctx.fillStyle = '#06090c'
    ctx.fillRect(0, 0, 512, 288)
    // frame + header
    ctx.strokeStyle = '#2c3a44'
    ctx.lineWidth = 6
    ctx.strokeRect(6, 6, 500, 276)
    ctx.fillStyle = '#e7b56a'
    ctx.font = 'bold 40px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('BATTLE ROYALE', 256, 62)
    ctx.fillStyle = '#3f5561'
    ctx.fillRect(40, 84, 432, 3)
    // operators meter
    const need = REAL_TARGET
    ctx.fillStyle = '#8fa3ad'
    ctx.font = '22px monospace'
    ctx.fillText(`OPERATORS ONLINE  ${real} / ${need}`, 256, 130)
    for (let i = 0; i < need; i++) {
      const x = 256 - (need * 46) / 2 + i * 46
      ctx.fillStyle = i < real ? '#57d867' : '#1d2a30'
      ctx.fillRect(x, 146, 36, 18)
      ctx.strokeStyle = '#3f5561'
      ctx.lineWidth = 2
      ctx.strokeRect(x, 146, 36, 18)
    }
    // countdown / waiting
    if (this.countdownRunning) {
      const s = Math.max(0, Math.ceil(this.countdown))
      ctx.fillStyle = s <= 10 ? '#ff5f52' : '#e7e2d5'
      ctx.font = 'bold 88px monospace'
      ctx.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 256, 246)
      ctx.fillStyle = '#8fa3ad'
      ctx.font = '18px monospace'
      ctx.fillText('DEPLOYING — STAND BY', 256, 272)
    } else {
      ctx.fillStyle = '#e7e2d5'
      ctx.font = 'bold 46px monospace'
      ctx.fillText('WAITING…', 256, 232)
      ctx.fillStyle = '#8fa3ad'
      ctx.font = '16px monospace'
      ctx.fillText('COUNTDOWN STARTS AT 4 OPERATORS', 256, 266)
    }
    this.lobbyBoard.needsUpdate = true
  }

  /** v12: ambient life of the lobby island — gulls, waves, beacon,
   *  campfire, flag and the 1 Hz board repaint */
  private updateLobbyLife(t: number, dt: number): void {
    // gulls circle + bank
    for (const g of this.lobbyGulls) {
      g.a += g.s * dt
      const x = Math.cos(g.a) * g.r
      const z = Math.sin(g.a) * g.r
      g.mesh.position.set(x, g.h + Math.sin(t * 0.9 + g.r) * 0.8, z)
      g.mesh.rotation.y = -g.a + (g.s > 0 ? Math.PI / 2 : -Math.PI / 2)
      // wing flap
      const flap = Math.sin(t * 9 + g.r) * 0.35
      g.mesh.children[1].rotation.z = flap
      g.mesh.children[2].rotation.z = -flap
    }
    // shore waves: expanding + fading rings (26 → 34 m, 6 s loop)
    for (const w of this.lobbyWaves) {
      w.ph += dt * 1.6
      const p = w.ph % 6
      const r = 26 + p * 1.35
      const scale = r / 26
      w.mesh.scale.setScalar(scale)
      const mat = w.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 * Math.max(0, 1 - p / 6)
    }
    // beacon: 1 s pulse
    if (this.lobbyBeacon && this.lobbyBeaconMat) {
      const pulse = t % 1.2
      const on = pulse < 0.18 ? 1 : 0
      this.lobbyBeacon.intensity = on * 4
      this.lobbyBeaconMat.emissiveIntensity = 0.3 + on * 2.4
    }
    // campfire flicker
    if (this.lobbyFire && this.lobbyFireMat) {
      this.lobbyFire.intensity = 1.7 + Math.sin(t * 11) * 0.5 + Math.random() * 0.5
      this.lobbyFireMat.opacity = 0.65 + Math.sin(t * 8.3) * 0.25
    }
    // flag sway (bend on the X vertices)
    if (this.lobbyFlag) {
      const pos = this.lobbyFlag.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const k = (x + 1.2) / 2.4          // 0 at the pole → 1 at the free edge
        pos.setZ(i, Math.sin(t * 2.6 + k * 2.2) * 0.16 * k)
      }
      pos.needsUpdate = true
    }
    // board repaint at 1 Hz
    const sec = Math.floor(t)
    if (sec !== this.lobbyBoardAt) {
      this.lobbyBoardAt = sec
      this.updateLobbyBoard()
    }
  }

  // ----------------------------------------------------------
  // MAP SCENE — sky, lights, then progressive build
  // ----------------------------------------------------------
  private buildMapSky(scene: THREE.Scene): void {
    // v10: dusk gradient, más rico (azul profundo → resplandor cálido)
    const skyGeo = new THREE.SphereGeometry(820, 24, 12)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x24375c) },
        mid: { value: new THREE.Color(0xc27a3f) },
        bot: { value: new THREE.Color(0x2a1c10) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.6, h)) : mix(bot, mid, smoothstep(-0.1, 0.12, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    scene.add(sky)
    // v10: disco solar con halo (media+) — ancla visual del atardecer
    const q = this.effQuality
    if (q !== 'baja') {
      const c = document.createElement('canvas')
      c.width = 256; c.height = 256
      const ctx = c.getContext('2d')!
      const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
      g.addColorStop(0, 'rgba(255,238,200,1)')
      g.addColorStop(0.12, 'rgba(255,205,140,0.95)')
      g.addColorStop(0.35, 'rgba(255,150,80,0.35)')
      g.addColorStop(1, 'rgba(255,120,60,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 256, 256)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, fog: false,
      }))
      sun.scale.setScalar(190)
      sun.position.set(-560, 210, -280)
      scene.add(sun)
      this.sunSprite = sun
    }
    // v10: nubes a la deriva (alta/ultra)
    if (q === 'alta' || q === 'ultra') {
      const cc = document.createElement('canvas')
      cc.width = 256; cc.height = 128
      const cx = cc.getContext('2d')!
      for (let i = 0; i < 16; i++) {
        const px = 30 + Math.random() * 196
        const py = 40 + Math.random() * 48
        const rg = cx.createRadialGradient(px, py, 4, px, py, 18 + Math.random() * 30)
        rg.addColorStop(0, 'rgba(236,220,205,0.55)')
        rg.addColorStop(1, 'rgba(236,220,205,0)')
        cx.fillStyle = rg
        cx.fillRect(0, 0, 256, 128)
      }
      const ctex = new THREE.CanvasTexture(cc)
      ctex.colorSpace = THREE.SRGBColorSpace
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: ctex, transparent: true, depthWrite: false, fog: false,
          opacity: 0.34 + Math.random() * 0.3,
        }))
        sp.scale.set(180 + Math.random() * 170, 60 + Math.random() * 50, 1)
        sp.position.set(rand(-MAP * 1.2, MAP * 1.2), 150 + Math.random() * 90, rand(-MAP * 1.2, MAP * 1.2))
        scene.add(sp)
        this.clouds.push(sp)
      }
    }
  }

  private buildMapLights(scene: THREE.Scene, eff: string): void {
    const sun = new THREE.DirectionalLight(0xffcf9e, eff === 'baja' ? 1.25 : 1.5)
    sun.position.set(-120, 150, -60)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0x9db8d0, 0x4a4636, eff === 'baja' ? 0.55 : eff === 'media' ? 0.68 : 0.8))
    if (eff !== 'baja') {
      sun.castShadow = true
      const size = eff === 'media' ? 1024 : eff === 'alta' ? 2048 : 4096
      sun.shadow.mapSize.set(size, size)
      const c = sun.shadow.camera
      const span = eff === 'media' ? 90 : 130
      c.left = -span; c.right = span; c.top = span; c.bottom = -span
      c.far = 520
      sun.shadow.bias = -0.0004
    }
    if (eff === 'alta' || eff === 'ultra') {
      // relleno cálido del atardecer para que los muros no queden planos
      const fill = new THREE.DirectionalLight(0xff9a5e, 0.28)
      fill.position.set(140, 90, 120)
      scene.add(fill)
    }
    // muzzle light for the player
    this.muzzle = new THREE.PointLight(0xffd9a0, 0, 24)
    scene.add(this.muzzle)
  }

  /** progressive map build — one chunk per frame during the countdown */
  private enqueueMapBuild(eff: string): void {
    this.buildQueue = [
      () => this.buildTerrain(),
      () => this.buildWater(),
      () => this.buildCity(0),
      () => this.buildCity(1),
      () => this.buildPois(),
      () => this.buildForests(eff),
      () => this.buildVehicles(),
      () => this.buildLoot(),
      () => this.scatterProps(),
      () => this.buildStorm(),
      () => this.finishMapBuild(),
    ]
  }

  private buildTerrain(): void {
    const SEG = 110
    const geo = new THREE.PlaneGeometry(MAP * 2, MAP * 2, SEG, SEG)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const cGrass = new THREE.Color(0x5d7a43)
    const cGrass2 = new THREE.Color(0x6d8a4c)
    const cRock = new THREE.Color(0x7d776e)
    const cSnow = new THREE.Color(0xd8dce2)
    const cSand = new THREE.Color(0xc2ab7e)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = terrainH(x, z)
      pos.setY(i, h)
      // biome blend by height (+ hash noise for texture)
      const n = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * 0.5 + 0.5
      if (h < -1.2) tmp.copy(cSand)
      else if (h > 33) tmp.copy(cSnow)
      else if (h > 13) tmp.copy(cRock).lerp(cSnow, clamp((h - 24) / 12, 0, 1) * 0.5)
      else tmp.copy(cGrass).lerp(cGrass2, n).lerp(cRock, clamp((h - 7) / 8, 0, 0.7))
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    // v10: micro-detalle procedural multiplicado sobre el color por vértice
    // (malla de manchas suaves: mata el aspecto plástico del terreno)
    // v13: Pasto.jpg real del usuario como base — el color por vértice
    // sigue modulando el bioma (verde en pradera, gris en roca, blanco
    // en las cumbres): pasto real con estaciones de altura "gratis".
    // La textura tarda en llegar → se registra con force para sustituir
    // al ruido procedural en cuanto preloadAssets resuelva.
    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96,
    })
    if (this.effQuality !== 'baja') {
      const pasto = getRepoTextures().pasto
      if (pasto) {
        const t = pasto.clone()
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(112, 112)   // 560 m / 112 ≈ baldosa de 5 m
        t.needsUpdate = true
        groundMat.map = t
        groundMat.userData.sharedMap = true
      } else {
        groundMat.map = makeNoiseDetailTexture(72)
        this.texMats.push({ mat: groundMat, kind: 'pasto', rx: 112, ry: 112, force: true })
      }
    }
    const mesh = new THREE.Mesh(geo, groundMat)
    this.mapScene.add(mesh)

    // ocean plane around the island (to the horizon)
    const hiQ = this.effQuality === 'alta' || this.effQuality === 'ultra'
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({
        color: 0x27435c,
        roughness: hiQ ? 0.12 : 0.3,
        metalness: hiQ ? 0.45 : 0.1,
      }),
    )
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -2.2
    this.mapScene.add(ocean)
  }

  private buildWater(): void {
    const hiQ = this.effQuality === 'alta' || this.effQuality === 'ultra'
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3d7a9e,
      roughness: hiQ ? 0.08 : 0.18,
      metalness: hiQ ? 0.5 : 0.25,
      transparent: true, opacity: 0.92,
      emissive: 0x0c2432, emissiveIntensity: hiQ ? 0.22 : 0.35,
    })
    for (const l of LAKES) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(l.r, 36), waterMat)
      w.rotation.x = -Math.PI / 2
      w.position.set(l.x, -0.75, l.z)
      this.mapScene.add(w)
    }
  }

  /** v10: réplicas de la textura Pared con repeats por cubo de tamaño
   *  (compartidas entre edificios: 6 texturas máximo, no una por muro) */
  private wallTexCache = new Map<string, THREE.Texture>()
  private roofTexCache = new Map<string, THREE.Texture>()

  /** material de muro por cubo de tamaño + tinte suave (variación) */
  private cityWallMat(w: number, h: number, seed: number): THREE.MeshStandardMaterial {
    const bw = w < 9 ? 's' : w < 11 ? 'm' : 'l'
    const bh = h < 8 ? 'lo' : h < 12 ? 'mi' : 'ta'
    const rx = bw === 's' ? 2.2 : bw === 'm' ? 3.2 : 4.2
    const ry = bh === 'lo' ? 1.8 : bh === 'mi' ? 2.8 : 4.0
    const tints = [0xffffff, 0xece6d9, 0xdcd5c6, 0xd2cbc0]
    const tint = tints[seed % tints.length]
    const repo = getRepoTextures()
    if (repo.pared) {
      let tex = this.wallTexCache.get(`${bw}${bh}`)
      if (!tex) {
        tex = repo.pared.clone()
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(rx, ry)
        tex.needsUpdate = true
        this.wallTexCache.set(`${bw}${bh}`, tex)
      }
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, color: tint })
      mat.userData.sharedMap = true
      return mat
    }
    // sin textura aún → material neutro registrado para parcheo en vivo
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a8f7d, roughness: 0.92 })
    this.texMats.push({ mat, kind: 'wall', rx, ry })
    return mat
  }

  /** material de tejado/losa por cubo (Piso con repeat propio) */
  private cityRoofMat(w: number, d: number): THREE.MeshStandardMaterial {
    const bk = w < 11 && d < 11 ? 's' : 'l'
    const r = bk === 's' ? 2.4 : 3.6
    const repo = getRepoTextures()
    if (repo.piso) {
      let tex = this.roofTexCache.get(bk)
      if (!tex) {
        tex = repo.piso.clone()
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(r, r)
        tex.needsUpdate = true
        this.roofTexCache.set(bk, tex)
      }
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
      mat.userData.sharedMap = true
      return mat
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.95 })
    this.texMats.push({ mat, kind: 'roof', rx: r, ry: r })
    return mat
  }

  /** building material set — the user's own Pared1/Piso1 textures.
   *  v9.1: si aún no han llegado (BR recién abierto), se registran y se
   *  parchean en vivo con applyRepoTexToBr() — el jugador está en la isla
   *  del lobby mientras tanto, así que nunca ve los muros sin textura */
  private buildingMats(): { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial } {
    const repo = getRepoTextures()
    const pared = repo.pared ?? null
    const piso = repo.piso ?? null
    if (pared) { pared.wrapS = pared.wrapT = THREE.RepeatWrapping }
    if (piso) { piso.wrapS = piso.wrapT = THREE.RepeatWrapping }
    const wall = new THREE.MeshStandardMaterial(
      pared ? { map: pared, roughness: 0.92 } : { color: 0x9a8f7d, roughness: 0.92 },
    )
    const roof = new THREE.MeshStandardMaterial(
      piso ? { map: piso, roughness: 0.95 } : { color: 0x6b6257, roughness: 0.95 },
    )
    // el mapa es de la textura COMPARTIDA (caché global): no liberarla al salir
    wall.userData.sharedMap = true
    roof.userData.sharedMap = true
    this.texMats.push({ mat: wall, kind: 'wall', rx: 2.4, ry: 1.9 }, { mat: roof, kind: 'roof', rx: 2.4, ry: 2.4 })
    return { wall, roof }
  }

  /** v9.1: aplica Pared/Piso a los materiales creados sin textura
   *  (v10: clona por repeat — cada cubo de tamaño conserva su escala) */
  private applyRepoTexToBr(): boolean {
    const repo = getRepoTextures()
    if (!repo.pared || !repo.piso) return false
    const src = (kind: string): THREE.Texture | null =>
      kind === 'wall' ? repo.pared
      : kind === 'roof' ? repo.piso
      : kind === 'pasto' ? repo.pasto
      : kind === 'arena' ? repo.arena
      : kind === 'asfalto' ? repo.asfalto
      : kind === 'concreto' ? repo.concreto
      : kind === 'roca' ? repo.roca
      : kind === 'contenedor' ? repo.contenedor
      : kind === 'madera' ? repo.madera
      : kind === 'ladrillo' ? repo.ladrillo
      : kind === 'metal' ? repo.metal
      : null
    const cloneCache = new Map<string, THREE.Texture>()
    for (const { mat, kind, rx, ry, force } of this.texMats) {
      if (mat.map && !force) continue
      const base = src(kind)
      if (!base) continue
      const key = `${kind}:${rx}x${ry}`
      let t = cloneCache.get(key)
      if (!t) {
        t = base.clone()
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(rx, ry)
        t.needsUpdate = true
        cloneCache.set(key, t)
      }
      mat.map = t
      mat.color.set(0xffffff)
      mat.userData.sharedMap = true
      mat.needsUpdate = true
    }
    return true
  }

  /** v9.1: al resolver preloadAssets — texturas a los muros y Arbol.glb
   *  a los bosques (con reintentos si la carga seguía en vuelo) */
  private onRepoAssetsReady(): void {
    if (this.disposed) return
    this.applyRepoTexToBr()
    const tree = getTreeTemplate()
    if (tree && this.forestIsProcedural && this.mapScene) this.rebuildForests(tree)
    if ((!getRepoTextures().pared || !getTreeTemplate()) && ++this.repoTexTries < 14) {
      setTimeout(() => this.onRepoAssetsReady(), 700)
    }
  }

  private buildCity(idx: number): void {
    const city = CITIES[idx]
    // ---- shared detail materials ----
    const winGlass = new THREE.MeshStandardMaterial({
      color: 0x1a2230, roughness: 0.35, metalness: 0.3,
      emissive: 0xffb45e, emissiveIntensity: 0.55,
    })
    const winFrame = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.7, metalness: 0.25 })
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95 })
    // v13: Concreto.jpg real en pretiles/losas de los edificios
    this.texMats.push({ mat: concrete, kind: 'concreto', rx: 2.5, ry: 2.5 })
    const roofPropMat = new THREE.MeshStandardMaterial({ color: 0x71706b, roughness: 0.6, metalness: 0.45 })
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 0.8 })
    const awningMat = new THREE.MeshStandardMaterial({ color: 0x8f3b2f, roughness: 0.85, side: THREE.DoubleSide })
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9d988e, roughness: 0.95 })
    // v13: aceras de Concreto.jpg (UVs escaladas por dimensión → repeat 1)
    this.texMats.push({ mat: sidewalkMat, kind: 'concreto', rx: 1, ry: 1 })

    // ---- v10: textured roads (asphalt + lane markings) + sidewalks ----
    // v13: Asfalto.jpg real del usuario — UVs escaladas por dimensión
    // (UNA textura compartida, baldosa de 8 m) + línea discontinua
    // central como malla aparte (la textura del usuario no trae marcas).
    // Si la textura aún no llegó: canvas clásico y parche force al llegar.
    const roadMat = new THREE.MeshStandardMaterial({ roughness: 0.94 })
    const repoAsphalt = getRepoTextures().asfalto
    if (repoAsphalt) {
      repoAsphalt.wrapS = repoAsphalt.wrapT = THREE.RepeatWrapping
      repoAsphalt.repeat.set(1, 1)
      roadMat.map = repoAsphalt
      roadMat.color.set(0xffffff)
      roadMat.userData.sharedMap = true
    } else {
      const canvasAsphalt = makeAsphaltTexture()
      roadMat.map = canvasAsphalt
      roadMat.userData.sharedMap = true
      this.texMats.push({ mat: roadMat, kind: 'asfalto', rx: 1, ry: 1, force: true })
    }
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8cf6a })
    const road = (w: number, d: number, x: number, z: number, ry: number): void => {
      const geo = new THREE.PlaneGeometry(w, d)
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 8), uv.getY(i) * (d / 8))
      const r = new THREE.Mesh(geo, roadMat)
      r.rotation.x = -Math.PI / 2
      r.rotation.z = ry
      r.position.set(x, terrainH(x, z) + 0.05, z)
      this.mapScene.add(r)
      // línea discontinua central (solo con la textura del usuario: el
      // canvas clásico ya la trae horneada)
      if (repoAsphalt) {
        const alongZ = ry !== 0 ? w >= d : w < d
        const len = alongZ ? d : w
        const dashGeos: THREE.BufferGeometry[] = []
        for (let s = -len / 2 + 3; s <= len / 2 - 3; s += 7) {
          const g = new THREE.PlaneGeometry(alongZ ? 0.18 : 2.2, alongZ ? 2.2 : 0.18)
          g.rotateX(-Math.PI / 2)
          g.translate(alongZ ? 0 : s, 0, alongZ ? s : 0)
          dashGeos.push(g)
        }
        if (dashGeos.length) {
          const merged = mergeGeometries(dashGeos, false)!
          const dashes = new THREE.Mesh(merged, dashMat)
          dashes.renderOrder = 2
          dashes.position.set(x, terrainH(x, z) + 0.07, z)
          this.mapScene.add(dashes)
        }
      }
    }
    const half = 3 * city.r / 2
    road(half, 7, city.x, city.z, 0)
    road(7, half, city.x, city.z, 0)
    road(half, 7, city.x, city.z, Math.PI / 2)
    // sidewalks flanking the two main avenues
    // v13: Concreto.jpg real (UVs escaladas por dimensión del bordillo)
    const swTile = (geo: THREE.BoxGeometry, w: number, d: number): THREE.BoxGeometry => {
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (d / 4))
      return geo
    }
    for (const off of [-4.6, 4.6]) {
      const swA = new THREE.Mesh(swTile(new THREE.BoxGeometry(half, 0.16, 1.7), half, 1.7), sidewalkMat)
      swA.position.set(city.x, terrainH(city.x, city.z + off) + 0.12, city.z + off)
      swA.receiveShadow = true
      this.mapScene.add(swA)
      const swB = new THREE.Mesh(swTile(new THREE.BoxGeometry(1.7, 0.16, half), 1.7, half), sidewalkMat)
      swB.position.set(city.x + off, terrainH(city.x + off, city.z) + 0.12, city.z)
      swB.receiveShadow = true
      this.mapScene.add(swB)
    }

    // ---- buildings: 11-13 per city, richly detailed ----
    // v11.2: denser cities (18 per city) — the island read as "empty" before
    const placed: { x: number; z: number; w: number; d: number }[] = []
    let tries = 0
    while (placed.length < 18 && tries < 420) {
      tries++
      const w = wrand(7, 13), d = wrand(7, 13)
      const ang = wrand(0, Math.PI * 2)
      const rr = wrand(6, city.r - 10)
      const x = city.x + Math.cos(ang) * rr
      const z = city.z + Math.sin(ang) * rr
      if (Math.hypot(x - city.x, z - city.z) < 11) continue    // keep the crossroads clear
      if (placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.z - z) < (p.d + d) / 2 + 4)) continue
      placed.push({ x, z, w, d })

      const h = wrand(5, 17)
      const gy = terrainH(x, z)
      this.buildDetailedBuilding(x, z, w, d, h, gy, placed.length, {
        winGlass, winFrame, concrete, roofPropMat, doorMat, awningMat,
      })

      // street lamp glow near the door
      if (placed.length % 3 === 0) {
        const lamp = new THREE.PointLight(0xffb45e, 8, 16)
        lamp.position.set(x + w / 2 + 1.5, gy + 3.4, z)
        this.mapScene.add(lamp)
      }
    }

    // sidewalk props: kiosks + containers (cover)
    // v13: contenedor corrugado del usuario (gris azulado teñido)
    const contMat = new THREE.MeshStandardMaterial({ color: 0x8a95a0, roughness: 0.7, metalness: 0.3 })
    this.texMats.push({ mat: contMat, kind: 'contenedor', rx: 2.2, ry: 1.2 })
    for (let i = 0; i < 14; i++) {
      const ang = wrand(0, Math.PI * 2)
      const rr = wrand(10, city.r - 6)
      const x = city.x + Math.cos(ang) * rr
      const z = city.z + Math.sin(ang) * rr
      const gy = terrainH(x, z)
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 6.2), contMat)
      c.position.set(x, gy + 1.2, z)
      c.rotation.y = wrnd() < 0.5 ? 0 : Math.PI / 2
      c.castShadow = true
      this.mapScene.add(c)
      this.aabbs.push({
        minX: x - 1.4, maxX: x + 1.4, minZ: z - 3.2, maxZ: z + 3.2, h: gy + 2.4,
      })
    }
  }

  /** v10: edificio urbano detallado — muros con Pared por cubo de tamaño,
   *  bandas de forjado, ventanas ENMARCADAS (fusionadas: 2 draw calls),
   *  puerta con escalón, balcones, toldos de tienda y azotea con depósito /
   *  climatizadora / antena. La colisión sigue siendo la caja principal. */
  private buildDetailedBuilding(
    x: number, z: number, w: number, d: number, h: number, gy: number, seed: number,
    mats: {
      winGlass: THREE.MeshStandardMaterial
      winFrame: THREE.MeshStandardMaterial
      concrete: THREE.MeshStandardMaterial
      roofPropMat: THREE.MeshStandardMaterial
      doorMat: THREE.MeshStandardMaterial
      awningMat: THREE.MeshStandardMaterial
    },
  ): void {
    const shop = wrnd() < 0.34
    const floors = Math.max(1, Math.floor(h / 4.2))
    const floorH = h / floors

    // main box (collision)
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.cityWallMat(w, h, seed))
    b.position.set(x, gy + h / 2, z)
    b.castShadow = true
    b.receiveShadow = true
    this.mapScene.add(b)

    // roof slab + parapet
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), this.cityRoofMat(w, d))
    roof.position.set(x, gy + h + 0.17, z)
    roof.castShadow = true
    this.mapScene.add(roof)
    const parGeos: THREE.BufferGeometry[] = []
    for (const [ox, oz, sw, sd] of [
      [0, d / 2, w, 0.35], [0, -d / 2, w, 0.35], [w / 2, 0, 0.35, d], [-w / 2, 0, 0.35, d],
    ] as const) {
      const g = new THREE.BoxGeometry(sw, 0.85, sd)
      g.translate(x + ox, gy + h + 0.6, z + oz)
      parGeos.push(g)
    }

    // floor bands (slabs between floors) + balcony slabs
    const slabGeos: THREE.BufferGeometry[] = []
    for (let f = 1; f <= floors; f++) {
      const g = new THREE.BoxGeometry(w + 0.25, 0.24, d + 0.25)
      g.translate(x, gy + f * floorH - 0.12, z)
      slabGeos.push(g)
    }
    const hasBalconies = h > 8.5 && wrnd() < 0.6
    if (hasBalconies) {
      const bFaces = wrnd() < 0.5 ? [-1, 1] : [1, -1]
      for (const s of bFaces) {
        for (let f = 1; f < floors; f++) {
          const bg = new THREE.BoxGeometry(w * 0.5, 0.16, 1.05)
          bg.translate(x, gy + f * floorH + 0.08, z + s * (d / 2 + 0.55))
          slabGeos.push(bg)
          const rail = new THREE.BoxGeometry(w * 0.5, 0.55, 0.09)
          rail.translate(x, gy + f * floorH + 0.42, z + s * (d / 2 + 1.05))
          slabGeos.push(rail)
        }
      }
    }

    // windows: framed + emissive glass on ±z AND ±x faces (merged → 2 meshes)
    const frameGeos: THREE.BufferGeometry[] = []
    const glassGeos: THREE.BufferGeometry[] = []
    for (let f = 0; f < floors; f++) {
      const wy = gy + 2.1 + f * floorH
      for (const s of [-1, 1]) {
        const fr = new THREE.BoxGeometry(w * 0.74, 1.4, 0.28)
        fr.translate(x, wy, z + s * (d / 2 + 0.08))
        frameGeos.push(fr)
        const gl = new THREE.BoxGeometry(w * 0.6, 1.05, 0.2)
        gl.translate(x, wy, z + s * (d / 2 + 0.16))
        glassGeos.push(gl)
        const fr2 = new THREE.BoxGeometry(0.28, 1.4, d * 0.62)
        fr2.translate(x + s * (w / 2 + 0.08), wy, z)
        frameGeos.push(fr2)
        const gl2 = new THREE.BoxGeometry(0.2, 1.05, d * 0.5)
        gl2.translate(x + s * (w / 2 + 0.16), wy, z)
        glassGeos.push(gl2)
      }
    }

    // door + stoop on the face towards the city center
    const toCenter = z >= CITIES[0].z ? 1 : -1
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.3), mats.doorMat)
    door.position.set(x, gy + 1.15, z + toCenter * (d / 2 + 0.12))
    door.castShadow = true
    this.mapScene.add(door)
    const stoop = new THREE.BoxGeometry(2.1, 0.18, 1.1)
    stoop.translate(x, gy + 0.09, z + toCenter * (d / 2 + 0.62))
    slabGeos.push(stoop)

    // awning over the door for shops
    if (shop) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.6), mats.awningMat)
      aw.position.set(x, gy + 2.75, z + toCenter * (d / 2 + 0.85))
      aw.rotation.x = toCenter * 0.18
      aw.castShadow = true
      this.mapScene.add(aw)
    }

    // rooftop props: water tank / AC unit + antenna (merged)
    const propGeos: THREE.BufferGeometry[] = []
    const tank = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10)
    tank.translate(x + w * 0.28, gy + h + 1.3, z + d * 0.26)
    propGeos.push(tank)
    const ac = new THREE.BoxGeometry(1.15, 0.8, 0.95)
    ac.translate(x - w * 0.3, gy + h + 0.75, z - d * 0.22)
    propGeos.push(ac)
    const mast = new THREE.CylinderGeometry(0.06, 0.09, 3.6 + wrnd() * 2.4, 6)
    mast.translate(x - w * 0.05, gy + h + 2.4, z + d * 0.05)
    propGeos.push(mast)

    // merge + add (few draw calls per building)
    const mergeAdd = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean): void => {
      if (!geos.length) return
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) return
      const m = new THREE.Mesh(merged, mat)
      m.castShadow = shadow
      this.mapScene.add(m)
    }
    mergeAdd(parGeos, mats.concrete, false)
    mergeAdd(slabGeos, mats.concrete, true)
    mergeAdd(frameGeos, mats.winFrame, false)
    mergeAdd(glassGeos, mats.winGlass, false)
    mergeAdd(propGeos, mats.roofPropMat, true)

    this.aabbs.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: gy + h })
  }

  private buildPois(): void {
    const mats = this.buildingMats()
    const winGlass = new THREE.MeshStandardMaterial({
      color: 0x1a2230, roughness: 0.35, metalness: 0.3,
      emissive: 0xffb45e, emissiveIntensity: 0.5,
    })
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.9 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x707a82, roughness: 0.5, metalness: 0.6 })
    for (const poi of POIS) {
      const count = poi.name === 'SERENE LAKE' ? 4 : 6
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + wrand(-0.4, 0.4)
        const rr = wrand(6, poi.r - 4)
        const x = poi.x + Math.cos(ang) * rr
        const z = poi.z + Math.sin(ang) * rr
        const gy = terrainH(x, z)
        if (gy < -0.8) continue    // don't build in the water
        const w = wrand(5, 8), d = wrand(5, 8), h = wrand(3.2, 5.2)
        // main box with the user's Pared texture
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall)
        b.position.set(x, gy + h / 2, z)
        b.castShadow = true
        b.receiveShadow = true
        this.mapScene.add(b)
        // v10: pitched roof (two tilted Piso slabs + ridge)
        const slope = 0.62
        const rH = Math.hypot(w / 2 + 0.55, 1.15)
        for (const s of [-1, 1]) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(rH, 0.16, d + 1.0), mats.roof)
          slab.position.set(x + s * (w / 4 + 0.22), gy + h + 0.62, z)
          slab.rotation.z = s * slope
          slab.castShadow = true
          this.mapScene.add(slab)
        }
        // gable ends (triangles read as boxes for cheapness — chimney instead)
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), woodMat)
        chimney.position.set(x + w * 0.28, gy + h + 1.15, z - d * 0.2)
        chimney.castShadow = true
        this.mapScene.add(chimney)
        // door + lit window
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.22), woodMat)
        door.position.set(x, gy + 1.0, z + d / 2 + 0.1)
        this.mapScene.add(door)
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.2), winGlass)
        win.position.set(x + w * 0.25, gy + 1.9, z + d / 2 + 0.12)
        this.mapScene.add(win)
        // small porch slab
        const porch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.2), woodMat)
        porch.position.set(x, gy + 0.07, z + d / 2 + 0.7)
        porch.receiveShadow = true
        this.mapScene.add(porch)
        this.aabbs.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: gy + h })
      }
      // ---- POI-specific landmarks (v10) ----
      if (poi.name === 'MILL FARM') {
        // grain silo + barn door frame
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 7.5, 14), mats.wall)
        silo.position.set(poi.x + 9, terrainH(poi.x + 9, poi.z) + 3.75, poi.z - 6)
        silo.castShadow = true
        this.mapScene.add(silo)
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.4, 14), metalMat)
        cap.position.set(poi.x + 9, terrainH(poi.x + 9, poi.z) + 8.2, poi.z - 6)
        cap.castShadow = true
        this.mapScene.add(cap)
        this.aabbs.push({ minX: poi.x + 7, maxX: poi.x + 11, minZ: poi.z - 8, maxZ: poi.z - 4, h: terrainH(poi.x + 9, poi.z) + 7.5 })
      } else if (poi.name === 'SERENE LAKE') {
        // wooden pier over the water
        const px = poi.x, pz = poi.z + 14
        for (let s = 0; s < 6; s++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 2.0), woodMat)
          plank.position.set(px, -0.35, pz + s * 2.0)
          plank.castShadow = true
          this.mapScene.add(plank)
        }
        for (const [ox, oz] of [[-0.85, 1], [0.85, 1], [-0.85, 9], [0.85, 9]] as const) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8), woodMat)
          post.position.set(px + ox, -1.2, pz + oz)
          this.mapScene.add(post)
        }
      } else if (poi.name === 'PUMP STATION') {
        // two horizontal fuel tanks + pipe
        for (const off of [-4.5, 4.5]) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7, 12), metalMat)
          tank.rotation.z = Math.PI / 2
          tank.position.set(poi.x + off, terrainH(poi.x + off, poi.z) + 1.7, poi.z)
          tank.castShadow = true
          this.mapScene.add(tank)
          this.aabbs.push({ minX: poi.x + off - 3.6, maxX: poi.x + off + 3.6, minZ: poi.z - 1.6, maxZ: poi.z + 1.6, h: terrainH(poi.x + off, poi.z) + 3.2 })
        }
      } else if (poi.name === 'RIDGE COMPOUND') {
        // watchtower
        const ty = terrainH(poi.x, poi.z)
        for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), woodMat)
          leg.position.set(poi.x + ox, ty + 3.5, poi.z + oz)
          leg.castShadow = true
          this.mapScene.add(leg)
        }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), woodMat)
        deck.position.set(poi.x, ty + 7.0, poi.z)
        deck.castShadow = true
        this.mapScene.add(deck)
        const hut = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 3.0), mats.wall)
        hut.position.set(poi.x, ty + 8.2, poi.z)
        hut.castShadow = true
        this.mapScene.add(hut)
      } else if (poi.name === 'SOUTH DOCKS') {
        // cargo crane silhouette + stacked crates
        const cy = terrainH(poi.x, poi.z)
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), metalMat)
          leg.position.set(poi.x + s * 3.2, cy + 4.5, poi.z + 4)
          leg.castShadow = true
          this.mapScene.add(leg)
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 0.6), metalMat)
        beam.position.set(poi.x, cy + 9, poi.z + 4)
        beam.castShadow = true
        this.mapScene.add(beam)
      }
    }
  }

  /** v9.1: bosques con Arbol.glb del usuario (horneado por material, ~4 draw
   *  calls) si la plantilla está lista; si no, conos procedurales que se
   *  reemplazan en cuanto llega (onRepoAssetsReady → rebuildForests) */
  private buildForests(eff: string): void {
    // clustered woods read as forests from a distance + scattered singles
    // v11.2: fuller island (+40 % trees)
    const count = eff === 'baja' ? 70 : eff === 'media' ? 120 : 160
    const spots = this.pickTreeSpots(count)
    this.trees = spots
    const tree = getTreeTemplate()
    if (tree) {
      this.bakeGlbForests(tree, spots)
      return
    }
    this.forestIsProcedural = true
    // instanced trunks + cones (fallback)
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.4, 6)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d452c, roughness: 0.95 })
    const leafGeo = new THREE.ConeGeometry(2.1, 5.2, 8)
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a30, roughness: 0.9 })
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length)
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const v = new THREE.Vector3()
    spots.forEach((t, i) => {
      const gy = terrainH(t.x, t.z)
      const sc = wrand(0.8, 1.35)
      v.set(t.x, gy + 1.7 * sc, t.z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), wrand(0, Math.PI * 2))
      s.set(sc, sc, sc)
      m.compose(v, q, s)
      trunks.setMatrixAt(i, m)
      v.set(t.x, gy + (3.4 + 2.0) * sc, t.z)
      m.compose(v, q, s)
      leaves.setMatrixAt(i, m)
    })
    leaves.castShadow = eff !== 'baja'
    this.mapScene.add(trunks, leaves)
    this.procForestMeshes.push(trunks, leaves)
  }

  /** puntos de bosque: 8 macizos + dispersos, fuera de ciudades/POIs/agua */
  private pickTreeSpots(count: number): TreeCol[] {
    const clusters: [number, number][] = [
      [-30, -60], [42, 8], [-85, 90], [95, 20], [-10, 60], [60, 85], [-95, -35], [15, -85],
    ]
    const spots: TreeCol[] = []
    let tries = 0
    while (spots.length < count && tries < count * 8) {
      tries++
      let x: number, z: number
      if (wrnd() < 0.78) {
        const c = clusters[Math.floor(wrand(0, clusters.length))]
        x = c[0] + wrand(-16, 16)
        z = c[1] + wrand(-16, 16)
      } else {
        x = wrand(-MAP + 8, MAP - 8)
        z = wrand(-MAP + 8, MAP - 8)
      }
      const h = terrainH(x, z)
      if (h < -0.6 || h > 20) continue
      if (CITIES.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 4)) continue
      if (POIS.some(p => Math.hypot(x - p.x, z - p.z) < p.r)) continue
      if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 3.2)) continue
      spots.push({ x, z, r: 0.55 })
    }
    return spots
  }

  /** hornea los árboles GLB en una geometría por material (como el juego
   *  principal: sin instancing+alphaTest, robusto en cualquier GPU) */
  private bakeGlbForests(tree: TreeTemplate, spots: TreeCol[]): void {
    const s = 8.6 / tree.rawHeight
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const pos = new THREE.Vector3()
    for (const part of tree.parts) {
      const geos: THREE.BufferGeometry[] = []
      for (const t of spots) {
        pos.set(t.x, terrainH(t.x, t.z) - 0.08, t.z)
        q.setFromAxisAngle(UP_AXIS, wrand(0, Math.PI * 2))
        const v = wrand(0.85, 1.3)
        sc.set(s * v, s * v, s * v)
        m.compose(pos, q, sc)
        const g = part.geo.clone()
        g.applyMatrix4(m)
        geos.push(g)
      }
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, part.mat)
      // material de la caché compartida: geometría propia (se libera al salir)
      mesh.userData.sharedMat = true
      mesh.frustumCulled = false   // geometría gigante: no dejar que el frustum la descarte
      this.mapScene.add(mesh)
      this.glbForestMeshes.push(mesh)
    }
    this.forestIsProcedural = false
  }

  /** sustituye los bosques procedurales por Arbol.glb cuando llega tarde */
  private rebuildForests(tree: TreeTemplate): void {
    if (!this.forestIsProcedural || !this.trees.length) return
    for (const mesh of this.procForestMeshes) {
      this.mapScene.remove(mesh)
      mesh.geometry.dispose()
    }
    this.procForestMeshes = []
    this.bakeGlbForests(tree, this.trees)
  }

  /** v11.2: the countryside gets rocks, crates and barrels — the island
   *  read as empty outside the two cities. Deterministic (seeded). */
  private scatterProps(): void {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d776e, roughness: 0.95 })
    const rockMat2 = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.98 })
    // v13: Roca.jpg real del usuario en los pedregales de la isla
    this.texMats.push({ mat: rockMat, kind: 'roca', rx: 2, ry: 2 }, { mat: rockMat2, kind: 'roca', rx: 1.5, ry: 1.5 })
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.9 })
    // v13: cajas de munición con Madera.jpg real del usuario
    this.texMats.push({ mat: crateMat, kind: 'madera', rx: 1.2, ry: 1.2 })
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3f5a3f, roughness: 0.7, metalness: 0.3 })
    const barrelMat2 = new THREE.MeshStandardMaterial({ color: 0x7a3b2f, roughness: 0.7, metalness: 0.3 })
    const inCity = (x: number, z: number): boolean =>
      CITIES.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 6)
    // rocks — decorative boulders that fill the empty hills
    for (let i = 0; i < 60; i++) {
      const x = wrand(-MAP + 8, MAP - 8)
      const z = wrand(-MAP + 8, MAP - 8)
      if (inCity(x, z)) continue
      const gy = terrainH(x, z)
      if (gy < -0.4 || gy > 24) continue
      const sc = wrand(0.7, 2.8)
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(sc, 0),
        wrnd() < 0.5 ? rockMat : rockMat2,
      )
      rock.position.set(x, gy + sc * 0.32, z)
      rock.rotation.set(wrand(0, 3), wrand(0, Math.PI * 2), wrand(0, 3))
      rock.castShadow = true
      rock.receiveShadow = true
      this.mapScene.add(rock)
    }
    // supply crates — cover + combat spots (with collision)
    for (let i = 0; i < 34; i++) {
      const x = wrand(-MAP + 10, MAP - 10)
      const z = wrand(-MAP + 10, MAP - 10)
      const gy = terrainH(x, z)
      if (gy < -0.3 || gy > 20) continue
      const stack = wrnd() < 0.4 ? 2 : 1
      for (let k = 0; k < stack; k++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), crateMat)
        c.position.set(x + wrand(-0.15, 0.15), gy + 0.65 + k * 1.3, z + wrand(-0.15, 0.15))
        c.rotation.y = wrand(0, Math.PI)
        c.castShadow = true
        this.mapScene.add(c)
      }
      this.aabbs.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8, h: gy + 1.3 * stack })
    }
    // barrels — road checkpoints and fuel depots (with collision)
    for (let i = 0; i < 24; i++) {
      const x = wrand(-MAP + 10, MAP - 10)
      const z = wrand(-MAP + 10, MAP - 10)
      const gy = terrainH(x, z)
      if (gy < -0.3 || gy > 20) continue
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10),
        wrnd() < 0.5 ? barrelMat : barrelMat2,
      )
      b.position.set(x, gy + 0.55, z)
      b.castShadow = true
      this.mapScene.add(b)
      this.aabbs.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, h: gy + 1.1 })
    }
    // fence posts along random field lines — reads as inhabited land
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95 })
    for (let f = 0; f < 14; f++) {
      const fx = wrand(-MAP + 16, MAP - 16)
      const fz = wrand(-MAP + 16, MAP - 16)
      if (terrainH(fx, fz) < -0.2 || inCity(fx, fz)) continue
      const ang = wrand(0, Math.PI)
      const len = wrand(14, 30)
      for (let k = -len / 2; k <= len / 2; k += 2.4) {
        const x = fx + Math.cos(ang) * k
        const z = fz + Math.sin(ang) * k
        const gy = terrainH(x, z)
        if (gy < -0.2) continue
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.16), postMat)
        post.position.set(x, gy + 0.62, z)
        post.castShadow = true
        this.mapScene.add(post)
      }
    }
  }

  private buildVehicles(): void {
    const bodyColors = [0x9a3b2f, 0x2f5a7a, 0x7a6a2f, 0x3f5a3f, 0x5a4a5f, 0x8f8f8f]
    const spots: [number, number][] = []
    for (const c of CITIES) {
      spots.push([c.x + wrand(-24, 24), c.z + wrand(-24, 24)])
      spots.push([c.x + wrand(-24, 24), c.z + wrand(-24, 24)])
      spots.push([c.x + wrand(-26, 26), c.z + wrand(-26, 26)])   // v11.2: more cars
    }
    for (const poi of POIS) spots.push([poi.x + wrand(-10, 10), poi.z + wrand(6, 12)])
    spots.push([wrand(-70, 70), wrand(-70, 70)])
    spots.push([wrand(-70, 70), wrand(-70, 70)])
    spots.push([wrand(-100, 100), wrand(-100, 100)])
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.9 })
    spots.forEach((s, i) => {
      // v11.2: never spawn a car wedged inside geometry — nudge until the
      // spot is clear (this is why cars "didn't work": blocked spawns)
      let [x, z] = s
      if (terrainH(x, z) < -0.6) return
      for (let k = 0; k < 12 && this.blocked(x, z, 2.2); k++) {
        x = s[0] + wrand(-16, 16)
        z = s[1] + wrand(-16, 16)
        if (terrainH(x, z) < -0.6) { x = s[0]; z = s[1] }
      }
      if (this.blocked(x, z, 2.0)) return   // truly no room → skip this car
      const gy = terrainH(x, z)
      const group = new THREE.Group()
      const color = bodyColors[i % bodyColors.length]
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 })
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 4.3), bodyMat)
      body.position.y = 0.78
      body.castShadow = true
      group.add(body)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 2.0), new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.25, metalness: 0.5 }))
      cabin.position.set(0, 1.42, -0.3)
      group.add(cabin)
      for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]] as const) {
        const w = new THREE.Mesh(wheelGeo, wheelMat)
        w.rotation.z = Math.PI / 2
        w.position.set(wx, 0.42, wz)
        group.add(w)
      }
      // headlights
      const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffdf9e, emissiveIntensity: 1.6 })
      for (const sx of [-0.6, 0.6]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.06), hlMat)
        hl.position.set(sx, 0.82, 2.16)
        group.add(hl)
      }
      group.position.set(x, gy, z)
      group.rotation.y = wrand(0, Math.PI * 2)
      this.mapScene.add(group)
      this.vehicles.push({ x, z, yaw: group.rotation.y, speed: 0, group, occupied: false, wheelPhase: 0 })
    })
  }

  // ----------------------------------------------------------
  // LOOT
  // ----------------------------------------------------------
  private buildLoot(): void {
    const addSpot = (x: number, z: number, kind: LootSpot['kind'], weapon: WeaponId, rarity = 0): void => {
      const gy = terrainH(x, z)
      if (gy < -0.8) return
      this.loot.push({ x, z, kind, weapon, rarity, taken: false, mesh: null, item: null })
    }
    // v10: las armas del BR son EXACTAMENTE las del modo normal (mismo
    // arsenal de shared.ts); cada una tira su rareza estilo Fortnite
    const rollWeapon = (minTier = 0): { wid: WeaponId; rar: number } => ({
      wid: WEAPON_POOL[Math.floor(wrand(0, WEAPON_POOL.length))],
      rar: rollBrRarity(minTier, wrnd),
    })
    // cities: dense floor loot
    for (const c of CITIES) {
      for (let i = 0; i < 14; i++) {
        const ang = wrand(0, Math.PI * 2)
        const rr = wrand(5, c.r - 5)
        const x = c.x + Math.cos(ang) * rr
        const z = c.z + Math.sin(ang) * rr
        const roll = wrnd()
        if (roll < 0.5) {
          const { wid, rar } = rollWeapon()
          addSpot(x, z, 'weapon', wid, rar)
        } else if (roll < 0.75) addSpot(x, z, 'ammo', 'p9')
        else addSpot(x, z, 'med', 'p9')
      }
      // 2 supply crates per city — weapon guaranteed RARE+ (Fortnite chest rule)
      for (let i = 0; i < 3; i++) {
        const { wid, rar } = rollWeapon(2)
        addSpot(c.x + wrand(-20, 20), c.z + wrand(-20, 20), 'crate', wid, rar)
      }
    }
    // POIs
    for (const p of POIS) {
      for (let i = 0; i < 4; i++) {
        const roll = wrnd()
        if (roll < 0.45) {
          const { wid, rar } = rollWeapon()
          addSpot(p.x + wrand(-p.r, p.r), p.z + wrand(-p.r, p.r), 'weapon', wid, rar)
        } else if (roll < 0.75) addSpot(p.x + wrand(-p.r, p.r), p.z + wrand(-p.r, p.r), 'ammo', 'p9')
        else addSpot(p.x + wrand(-p.r, p.r), p.z + wrand(-p.r, p.r), 'med', 'p9')
      }
    }
    // scattered countryside loot (v12: + material pallets)
    for (let i = 0; i < 22; i++) {
      addSpot(wrand(-MAP + 10, MAP - 10), wrand(-MAP + 10, MAP - 10),
        wrnd() < 0.5 ? 'ammo' : 'med', 'p9')
    }
    // v12: material pallets — the building economy's floor loot
    for (let i = 0; i < 26; i++) {
      addSpot(wrand(-MAP + 10, MAP - 10), wrand(-MAP + 10, MAP - 10), 'mats', 'p9')
    }
    for (const p of POIS) {
      addSpot(p.x + wrand(-p.r * 0.7, p.r * 0.7), p.z + wrand(-p.r * 0.7, p.r * 0.7), 'mats', 'p9')
    }
    // meshes (lazy built once the map is active — they belong to mapScene)
    for (const s of this.loot) s.mesh = this.buildLootMesh(s)
  }

  private buildLootMesh(s: LootSpot): THREE.Group {
    const group = new THREE.Group()
    const gy = terrainH(s.x, s.z)
    // v12: MATERIAL pallet — wooden slats + straps, reads as build supplies
    if (s.kind === 'mats') {
      const wood = new THREE.MeshStandardMaterial({ color: 0xb08a54, roughness: 0.85 })
      const strap = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.7 })
      for (let i = 0; i < 3; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.85), wood)
        slat.position.set(0, 0.1 + i * 0.17, 0)
        slat.rotation.y = (i % 2) * 0.05
        group.add(slat)
      }
      for (const sx of [-0.42, 0.42]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.9), strap)
        st.position.set(sx, 0.26, 0)
        group.add(st)
      }
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.9, 24),
        new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      )
      glow.rotation.x = -Math.PI / 2
      glow.position.y = 0.04
      group.add(glow)
      group.position.set(s.x, gy, s.z)
      return group
    }
    // v10: el color del haz/anillo lo manda la RAREZA del arma
    // (cajas de suministro: ámbar propio; bots/municiones: colores de tipo)
    const rarity = BR_RARITIES[Math.max(0, Math.min(BR_RARITIES.length - 1, s.rarity))]
    const color = s.kind === 'weapon' ? rarity.color
      : s.kind === 'crate' ? 0xf59e0b
        : s.kind === 'med' ? 0x38d9a9 : 0x8f8f5a
    // ground ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05
    group.add(ring)
    // vertical beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.3, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: s.kind === 'weapon' || s.kind === 'crate' ? 0.2 : 0.16, side: THREE.DoubleSide, depthWrite: false }),
    )
    beam.position.y = 3.5
    group.add(beam)
    // v10: doble anillo interior para rarezas altas (se lee desde lejos)
    if ((s.kind === 'weapon' || s.kind === 'crate') && s.rarity >= 3) {
      const ring2 = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1.05, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
      )
      ring2.rotation.x = -Math.PI / 2
      ring2.position.y = 0.06
      group.add(ring2)
    }
    // floating item
    const item = new THREE.Group()
    if (s.kind === 'weapon') {
      // v9.1: el arma real (GLB del usuario) flotando sobre el haz
      const built = buildGLBWeapon(s.weapon) ?? buildWeaponModel(s.weapon)
      const model = built.group
      model.scale.setScalar(1.35)
      item.add(model)
    } else if (s.kind === 'crate') {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x8a6b2f, roughness: 0.8, emissive: 0x7a4f12, emissiveIntensity: 0.5 }),
      )
      item.add(box)
    } else if (s.kind === 'med') {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.34, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
      )
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.03, 0.11),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x7f1d1d, emissiveIntensity: 0.9 }),
      )
      cross.position.y = 0.18
      item.add(box, cross)
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.3, 0.36),
        new THREE.MeshStandardMaterial({ color: 0x6d6d45, roughness: 0.7, metalness: 0.4 }),
      )
      item.add(box)
    }
    item.position.y = 0.85
    group.add(item)
    s.item = item
    group.position.set(s.x, gy, s.z)
    this.mapScene.add(group)
    return group
  }

  /** v9.1: arma GLB flotando (llega tarde el GLB perezoso) */
  private rebuildLootWeaponItem(s: LootSpot): void {
    if (!s.mesh || !s.item) return
    for (const child of [...s.item.children]) {
      s.item.remove(child)
      disposeTree(child)
    }
    const built = buildGLBWeapon(s.weapon) ?? buildWeaponModel(s.weapon)
    const model = built.group
    model.scale.setScalar(1.35)
    s.item.add(model)
  }

  // ----------------------------------------------------------
  // STORM
  // ----------------------------------------------------------
  private buildStorm(): void {
    const geo = new THREE.CylinderGeometry(1, 1, 110, 72, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd93a5e, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false,
    })
    this.stormMesh = new THREE.Mesh(geo, mat)
    this.stormMesh.position.y = 30
    this.mapScene.add(this.stormMesh)
    this.stormR = 230
    this.stormTargetR = 230
    this.stormFromR = 230
    this.stormCX = 0
    this.stormCZ = 0
    // v11: precomputed by the shared match seed (identical everywhere)
    this.stormTargetC = this.stormPlan[0] ?? [0, 0]
    this.stormIdx = 0
    this.stormState = 'wait'
    this.stormTimer = STORM_PHASES[0].wait
  }

  private updateStorm(dt: number): void {
    if (this.phase !== 'live' && this.phase !== 'dead') return
    const ph = STORM_PHASES[Math.min(this.stormIdx, STORM_PHASES.length - 1)]
    this.stormTimer -= dt
    if (this.stormState === 'wait') {
      if (this.stormTimer <= 0) {
        // begin shrinking toward the next radius
        this.stormState = 'shrink'
        this.stormTimer = ph.shrink
        this.stormFromR = this.stormR
        this.stormTargetR = ph.r
        // v11: storm centers come from the seeded plan (same on every client)
        this.stormTargetC = this.stormPlan[Math.min(this.stormIdx + 1, this.stormPlan.length - 1)] ?? this.stormTargetC
        useBr.getState().addFeed('THE STORM IS CLOSING IN', false)
        getAudio().announceDing()
      }
    } else {
      const k = 1 - clamp(this.stormTimer / ph.shrink, 0, 1)
      this.stormR = this.stormFromR + (this.stormTargetR - this.stormFromR) * k
      this.stormCX = this.stormCX + (this.stormTargetC[0] - this.stormCX) * dt * 0.4
      this.stormCZ = this.stormCZ + (this.stormTargetC[1] - this.stormCZ) * dt * 0.4
      if (this.stormTimer <= 0) {
        this.stormIdx++
        this.stormState = 'wait'
        this.stormTimer = STORM_PHASES[Math.min(this.stormIdx, STORM_PHASES.length - 1)].wait
      }
    }
    if (this.stormMesh) {
      this.stormMesh.scale.set(this.stormR, 1, this.stormR)
      this.stormMesh.position.set(this.stormCX, 30, this.stormCZ)
      const mat = this.stormMesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.14 + 0.05 * Math.sin(this.clock * 1.7)
      this.stormMesh.rotation.y += dt * 0.03
    }
    // damage: everyone outside the circle
    this.stormTick += dt
    if (this.stormTick >= 1) {
      this.stormTick = 0
      // player
      if (this.phase === 'live') {
        const d = Math.hypot(this.px - this.stormCX, this.pz - this.stormCZ)
        const inStorm = d > this.stormR
        useBr.getState().set({ inStorm })
        if (inStorm) {
          this.damagePlayer(ph.dps, 'THE STORM')
          getAudio().playerHurt()
        }
      }
      // bots (v11: only the bot leader arbitrates bot deaths)
      if (this.botLeader) {
        for (const b of this.bots) {
          if (!b.alive || !b.landed) continue
          const d = Math.hypot(b.x - this.stormCX, b.z - this.stormCZ)
          if (d > this.stormR) {
            b.hp -= ph.dps * 3.2
            if (b.hp <= 0) this.killBot(b, 'the storm')
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // BOTS
  // ----------------------------------------------------------
  private buildBots(count: number): void {
    // v11: deterministic roster — same seed ⇒ the same names, uniforms,
    // weapons and drop spots on EVERY client (dedicated bot stream, so
    // world-build timing can never desync the two)
    const names = [...SIM_NAMES]
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(brnd() * (i + 1))
      ;[names[i], names[j]] = [names[j], names[i]]
    }
    for (let i = 0; i < count; i++) {
      // drop target: weighted to POIs/cities
      let anchor: { x: number; z: number; r?: number }
      if (brnd() < 0.62) {
        anchor = brnd() < 0.5
          ? CITIES[Math.floor(brand(0, CITIES.length))]
          : { x: brand(-60, 60), z: brand(-60, 60), r: 10 }
      } else {
        anchor = { x: brand(-MAP + 14, MAP - 14), z: brand(-MAP + 14, MAP - 14), r: 10 }
      }
      const dropX = anchor.x + brand(-8, 8)
      const dropZ = anchor.z + brand(-8, 8)
      const b: BrBot = {
        id: i + 1,
        name: names[i % names.length],
        alive: true,
        x: dropX,
        y: 0,
        z: dropZ,
        yaw: brand(0, Math.PI * 2),
        hp: 100,
        weapon: WEAPON_POOL[Math.floor(brand(0, WEAPON_POOL.length))],
        // v10: los operadores también portan armas con rareza (daño escalado)
        rarity: rollBrRarity(0, brnd),
        destX: anchor.x + brand(-8, 8),
        destZ: anchor.z + brand(-8, 8),
        thinkAt: 0,
        nextShotAt: 0,
        accuracy: brand(0.32, 0.6),
        targetBot: -1,
        targetPlayer: false,
        mesh: null,
        rig: null,
        tint: i,
        legPhase: brand(0, 10),
        deadAt: 0,
        dropAt: brand(1, 4),
        landed: false,
        dropX,
        dropZ,
        tx: dropX,
        tz: dropZ,
        tyaw: 0,
        moving: false,
        snapped: false,
        targetOp: null,
      }
      this.bots.push(b)
    }
  }


  private loadSoldier(): void {
    if (this.soldierLoading || this.soldierTemplate) return
    this.soldierLoading = true
    new GLTFLoader().load(
      `${ASSET_BASE}/models/soldier1.glb`,
      gltf => {
        if (this.disposed) return
        try {
          const template = gltf.scene
          const box = new THREE.Box3().setFromObject(template)
          const scale = SOLDIER_HEIGHT / Math.max(0.01, box.max.y - box.min.y)
          template.scale.setScalar(scale)
          template.position.y = -box.min.y * scale
          template.traverse(o => {
            if (!(o instanceof THREE.Mesh)) return
            o.castShadow = this.effQuality !== 'baja'
            o.receiveShadow = false
            o.frustumCulled = false   // la piel se anima: no dejar que el frustum la descarte
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            for (const m of mats) {
              const std = m as THREE.MeshStandardMaterial
              if (!std || std.isMeshStandardMaterial !== true) continue
              // Sketchfab exporta todo como BLEND aunque sea opaco
              if (std.transparent && (std.opacity ?? 1) >= 0.999) {
                std.transparent = false
                std.depthWrite = true
              }
              if (std.map) {
                std.map.colorSpace = THREE.SRGBColorSpace
                std.metalness = Math.min(std.metalness, 0.25)
                std.roughness = Math.min(Math.max(std.roughness, 0.55), 0.92)
                std.envMapIntensity = 0.55
              }
            }
          })
          this.soldierTemplate = template
          // sustituir en cascada los cuerpos low-poly (uno por tick)
          this.swapAllToSoldier()
        } catch (e) {
          console.warn('EMERGENCY STRIKE: no se pudo preparar soldier1.glb para el BR', e)
        }
      },
      undefined,
      () => { /* sin GLB → seguimos con el fallback low-poly */ },
    )
  }

  /** clona el soldado con el uniforme teñido de ESTE operador (FFA) */
  private buildBrSoldier(tintIdx: number): THREE.Object3D | null {
    if (!this.soldierTemplate) return null
    const rig = skeletonClone(this.soldierTemplate)
    const idx = ((tintIdx % BR_TINTS.length) + BR_TINTS.length) % BR_TINTS.length
    const cache = this.tintCache[idx]
    const tint = BR_TINTS[idx]
    rig.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const out = mats.map(orig => {
        if (!TINTABLE_MATS.has(orig.name)) return orig
        const tinted = cache.get(orig)
        if (tinted) return tinted
        const v = orig.clone() as THREE.MeshStandardMaterial
        if (v.color) v.color = new THREE.Color(tint)
        cache.set(orig, v)
        return v
      })
      o.material = Array.isArray(o.material) ? out : out[0]
      o.castShadow = this.effQuality !== 'baja'
      o.frustumCulled = false
    })
    // pose de reposo por si algo va sin animar
    const armL = findBone(rig, /^mixamorigLeftArm_/)
    const armR = findBone(rig, /^mixamorigRightArm_/)
    if (armL) armL.rotation.set(ARM_REST_X, 0, 0)
    if (armR) armR.rotation.set(ARM_REST_X, 0, 0)
    return rig
  }

  /** cuerpo completo de operador: soldado GLB (con arma real agarrada a las
   *  manos por IK de una pasada) o fallback low-poly con arma GLB */
  private buildBotBody(tintIdx: number, weapon: WeaponId): BodyRig {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    const weaponHolder = new THREE.Group()
    const rest = new THREE.Object3D()
    const rig = this.buildBrSoldier(tintIdx)
    if (rig) {
      body.add(rig)
      // pose de APUNTADO a dos manos (calibración del juego principal)
      const armT = findBone(rig, /^mixamorigRightArm_/)
      const armS = findBone(rig, /^mixamorigLeftArm_/)
      const foreT = findBone(rig, /^mixamorigRightForeArm_/)
      const foreS = findBone(rig, /^mixamorigLeftForeArm_/)
      if (armT) armT.rotation.set(SOLDIER_AIM.tArm.x, SOLDIER_AIM.tArm.y, SOLDIER_AIM.tArm.z)
      if (armS) armS.rotation.set(SOLDIER_AIM.sArm.x, SOLDIER_AIM.sArm.y, SOLDIER_AIM.sArm.z)
      if (foreT) foreT.rotation.set(SOLDIER_AIM.tFore.x, 0, SOLDIER_AIM.tFore.z)
      if (foreS) foreS.rotation.set(SOLDIER_AIM.sFore.x, 0, SOLDIER_AIM.sFore.z)
      const legL = findBone(rig, /^mixamorigLeftUpLeg_/)
      const legR = findBone(rig, /^mixamorigRightUpLeg_/)
      const kneeL = findBone(rig, /^mixamorigLeftLeg_/)
      const kneeR = findBone(rig, /^mixamorigRightLeg_/)
      if (legL) legL.rotation.x = -0.14
      if (legR) legR.rotation.x = 0.1
      if (kneeL) kneeL.rotation.x = 0.16
      if (kneeR) kneeR.rotation.x = 0.06
      body.add(weaponHolder)
      // IK de una sola pasada: manos tras la pose → posición del arma
      const handT = findBone(rig, /^mixamorigRightHand_/)
      const handS = findBone(rig, /^mixamorigLeftHand_/)
      if (handT && handS) {
        handT.updateWorldMatrix(true, false)
        handS.updateWorldMatrix(true, false)
        const v1 = new THREE.Vector3().setFromMatrixPosition(handT.matrixWorld)
        const v2 = new THREE.Vector3().setFromMatrixPosition(handS.matrixWorld)
        body.worldToLocal(v1)
        body.worldToLocal(v2)
        const dir = v2.clone().sub(v1).multiplyScalar(0.8)
        dir.y -= 0.06
        dir.z += 0.85
        dir.normalize()
        weaponHolder.position.copy(v1)
        weaponHolder.position.y += 0.02
        weaponHolder.quaternion.setFromUnitVectors(Z_AXIS, dir)
      } else {
        weaponHolder.position.set(0.22, 1.32, 0.34)
      }
      this.attachRigWeapon(weaponHolder, weapon)
      return {
        root, body, weaponHolder,
        legs: [legL ?? rest, legR ?? rest],
        knees: [kneeL ?? rest, kneeR ?? rest],
        arms: [armS ?? rest, armT ?? rest],
        forearms: [foreS ?? rest, foreT ?? rest],
        usingSoldier: true, tintIdx, weaponId: weapon,
      }
    }
    // ---- fallback low-poly (mientras/lugar donde no hay GLB) ----
    const uniform = BR_TINTS[((tintIdx % BR_TINTS.length) + BR_TINTS.length) % BR_TINTS.length]
    const g = this.buildBotMesh(uniform, 0x2c3642)
    body.add(g)
    const legs = (g as THREE.Group & { _legs?: THREE.Mesh[] })._legs ?? []
    const arms = (g as THREE.Group & { _arms?: THREE.Mesh[] })._arms ?? []
    weaponHolder.position.set(0.2, 1.28, 0.3)
    weaponHolder.rotation.x = -0.06
    body.add(weaponHolder)
    this.attachRigWeapon(weaponHolder, weapon)
    return {
      root, body, weaponHolder,
      legs: [rest, rest], knees: [rest, rest], arms: [rest, rest], forearms: [rest, rest],
      usingSoldier: false, tintIdx, weaponId: weapon,
      pLegs: legs, pArms: arms,
    }
  }

  /** arma real (GLB del usuario) en el soporte; fallback procedural */
  private attachRigWeapon(holder: THREE.Group, weapon: WeaponId): void {
    const built = buildGLBWeapon(weapon) ?? buildWeaponModel(weapon)
    const group = built.group
    group.scale.setScalar(0.95)
    group.rotation.y = Math.PI
    group.position.set(0, 0.06, 0.05)
    holder.add(group)
  }

  /** sustituye el arma del soporte (llega el GLB perezoso) */
  private rebuildRigWeapon(rig: BodyRig): void {
    if (!rig.weaponHolder.children.length) return
    for (const child of [...rig.weaponHolder.children]) {
      rig.weaponHolder.remove(child)
      disposeTree(child)
    }
    this.attachRigWeapon(rig.weaponHolder, rig.weaponId)
  }

  /** animación de caminar/caída del cuerpo (huesos del soldado o fallback) */
  private animateRig(rig: BodyRig, legPhase: number, moving: boolean): void {
    const swing = moving ? 0.55 : 0
    const sPh = Math.sin(legPhase) * swing
    if (rig.usingSoldier) {
      // piernas: pose base + balanceo; rodillas dobladas en la subida
      rig.legs[0].rotation.x = -0.14 + sPh
      rig.legs[1].rotation.x = 0.1 - sPh
      rig.knees[0].rotation.x = 0.16 + Math.max(0, sPh) * 0.95
      rig.knees[1].rotation.x = 0.06 + Math.max(0, -sPh) * 0.95
      // vaivén de cadera + bote vertical (se lee como humano)
      rig.body.rotation.z = Math.sin(legPhase) * 0.045 * swing
      rig.body.position.y = Math.abs(Math.sin(legPhase)) * 0.03 * swing
      // los brazos siguen en el arma (pose de apuntado) con vaivén leve
      rig.arms[0].rotation.x = SOLDIER_AIM.sArm.x + sPh * 0.05
      rig.arms[1].rotation.x = SOLDIER_AIM.tArm.x - sPh * 0.05
    } else {
      const sw = sPh
      if (rig.pLegs?.[0]) rig.pLegs[0].rotation.x = sw
      if (rig.pLegs?.[1]) rig.pLegs[1].rotation.x = -sw
      if (rig.pArms?.[0]) rig.pArms[0].rotation.x = -sw * 0.6
      if (rig.pArms?.[1]) rig.pArms[1].rotation.x = sw * 0.6
    }
  }

  /** al cargar soldier1.glb: reemplaza los cuerpos low-poly uno a uno */
  private swapAllToSoldier(): void {
    const botsPend = this.bots.filter(b => b.rig && !b.rig.usingSoldier)
    const walkersPend = this.lobbyWalkers.filter(w => !w.rig.usingSoldier)
    const step = (): void => {
      if (this.disposed || !this.soldierTemplate) return
      const b = botsPend.shift()
      if (b && b.rig && !b.rig.usingSoldier) {
        const old = b.rig
        const pos = old.root.position.clone()
        const yaw = old.root.rotation.y
        this.mapScene.remove(old.root)
        disposeTree(old.root)
        b.rig = this.buildBotBody(b.tint, b.weapon)
        b.mesh = b.rig.root
        b.rig.root.position.copy(pos)
        b.rig.root.rotation.y = yaw
        this.mapScene.add(b.rig.root)
      }
      const w = walkersPend.shift()
      if (w && !w.rig.usingSoldier) {
        const old = w.rig
        const pos = old.root.position.clone()
        const yaw = old.root.rotation.y
        this.lobbyScene.remove(old.root)
        disposeTree(old.root)
        w.rig = this.buildBotBody(old.tintIdx, old.weaponId)
        w.rig.root.position.copy(pos)
        w.rig.root.rotation.y = yaw
        this.lobbyScene.add(w.rig.root)
      }
      if (botsPend.length || walkersPend.length) setTimeout(step, 40)
    }
    step()
  }

  /** v9.1: al llegar un GLB de arma → modelos reales en todos los sitios */
  private refreshWeaponModels(): void {
    if (this.disposed) return
    // viewmodel del jugador (si aún era procedural)
    if (this.vmIsProcedural && this.weapon) this.attachViewmodel(this.weapon)
    // manos de bots y caminantes
    for (const b of this.bots) {
      if (b.rig) this.rebuildRigWeapon(b.rig)
    }
    for (const w of this.lobbyWalkers) this.rebuildRigWeapon(w.rig)
    // loot de armas flotando
    for (const s of this.loot) {
      if (!s.taken && s.kind === 'weapon' && s.mesh) this.rebuildLootWeaponItem(s)
    }
  }

  /** low-poly soldier for the fallback body */
  private buildBotMesh(uniform: number, vest: number): THREE.Group {
    const g = new THREE.Group()
    const skin = new THREE.MeshStandardMaterial({ color: 0xb08a60, roughness: 0.85 })
    const uniMat = new THREE.MeshStandardMaterial({ color: uniform, roughness: 0.9 })
    const vestMat = new THREE.MeshStandardMaterial({ color: vest, roughness: 0.8 })
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.26), uniMat)
    torso.position.y = 1.18
    g.add(torso)
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), vestMat)
    vestMesh.position.y = 1.26
    g.add(vestMesh)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.26), skin)
    head.position.y = 1.66
    g.add(head)
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.28), vestMat)
    helmet.position.y = 1.79
    g.add(helmet)
    const legs: THREE.Mesh[] = []
    for (const sx of [-0.11, 0.11]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), uniMat)
      leg.geometry.translate(0, -0.39, 0)
      leg.position.set(sx, 0.82, 0)
      g.add(leg)
      legs.push(leg)
    }
    const arms: THREE.Mesh[] = []
    for (const sx of [-0.3, 0.3]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), uniMat)
      arm.geometry.translate(0, -0.31, 0)
      arm.position.set(sx, 1.42, 0)
      g.add(arm)
      arms.push(arm)
    }
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false })
    // animation handles
    ;(g as THREE.Group & { _legs?: THREE.Mesh[] })._legs = legs
    ;(g as THREE.Group & { _arms?: THREE.Mesh[] })._arms = arms
    return g
  }

  private ensureBotMesh(b: BrBot): void {
    if (b.rig || !b.landed || !b.alive) return
    const rig = this.buildBotBody(b.tint, b.weapon)
    b.rig = rig
    b.mesh = rig.root
    this.mapScene.add(rig.root)
  }

  private updateBots(dt: number, t: number): void {
    if (this.phase !== 'live') return
    for (const b of this.bots) {
      if (!b.alive) {
        // v9.1: caída del soldado con desaceleración natural (easeOutCubic)
        if (b.rig && b.rig.usingSoldier && this.clock - b.deadAt < 0.7) {
          const dt2 = this.clock - b.deadAt
          const fall = Math.min(1, dt2 / 0.6)
          const ease = 1 - Math.pow(1 - fall, 3)
          b.rig.body.rotation.x = (Math.PI / 2) * ease
          b.rig.body.rotation.z = 0.14 * ease
          b.rig.body.position.y = -0.64 * ease
        }
        continue
      }
      // v11: followers render network puppets — the leader owns the AI
      if (!this.botLeader) {
        this.followerBot(b, dt)
        continue
      }
      // landing delay after the player jumps
      if (!b.landed) {
        b.dropAt -= dt
        if (b.dropAt <= 0) {
          b.landed = true
          b.y = terrainH(b.x, b.z)
          this.ensureBotMesh(b)
        }
        continue
      }
      // --- think ---
      if (t > b.thinkAt) {
        b.thinkAt = t + rand(700, 1600)
        // find target: player, a REAL operator or the nearest bot within 62 m
        let best = -1
        let bestD = 62
        let targetPlayer = false
        b.targetOp = null
        if (this.phase === 'live') {
          const d = Math.hypot(this.px - b.x, this.pz - b.z)
          if (d < bestD) { bestD = d; targetPlayer = true }
        }
        for (const [u, op] of this.remoteOps) {
          if (!op.alive || op.st !== 'live') continue
          const d = Math.hypot(op.x - b.x, op.z - b.z)
          if (d < bestD) { bestD = d; b.targetOp = u; targetPlayer = false; best = -1 }
        }
        for (const o of this.bots) {
          if (o === b || !o.alive || !o.landed) continue
          const d = Math.hypot(o.x - b.x, o.z - b.z)
          if (d < bestD) { bestD = d; best = o.id; b.targetOp = null; targetPlayer = false }
        }
        b.targetBot = best
        b.targetPlayer = targetPlayer
        // outside the storm → run to the circle center
        const dC = Math.hypot(b.x - this.stormCX, b.z - this.stormCZ)
        if (dC > this.stormR * 0.92) {
          b.destX = this.stormCX + rand(-this.stormR * 0.3, this.stormR * 0.3)
          b.destZ = this.stormCZ + rand(-this.stormR * 0.3, this.stormR * 0.3)
          b.targetBot = -1
          b.targetPlayer = false
          b.targetOp = null
        } else if (best < 0 && !targetPlayer && !b.targetOp) {
          // roam: POI-biased wandering
          const ang = rand(0, Math.PI * 2)
          const rr = rand(10, 34)
          b.destX = clamp(b.x + Math.cos(ang) * rr, -MAP + 10, MAP - 10)
          b.destZ = clamp(b.z + Math.sin(ang) * rr, -MAP + 10, MAP - 10)
        }
      }
      // --- shoot ---
      if ((b.targetBot >= 0 || b.targetPlayer || b.targetOp) && t > b.nextShotAt) {
        b.nextShotAt = t + rand(260, 620)
        const target = b.targetPlayer ? { x: this.px, z: this.pz }
          : b.targetOp ? this.remoteOps.get(b.targetOp)
            : this.bots.find(o => o.id === b.targetBot)
        const tx = target?.x ?? b.x
        const tz = target?.z ?? b.z
        const d = Math.hypot(tx - b.x, tz - b.z)
        if (d < 64 && target) {
          // tracer toward the target + shot sound (distance-based)
          const from = new THREE.Vector3(b.x, b.y + 1.4, b.z)
          const to = new THREE.Vector3(tx, terrainH(tx, tz) + 1.2, tz)
          this.spawnTracer(from, to)
          if (b.targetPlayer || b.targetOp) {
            const distToPlayer = Math.hypot(this.px - b.x, this.pz - b.z)
            getAudio().gunshot(WEAPONS[b.weapon].sound, clamp(distToPlayer / 6, 0, 60))
            this.pings.push({ x: b.x, z: b.z, t: 2 })
            const hitChance = b.accuracy * (1 - d / 78) * (this.movingFast() ? 0.7 : 1)
            if (Math.random() < hitChance) {
              // v10: el daño del bot escala con la rareza de SU arma
              const rarMult = BR_RARITIES[b.rarity]?.dmgMult ?? 1
              const dmg = rand(7, 13) * (WEAPONS[b.weapon].damage / 34) * rarMult
              if (b.targetPlayer) {
                // v12: player-built WALLS soak bot fire — building is real cover
                const wall = this.wallOnSegment(b.x, b.z, b.y + 1.4, this.px, this.pz, this.py - 0.35)
                if (wall) {
                  this.damageBuild(wall.piece, dmg * 0.8, false)
                } else {
                  this.damagePlayer(dmg, b.name)
                }
              } else if (b.targetOp) {
                // v11: the damage lands on the REAL operator's client
                esNet.brPublishEv({ ty: 'hit', o: myOid(), tgt: b.targetOp, by: '', byN: b.name, dmg: R1(dmg), w: b.weapon })
              }
            }
          } else {
            // bot vs bot: probabilistic damage
            const victim = this.bots.find(o => o.id === b.targetBot)
            if (victim && victim.alive) {
              const hitChance = b.accuracy * (1 - d / 78)
              if (Math.random() < hitChance) {
                const rarMult = BR_RARITIES[b.rarity]?.dmgMult ?? 1
                victim.hp -= rand(9, 16) * rarMult
                if (victim.hp <= 0) this.killBot(victim, b.name)
              }
            }
          }
        }
      }
      // --- move ---
      let mx = b.destX
      let mz = b.destZ
      if (b.targetBot >= 0 || b.targetPlayer || b.targetOp) {
        // strafe combat: keep some distance
        const target = b.targetPlayer ? { x: this.px, z: this.pz }
          : b.targetOp ? this.remoteOps.get(b.targetOp)
            : this.bots.find(o => o.id === b.targetBot)
        const tx = target?.x ?? b.x
        const tz = target?.z ?? b.z
        const dx = tx - b.x, dz = tz - b.z
        const dd = Math.hypot(dx, dz) || 1
        if (dd > 30) { mx = tx; mz = tz }
        else {
          // orbit sideways
          mx = b.x - (dz / dd) * 6
          mz = b.z + (dx / dd) * 6
        }
      }
      const dx = mx - b.x
      const dz = mz - b.z
      const dl = Math.hypot(dx, dz)
      b.moving = dl > 1.2
      if (dl > 1.2) {
        const speed = (b.targetBot >= 0 || b.targetPlayer || b.targetOp) ? 3.6 : 4.4
        const nx = b.x + (dx / dl) * speed * dt
        const nz = b.z + (dz / dl) * speed * dt
        if (!this.blocked(nx, nz, 0.45)) {
          b.x = nx
          b.z = nz
        } else {
          // slide around obstacles
          b.thinkAt = 0
        }
        b.yaw = Math.atan2(dx, dz)
        b.legPhase += dt * 9
      }
      b.y = terrainH(b.x, b.z)
      this.ensureBotMesh(b)
      if (b.mesh) {
        b.mesh.position.set(b.x, b.y, b.z)
        b.mesh.rotation.y = b.yaw
        if (b.rig) this.animateRig(b.rig, b.legPhase, dl > 1.2)
      }
    }
    // bot-vs-bot background attrition so the match always advances
    // (v11: only the bot leader arbitrates attrition)
    if (this.botLeader && t - this.botThink > 15000) {
      this.botThink = t
      const alive = this.bots.filter(b => b.alive && b.landed)
      if (alive.length > 3 && this.aliveCount() < this.bots.filter(b => b.alive).length + 1 && Math.random() < 0.5) {
        // pick a random far duel and resolve it
        const a = alive[Math.floor(rand(0, alive.length))]
        const victims = alive.filter(v => v !== a && Math.hypot(v.x - a.x, v.z - a.z) > 80)
        if (victims.length) {
          const victim = victims[Math.floor(rand(0, victims.length))]
          this.killBot(victim, a.name)
        }
      }
    }
    // v11: the leader broadcasts the bot states (~7 Hz) so every client
    // sees the same match
    if (this.botLeader && this.matchId && !this.practice && t - this.botsPubAt > 140) {
      this.botsPubAt = t
      const bs: number[][] = []
      for (const b of this.bots) {
        bs.push([b.id, R1(b.x), R1(b.z), R2(b.yaw), (b.alive ? 1 : 0) | (b.landed ? 2 : 0) | (b.moving ? 4 : 0)])
      }
      esNet.brPublishBots(JSON.stringify({ bs }))
    }
  }

  /** v11: network puppet — the leader's snapshots drive this bot */
  private followerBot(b: BrBot, dt: number): void {
    if (!b.landed) return
    const dx = b.tx - b.x
    const dz = b.tz - b.z
    const dl = Math.hypot(dx, dz)
    if (dl > 0.05) {
      const step = Math.min(dl, dt * 14)
      b.x += (dx / dl) * step
      b.z += (dz / dl) * step
      b.legPhase += dt * 9
    }
    b.yaw += (b.tyaw - b.yaw) * Math.min(1, dt * 10)
    b.y = terrainH(b.x, b.z)
    this.ensureBotMesh(b)
    if (b.mesh) {
      b.mesh.position.set(b.x, b.y, b.z)
      b.mesh.rotation.y = b.yaw
      if (b.rig) this.animateRig(b.rig, b.legPhase, dl > 0.4)
    }
  }


  private aliveCount(): number {
    let n = this.bots.filter(b => b.alive).length
    if (this.phase === 'live') n += 1
    for (const op of this.remoteOps.values()) {
      if (op.alive) n += 1
    }
    return n
  }

  private killBot(b: BrBot, killer: string, killerOid = '', byPlayer = false): void {
    if (!b.alive) return
    this.killBotVisual(b)
    const feed = useBr.getState()
    feed.addFeed(`${killer.toUpperCase()} eliminated ${b.name.toUpperCase()}`, byPlayer)
    if (byPlayer) {
      this.kills++
      getAudio().killConfirm()
      // v12: every elimination pays materials (Fortnite economy)
      this.mats = Math.min(999, this.mats + MATS_PER_KILL)
      useBr.getState().set({ mats: this.mats })
    }
    // drop ammo where they fell
    this.spawnLootDrop(b.x, b.z, b.weapon)
    if (!this.practice && this.matchId) {
      // v11: every operator sees the elimination and the ammo drop
      esNet.brPublishEv({ ty: 'lootdrop', o: myOid(), x: R1(b.x), z: R1(b.z), w: b.weapon })
      esNet.brPublishEv({ ty: 'kill', o: myOid(), tgt: `b${b.id}`, tgtN: b.name, by: killerOid, byN: killer })
    }
    // v10: reacción en el chat de partida (los rivales tienen personalidad)
    if (byPlayer && Math.random() < 0.34 && this.phase === 'live') {
      const taunts = [
        'Nice shot, operator',
        'That was my Legendary you just earned',
        'I dropped my weapon, take it',
        'Good fight',
        'Top 10 incoming, watch out',
      ]
      useChat.getState().push(
        SIM_NAMES[Math.floor(rand(0, SIM_NAMES.length))],
        taunts[Math.floor(rand(0, taunts.length))],
        'br',
      )
    }
  }

  /** visual death only (network followers use this) */
  private killBotVisual(b: BrBot): void {
    if (!b.alive) return
    b.alive = false
    b.deadAt = this.clock
    if (b.rig && b.rig.usingSoldier) {
      // v9.1: la caída se anima en updateBots (easeOutCubic) — el arma
      // acompaña al cuerpo porque cuelga del mismo bodyGroup
    } else if (b.mesh) {
      // fallback low-poly: fall over + stay as a body for a while
      b.mesh.rotation.x = Math.PI / 2 * 0.92
      b.mesh.position.y = b.y + 0.25
    }
  }

  private spawnLootDrop(x: number, z: number, weapon: WeaponId): void {
    this.loot.push({ x, z, kind: 'ammo', weapon, rarity: 0, taken: false, mesh: null, item: null })
    const spot = this.loot[this.loot.length - 1]
    spot.mesh = this.buildLootMesh(spot)
  }

  // ----------------------------------------------------------
  // MATCHMAKING (lobby island) — countdown at 4 connected
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // MATCHMAKING (lobby island) — v11 REAL
  // Only actual operators appear (esnet roster); bots NEVER join
  // the queue. The 60 s countdown starts when 4 REAL operators
  // are connected and bots fill to 20 only AFTER it.
  // ----------------------------------------------------------
  private updateQueue(t: number, dt: number): void {
    const brSet = useBr.getState().set
    this.updateLobbyLife(t, dt)
    if (!this.countdownRunning) {
      // online: waiting for REAL operators (nothing to simulate — the
      // roster arrives over the network). practice: short local warmup.
      if (this.practice && this.worldSeed !== null) {
        this.countdownRunning = true
        this.countdown = 6
        brSet({ countdownActive: true, countdown: 6 })
      }
    } else {
      // online: the countdown follows the leader's wall-clock t0
      if (!this.practice && this.netCountT0) {
        if (useBrNet.getState().countInfo === null) {
          // lobby cancelled → back to waiting
          this.countdownRunning = false
          this.netCountT0 = 0
          brSet({ countdownActive: false, countdown: 0 })
        } else {
          this.countdown = Math.max(0, (this.netCountT0 - Date.now()) / 1000)
          brSet({ countdown: Math.ceil(this.countdown) })
          if (this.countdown <= 0) {
            brSet({ countdownActive: false, countdown: 0, alive: TOTAL, kills: 0, phase: 'plane', loadingMap: false })
            this.brStartMatch()
          }
        }
      } else {
        this.countdown -= dt
        brSet({ countdown: Math.max(0, Math.ceil(this.countdown)) })
        if (this.countdown <= 0) {
          brSet({ countdownActive: false, countdown: 0, alive: TOTAL, kills: 0, phase: 'plane', loadingMap: false })
          this.brStartMatch()
        }
      }
    }
    // lobby walkers wander (the REAL operators on the island)
    for (const w of this.lobbyWalkers) {
      const dx = w.dest[0] - w.rig.root.position.x
      const dz = w.dest[1] - w.rig.root.position.z
      const d = Math.hypot(dx, dz)
      let moving = false
      if (d < 1) { w.dest = [rand(-16, 16), rand(-16, 16)] }
      else {
        w.rig.root.position.x += (dx / d) * 1.5 * dt
        w.rig.root.position.z += (dz / d) * 1.5 * dt
        w.rig.root.rotation.y = Math.atan2(dx, dz)
        w.phase += dt * 8
        moving = true
      }
      this.animateRig(w.rig, w.phase, moving)
    }
  }

  // ----------------------------------------------------------
  // v11 — NET: roster / countdown / practice / match start
  // ----------------------------------------------------------
  /** the REAL lobby roster (each entry is a live operator) */
  private onNetRoster(ops: BrQueueOp[]): void {
    if (this.disposed || this.practice) return
    this.netRoster = ops
    this.queue = ops.map(o => ({ name: o.n, real: true }))
    useBr.getState().set({ queuePlayers: [...this.queue] })
    // walkers = the real operators on the island (me included)
    const want = ops.length
    while (this.lobbyWalkers.length > want) {
      const w = this.lobbyWalkers.pop()!
      this.lobbyScene.remove(w.rig.root)
      disposeTree(w.rig.root)
    }
    while (this.lobbyWalkers.length < want) {
      const i = this.lobbyWalkers.length
      const op = ops[i]
      const rig = this.buildBotBody(i, WEAPON_POOL[i % WEAPON_POOL.length])
      rig.root.position.set(rand(-16, 16), 0, rand(-14, 14))
      this.lobbyScene.add(rig.root)
      this.lobbyWalkers.push({ rig, phase: rand(0, 10), dest: [rand(-16, 16), rand(-14, 14)] })
      if (op && op.u !== myOid()) getAudio().uiClick()
    }
  }

  /** leader started the 60 s countdown (seed + match id shared) */
  private onNetCountdown(c: { t0: number; seed: number; mid: string }): void {
    if (this.disposed || this.practice || this.worldSeed !== null) return
    this.netCountT0 = c.t0
    this.applyMatchSeed(c.seed, c.mid)
    // subscribe the match channels BEFORE t0 so nothing gets lost
    esNet.brMatchEnter(c.mid, {
      pose: (u, p) => this.onNetPose(u, p),
      ev: p => this.onNetEv(p),
      chat: p => this.onNetChat(p),
      bots: p => this.onNetBots(p),
    })
    this.countdownRunning = true
    this.countdown = Math.max(1, (c.t0 - Date.now()) / 1000)
    useBr.getState().set({ countdownActive: true, countdown: Math.ceil(this.countdown) })
    getAudio().announceDing()
  }

  /** offline practice: same island pipeline, 19 bots, no ranking */
  beginPractice(): void {
    if (this.worldSeed !== null) return
    this.practice = true
    this.botLeader = true
    this.applyMatchSeed((Math.random() * 0x7fffffff) | 0, 'practice')
    useBr.getState().addFeed('PRACTICE MATCH — 19 bots · online queue needs 4 real operators', false)
  }

  /** re-try the online service (queue overlay button) */
  retryNet(): void {
    if (this.practice || this.worldSeed !== null) return
    esNet.connect()
    useBr.getState().set({ netStatus: 'connecting' })
  }

  /** seed everything deterministic (storm plan, plane line, world rng) */
  private applyMatchSeed(seed: number, mid: string): void {
    this.worldSeed = seed
    this.matchId = mid
    wrng = mulberry32(seed)
    brng = mulberry32(seed ^ 0xB075C0DE)
    // deterministic storm plan (same sequence on every client)
    this.stormPlan = []
    let cx = 0, cz = 0, r = 230
    this.stormPlan.push([wrand(-30, 30), wrand(-30, 30)])
    for (let i = 0; i < STORM_PHASES.length; i++) {
      const target = STORM_PHASES[i].r
      const maxOff = Math.max(0, r - target - 4)
      const ang = wrand(0, Math.PI * 2)
      const off = wrand(0, maxOff)
      cx = clamp(cx + Math.cos(ang) * off, -MAP + target, MAP - target)
      cz = clamp(cz + Math.sin(ang) * off, -MAP + target, MAP - target)
      r = target
      this.stormPlan.push([cx, cz])
    }
    this.planeAngle = wrand(0, Math.PI * 2)
    useBr.getState().set({ loadingMap: true })
  }

  /** countdown ended → room of 20 boards the plane */
  private brStartMatch(): void {
    if (this.practice) {
      this.buildBots(TOTAL - 1)
      this.botsBuilt = true
      useBr.getState().addFeed(`PRACTICE — you vs ${TOTAL - 1} bots`, false)
    } else {
      // REAL match — bots are simulated by ONE client (bot leader =
      // lowest Operator ID) and broadcast; every client generates the
      // SAME deterministic bots from the seed + the leader's count.
      esNet.brMatchGo()
      const me = myOid()
      const ops = this.netRoster.filter(o => o.u !== me)
      const real = ops.length + 1
      const botsNeeded = Math.max(0, TOTAL - real)
      this.botLeader = !!me && (ops.length === 0 || ops[0].u > me)
      if (real > 1) {
        useBr.getState().addFeed(`MATCH START — ${real} operators + ${botsNeeded} bots`, false)
      } else {
        useBr.getState().addFeed('MATCH START — room filled with bots', false)
      }
      if (this.botLeader) {
        this.buildBots(botsNeeded)
        this.botsBuilt = true
        esNet.brPublishEv({ ty: 'mcount', o: me, n: botsNeeded })
      } else {
        // wait briefly for the leader's bot count; local fallback if lost
        if (this.mcountTimer) clearTimeout(this.mcountTimer)
        this.mcountTimer = setTimeout(() => {
          if (!this.botsBuilt && !this.disposed) {
            this.buildBots(botsNeeded)
            this.botsBuilt = true
          }
        }, 5000)
      }
    }
    this.startPlane()
  }

  // ----------------------------------------------------------
  // PLANE + DROP
  // ----------------------------------------------------------
  private startPlane(): void {
    this.phase = 'plane'
    this.planeT = 0
    this.planeDur = 15
    this.matchStartAt = performance.now()
    // v11: the drop line is part of the seeded plan (same for everyone)
    const ang = this.planeAngle || rand(0, Math.PI * 2)
    const R = MAP * 1.35
    this.planeA.set(Math.cos(ang) * R, 150, Math.sin(ang) * R)
    this.planeB.set(-Math.cos(ang) * R, 150, -Math.sin(ang) * R)
    this.scene = this.mapScene
    this.jumped = false
    this.glide = false
    // plane mesh
    const plane = new THREE.Group()
    const fusMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.5, metalness: 0.5 })
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 10), fusMat)
    fus.rotation.x = Math.PI / 2
    plane.add(fus)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 3.4), fusMat)
    plane.add(wing)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 2.2), fusMat)
    tail.position.set(0, 1.6, -7)
    plane.add(tail)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 2.4), fusMat)
    fin.position.set(0, 2.6, -7)
    plane.add(fin)
    this.planeMesh = plane
    this.mapScene.add(plane)
    useBr.getState().addFeed('DROP FROM THE PLANE WITH [SPACE] — pick your landing zone', false)
  }

  private jumpFromPlane(): void {
    if (this.jumped || this.phase !== 'plane') return
    this.jumped = true
    this.phase = 'freefall'
    const k = this.planeT / this.planeDur
    this.px = this.planeA.x + (this.planeB.x - this.planeA.x) * k
    this.py = this.planeA.y
    this.pz = this.planeA.z + (this.planeB.z - this.planeA.z) * k
    this.vy = -4
    this.pitch = -0.6
    getAudio().jump()
    useBr.getState().set({ phase: 'plane' })   // HUD still shows the drop hint
  }

  private updatePlane(dt: number): void {
    if (this.phase !== 'plane') return
    if (!this.jumped) {
      this.planeT += dt
      const k = clamp(this.planeT / this.planeDur, 0, 1)
      const pos = new THREE.Vector3().lerpVectors(this.planeA, this.planeB, k)
      if (this.planeMesh) {
        this.planeMesh.position.copy(pos)
        this.planeMesh.rotation.y = Math.atan2(this.planeB.x - this.planeA.x, this.planeB.z - this.planeA.z)
      }
      // camera rides slightly above/behind the plane, looking down at the island
      this.px = pos.x
      this.py = pos.y + 4
      this.pz = pos.z
      this.yaw = Math.atan2(this.planeB.x - this.planeA.x, this.planeB.z - this.planeA.z) + Math.PI
      this.pitch = -0.75
      if (k >= 0.86) this.jumpFromPlane()   // auto-eject at the end of the run
    }
  }

  private updateFreefall(dt: number): void {
    if (this.phase !== 'freefall') return
    const groundY = terrainH(this.px, this.pz)
    const alt = this.py - groundY
    // glider deploys near the ground
    if (!this.glide && alt < 34) {
      this.glide = true
      getAudio().land()
    }
    const maxFall = this.glide ? 6.5 : 42
    this.vy = Math.max(this.vy - 26 * dt, -maxFall)
    // steer with WASD
    const fwd = this.keys.has('KeyW') ? 1 : this.keys.has('KeyS') ? -1 : 0
    const strafe = this.keys.has('KeyA') ? 1 : this.keys.has('KeyD') ? -1 : 0
    const spd = this.glide ? 12 : 9
    if (fwd || strafe) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
      this.px += (-sin * fwd - cos * strafe) * spd * dt
      this.pz += (-cos * fwd + sin * strafe) * spd * dt
      this.px = clamp(this.px, -MAP + 4, MAP - 4)
      this.pz = clamp(this.pz, -MAP + 4, MAP - 4)
    }
    this.py += this.vy * dt
    if (this.py <= groundY + EYE) {
      this.py = groundY + EYE
      this.vy = 0
      this.onGround = true
      this.phase = 'live'
      useBr.getState().set({ phase: 'live' })
      getAudio().land()
      // v12: fresh building economy for this match
      this.mats = MATS_START
      this.builds = []
      this.buildCols = []
      useBr.getState().set({ mats: this.mats, buildMode: null })
      this.buildMode = null
      useBr.getState().addFeed('BOOTS ON THE GROUND — loot fast, the storm comes', false)
      useBr.getState().addFeed('BUILD MODE: [Q] WALL · [C] RAMP · [Z] FLOOR — materials ready', false)
    }
  }

  // ----------------------------------------------------------
  // PLAYER MOVEMENT (live)
  // ----------------------------------------------------------
  private movingFast(): boolean {
    return this.keys.has('KeyW') || this.keys.has('KeyA') || this.keys.has('KeyS') || this.keys.has('KeyD')
  }

  private updatePlayer(dt: number): void {
    if (this.phase !== 'live') return

    // vehicle driving replaces walking
    if (this.inVehicle) {
      this.updateDriving(dt)
      return
    }

    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const crouch = this.keys.has('ControlLeft')
    let speed = sprint ? 7.4 : 5.0
    if (crouch) speed = 2.4
    if (this.weapon && WEAPONS[this.weapon]) speed *= WEAPONS[this.weapon].moveMult
    if (this.adsAmt > 0.3) speed *= 0.65   // v11.2: aiming slows you (normal-mode rule)
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    if (fwd || strafe) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
      const len = Math.hypot(fwd, strafe)
      const dx = (-sin * fwd + cos * strafe) / len
      const dz = (-cos * fwd - sin * strafe) / len
      const nx = this.px + dx * speed * dt
      const nz = this.pz + dz * speed * dt
      if (!this.blocked(nx, nz, 0.4)) { this.px = nx; this.pz = nz }
      else {
        // try axis-sliding against walls
        if (!this.blocked(nx, this.pz, 0.4)) this.px = nx
        else if (!this.blocked(this.px, nz, 0.4)) this.pz = nz
      }
      this.px = clamp(this.px, -MAP + 2, MAP - 2)
      this.pz = clamp(this.pz, -MAP + 2, MAP - 2)
      if (this.onGround && Math.random() < dt * 6) getAudio().footstep(sprint ? 1.4 : 1)
    }

    // jump + gravity on the terrain (v12: + build floors/ramps via groundAt)
    const feet = this.py - EYE
    const groundY = this.groundAt(this.px, this.pz, feet) + EYE
    if (this.onGround && this.keys.has('Space')) {
      this.vy = 6.4
      this.onGround = false
      getAudio().jump()
    }
    if (!this.onGround) {
      this.vy -= 16 * dt
      this.py += this.vy * dt
      if (this.py <= groundY) {
        this.py = groundY
        this.vy = 0
        this.onGround = true
        getAudio().land()
      }
    } else if (this.py > groundY + 0.65) {
      // the ground dropped (a piece was destroyed / walked off an edge) → fall
      this.onGround = false
      this.vy = 0
    } else {
      // follow the terrain (also handles walking uphill + ramps)
      this.py = groundY
    }

    // interaction (E): loot + vehicles
    this.updateInteraction()
    // v12: ghost preview + turbo-build
    this.updateBuild(performance.now())
  }

  /** circle collision vs buildings + trees + v12 build walls (with vertical overlap) */
  private blocked(x: number, z: number, r: number): boolean {
    for (const b of this.aabbs) {
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true
    }
    const feet = this.py - EYE
    for (const c of this.buildCols) {
      if (!c.blocks || c.piece.dead) continue
      // vertical overlap: blocked only if the body intersects the wall span
      if (feet + 1.7 < c.y0 + 0.05 || feet > c.y1 - 0.3) continue
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true
    }
    for (const t of this.trees) {
      const dx = x - t.x, dz = z - t.z
      if (dx * dx + dz * dz < (t.r + r) * (t.r + r)) return true
    }
    return false
  }

  private updateInteraction(): void {
    const brSet = useBr.getState().set
    let hint = ''
    // nearest loot within 2.2 m
    let bestLoot: LootSpot | null = null
    let bestD = 2.3
    for (const s of this.loot) {
      if (s.taken) continue
      const d = Math.hypot(s.x - this.px, s.z - this.pz)
      if (d < bestD) { bestD = d; bestLoot = s }
    }
    if (bestLoot) {
      const label = bestLoot.kind === 'weapon'
        ? `${BR_RARITIES[bestLoot.rarity]?.label ?? 'COMMON'} · ${WEAPONS[bestLoot.weapon].name.toUpperCase()}`
        : bestLoot.kind === 'crate'
          ? `SUPPLY CRATE · ${BR_RARITIES[bestLoot.rarity]?.label ?? 'RARE'} ${WEAPONS[bestLoot.weapon].name.toUpperCase()}`
          : bestLoot.kind === 'med' ? 'MEDKIT'
            : bestLoot.kind === 'mats' ? 'MATERIALS' : 'AMMO BOX'
      hint = `[E]  ${label}`
      if (this.wantJump) this.takeLoot(bestLoot)
    }
    // vehicles within 3.2 m
    if (!this.inVehicle) {
      let bestV: BrVehicle | null = null
      let vd = 3.4
      for (const v of this.vehicles) {
        const d = Math.hypot(v.x - this.px, v.z - this.pz)
        if (d < vd) { vd = d; bestV = v }
      }
      if (bestV) {
        hint = hint ? `${hint}   ·   [E]  VEHICLE` : '[E]  VEHICLE'
        if (!bestLoot && this.wantJump) this.enterVehicle(bestV)
      }
    }
    this.wantJump = false
    if (hint !== this.lastHint) {
      this.lastHint = hint
      brSet({ hint })
    }
  }
  private lastHint = ''

  private takeLoot(s: LootSpot): void {
    if (s.taken) return
    // v12: material pickups (pallets) + crate/ammo bonuses feed the build economy
    const addMats = (n: number): void => {
      this.mats = Math.min(999, this.mats + n)
      useBr.getState().set({ mats: this.mats })
    }
    if (s.kind === 'mats') {
      addMats(MATS_PALLET)
      getAudio().buy()
      useBr.getState().addFeed(`+${MATS_PALLET} MATERIALS — build with [Q] [C] [Z]`, true)
    } else if (s.kind === 'weapon' || s.kind === 'crate') {
      const wid = s.weapon
      this.weapon = wid
      this.weaponRarity = s.rarity
      this.mag = WEAPONS[wid].mag
      this.reserve = WEAPONS[wid].mag * 2
      this.reloading = false
      this.attachViewmodel(wid)
      getAudio().draw()
      if (s.kind === 'crate') {
        // crates also patch you up (+ materials for building)
        this.hp = Math.min(100, this.hp + 45)
        addMats(MATS_CRATE)
        useBr.getState().addFeed(`+${MATS_CRATE} MATERIALS from the supply crate`, true)
        getAudio().pickup(true)
      }
      const rar = BR_RARITIES[s.rarity]
      useBr.getState().addFeed(`PICKED UP [${rar?.label ?? 'COMMON'}] ${WEAPONS[wid].name.toUpperCase()} — ${rar ? Math.round((rar.dmgMult - 1) * 100) : 0}% DMG`, true)
    } else if (s.kind === 'med') {
      if (this.hp >= 100) { this.wantJump = false; return }
      this.hp = Math.min(100, this.hp + 55)
      getAudio().pickup(false)
    } else {
      // ammo: refill current weapon reserves (+ a few materials)
      if (this.weapon) this.reserve += WEAPONS[this.weapon].mag * 2
      addMats(MATS_AMMO)
      getAudio().pickup(true)
    }
    s.taken = true
    if (s.mesh) {
      this.mapScene.remove(s.mesh)
      // v9.1: respeta los recursos compartidos (GLB de armas)
      disposeTree(s.mesh)
      s.mesh = null
      s.item = null
    }
    if (!this.practice && this.matchId) {
      // v11: the loot disappears for everyone
      esNet.brPublishEv({ ty: 'loot', o: myOid(), i: this.loot.indexOf(s) })
    }
  }

  // ------------------------------------------------------------
  // v12 — FORTNITE-STYLE BUILDING (clean & smooth)
  // Q wall · C ramp · Z floor → ghost preview snaps to the 4 m
  // grid; LEFT-CLICK places (hold = turbo-build). Pieces cost 10
  // materials, have HP, block bullets AND bot fire (real cover),
  // floors/ramps are walkable, everything replicates over the net.
  // ----------------------------------------------------------
  /** enters/exits build mode with a piece selected */
  setBuildMode(kind: BuildKind | null): void {
    this.buildMode = kind
    useBr.getState().set({ buildMode: kind })
    if (kind) {
      this.ads = false
      getAudio().draw()
    }
  }

  /** per-frame: ghost placement + turbo-build while holding LMB */
  private updateBuild(t: number): void {
    if (this.phase !== 'live') { this.hideGhost(); return }
    if (!this.buildMode || this.inVehicle) { this.hideGhost(); return }
    // rebuild the ghost if the piece changed
    if (this.buildGhostKind !== this.buildMode) this.rebuildGhost()
    // target cell from the look direction (3.2 m ahead of the camera)
    const tg = this.buildTarget()
    if (!tg) { this.hideGhost(); return }
    // orient the ghost
    if (this.buildGhost) {
      const center = this.pieceCenter(tg)
      this.buildGhost.position.set(center.x, center.y, center.z)
      this.buildGhost.rotation.y = this.pieceYaw(tg)
      this.buildGhostOk = this.canPlacePiece(tg)
      const col = this.buildGhostOk ? 0x4fd2ff : 0xff5f52
      for (const m of this.buildGhostMats) m.color.setHex(col)
      this.buildGhost.visible = true
      useBr.getState().set({ buildPlaceable: this.buildGhostOk && this.mats >= BUILD_COST })
    }
    // turbo-build: holding LMB keeps placing
    if (this.mouseHeld && this.locked && t > this.buildAt) this.tryPlaceBuild()
  }

  /** target placement: cell + facing + level, all snapped */
  private buildTarget(): { kind: BuildKind; cx: number; cz: number; edge: number; lv: number } | null {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    dir.y = 0
    if (dir.lengthSq() < 1e-6) return null
    dir.normalize()
    // point 3.2 m ahead of the camera
    const ax = this.px + dir.x * 3.2
    const az = this.pz + dir.z * 3.2
    const cx = Math.floor((ax + MAP) / GRID)
    const cz = Math.floor((az + MAP) / GRID)
    if (cx < 0 || cz < 0 || cx > (2 * MAP) / GRID - 1 || cz > (2 * MAP) / GRID - 1) return null
    // facing quantized to 4 directions (N=-Z, E=+X, S=+Z, W=-X)
    let yaw = Math.atan2(dir.x, -dir.z)
    if (yaw < 0) yaw += Math.PI * 2
    const edge = Math.round(yaw / (Math.PI / 2)) % 4
    // vertical level from the player's feet (walkable ramp chaining)
    const feet = this.py - EYE
    const lv = Math.round(feet / RISE)
    return { kind: this.buildMode!, cx, cz, edge, lv }
  }

  /** world-space center of a piece */
  private pieceCenter(tg: { kind: BuildKind; cx: number; cz: number; edge: number; lv: number }): { x: number; y: number; z: number } {
    const x = tg.cx * GRID - MAP + GRID / 2
    const z = tg.cz * GRID - MAP + GRID / 2
    const y = tg.lv * RISE
    if (tg.kind === 'wall') {
      // on the NEAR edge of the target cell (the one facing the player)
      const off = 2
      switch (tg.edge) {
        case 0: return { x, y, z: z - off }
        case 1: return { x: x + off, y, z }
        case 2: return { x, y, z: z + off }
        default: return { x: x - off, y, z }
      }
    }
    return { x, y, z }
  }

  /** yaw of a piece (walls face across the edge; ramps rise along facing) */
  private pieceYaw(tg: { kind: BuildKind; edge: number }): number {
    if (tg.kind === 'wall') return (tg.edge % 2 === 1 ? Math.PI / 2 : 0)
    // ramp: the local +Z end is the HIGH end — rotate it to the facing dir
    // (N=-Z → π, E=+X → π/2, S=+Z → 0, W=-X → -π/2)
    return tg.edge === 0 ? Math.PI : tg.edge === 2 ? 0 : tg.edge === 1 ? Math.PI / 2 : -Math.PI / 2
  }

  /** can this piece be placed here? (no duplicates, no static overlap, in bounds) */
  private canPlacePiece(tg: { kind: BuildKind; cx: number; cz: number; edge: number; lv: number }): boolean {
    // duplicate piece in the same cell/edge/level
    for (const b of this.builds) {
      if (b.dead) continue
      if (b.kind !== tg.kind) continue
      if (b.cx !== tg.cx || b.cz !== tg.cz || b.lv !== tg.lv) continue
      if (tg.kind === 'wall' && b.edge !== tg.edge) continue
      return false
    }
    // piece bounding box
    const c = this.pieceCenter(tg)
    const wHalf = tg.kind === 'wall' ? (tg.edge % 2 === 1 ? 0.16 : 2) : 2
    const dHalf = tg.kind === 'wall' ? (tg.edge % 2 === 1 ? 2 : 0.16) : 2
    const minX = c.x - wHalf, maxX = c.x + wHalf
    const minZ = c.z - dHalf, maxZ = c.z + dHalf
    const y0 = tg.lv * RISE
    const y1 = y0 + (tg.kind === 'wall' ? RISE : tg.kind === 'ramp' ? RISE : 0.22)
    // static map geometry overlap (only serious for walls/floors at their heights)
    for (const a of this.aabbs) {
      if (maxX > a.minX - 0.1 && minX < a.maxX + 0.1 && maxZ > a.minZ - 0.1 && minZ < a.maxZ + 0.1) {
        if (y1 > 0.4 && y0 < a.h) return false
      }
    }
    // trees
    for (const t of this.trees) {
      if (t.x > minX - 0.6 && t.x < maxX + 0.6 && t.z > minZ - 0.6 && t.z < maxZ + 0.6) {
        if (y0 < 5.5) return false
      }
    }
    return true
  }

  /** places the ghost piece (called by LMB and turbo-build) */
  private tryPlaceBuild(): void {
    if (!this.buildMode) return
    const tg = this.buildTarget()
    if (!tg) return
    const now = performance.now()
    if (now < this.buildAt) return
    if (this.mats < BUILD_COST) {
      if (now > this.buildAt) {
        useBr.getState().set({ hint: 'NOT ENOUGH MATERIALS — loot pallets, crates and ammo boxes' })
        this.buildAt = now + 900
      }
      return
    }
    if (!this.canPlacePiece(tg)) return
    if (this.builds.filter(b => b.mine && !b.dead).length >= BUILD_MAX) return
    this.buildAt = now + 150          // turbo-build cadence (smooth, not spammy)
    this.mats -= BUILD_COST
    useBr.getState().set({ mats: this.mats })
    const id = `l${++this.buildSeq}`
    this.spawnBuildPiece(tg, id, myOid(), true)
    getAudio().reload('end')          // wood thunk (two-stage latch sound)
    // replicate to the other operators
    if (!this.practice && this.matchId) {
      esNet.brPublishEv({ ty: 'build', o: myOid(), id, k: tg.kind, cx: tg.cx, cz: tg.cz, e: tg.edge, lv: tg.lv })
    }
  }

  /** creates the piece: mesh + collision columns */
  private spawnBuildPiece(tg: { kind: BuildKind; cx: number; cz: number; edge: number; lv: number }, id: string, owner: string, mine: boolean): void {
    this.ensureBuildMaterials()
    const c = this.pieceCenter(tg)
    const baseY = tg.lv * RISE
    const mesh = this.buildPieceMesh(tg)
    mesh.position.set(c.x, baseY, c.z)
    mesh.rotation.y = this.pieceYaw(tg)
    this.mapScene.add(mesh)
    const piece: BuildPiece = {
      id, kind: tg.kind, cx: tg.cx, cz: tg.cz, edge: tg.edge, lv: tg.lv,
      baseY, hp: BUILD_HP[tg.kind], mesh, owner, mine, dead: false,
    }
    this.builds.push(piece)
    // collision columns
    const mk = (minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number, blocks: boolean): void => {
      this.buildCols.push({ piece, minX, maxX, minZ, maxZ, y0, y1, blocks })
    }
    if (tg.kind === 'wall') {
      // N/S edges (0/2): the wall spans X (±2) and is thin in Z (±0.16);
      // E/W edges (1/3): thin in X, spans Z. Matches the visible slab.
      const xHalf = tg.edge % 2 === 1 ? 0.16 : 2
      const zHalf = tg.edge % 2 === 1 ? 2 : 0.16
      mk(c.x - xHalf, c.x + xHalf, c.z - zHalf, c.z + zHalf, baseY, baseY + RISE, true)
    } else if (tg.kind === 'floor') {
      mk(c.x - 2, c.x + 2, c.z - 2, c.z + 2, baseY, baseY + 0.22, false)
    } else {
      // ramp: 4 stair columns (each 1 m of run, 0.75 m of rise)
      // the ramp rises TOWARD the facing direction
      const fx = tg.edge === 1 ? 1 : tg.edge === 3 ? -1 : 0
      const fz = tg.edge === 2 ? 1 : tg.edge === 0 ? -1 : 0
      for (let s = 0; s < 4; s++) {
        // strip s along the facing axis: s=3 is the HIGH end
        const lo = -2 + s
        const hi = lo + 1
        const y0 = baseY + s * 0.75
        const y1 = y0 + 0.75
        if (fx !== 0) mk(c.x + lo, c.x + hi, c.z - 2, c.z + 2, y0, y1, false)
        else mk(c.x - 2, c.x + 2, c.z + lo, c.z + hi, y0, y1, false)
      }
      void fx; void fz
    }
  }

  /** visual mesh of a piece — v13: materiales de construcción reales del
   *  usuario: WALL = Ladrillo.jpg (muro de obra), FLOOR = Madera.jpg
   *  (plataforma de tablones), RAMP = Metal.jpg (rampa industrial) y
   *  vigas/travesaños de Metal.jpg oscura */
  private buildPieceMesh(tg: { kind: BuildKind }): THREE.Group {
    const g = new THREE.Group()
    const wallMat = this.buildMats.wall!
    const floorMat = this.buildMats.floor!
    const rampMat = this.buildMats.ramp!
    const frameMat = this.buildMats.frame!
    if (tg.kind === 'wall') {
      // panel + cross braces (reads as construction wood)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4, RISE, 0.22), wallMat)
      panel.position.y = RISE / 2
      g.add(panel)
      for (const y of [0.35, RISE - 0.35, RISE / 2]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.3), frameMat)
        brace.position.y = y
        brace.rotation.z = y === RISE / 2 ? 0.72 : 0
        g.add(brace)
      }
    } else if (tg.kind === 'floor') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.22, 4), floorMat)
      slab.position.y = 0.11
      g.add(slab)
      // edge beams
      for (const [ex, ez, w] of [[0, 2, 4], [0, -2, 4], [2, 0, 0], [-2, 0, 0]] as const) {
        const beam = new THREE.Mesh(
          ex !== 0 ? new THREE.BoxGeometry(0.24, 0.3, 4) : new THREE.BoxGeometry(4, 0.3, 0.24),
          frameMat,
        )
        beam.position.set(ex, 0.05, ez)
        g.add(beam)
      }
    } else {
      // ramp: inclined slab + rails (the surface matches groundAt())
      // v13: rampa metálica industrial (Metal.jpg del usuario)
      const len = Math.hypot(GRID, RISE) // 5 m along the slope
      const slab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, len), rampMat)
      slab.position.set(0, RISE / 2, 0)
      slab.rotation.x = -Math.atan2(RISE, GRID)
      g.add(slab)
      for (const sx of [-1.9, 1.9]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, len), frameMat)
        rail.position.set(sx, RISE / 2 + 0.18, 0)
        rail.rotation.x = -Math.atan2(RISE, GRID)
        g.add(rail)
      }
    }
    return g
  }

  /** shared build materials — v13: LADRILLO (wall) · MADERA (floor) ·
   *  METAL (ramp + vigas), las texturas de construcción del usuario.
   *  Si aún no llegaron: colores de obra + parche en vivo (applyRepoTexToBr) */
  private ensureBuildMaterials(): void {
    if (this.buildMats.wall && this.buildMats.floor && this.buildMats.ramp && this.buildMats.frame) return
    const repo = getRepoTextures()
    // muro de ladrillo de obra (WALL)
    const brickWall = new THREE.MeshStandardMaterial({ color: 0xb0705c, roughness: 0.92 })
    // plataforma de tablones (FLOOR)
    const woodFloor = new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.9 })
    // chapa industrial (RAMP)
    const metalRamp = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.55, metalness: 0.6 })
    // viga oscura (travesaños/rieles de todas las piezas)
    const metalFrame = new THREE.MeshStandardMaterial({ color: 0x565c63, roughness: 0.6, metalness: 0.55 })
    const applyTex = (
      mat: THREE.MeshStandardMaterial, tex: THREE.Texture | null,
      kind: 'ladrillo' | 'madera' | 'metal', rx: number, ry: number, tint: number,
    ): void => {
      if (tex) {
        const t = tex.clone()
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(rx, ry)
        t.needsUpdate = true
        mat.map = t
        mat.color.set(tint)
        mat.userData.sharedMap = true
        mat.needsUpdate = true
      } else {
        // sin textura aún → registrado para el parche en vivo (applyRepoTexToBr)
        this.texMats.push({ mat, kind, rx, ry })
      }
    }
    applyTex(brickWall, repo.ladrillo, 'ladrillo', 2.2, 1.6, 0xffffff)
    applyTex(woodFloor, repo.madera, 'madera', 1.6, 1.6, 0xffffff)
    applyTex(metalRamp, repo.metal, 'metal', 2.4, 3, 0xffffff)
    applyTex(metalFrame, repo.metal, 'metal', 1, 1, 0x6b7076)
    this.buildMats.wall = brickWall
    this.buildMats.floor = woodFloor
    this.buildMats.ramp = metalRamp
    this.buildMats.frame = metalFrame
  }

  /** (re)builds the translucent ghost preview */
  private rebuildGhost(): void {
    this.hideGhost()
    const kind = this.buildMode!
    this.buildGhostKind = kind
    this.buildGhostMats = []
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4fd2ff, transparent: true, opacity: 0.3, depthWrite: false,
    })
    this.buildGhostMats.push(mat)
    const g = new THREE.Group()
    const dims = kind === 'wall' ? [4, RISE, 0.22] : kind === 'floor' ? [4, 0.22, 4] : [4, 0.2, Math.hypot(GRID, RISE)]
    const body = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), mat)
    if (kind === 'wall') body.position.y = RISE / 2
    else if (kind === 'floor') body.position.y = 0.11
    else { body.position.y = RISE / 2; body.rotation.x = -Math.atan2(RISE, GRID) }
    g.add(body)
    // wire outline for the crisp Fortnite-style snap read
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.9 }),
    )
    edges.position.copy(body.position)
    edges.rotation.copy(body.rotation)
    g.add(edges)
    this.buildGhost = g
    this.mapScene.add(g)
  }

  private hideGhost(): void {
    if (this.buildGhost) {
      this.mapScene.remove(this.buildGhost)
      disposeTree(this.buildGhost)
      this.buildGhost = null
    }
    this.buildGhostKind = null
  }

  /** damages a build piece (player bullets, bot fire) */
  private damageBuild(piece: BuildPiece, dmg: number, byMe: boolean): void {
    if (piece.dead) return
    piece.hp -= dmg
    // visual crack: scale down slightly as it weakens? cheap: opacity flash via emissive
    const frac = Math.max(0, piece.hp) / BUILD_HP[piece.kind]
    piece.mesh.traverse(o => {
      const m = (o as THREE.Mesh).material
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        ;(m as THREE.MeshStandardMaterial).emissive?.setHex(0x331a08)
      }
    })
    if (piece.hp <= 0) this.destroyBuild(piece, byMe)
  }

  /** destroys a piece: mesh + collision + (broadcast if it was my shot) */
  private destroyBuild(piece: BuildPiece, broadcast: boolean): void {
    if (piece.dead) return
    piece.dead = true
    this.mapScene.remove(piece.mesh)
    disposeTree(piece.mesh)
    this.buildCols = this.buildCols.filter(c => c.piece !== piece)
    this.builds = this.builds.filter(b => b !== piece)
    getAudio().impact(0)
    if (broadcast && !this.practice && this.matchId) {
      esNet.brPublishEv({ ty: 'bdes', o: piece.owner, id: piece.id })
    }
  }

  /** removes a piece by id (network 'bdes') */
  private destroyBuildById(owner: string, id: string): void {
    const p = this.builds.find(b => b.owner === owner && b.id === id)
    if (p) this.destroyBuild(p, false)
  }

  /** walkable ground under (x,z): terrain + build floors/ramps */
  private groundAt(x: number, z: number, feetY: number): number {
    let ground = terrainH(x, z)
    for (const b of this.builds) {
      if (b.dead) continue
      if (b.kind === 'wall') continue
      const cx = b.cx * GRID - MAP + GRID / 2
      const cz = b.cz * GRID - MAP + GRID / 2
      if (Math.abs(x - cx) > 2 || Math.abs(z - cz) > 2) continue
      let surface: number
      if (b.kind === 'floor') {
        surface = b.baseY + 0.22
      } else {
        // ramp: progress along the facing axis (0 at the low end → 1 at the high end)
        let u: number
        if (b.edge === 1) u = (x - (cx - 2)) / GRID
        else if (b.edge === 3) u = 1 - (x - (cx - 2)) / GRID
        else if (b.edge === 2) u = (z - (cz - 2)) / GRID
        else u = 1 - (z - (cz - 2)) / GRID
        surface = b.baseY + Math.max(0, Math.min(1, u)) * RISE
      }
      // stand on it only if it is at/below our feet (+ step-up margin)
      if (surface <= feetY + 0.62 && surface > ground) ground = surface
    }
    return ground
  }

  /** first WALL between two points (bot → player cover check) */
  private wallOnSegment(x1: number, z1: number, y1: number, x2: number, z2: number, y2: number): BuildCol | null {
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 0.4) return null
    let best: BuildCol | null = null
    let bestT = 1
    for (const c of this.buildCols) {
      if (!c.blocks || c.piece.dead) continue
      // slab method in 2D
      const tmin = 0, tmax = 1
      let tt0 = tmin, tt1 = tmax
      let ok = true
      for (const [p, d, mn, mx] of [
        [x1, dx, c.minX, c.maxX], [z1, dz, c.minZ, c.maxZ],
      ] as const) {
        if (Math.abs(d) < 1e-8) {
          if (p < mn || p > mx) { ok = false; break }
        } else {
          let a = (mn - p) / d, b = (mx - p) / d
          if (a > b) { const tmp = a; a = b; b = tmp }
          tt0 = Math.max(tt0, a)
          tt1 = Math.min(tt1, b)
          if (tt0 > tt1) { ok = false; break }
        }
      }
      if (!ok) continue
      const t = tt0
      if (t >= bestT) continue
      // height at the crossing point must overlap the wall span
      const y = y1 + (y2 - y1) * t
      if (y > c.y0 - 0.2 && y < c.y1 + 0.2) {
        best = c
        bestT = t
      }
    }
    return best
  }

  // ------------------------------------------------------------
  // VEHICLES
  // ------------------------------------------------------------
  private enterVehicle(v: BrVehicle): void {
    v.occupied = true
    this.inVehicle = v
    getAudio().uiClick()
    useBr.getState().set({ inVehicle: true })
    if (!this.practice && this.matchId) {
      esNet.brPublishEv({ ty: 'veh', o: myOid(), i: this.vehicles.indexOf(v), st: 'take' })
    }
  }

  private exitVehicle(): void {
    if (!this.inVehicle) return
    const v = this.inVehicle
    v.occupied = false
    v.speed = 0
    // step out beside the car
    const ox = v.x + Math.cos(v.yaw) * 2.2
    const oz = v.z - Math.sin(v.yaw) * 2.2
    if (!this.blocked(ox, oz, 0.4)) { this.px = ox; this.pz = oz }
    this.py = terrainH(this.px, this.pz) + EYE
    this.inVehicle = null
    useBr.getState().set({ inVehicle: false })
    if (!this.practice && this.matchId) {
      esNet.brPublishEv({ ty: 'veh', o: myOid(), i: this.vehicles.indexOf(v), st: 'free', x: R1(v.x), z: R1(v.z), yaw: R2(v.yaw) })
    }
  }

  private updateDriving(dt: number): void {
    const v = this.inVehicle
    if (!v) return
    // [E] to step out
    if (this.wantJump) {
      this.wantJump = false
      this.exitVehicle()
      return
    }
    const gas = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
    const steer = (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0)
    const maxSpeed = 24
    if (gas > 0) v.speed = Math.min(maxSpeed, v.speed + 11 * dt)
    else if (gas < 0) v.speed = Math.max(-9, v.speed - 14 * dt)
    else v.speed *= 1 - 1.2 * dt
    // steering scales down at low speed
    if (Math.abs(v.speed) > 0.6) {
      v.yaw -= steer * 1.35 * dt * clamp(Math.abs(v.speed) / 9, 0.25, 1) * Math.sign(v.speed)
    }
    const dx = -Math.sin(v.yaw) * v.speed * dt
    const dz = -Math.cos(v.yaw) * v.speed * dt
    const tx = v.x + dx
    const tz = v.z + dz
    if (!this.blocked(tx, tz, 1.6)) {
      v.x = clamp(tx, -MAP + 3, MAP - 3)
      v.z = clamp(tz, -MAP + 3, MAP - 3)
    } else {
      v.speed = -v.speed * 0.25   // bounce back
      getAudio().impact(0)
    }
    v.group.position.set(v.x, terrainH(v.x, v.z), v.z)
    v.group.rotation.y = v.yaw
    // camera at the driver's seat
    this.px = v.x - Math.sin(v.yaw) * 0.2
    this.pz = v.z - Math.cos(v.yaw) * 0.2
    this.py = terrainH(v.x, v.z) + 1.9
    // wheels
    v.wheelPhase += Math.abs(v.speed) * dt * 2
    v.group.children.forEach(c => {
      const mesh = c as THREE.Mesh
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
      const single = Array.isArray(mat) ? mat[0] : mat
      if (mesh.geometry instanceof THREE.CylinderGeometry && single && single.color && single.color.getHex() === 0x181818) {
        mesh.rotation.x = v.wheelPhase
      }
    })
  }

  // ----------------------------------------------------------
  // SHOOTING
  // ----------------------------------------------------------
  private vmMuzzle: THREE.Object3D | null = null

  private attachViewmodel(wid: WeaponId): void {
    if (this.vmGroup) {
      this.camera.remove(this.vmGroup)
      // libera el modelo (respeta los recursos COMPARTIDOS de los GLB)
      disposeTree(this.vmGroup)
    }
    // v9.1: arma real del usuario (GLB) con la misma convención de pose que
    // el juego principal — el fallback procedural solo si el GLB no llegó
    const glb = buildGLBWeapon(wid)
    const built = glb ?? buildWeaponModel(wid)
    this.vmIsProcedural = !glb
    const model = built.group
    this.vmMuzzle = built.muzzle
    const pose = weaponPose(wid)
    this.vmBase.copy(pose.hip)
    this.vmBaseRot.copy(pose.hipRot)
    model.position.copy(pose.hip)
    model.rotation.copy(pose.hipRot)
    model.scale.setScalar(1.0)
    this.vmGroup = model
    this.camera.add(this.vmGroup)
    if (!this.camera.parent) this.scene.add(this.camera)
  }

  private startReload(): void {
    if (!this.weapon || this.reloading) return
    const w = WEAPONS[this.weapon]
    if (w.mag <= 0) return
    if (this.mag >= w.mag || this.reserve <= 0) return
    this.reloading = true
    this.reloadEndAt = performance.now() + w.reloadTime * 1000
    getAudio().reload('mag')
  }

  private tryShoot(): void {
    if (this.phase !== 'live' || this.inVehicle) return
    const now = performance.now()
    if (!this.weapon || this.reloading || now < this.nextShotAt) return
    const w = WEAPONS[this.weapon]
    if (w.mag > 0) {
      if (this.mag <= 0) {
        getAudio().dryFire()
        this.nextShotAt = now + 260
        this.startReload()
        return
      }
      this.mag--
    }
    this.nextShotAt = now + 60000 / w.rpm
    getAudio().gunshot(w.sound, 0)
    this.vmKick = 1
    this.pitch = clamp(this.pitch + w.recoilV * 0.011, -1.35, 1.35)
    this.yaw += (Math.random() - 0.5) * w.recoilH * 0.006   // v11.2: horizontal recoil
    // v11.2: sustained fire blooms the spread (normal-mode spray model)
    this.sprayIdx = Math.min(14, this.sprayIdx + 1)
    this.lastShotTime = now

    // muzzle light
    if (this.muzzle) {
      this.muzzle.position.copy(this.camera.position)
      this.muzzle.intensity = 30
      this.muzzleUntil = now + 60
    }

    // raycast: bots (head/body spheres) + buildings + terrain
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const origin = this.camera.position.clone()
    // v11.2: the SAME spread model as the normal modes — base + movement +
    // air + crouch + ADS + spray bloom (cone via right/up camera basis)
    {
      const sprintKey = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      const crouchKey = this.keys.has('ControlLeft')
      const hSpeed = this.movingFast() ? (sprintKey ? 7.4 : crouchKey ? 2.4 : 5.0) : 0
      let spread = w.spreadBase
      spread += w.spreadMove * Math.min(1, hSpeed / 6)
      if (!this.onGround) spread += w.spreadAir
      if (crouchKey) spread *= 0.72
      if (this.adsAmt > 0.6) spread *= 0.45
      spread += this.sprayIdx * w.sprayInacc
      if (spread > 0.02) {
        const r = (spread * Math.PI / 180) * Math.sqrt(Math.random())
        const ang = Math.random() * Math.PI * 2
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion)
        dir.addScaledVector(right, Math.cos(ang) * r)
          .addScaledVector(up, Math.sin(ang) * r)
          .normalize()
      }
    }
    let hitPoint = origin.clone().addScaledVector(dir, 220)
    let hitBot: BrBot | null = null
    let headshot = false

    // bots first (spheres)
    let bestT = 220
    let hitOp: RemoteOp | null = null
    for (const b of this.bots) {
      if (!b.alive || !b.landed) continue
      const center = new THREE.Vector3(b.x, b.y + 1.05, b.z)
      const headC = new THREE.Vector3(b.x, b.y + 1.68, b.z)
      const tB = this.raySphere(origin, dir, center, 0.62)
      const tH = this.raySphere(origin, dir, headC, 0.3)
      if (tH >= 0 && tH < bestT) { bestT = tH; hitBot = b; headshot = true; hitOp = null }
      if (tB >= 0 && tB < bestT) { bestT = tB; hitBot = b; headshot = false; hitOp = null }
    }
    // v11: REAL operators are targets too (spheres at their poses)
    for (const op of this.remoteOps.values()) {
      if (!op.alive || op.st !== 'live') continue
      const center = new THREE.Vector3(op.x, op.y + 1.05, op.z)
      const headC = new THREE.Vector3(op.x, op.y + 1.68, op.z)
      const tB = this.raySphere(origin, dir, center, 0.62)
      const tH = this.raySphere(origin, dir, headC, 0.3)
      if (tH >= 0 && tH < bestT) { bestT = tH; hitOp = op; hitBot = null; headshot = true }
      if (tB >= 0 && tB < bestT) { bestT = tB; hitOp = op; hitBot = null; headshot = false }
    }
    // buildings (ray vs AABB, slab method)
    let buildingT = 220
    for (const a of this.aabbs) {
      const t = this.rayAABB(origin, dir, a)
      if (t >= 0 && t < buildingT) buildingT = t
    }
    if (buildingT < bestT) { bestT = buildingT; hitBot = null; hitOp = null }

    // v12: BUILD pieces (ray vs their columns — walls/floors/ramps)
    let buildCol: BuildCol | null = null
    let buildT = 220
    for (const c of this.buildCols) {
      if (c.piece.dead) continue
      const t = this.rayBuildCol(origin, dir, c)
      if (t >= 0 && t < buildT) { buildT = t; buildCol = c }
    }
    if (buildT < bestT) { bestT = buildT; hitBot = null; hitOp = null; buildingT = buildT }

    // terrain (coarse march)
    let terrainT = 220
    for (let d = 2; d < 220; d += 1.5) {
      const p = origin.clone().addScaledVector(dir, d)
      if (p.y <= terrainH(p.x, p.z)) { terrainT = d; break }
    }
    if (terrainT < bestT) { bestT = terrainT; hitBot = null; hitOp = null; buildCol = null }

    hitPoint = origin.clone().addScaledVector(dir, Math.min(bestT, 220))
    this.spawnTracer(origin.clone().addScaledVector(dir, 1.2), hitPoint)

    // shared damage math (weapon stats + falloff + rarity multiplier)
    const w2 = WEAPONS[this.weapon]
    let dmg = w2.damage * (headshot ? w2.headMult : 1)
    dmg *= BR_RARITIES[this.weaponRarity]?.dmgMult ?? 1
    if (bestT > w2.falloffStart) {
      const f = clamp((bestT - w2.falloffStart) / Math.max(1, w2.falloffEnd - w2.falloffStart), 0, 1)
      dmg *= 1 - f * (1 - w2.falloffMin)
    }

    // v12: BUILD piece hit — the structure takes the damage (flat, no HS)
    if (buildCol && buildT <= bestT + 1e-6) {
      this.damageBuild(buildCol.piece, w2.damage * (BR_RARITIES[this.weaponRarity]?.dmgMult ?? 1), true)
      getAudio().impact(clamp(bestT / 8, 0, 30))
      useBr.getState().set({ hitAt: performance.now(), hitHead: false })
      return
    }

    if (hitOp) {
      // v11: REAL operator hit — THEIR client applies the damage
      getAudio().fleshHit(Math.min(20, bestT))
      useBr.getState().set({ hitAt: performance.now(), hitHead: headshot })
      if (!this.practice && this.matchId) {
        esNet.brPublishEv({ ty: 'hit', o: myOid(), tgt: hitOp.u, by: myOid(), byN: useAuth.getState().user ?? 'Operator', dmg: Math.round(dmg), hs: headshot ? 1 : 0, w: this.weapon })
      }
    } else if (hitBot) {
      if (this.botLeader || this.practice) {
        hitBot.hp -= dmg
        getAudio().fleshHit(Math.min(20, bestT))
        useBr.getState().set({ hitAt: performance.now(), hitHead: headshot })
        if (hitBot.hp <= 0) this.killBot(hitBot, useAuth.getState().user ?? 'Operator', myOid(), true)
        else if (!hitBot.landed) { /* can't hit un-landed bots anyway */ }
      } else {
        // v11: the leader applies the damage to its authoritative bots
        getAudio().fleshHit(Math.min(20, bestT))
        useBr.getState().set({ hitAt: performance.now(), hitHead: headshot })
        if (!this.practice && this.matchId) {
          esNet.brPublishEv({ ty: 'bothit', o: myOid(), bid: hitBot.id, by: myOid(), byN: useAuth.getState().user ?? 'Operator', dmg: Math.round(dmg), hs: headshot ? 1 : 0 })
        }
      }
    } else {
      getAudio().impact(clamp(bestT / 8, 0, 30))
    }
  }

  /** v12: ray vs a build column (slab method with real y0/y1 span) */
  private rayBuildCol(o: THREE.Vector3, d: THREE.Vector3, c: BuildCol): number {
    const min = new THREE.Vector3(c.minX, c.y0, c.minZ)
    const max = new THREE.Vector3(c.maxX, c.y1, c.maxZ)
    let tmin = 0, tmax = 300
    for (const axis of ['x', 'y', 'z'] as const) {
      const dv = d[axis], ov = o[axis], mn = min[axis], mx = max[axis]
      if (Math.abs(dv) < 1e-8) {
        if (ov < mn || ov > mx) return -1
      } else {
        let t1 = (mn - ov) / dv, t2 = (mx - ov) / dv
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return -1
      }
    }
    return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : -1)
  }

  private raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number {
    const oc = o.clone().sub(c)
    const b = oc.dot(d)
    const cc = oc.dot(oc) - r * r
    const disc = b * b - cc
    if (disc < 0) return -1
    const t = -b - Math.sqrt(disc)
    return t >= 0 ? t : -1
  }

  private rayAABB(o: THREE.Vector3, d: THREE.Vector3, a: AABB): number {
    const min = new THREE.Vector3(a.minX, -20, a.minZ)
    const max = new THREE.Vector3(a.maxX, a.h, a.maxZ)
    let tmin = 0, tmax = 300
    for (const axis of ['x', 'y', 'z'] as const) {
      const dv = d[axis], ov = o[axis], mn = min[axis], mx = max[axis]
      if (Math.abs(dv) < 1e-8) {
        if (ov < mn || ov > mx) return -1
      } else {
        let t1 = (mn - ov) / dv, t2 = (mx - ov) / dv
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        tmin = Math.max(tmin, t1)
        tmax = Math.min(tmax, t2)
        if (tmin > tmax) return -1
      }
    }
    return tmin
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 })
    const line = new THREE.Line(geo, mat)
    line.frustumCulled = false
    this.scene.add(line)
    this.tracers.push({ line, born: performance.now() })
    if (this.tracers.length > 40) {
      const old = this.tracers.shift()!
      this.scene.remove(old.line)
      old.line.geometry.dispose()
      ;(old.line.material as THREE.Material).dispose()
    }
  }

  private updateTracers(): void {
    const t = performance.now()
    while (this.tracers.length && t - this.tracers[0].born > 90) {
      const tr = this.tracers.shift()!
      this.scene.remove(tr.line)
      tr.line.geometry.dispose()
      ;(tr.line.material as THREE.Material).dispose()
    }
    if (this.muzzle && t > this.muzzleUntil) this.muzzle.intensity = 0
  }

  // ----------------------------------------------------------
  // v11 — REAL remote operators: poses, events, chat, bots
  // ----------------------------------------------------------
  /** renders + interpolates the real operators on the island */
  private updateRemoteOps(dt: number): void {
    if (this.practice || this.remoteOps.size === 0) return
    const wall = Date.now()
    for (const op of this.remoteOps.values()) {
      // disconnect detection: no poses for 8 s during the live match
      if (op.alive && this.phase === 'live' && op.st !== 'plane' && wall - op.lastPose > 8000) {
        op.alive = false
        op.deadAt = this.clock
        op.veh = -1
        useBr.getState().addFeed(`${op.n.toUpperCase()} DISCONNECTED`, false)
        continue
      }
      if (!op.alive) {
        // fall animation (same easing as the bots)
        if (op.rig && op.rig.usingSoldier && this.clock - op.deadAt < 0.7) {
          const dt2 = this.clock - op.deadAt
          const ease = 1 - Math.pow(1 - Math.min(1, dt2 / 0.6), 3)
          op.rig.body.rotation.x = (Math.PI / 2) * ease
          op.rig.body.rotation.z = 0.14 * ease
          op.rig.body.position.y = -0.64 * ease
        }
        continue
      }
      if (op.st === 'plane') {
        if (op.rig) op.rig.root.visible = false
        continue
      }
      if (!op.rig) {
        const tintIdx = [...op.u].reduce((a, c) => a + c.charCodeAt(0), 0) % BR_TINTS.length
        op.rig = this.buildBotBody(tintIdx, op.weapon ?? 'p9')
        op.rig.root.visible = true
        this.mapScene.add(op.rig.root)
        op.x = op.tx
        op.z = op.tz
        op.yaw = op.tyaw
      } else if (!op.rig.root.visible) {
        op.rig.root.visible = true
      }
      // interpolate toward the last pose
      const dx = op.tx - op.x
      const dz = op.tz - op.z
      const dl = Math.hypot(dx, dz)
      if (dl > 0.02) {
        const step = Math.min(dl, dt * 12)
        op.x += (dx / dl) * step
        op.z += (dz / dl) * step
      }
      op.yaw += (op.tyaw - op.yaw) * Math.min(1, dt * 10)
      if (op.moving) op.legPhase += dt * 9
      op.y = op.st === 'freefall' ? op.ty : terrainH(op.x, op.z)
      op.rig.root.position.set(op.x, op.y, op.z)
      op.rig.root.rotation.y = op.yaw
      this.animateRig(op.rig, op.legPhase, op.moving && dl > 0.2)
      // driving? the vehicle follows the driver on every client
      if (op.veh >= 0 && op.veh < this.vehicles.length) {
        const v = this.vehicles[op.veh]
        v.occupied = true
        v.x = op.x
        v.z = op.z
        v.yaw = op.yaw
        v.group.position.set(v.x, terrainH(v.x, v.z), v.z)
        v.group.rotation.y = v.yaw
      }
    }
  }

  /** a pose arrived from a REAL operator */
  private onNetPose(u: string, p: Record<string, unknown>): void {
    if (this.disposed || this.practice || u === myOid()) return
    const arr = Array.isArray(p.p) ? (p.p as unknown[]) : []
    const x = typeof arr[0] === 'number' ? arr[0] : 0
    const y = typeof arr[1] === 'number' ? arr[1] : 0
    const z = typeof arr[2] === 'number' ? arr[2] : 0
    let op = this.remoteOps.get(u)
    if (!op) {
      const w = String(p.w ?? '') as WeaponId | ''
      op = {
        u,
        n: String(p.n ?? 'Operator').slice(0, 16),
        rig: null,
        x, y, z, tx: x, ty: y, tz: z, yaw: 0, tyaw: 0,
        st: String(p.st ?? 'live'),
        alive: true,
        weapon: w || null,
        moving: false,
        legPhase: 0,
        veh: -1,
        lastPose: Date.now(),
        deadAt: 0,
      }
      this.remoteOps.set(u, op)
    }
    op.tx = x
    op.ty = y
    op.tz = z
    op.tyaw = typeof p.y === 'number' ? p.y : 0
    op.st = String(p.st ?? 'live')
    op.moving = p.m === 1
    op.veh = typeof p.veh === 'number' ? p.veh : -1
    op.lastPose = Date.now()
    const w = String(p.w ?? '')
    if (w && w !== op.weapon) {
      op.weapon = w as WeaponId
      if (op.rig) this.rebuildRigWeapon(op.rig)
    }
    if (op.veh < 0 && op.rig && op.st !== 'plane') op.rig.root.visible = true
  }

  /** the local player's pose, throttled (10 Hz moving / 2.5 Hz idle) */
  private publishPose(t: number): void {
    if (this.practice || !this.matchId) return
    if (this.phase === 'queue' || this.phase === 'dead' || this.phase === 'victory') return
    const moving = (this.movingFast() || this.phase === 'freefall' || this.inVehicle !== null) ? 1 : 0
    const iv = moving || this.phase !== 'live' ? 100 : 400
    if (t - this.poseAt < iv) return
    this.poseAt = t
    const veh = this.inVehicle ? this.vehicles.indexOf(this.inVehicle) : -1
    esNet.brPublishPose([this.px, this.py, this.pz], this.yaw, moving, this.weapon ?? '', this.phase, veh)
  }

  /** periodic net duties: HUD status + bot-leader failover */
  private netHousekeeping(t: number): void {
    if (this.practice) return
    if (t - this.netHkAt < 500) return
    this.netHkAt = t
    const st = esNet.status === 'online' ? 'online' : esNet.status
    if (useBr.getState().netStatus !== st) useBr.getState().set({ netStatus: st })
    if (this.phase === 'live' && !this.botLeader && this.matchId) {
      // no bot snapshots for a while → the lowest-ID operator alive
      // takes over the simulation so the match keeps flowing
      const staleFor = this.lastBotsMsg === 0 ? 30000 : 6000
      if (Date.now() - this.lastBotsMsg > staleFor) this.takeOverBots()
    }
  }

  private takeOverBots(): void {
    const me = myOid()
    if (!me) return
    let min = me
    for (const [u, op] of this.remoteOps) {
      if (op.alive && u < min) min = u
    }
    if (min !== me) return
    if (!this.botsBuilt) {
      this.buildBots(Math.max(0, TOTAL - 1 - this.remoteOps.size))
      this.botsBuilt = true
    }
    this.botLeader = true
    useBr.getState().addFeed('YOU TOOK OVER THE SIMULATION', false)
  }

  /** a REAL operator's chat line */
  private onNetChat(p: Record<string, unknown>): void {
    if (String(p.u) === myOid()) return
    pushNetChatLine(String(p.n ?? 'Operator'), String(p.text ?? ''))
  }

  /** bot snapshots from the leader */
  private onNetBots(p: Record<string, unknown>): void {
    if (this.practice || this.disposed) return
    this.lastBotsMsg = Date.now()
    const bs = p.bs
    if (!Array.isArray(bs)) return
    for (const raw of bs) {
      if (!Array.isArray(raw) || raw.length < 5) continue
      const b = this.bots.find(x => x.id === raw[0])
      if (!b) continue
      const flags = raw[4]
      if (!b.snapped) {
        b.x = raw[1]
        b.z = raw[2]
        b.snapped = true
      }
      b.tx = raw[1]
      b.tz = raw[2]
      b.tyaw = raw[3]
      b.moving = (flags & 4) !== 0
      if ((flags & 2) !== 0 && !b.landed) {
        b.landed = true
        b.y = terrainH(b.x, b.z)
        this.ensureBotMesh(b)
      }
      if ((flags & 1) === 0 && b.alive) this.killBotVisual(b)
    }
  }

  /** match events: hits, kills, loot, vehicles, win, leaves… */
  private onNetEv(p: Record<string, unknown>): void {
    if (this.disposed || this.practice) return
    const o = String(p.o ?? '')           // origin — skip my own echoes
    if (o === myOid()) return
    const me = myOid()
    const ty = String(p.ty ?? '')
    if (ty === 'mcount') {
      const n = Math.max(0, Math.min(TOTAL - 1, Number(p.n) || 0))
      if (!this.botsBuilt) {
        this.buildBots(n)
        this.botsBuilt = true
      } else if (this.bots.length !== n) {
        // roster skew correction — rebuild with the leader's count
        for (const b of this.bots) {
          if (b.rig) {
            this.mapScene.remove(b.rig.root)
            disposeTree(b.rig.root)
          }
        }
        this.bots = []
        this.buildBots(n)
      }
      return
    }
    if (ty === 'hit') {
      if (String(p.tgt) === me && this.phase === 'live') {
        this.lastDamager = { u: String(p.by ?? ''), n: String(p.byN ?? 'Operator') }
        this.damagePlayer(Number(p.dmg) || 9, String(p.byN ?? 'an operator'))
      }
      return
    }
    if (ty === 'bothit') {
      if (this.botLeader) {
        const b = this.bots.find(x => x.id === Number(p.bid))
        if (b && b.alive) {
          b.hp -= Number(p.dmg) || 10
          if (b.hp <= 0) this.killBot(b, String(p.byN ?? 'Operator'), String(p.by ?? ''), false)
        }
      }
      return
    }
    if (ty === 'kill') {
      const tgt = String(p.tgt ?? '')
      const tgtN = String(p.tgtN ?? 'Operator')
      const by = String(p.by ?? '')
      const byN = String(p.byN ?? 'Operator')
      if (by === me) {
        this.kills++
        getAudio().killConfirm()
      }
      useBr.getState().addFeed(`${byN.toUpperCase()} eliminated ${tgtN.toUpperCase()}`, by === me)
      if (tgt.startsWith('b')) {
        const b = this.bots.find(x => x.id === Number(tgt.slice(1)))
        if (b && b.alive) this.killBotVisual(b)
      } else if (tgt !== me) {
        const op = this.remoteOps.get(tgt)
        if (op && op.alive) this.killOpVisual(op)
      }
      return
    }
    if (ty === 'loot') {
      const i = Number(p.i)
      if (Number.isInteger(i) && i >= 0 && i < this.loot.length) {
        const spot = this.loot[i]
        if (!spot.taken) {
          spot.taken = true
          if (spot.mesh) {
            this.mapScene.remove(spot.mesh)
            disposeTree(spot.mesh)
            spot.mesh = null
            spot.item = null
          }
        }
      }
      return
    }
    if (ty === 'lootdrop') {
      const x = Number(p.x)
      const z = Number(p.z)
      const w = String(p.w ?? 'p9') as WeaponId
      if (Number.isFinite(x) && Number.isFinite(z)) this.spawnLootDrop(x, z, w)
      return
    }
    // v12: another operator placed a build piece → replicate locally
    if (ty === 'build') {
      const k = String(p.k) as BuildKind
      const cx = Number(p.cx), cz = Number(p.cz), e = Number(p.e), lv = Number(p.lv)
      const id = String(p.id ?? '')
      if ((k === 'wall' || k === 'ramp' || k === 'floor')
        && Number.isInteger(cx) && Number.isInteger(cz)
        && Number.isFinite(e) && Number.isFinite(lv) && id) {
        const owner = String(p.o ?? '')
        // guard: not a duplicate (rejoined/replayed events)
        if (!this.builds.some(b => b.owner === owner && b.id === id)) {
          this.spawnBuildPiece({ kind: k, cx, cz, edge: Math.max(0, Math.min(3, Math.round(e))), lv: Math.round(lv) }, id, owner, false)
        }
      }
      return
    }
    // v12: a build piece was destroyed somewhere
    if (ty === 'bdes') {
      this.destroyBuildById(String(p.o ?? ''), String(p.id ?? ''))
      return
    }
    if (ty === 'veh') {
      const i = Number(p.i)
      if (!Number.isInteger(i) || i < 0 || i >= this.vehicles.length) return
      const v = this.vehicles[i]
      if (String(p.st) === 'take') {
        v.occupied = true
      } else {
        v.occupied = false
        v.speed = 0
        const x = Number(p.x)
        const z = Number(p.z)
        const yaw = Number(p.y)
        if (Number.isFinite(x) && Number.isFinite(z)) {
          v.x = x
          v.z = z
          if (Number.isFinite(yaw)) v.yaw = yaw
          v.group.position.set(v.x, terrainH(v.x, v.z), v.z)
          v.group.rotation.y = v.yaw
        }
      }
      return
    }
    if (ty === 'win') {
      const u = String(p.u ?? '')
      if (u && u !== me && this.phase === 'live') {
        this.playerDeath(String(p.n ?? 'the champion'))
      }
      return
    }
    if (ty === 'leave') {
      const op = this.remoteOps.get(String(p.u ?? ''))
      if (op && op.alive) {
        this.killOpVisual(op)
        useBr.getState().addFeed(`${op.n.toUpperCase()} LEFT THE MATCH`, false)
      }
      return
    }
  }

  /** visual death of a REAL remote operator */
  private killOpVisual(op: RemoteOp): void {
    if (!op.alive) return
    op.alive = false
    op.deadAt = this.clock
    op.veh = -1
    if (op.rig) op.rig.root.visible = true
  }

  // ----------------------------------------------------------
  // PLAYER DAMAGE / DEATH / VICTORY
  // ----------------------------------------------------------
  private damagePlayer(dmg: number, source: string): void {
    if (this.phase !== 'live') return
    this.hp -= dmg
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 45)
    if (this.hp <= 0) {
      this.hp = 0
      this.playerDeath(source)
    }
  }

  private playerDeath(source: string): void {
    if (this.inVehicle) this.exitVehicle()
    this.phase = 'dead'
    const placement = this.aliveCount() + 1   // survivors + you
    this.endTime = performance.now()
    getAudio().deathSound()
    useBr.getState().set({ phase: 'dead', placement, hp: 0 })
    useBr.getState().addFeed(`YOU WERE ELIMINATED BY ${source.toUpperCase()} · #${placement}`, false)
    recordBr({
      placement,
      kills: this.kills,
      duration: Math.max(0, (this.endTime - this.matchStartAt) / 1000),
    })
    if (!this.practice && this.matchId) {
      // v11: the whole island hears about it (credit to the last damager)
      esNet.brPublishEv({
        ty: 'kill', o: myOid(), tgt: myOid(), tgtN: useAuth.getState().user ?? 'Operator',
        by: this.lastDamager?.u ?? '', byN: source,
      })
    }
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  private checkVictory(): void {
    if (this.phase !== 'live') return
    if (this.aliveCount() <= 1) {
      this.phase = 'victory'
      this.endTime = performance.now()
      getAudio().roundEnd()
      useBr.getState().set({ phase: 'victory', placement: 1, alive: 1 })
      recordBr({
        placement: 1,
        kills: this.kills,
        duration: Math.max(0, (this.endTime - this.matchStartAt) / 1000),
      })
      if (!this.practice && this.matchId) {
        // v11: crown broadcast — everyone sees the champion
        esNet.brPublishEv({ ty: 'win', o: myOid(), u: myOid(), n: useAuth.getState().user ?? 'Operator' })
      }
      if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    }
  }

  // ----------------------------------------------------------
  // MINIMAP
  // ----------------------------------------------------------
  private renderMapBase(): void {
    const N = 120
    const c = document.createElement('canvas')
    c.width = 240; c.height = 240
    const ctx = c.getContext('2d')!
    const px = 240 / N
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (i / N) * MAP * 2 - MAP
        const z = (j / N) * MAP * 2 - MAP
        const h = terrainH(x, z)
        let col = '#4d6b3a'
        if (h < -1.2) col = '#2a5a7a'
        else if (h > 33) col = '#d8dce2'
        else if (h > 13) col = '#7d776e'
        else if (h > 6) col = '#5f6b4a'
        ctx.fillStyle = col
        ctx.fillRect(i * px, j * px, px + 1, px + 1)
      }
    }
    // cities + lakes + POI labels
    ctx.fillStyle = '#3a3d42'
    for (const city of CITIES) {
      const cx = (city.x + MAP) / (MAP * 2) * 240
      const cz = (city.z + MAP) / (MAP * 2) * 240
      ctx.fillRect(cx - 13, cz - 13, 26, 26)
    }
    ctx.strokeStyle = '#c9b483'
    ctx.font = '700 8px monospace'
    ctx.fillStyle = 'rgba(255,240,210,0.85)'
    ctx.textAlign = 'center'
    for (const p of POIS) {
      const cx = (p.x + MAP) / (MAP * 2) * 240
      const cz = (p.z + MAP) / (MAP * 2) * 240
      ctx.strokeText(p.name, cx, cz)
      ctx.fillText(p.name, cx, cz)
    }
    this.mapBase = c
  }

  private drawMinimap(): void {
    if (!this.mapBase || this.phase === 'queue') return
    const ctx = this.minimapCanvas.getContext('2d')
    if (!ctx) return
    const S = this.minimapCanvas.width
    ctx.clearRect(0, 0, S, S)
    ctx.drawImage(this.mapBase, 0, 0, S, S)

    const toMap = (x: number, z: number): [number, number] => [
      (x + MAP) / (MAP * 2) * S,
      (z + MAP) / (MAP * 2) * S,
    ]

    // storm circle (current) + next circle
    const [scx, scz] = toMap(this.stormCX, this.stormCZ)
    const rPix = this.stormR / (MAP * 2) * S
    ctx.strokeStyle = 'rgba(255,70,90,0.95)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(scx, scz, rPix, 0, Math.PI * 2); ctx.stroke()
    // shade outside the circle
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, S, S)
    ctx.arc(scx, scz, rPix, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(200,30,50,0.16)'
    ctx.fill()
    ctx.restore()
    if (this.stormState === 'wait' && this.stormIdx < STORM_PHASES.length) {
      const nextR = STORM_PHASES[this.stormIdx].r / (MAP * 2) * S
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.arc(scx, scz, nextR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // enemy fire pings
    for (const p of this.pings) {
      const [px, pz] = toMap(p.x, p.z)
      ctx.fillStyle = `rgba(255,80,80,${clamp(p.t / 2, 0, 1)})`
      ctx.beginPath(); ctx.arc(px, pz, 3.4, 0, Math.PI * 2); ctx.fill()
    }

    // player arrow
    const [px, pz] = toMap(this.px, this.pz)
    ctx.save()
    ctx.translate(px, pz)
    ctx.rotate(-this.yaw)
    ctx.fillStyle = '#ffe9c4'
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4.4, 5)
    ctx.lineTo(0, 2.4)
    ctx.lineTo(-4.4, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // N indicator
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '700 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('N', S / 2, 12)
  }

  // ----------------------------------------------------------
  // HUD SYNC
  // ----------------------------------------------------------
  /** v11.2: current spread in degrees — feeds the dynamic crosshair */
  private crosshairSpread(): number {
    if (!this.weapon) return 1.2
    const w = WEAPONS[this.weapon]
    const sprintKey = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const crouchKey = this.keys.has('ControlLeft')
    const hSpeed = this.movingFast() ? (sprintKey ? 7.4 : crouchKey ? 2.4 : 5.0) : 0
    let spread = w.spreadBase
    spread += w.spreadMove * Math.min(1, hSpeed / 6)
    if (!this.onGround) spread += w.spreadAir
    if (crouchKey) spread *= 0.72
    if (this.adsAmt > 0.6) spread *= 0.45
    spread += this.sprayIdx * w.sprayInacc
    return spread
  }

  private syncHud(): void {
    const t = performance.now()
    if (t - this.hudAt < 120) return
    this.hudAt = t
    const brSet = useBr.getState().set
    const w = this.weapon ? WEAPONS[this.weapon] : null
    const ph = STORM_PHASES[Math.min(this.stormIdx, STORM_PHASES.length - 1)]
    brSet({
      hp: Math.max(0, Math.round(this.hp)),
      weapon: this.weapon ?? '',
      weaponLabel: w ? w.name.toUpperCase() : 'UNARMED — LOOT A WEAPON',
      weaponRarity: this.weaponRarity,
      mag: this.mag,
      reserve: this.reserve,
      alive: this.aliveCount(),
      kills: this.kills,
      stormPhase: this.stormIdx + 1,
      stormLabel: this.stormState === 'wait' ? `STORM MOVES IN ${Math.ceil(this.stormTimer)}s` : 'STORM SHRINKING',
      stormTimer: Math.ceil(Math.max(0, this.stormTimer)),
      // v11.2: dynamic crosshair (same spread inputs) + sniper scope
      spread: this.crosshairSpread(),
      scope: !!this.weapon && !!WEAPONS[this.weapon].sniper && this.adsAmt > 0.7,
    })
  }

  // ----------------------------------------------------------
  // MAIN LOOP
  // ----------------------------------------------------------
  private loop = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.lastT) / 1000
    this.lastT = now
    dt = Math.min(dt, 0.1)
    this.clock += dt

    // progressive map build (one chunk per frame) — v11: HELD until the
    // match seed is known, so every client builds the SAME world
    if (this.buildQueue.length && this.worldSeed !== null) {
      const chunk = this.buildQueue.shift()!
      chunk()
    }

    // v11.2: everything freezes behind the pause menu (render keeps running)
    if (!this.paused) {
      if (this.phase === 'queue') this.updateQueue(now, dt)
      this.updatePlane(dt)
      this.updateFreefall(dt)
      this.updatePlayer(dt)
      this.updateBots(dt, now)
      this.updateRemoteOps(dt)
      this.updateStorm(dt)
      this.updateTracers()
      this.publishPose(now)
      this.netHousekeeping(now)
      this.checkVictory()

      // ---- v11.2: FOV + ADS + sprint + spray (same model as the normal modes) ----
      const wNow = this.weapon ? WEAPONS[this.weapon] : null
      const targetFov = this.ads && this.phase === 'live' && !this.reloading && wNow
        ? (wNow.zoomFov || 62)
        : this.sprintAmt > 0.3 ? 74 + 7 * this.sprintAmt : 74
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10)
      this.camera.updateProjectionMatrix()
      this.adsAmt += ((this.ads && this.phase === 'live' && !this.reloading ? 1 : 0) - this.adsAmt) * Math.min(1, dt * 9)
      this.sprintAmt += (((this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && this.movingFast() && !this.ads ? 1 : 0) - this.sprintAmt) * Math.min(1, dt * 8)
      if (now - this.lastShotTime > 380) this.sprayIdx = Math.max(0, this.sprayIdx - dt * 18)
      // sniper ADS: hide the viewmodel (scope takes over, like the normal modes)
      if (this.vmGroup) this.vmGroup.visible = !(wNow?.sniper && this.adsAmt > 0.7)
    }

    // dead: slow orbit spectate over the drop area
    if (this.phase === 'dead' || this.phase === 'victory') {
      const k = this.clock * 0.14
      const focus = this.phase === 'dead'
        ? new THREE.Vector3(this.px, terrainH(this.px, this.pz), this.pz)
        : new THREE.Vector3(this.px, terrainH(this.px, this.pz), this.pz)
      this.camera.position.set(focus.x + Math.cos(k) * 34, focus.y + 22, focus.z + Math.sin(k) * 34)
      this.camera.lookAt(focus)
    } else {
      // camera from player state
      this.camera.rotation.order = 'YXZ'
      this.camera.rotation.set(this.pitch, this.yaw, 0)
      this.camera.position.set(this.px, this.py, this.pz)
    }

    // viewmodel kick recovery + reload finish
    if (this.vmGroup) {
      this.vmKick *= Math.max(0, 1 - dt * 9)
      // v11.2: hip → ADS pose (the SAME weaponPose data as the normal modes)
      const a = this.adsAmt
      const pose = this.weapon ? weaponPose(this.weapon) : null
      const bx = pose ? pose.hip.x + (pose.ads.x - pose.hip.x) * a : this.vmBase.x
      const by = pose ? pose.hip.y + (pose.ads.y - pose.hip.y) * a : this.vmBase.y
      const bz = pose ? pose.hip.z + (pose.ads.z - pose.hip.z) * a : this.vmBase.z
      const bob = this.movingFast() && this.phase === 'live' && !this.inVehicle
        ? Math.sin(this.clock * 9.5) * 0.008 * (1 - a * 0.7)
        : 0
      // v9.1: pose base del arma real (weaponPose) + patada y balanceo encima
      this.vmGroup.position.set(
        bx,
        by + bob,
        bz + this.vmKick * 0.09 * (1 - a * 0.6),
      )
      this.vmGroup.rotation.set(
        (this.vmBaseRot.x + this.vmKick * 0.16) * (1 - a),
        this.vmBaseRot.y * (1 - a),
        this.vmBaseRot.z * (1 - a * 0.8),
      )
    }
    // v9.1: el loot flota y gira — se lee como recogible
    for (const s of this.loot) {
      if (s.taken || !s.item) continue
      s.item.rotation.y += dt * 1.4
      s.item.position.y = 0.85 + Math.sin(this.clock * 2 + s.x * 0.35) * 0.08
    }
    if (this.reloading && now >= this.reloadEndAt) {
      this.reloading = false
      const w = this.weapon ? WEAPONS[this.weapon] : null
      if (w && this.weapon) {
        const need = w.mag - this.mag
        const take = Math.min(need, this.reserve)
        this.mag += take
        this.reserve -= take
      }
    }
    // hurt flash decay
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6)
    // ping decay
    for (const p of this.pings) p.t -= dt
    this.pings = this.pings.filter(p => p.t > 0)
    // v10: las nubes derivan despacio (solo alta/ultra las crean)
    for (const c of this.clouds) {
      c.position.x += dt * 1.1
      if (c.position.x > MAP * 1.35) c.position.x = -MAP * 1.35
    }
    // v10: el sol cuelga del cielo, no de la cámara (posición fija ya puesta)

    this.syncHud()
    this.drawMinimap()
    this.renderer.render(this.scene, this.camera)
  }

  // ----------------------------------------------------------
  // FINISH MAP BUILD
  // ----------------------------------------------------------
  private finishMapBuild(): void {
    this.mapReady = true
    this.renderMapBase()
    useBr.getState().set({ loadingMap: false })
  }

  // ----------------------------------------------------------
  // PUBLIC API (used by the HUD / mount)
  // ----------------------------------------------------------
  leave(): void {
    // voluntary exit — records the current placement if still alive
    if (this.phase === 'live') {
      const placement = this.aliveCount() + 1
      recordBr({
        placement,
        kills: this.kills,
        duration: Math.max(0, (performance.now() - this.matchStartAt) / 1000),
      })
    }
    if (!this.practice && this.matchId) {
      // v11: the other operators keep fighting — count me out
      esNet.brPublishEv({ ty: 'leave', o: myOid(), u: myOid(), n: useAuth.getState().user ?? 'Operator' })
    }
    this.dispose()
  }

  get hurtLevel(): number { return this.hurtFlash }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // v11: leave the lobby + match channels cleanly
    if (this.mcountTimer) { clearTimeout(this.mcountTimer); this.mcountTimer = null }
    esNet.brLeaveQueue()
    esNet.brMatchLeave()
    this.remoteOps.clear()
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('mouseup', this.onMouseUp)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    getAudio().setDuck(false)
    // v10: cortar el chat ambiente y vaciar el canal
    this.chatStop?.()
    this.chatStop = null
    useChat.getState().reset()
    useChat.getState().setMode('pvp')
    this.clouds.length = 0
    this.sunSprite = null
    // v9.1: no seguir escuchando llegadas de armas GLB
    this.weaponGLBUnsub?.()
    this.weaponGLBUnsub = null

    // free ALL GPU resources (isolated architecture: nothing leaks).
    // v9.1: disposeTree respeta lo COMPARTIDO con la caché global (armas
    // GLB, materiales de Arbol.glb) y las texturas Pared/Piso del usuario;
    // el resto (plantilla del soldado por instancia, clones teñidos,
    // geometría horneada de bosques, props) se libera por completo.
    disposeTree(this.lobbyScene)
    disposeTree(this.mapScene)
    // v12: build pieces belong to mapScene but tracked separately — free cleanly
    this.hideGhost()
    for (const b of this.builds) {
      this.mapScene.remove(b.mesh)
      disposeTree(b.mesh)
    }
    this.builds = []
    this.buildCols = []
    this.buildMode = null
    this.buildMats.wall = null
    this.buildMats.floor = null
    this.buildMats.ramp = null
    this.buildMats.frame = null
    if (this.soldierTemplate) disposeTree(this.soldierTemplate)
    this.soldierTemplate = null
    try { this.renderer.dispose() } catch { /* ok */ }

    useBr.getState().reset()
    useGame.getState().setPhase('menu')
  }
}

/** convenience factory used by the mount component */
export function startBrGame(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement): BattleRoyaleGame {
  const game = new BattleRoyaleGame(canvas, minimapCanvas)
  game.init()
  return game
}
