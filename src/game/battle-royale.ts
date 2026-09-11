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
import { useAuth, recordBr, useSquad } from './auth'
import { useChat, startAmbientChat } from './chat'
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
interface TreeCol { x: number; z: number; r: number }
interface LootSpot {
  x: number; z: number
  kind: 'weapon' | 'ammo' | 'med' | 'crate'
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
  private nextJoinAt = 0
  private countdown = 0
  private countdownRunning = false
  private matchStartAt = 0
  private humansTarget = 8            // simulated real connections before bots

  // map build queue (spread over frames during the countdown)
  private buildQueue: (() => void)[] = []
  private mapReady = false

  // lobby extras
  private lobbyWalkers: { rig: BodyRig; phase: number; dest: [number, number] }[] = []

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
  /** muros/tejados creados sin textura aún — se parchean al llegar Pared/Piso */
  private texMats: { mat: THREE.MeshStandardMaterial; kind: 'wall' | 'roof'; rx: number; ry: number }[] = []
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

    // matchmaking: the local player is already "connected"
    const me = useAuth.getState().user ?? useGame.getState().playerName ?? 'Operator'
    this.queue = [{ name: me, real: true }]
    this.humansTarget = Math.floor(rand(6, 11))
    this.nextJoinAt = performance.now() + rand(1500, 3000)
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
    // el BR es SIEMPRE solos: si tienes grupo activo, se queda en el menú
    const squad = useSquad.getState()
    if (squad.members.length > 0) {
      useBr.getState().addFeed('BATTLE ROYALE IS ALWAYS SOLOS — your squad stays at the menu', false)
    }

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
    if (e.code === 'Escape' && document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code) }
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return
    const s = useGame.getState().settings
    const sens = s.sens * 0.0022
    this.yaw -= e.movementX * sens
    this.pitch = clamp(this.pitch - e.movementY * sens, -1.35, 1.35)
  }
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) { this.requestLock(); return }
    if (e.button === 0) this.tryShoot()
  }
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas
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
  }
  requestLock(): void {
    if (this.phase === 'dead' || this.phase === 'victory') return
    void this.canvas.requestPointerLock?.()
  }

  // ----------------------------------------------------------
  // LOBBY ISLAND
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
    const sand = new THREE.Mesh(
      new THREE.CircleGeometry(34, 44),
      new THREE.MeshStandardMaterial({ color: 0xc9b483, roughness: 1 }),
    )
    sand.rotation.x = -Math.PI / 2
    sand.position.y = 0.02
    scene.add(sand)
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(27, 40),
      new THREE.MeshStandardMaterial({ color: 0x6d8a4c, roughness: 1 }),
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.y = 0.06
    scene.add(grass)

    // palms (trunk + fan of leaves)
    const palmPositions: [number, number][] = [
      [-20, 8], [18, -12], [-14, -18], [22, 14], [0, 24], [-24, -4], [12, 22], [4, -24],
    ]
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
      palm.position.set(tx, 0, tz)
      scene.add(palm)
    }

    // crates + weapon rack (set dressing)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.85 })
    for (const [cx, cz, rot] of [[-6, -3, 0.3], [-5, -2, 0.9], [6, 4, 0.2], [5.6, 3, 1.2]] as const) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), crateMat)
      c.position.set(cx, 0.55, cz)
      c.rotation.y = rot
      scene.add(c)
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
      () => this.buildStorm(),
      () => this.buildBots(),
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
    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96,
      ...(this.effQuality !== 'baja' ? { map: makeNoiseDetailTexture(72) } : {}),
    })
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
    const cloneCache = new Map<string, THREE.Texture>()
    for (const { mat, kind, rx, ry } of this.texMats) {
      if (mat.map) continue
      const key = `${kind}:${rx}x${ry}`
      let t = cloneCache.get(key)
      if (!t) {
        t = (kind === 'wall' ? repo.pared : repo.piso).clone()
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
    const roofPropMat = new THREE.MeshStandardMaterial({ color: 0x71706b, roughness: 0.6, metalness: 0.45 })
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 0.8 })
    const awningMat = new THREE.MeshStandardMaterial({ color: 0x8f3b2f, roughness: 0.85, side: THREE.DoubleSide })
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9d988e, roughness: 0.95 })

    // ---- v10: textured roads (asphalt + lane markings) + sidewalks ----
    const asphalt = makeAsphaltTexture()
    const road = (w: number, d: number, x: number, z: number, ry: number): void => {
      const t = asphalt.clone()
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(d / 8)))
      t.needsUpdate = true
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.94 }))
      r.rotation.x = -Math.PI / 2
      r.rotation.z = ry
      r.position.set(x, terrainH(x, z) + 0.05, z)
      this.mapScene.add(r)
    }
    const half = 3 * city.r / 2
    road(half, 7, city.x, city.z, 0)
    road(7, half, city.x, city.z, 0)
    road(half, 7, city.x, city.z, Math.PI / 2)
    // sidewalks flanking the two main avenues
    for (const off of [-4.6, 4.6]) {
      const swA = new THREE.Mesh(new THREE.BoxGeometry(half, 0.16, 1.7), sidewalkMat)
      swA.position.set(city.x, terrainH(city.x, city.z + off) + 0.12, city.z + off)
      swA.receiveShadow = true
      this.mapScene.add(swA)
      const swB = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, half), sidewalkMat)
      swB.position.set(city.x + off, terrainH(city.x + off, city.z) + 0.12, city.z)
      swB.receiveShadow = true
      this.mapScene.add(swB)
    }

    // ---- buildings: 11-13 per city, richly detailed ----
    const placed: { x: number; z: number; w: number; d: number }[] = []
    let tries = 0
    while (placed.length < 12 && tries < 260) {
      tries++
      const w = rand(7, 13), d = rand(7, 13)
      const ang = rand(0, Math.PI * 2)
      const rr = rand(6, city.r - 10)
      const x = city.x + Math.cos(ang) * rr
      const z = city.z + Math.sin(ang) * rr
      if (Math.hypot(x - city.x, z - city.z) < 11) continue    // keep the crossroads clear
      if (placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.z - z) < (p.d + d) / 2 + 4)) continue
      placed.push({ x, z, w, d })

      const h = rand(5, 17)
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
    const contMat = new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.7, metalness: 0.3 })
    for (let i = 0; i < 8; i++) {
      const ang = rand(0, Math.PI * 2)
      const rr = rand(10, city.r - 6)
      const x = city.x + Math.cos(ang) * rr
      const z = city.z + Math.sin(ang) * rr
      const gy = terrainH(x, z)
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 6.2), contMat)
      c.position.set(x, gy + 1.2, z)
      c.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2
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
    const shop = Math.random() < 0.34
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
    const hasBalconies = h > 8.5 && Math.random() < 0.6
    if (hasBalconies) {
      const bFaces = Math.random() < 0.5 ? [-1, 1] : [1, -1]
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
    const mast = new THREE.CylinderGeometry(0.06, 0.09, 3.6 + Math.random() * 2.4, 6)
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
      const count = poi.name === 'SERENE LAKE' ? 3 : 4
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + rand(-0.4, 0.4)
        const rr = rand(6, poi.r - 4)
        const x = poi.x + Math.cos(ang) * rr
        const z = poi.z + Math.sin(ang) * rr
        const gy = terrainH(x, z)
        if (gy < -0.8) continue    // don't build in the water
        const w = rand(5, 8), d = rand(5, 8), h = rand(3.2, 5.2)
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
    const count = eff === 'baja' ? 50 : eff === 'media' ? 84 : 116
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
      const sc = rand(0.8, 1.35)
      v.set(t.x, gy + 1.7 * sc, t.z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2))
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
      if (Math.random() < 0.78) {
        const c = clusters[Math.floor(rand(0, clusters.length))]
        x = c[0] + rand(-16, 16)
        z = c[1] + rand(-16, 16)
      } else {
        x = rand(-MAP + 8, MAP - 8)
        z = rand(-MAP + 8, MAP - 8)
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
        q.setFromAxisAngle(UP_AXIS, rand(0, Math.PI * 2))
        const v = rand(0.85, 1.3)
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

  private buildVehicles(): void {
    const bodyColors = [0x9a3b2f, 0x2f5a7a, 0x7a6a2f, 0x3f5a3f, 0x5a4a5f, 0x8f8f8f]
    const spots: [number, number][] = []
    for (const c of CITIES) {
      spots.push([c.x + rand(-24, 24), c.z + rand(-24, 24)])
      spots.push([c.x + rand(-24, 24), c.z + rand(-24, 24)])
    }
    spots.push([POIS[0].x + 10, POIS[0].z + 8])
    spots.push([POIS[1].x - 8, POIS[1].z + 6])
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.9 })
    spots.forEach((s, i) => {
      const [x, z] = s
      const gy = terrainH(x, z)
      if (gy < -0.6) return
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
      group.rotation.y = rand(0, Math.PI * 2)
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
      wid: WEAPON_POOL[Math.floor(rand(0, WEAPON_POOL.length))],
      rar: rollBrRarity(minTier),
    })
    // cities: dense floor loot
    for (const c of CITIES) {
      for (let i = 0; i < 10; i++) {
        const ang = rand(0, Math.PI * 2)
        const rr = rand(5, c.r - 5)
        const x = c.x + Math.cos(ang) * rr
        const z = c.z + Math.sin(ang) * rr
        const roll = Math.random()
        if (roll < 0.5) {
          const { wid, rar } = rollWeapon()
          addSpot(x, z, 'weapon', wid, rar)
        } else if (roll < 0.75) addSpot(x, z, 'ammo', 'p9')
        else addSpot(x, z, 'med', 'p9')
      }
      // 2 supply crates per city — weapon guaranteed RARE+ (Fortnite chest rule)
      for (let i = 0; i < 2; i++) {
        const { wid, rar } = rollWeapon(2)
        addSpot(c.x + rand(-20, 20), c.z + rand(-20, 20), 'crate', wid, rar)
      }
    }
    // POIs
    for (const p of POIS) {
      for (let i = 0; i < 3; i++) {
        const roll = Math.random()
        if (roll < 0.45) {
          const { wid, rar } = rollWeapon()
          addSpot(p.x + rand(-p.r, p.r), p.z + rand(-p.r, p.r), 'weapon', wid, rar)
        } else if (roll < 0.75) addSpot(p.x + rand(-p.r, p.r), p.z + rand(-p.r, p.r), 'ammo', 'p9')
        else addSpot(p.x + rand(-p.r, p.r), p.z + rand(-p.r, p.r), 'med', 'p9')
      }
    }
    // scattered countryside loot
    for (let i = 0; i < 12; i++) {
      addSpot(rand(-MAP + 10, MAP - 10), rand(-MAP + 10, MAP - 10),
        Math.random() < 0.5 ? 'ammo' : 'med', 'p9')
    }
    // meshes (lazy built once the map is active — they belong to mapScene)
    for (const s of this.loot) s.mesh = this.buildLootMesh(s)
  }

  private buildLootMesh(s: LootSpot): THREE.Group {
    const group = new THREE.Group()
    const gy = terrainH(s.x, s.z)
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
    this.stormTargetC = [rand(-30, 30), rand(-30, 30)]
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
        this.stormTargetC = this.nextStormCenter(ph.r)
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
      // bots
      for (const b of this.bots) {
        if (!b.alive || !b.landed) continue
        const d = Math.hypot(b.x - this.stormCX, b.z - this.stormCZ)
        if (d > this.stormR) {
          b.hp -= ph.dps * 3.2
          if (b.hp <= 0) this.killBot(b, 'the storm', false)
        }
      }
    }
  }

  /** next storm center kept inside the current circle */
  private nextStormCenter(r: number): [number, number] {
    const maxOff = Math.max(0, this.stormR - r - 4)
    const ang = rand(0, Math.PI * 2)
    const off = rand(0, maxOff)
    return [
      clamp(this.stormCX + Math.cos(ang) * off, -MAP + r, MAP - r),
      clamp(this.stormCZ + Math.sin(ang) * off, -MAP + r, MAP - r),
    ]
  }

  // ----------------------------------------------------------
  // BOTS
  // ----------------------------------------------------------
  private buildBots(): void {
    const names = [...SIM_NAMES].sort(() => Math.random() - 0.5)
    for (let i = 0; i < TOTAL - 1; i++) {
      // drop target: weighted to POIs/cities
      // (v9.1 FIX: la versión anterior indexaba un array de UN elemento con
      //  Math.floor(rand(0,2)) → undefined → excepción → la sala se quedaba
      //  con ~4-6 operadores en vez de 20)
      let anchor: { x: number; z: number; r?: number }
      if (Math.random() < 0.62) {
        anchor = Math.random() < 0.5
          ? CITIES[Math.floor(rand(0, CITIES.length))]
          : { x: rand(-60, 60), z: rand(-60, 60), r: 10 }
      } else {
        anchor = { x: rand(-MAP + 14, MAP - 14), z: rand(-MAP + 14, MAP - 14), r: 10 }
      }
      const b: BrBot = {
        id: i + 1,
        name: names[i % names.length],
        alive: true,
        x: anchor.x + rand(-8, 8),
        y: 0,
        z: anchor.z + rand(-8, 8),
        yaw: rand(0, Math.PI * 2),
        hp: 100,
        weapon: WEAPON_POOL[Math.floor(rand(0, WEAPON_POOL.length))],
        // v10: los operadores también portan armas con rareza (daño escalado)
        rarity: rollBrRarity(0),
        destX: anchor.x + rand(-8, 8),
        destZ: anchor.z + rand(-8, 8),
        thinkAt: 0,
        nextShotAt: 0,
        accuracy: rand(0.32, 0.6),
        targetBot: -1,
        targetPlayer: false,
        mesh: null,
        rig: null,
        tint: i,
        legPhase: rand(0, 10),
        deadAt: 0,
        dropAt: rand(1, 4),
        landed: false,
        dropX: anchor.x + rand(-8, 8),
        dropZ: anchor.z + rand(-8, 8),
      }
      b.x = b.dropX
      b.z = b.dropZ
      this.bots.push(b)
    }
  }

  // ----------------------------------------------------------
  // v9.1 — SOLDADO REAL (soldier1.glb del usuario, plantilla por instancia)
  // ----------------------------------------------------------
  /** carga y normaliza la plantilla (misma normalización que el juego
   *  principal: escala a 1,84 m, Sketchfab BLEND→opaco, PBR moderado) */
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
        // find target: player or nearest bot within 62 m
        let best = -1
        let bestD = 62
        let targetPlayer = false
        if (this.phase === 'live') {
          const d = Math.hypot(this.px - b.x, this.pz - b.z)
          if (d < bestD) { bestD = d; targetPlayer = true }
        }
        for (const o of this.bots) {
          if (o === b || !o.alive || !o.landed) continue
          const d = Math.hypot(o.x - b.x, o.z - b.z)
          if (d < bestD) { bestD = d; best = o.id; targetPlayer = false }
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
        } else if (best < 0 && !targetPlayer) {
          // roam: POI-biased wandering
          const ang = rand(0, Math.PI * 2)
          const rr = rand(10, 34)
          b.destX = clamp(b.x + Math.cos(ang) * rr, -MAP + 10, MAP - 10)
          b.destZ = clamp(b.z + Math.sin(ang) * rr, -MAP + 10, MAP - 10)
        }
      }
      // --- shoot ---
      if ((b.targetBot >= 0 || b.targetPlayer) && t > b.nextShotAt) {
        b.nextShotAt = t + rand(260, 620)
        const tx = b.targetPlayer ? this.px : this.bots.find(o => o.id === b.targetBot)?.x ?? b.x
        const tz = b.targetPlayer ? this.pz : this.bots.find(o => o.id === b.targetBot)?.z ?? b.z
        const d = Math.hypot(tx - b.x, tz - b.z)
        if (d < 64) {
          // tracer toward the target + shot sound (distance-based)
          const from = new THREE.Vector3(b.x, b.y + 1.4, b.z)
          const to = new THREE.Vector3(tx, terrainH(tx, tz) + 1.2, tz)
          this.spawnTracer(from, to)
          if (b.targetPlayer) {
            const distToPlayer = Math.hypot(this.px - b.x, this.pz - b.z)
            getAudio().gunshot(WEAPONS[b.weapon].sound, clamp(distToPlayer / 6, 0, 60))
            this.pings.push({ x: b.x, z: b.z, t: 2 })
            const hitChance = b.accuracy * (1 - d / 78) * (this.movingFast() ? 0.7 : 1)
            if (Math.random() < hitChance) {
              // v10: el daño del bot escala con la rareza de SU arma
              const rarMult = BR_RARITIES[b.rarity]?.dmgMult ?? 1
              const dmg = rand(7, 13) * (WEAPONS[b.weapon].damage / 34) * rarMult
              this.damagePlayer(dmg, b.name)
            }
          } else {
            // bot vs bot: probabilistic damage
            const victim = this.bots.find(o => o.id === b.targetBot)
            if (victim && victim.alive) {
              const hitChance = b.accuracy * (1 - d / 78)
              if (Math.random() < hitChance) {
                const rarMult = BR_RARITIES[b.rarity]?.dmgMult ?? 1
                victim.hp -= rand(9, 16) * rarMult
                if (victim.hp <= 0) this.killBot(victim, b.name, false)
              }
            }
          }
        }
      }
      // --- move ---
      let mx = b.destX
      let mz = b.destZ
      if (b.targetBot >= 0 || b.targetPlayer) {
        // strafe combat: keep some distance
        const tx = b.targetPlayer ? this.px : this.bots.find(o => o.id === b.targetBot)?.x ?? b.x
        const tz = b.targetPlayer ? this.pz : this.bots.find(o => o.id === b.targetBot)?.z ?? b.z
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
      if (dl > 1.2) {
        const speed = (b.targetBot >= 0 || b.targetPlayer) ? 3.6 : 4.4
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
    if (t - this.botThink > 15000) {
      this.botThink = t
      const alive = this.bots.filter(b => b.alive && b.landed)
      if (alive.length > 3 && this.aliveCount() < this.bots.filter(b => b.alive).length + 1 && Math.random() < 0.5) {
        // pick a random far duel and resolve it
        const a = alive[Math.floor(rand(0, alive.length))]
        const victims = alive.filter(v => v !== a && Math.hypot(v.x - a.x, v.z - a.z) > 80)
        if (victims.length) {
          const victim = victims[Math.floor(rand(0, victims.length))]
          this.killBot(victim, a.name, false)
        }
      }
    }
  }

  private aliveCount(): number {
    return this.bots.filter(b => b.alive).length + (this.phase === 'live' ? 1 : 0)
  }

  private killBot(b: BrBot, killer: string, byPlayer: boolean): void {
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
    const feed = useBr.getState()
    feed.addFeed(`${killer.toUpperCase()} eliminated ${b.name.toUpperCase()}`, byPlayer)
    if (byPlayer) {
      this.kills++
      getAudio().killConfirm()
    }
    // drop ammo where they fell
    this.loot.push({ x: b.x, z: b.z, kind: 'ammo', weapon: b.weapon, rarity: 0, taken: false, mesh: null, item: null })
    const spot = this.loot[this.loot.length - 1]
    spot.mesh = this.buildLootMesh(spot)
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

  // ----------------------------------------------------------
  // MATCHMAKING (lobby island) — countdown at 4 connected
  // ----------------------------------------------------------
  private updateQueue(t: number, dt: number): void {
    const brSet = useBr.getState().set
    if (!this.countdownRunning) {
      // players "connect" one by one
      if (t > this.nextJoinAt && this.queue.length < this.humansTarget) {
        this.nextJoinAt = t + rand(2200, 5200)
        const name = SIM_NAMES[(this.queue.length * 3 + 1) % SIM_NAMES.length] + (Math.random() < 0.4 ? String(Math.floor(rand(10, 99))) : '')
        this.queue.push({ name, real: true })
        brSet({ queuePlayers: [...this.queue] })
        // a walker appears on the island
        if (this.lobbyWalkers.length < this.queue.length + 1) {
          const rig = this.buildBotBody(this.lobbyWalkers.length, WEAPON_POOL[this.lobbyWalkers.length % WEAPON_POOL.length])
          rig.root.position.set(rand(-16, 16), 0, rand(-14, 14))
          this.lobbyScene.add(rig.root)
          this.lobbyWalkers.push({ rig, phase: rand(0, 10), dest: [rand(-16, 16), rand(-16, 16)] })
        }
        getAudio().uiClick()
      }
      // v9: countdown of one minute starts as soon as 4 players are connected
      if (this.queue.length >= REAL_TARGET && this.mapReady) {
        this.countdownRunning = true
        this.countdown = COUNTDOWN_S
        brSet({ countdownActive: true, countdown: COUNTDOWN_S })
        getAudio().announceDing()
      }
    } else {
      this.countdown -= dt
      brSet({ countdown: Math.max(0, Math.ceil(this.countdown)) })
      if (this.countdown <= 0) {
        // fill the room to 20 with bots → board the plane
        const botsNeeded = TOTAL - this.queue.length
        brSet({
          countdownActive: false,
          countdown: 0,
          alive: TOTAL,
          kills: 0,
          phase: 'plane',
          loadingMap: false,
        })
        useBr.getState().addFeed(`MATCH START — ${this.queue.length} operators + ${Math.max(0, botsNeeded)} bots`, false)
        this.startPlane()
      }
    }
    // lobby walkers wander (soldiers with their weapons on the island)
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
  // PLANE + DROP
  // ----------------------------------------------------------
  private startPlane(): void {
    this.phase = 'plane'
    this.planeT = 0
    this.planeDur = 15
    this.matchStartAt = performance.now()
    // random line across the island through its center
    const ang = rand(0, Math.PI * 2)
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
      useBr.getState().addFeed('BOOTS ON THE GROUND — loot fast, the storm comes', false)
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

    // jump + gravity on the terrain
    const groundY = terrainH(this.px, this.pz) + EYE
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
    } else {
      // follow the terrain (also handles walking uphill)
      this.py = groundY
    }

    // interaction (E): loot + vehicles
    this.updateInteraction()
  }

  /** circle collision vs buildings + trees */
  private blocked(x: number, z: number, r: number): boolean {
    for (const b of this.aabbs) {
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true
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
          : bestLoot.kind === 'med' ? 'MEDKIT' : 'AMMO BOX'
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
    if (s.kind === 'weapon' || s.kind === 'crate') {
      const wid = s.weapon
      this.weapon = wid
      this.weaponRarity = s.rarity
      this.mag = WEAPONS[wid].mag
      this.reserve = WEAPONS[wid].mag * 2
      this.reloading = false
      this.attachViewmodel(wid)
      getAudio().draw()
      if (s.kind === 'crate') {
        // crates also patch you up
        this.hp = Math.min(100, this.hp + 45)
        getAudio().pickup(true)
      }
      const rar = BR_RARITIES[s.rarity]
      useBr.getState().addFeed(`PICKED UP [${rar?.label ?? 'COMMON'}] ${WEAPONS[wid].name.toUpperCase()} — ${rar ? Math.round((rar.dmgMult - 1) * 100) : 0}% DMG`, true)
    } else if (s.kind === 'med') {
      if (this.hp >= 100) { this.wantJump = false; return }
      this.hp = Math.min(100, this.hp + 55)
      getAudio().pickup(false)
    } else {
      // ammo: refill current weapon reserves
      if (this.weapon) this.reserve += WEAPONS[this.weapon].mag * 2
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
  }

  // ----------------------------------------------------------
  // VEHICLES
  // ----------------------------------------------------------
  private enterVehicle(v: BrVehicle): void {
    v.occupied = true
    this.inVehicle = v
    getAudio().uiClick()
    useBr.getState().set({ inVehicle: true })
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

    // muzzle light
    if (this.muzzle) {
      this.muzzle.position.copy(this.camera.position)
      this.muzzle.intensity = 30
      this.muzzleUntil = now + 60
    }

    // raycast: bots (head/body spheres) + buildings + terrain
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const origin = this.camera.position.clone()
    let hitPoint = origin.clone().addScaledVector(dir, 220)
    let hitBot: BrBot | null = null
    let headshot = false

    // bots first (spheres)
    let bestT = 220
    for (const b of this.bots) {
      if (!b.alive || !b.landed) continue
      const center = new THREE.Vector3(b.x, b.y + 1.05, b.z)
      const headC = new THREE.Vector3(b.x, b.y + 1.68, b.z)
      const tB = this.raySphere(origin, dir, center, 0.62)
      const tH = this.raySphere(origin, dir, headC, 0.3)
      if (tH >= 0 && tH < bestT) { bestT = tH; hitBot = b; headshot = true }
      if (tB >= 0 && tB < bestT) { bestT = tB; hitBot = b; headshot = false }
    }
    // buildings (ray vs AABB, slab method)
    let buildingT = 220
    for (const a of this.aabbs) {
      const t = this.rayAABB(origin, dir, a)
      if (t >= 0 && t < buildingT) buildingT = t
    }
    if (buildingT < bestT) { bestT = buildingT; hitBot = null }

    // terrain (coarse march)
    let terrainT = 220
    for (let d = 2; d < 220; d += 1.5) {
      const p = origin.clone().addScaledVector(dir, d)
      if (p.y <= terrainH(p.x, p.z)) { terrainT = d; break }
    }
    if (terrainT < bestT) { bestT = terrainT; hitBot = null }

    hitPoint = origin.clone().addScaledVector(dir, Math.min(bestT, 220))
    this.spawnTracer(origin.clone().addScaledVector(dir, 1.2), hitPoint)

    if (hitBot) {
      // damage with weapon stats + falloff (+ v10 rarity multiplier)
      const w2 = WEAPONS[this.weapon]
      let dmg = w2.damage * (headshot ? w2.headMult : 1)
      dmg *= BR_RARITIES[this.weaponRarity]?.dmgMult ?? 1
      if (bestT > w2.falloffStart) {
        const f = clamp((bestT - w2.falloffStart) / Math.max(1, w2.falloffEnd - w2.falloffStart), 0, 1)
        dmg *= 1 - f * (1 - w2.falloffMin)
      }
      hitBot.hp -= dmg
      getAudio().fleshHit(Math.min(20, bestT))
      if (hitBot.hp <= 0) this.killBot(hitBot, useAuth.getState().user ?? 'Operator', true)
      else if (!hitBot.landed) { /* can't hit un-landed bots anyway */ }
    } else {
      getAudio().impact(clamp(bestT / 8, 0, 30))
    }
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
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  private checkVictory(): void {
    if (this.phase !== 'live') return
    if (this.bots.every(b => !b.alive)) {
      this.phase = 'victory'
      this.endTime = performance.now()
      getAudio().roundEnd()
      useBr.getState().set({ phase: 'victory', placement: 1, alive: 1 })
      recordBr({
        placement: 1,
        kills: this.kills,
        duration: Math.max(0, (this.endTime - this.matchStartAt) / 1000),
      })
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

    // progressive map build (one chunk per frame during matchmaking)
    if (this.buildQueue.length) {
      const chunk = this.buildQueue.shift()!
      chunk()
    }

    if (this.phase === 'queue') this.updateQueue(now, dt)
    this.updatePlane(dt)
    this.updateFreefall(dt)
    this.updatePlayer(dt)
    this.updateBots(dt, now)
    this.updateStorm(dt)
    this.updateTracers()
    this.checkVictory()

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
      const bob = this.movingFast() && this.phase === 'live' && !this.inVehicle
        ? Math.sin(this.clock * 9.5) * 0.008
        : 0
      // v9.1: pose base del arma real (weaponPose) + patada y balanceo encima
      this.vmGroup.position.set(
        this.vmBase.x,
        this.vmBase.y + bob,
        this.vmBase.z + this.vmKick * 0.09,
      )
      this.vmGroup.rotation.set(
        this.vmBaseRot.x + this.vmKick * 0.16,
        this.vmBaseRot.y,
        this.vmBaseRot.z,
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
    this.dispose()
  }

  get hurtLevel(): number { return this.hurtFlash }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
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
