// ============================================================
// EMERGENCY STRIKE — BATTLE ROYALE (v9)
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
// Map: 280×280 (twice the 140×140 Team Deathmatch city) with
// 2 cities, mountains, 2 lakes, forests, drivable vehicles,
// weapon loot, supply crates and a progressive storm.
// Flow: lobby island (matchmaking) → plane drop → glider →
// live → last operator standing.
// Graphics: capped to LOW / MEDIUM for stability.
// ============================================================
import * as THREE from 'three'
import { GAME, WEAPONS, type WeaponId } from './shared'
import { useBr, type BrQueuePlayer } from './br-store'
import { useGame } from './store'
import { useAuth, recordBr } from './auth'
import { getAudio } from './audio'
import { getRepoTextures } from './assets'
import { buildWeaponModel } from './viewmodel'

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

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const smooth = (t: number): number => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x) }

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
  taken: boolean
  mesh: THREE.Group | null
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
  legPhase: number
  deadAt: number
  dropAt: number     // becomes active when landed
  landed: boolean
  dropX: number; dropZ: number
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
  private lobbyWalkers: { group: THREE.Group; phase: number; dest: [number, number] }[] = []

  private hudAt = 0
  private botThink = 0
  private endTime = 0

  constructor(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.minimapCanvas = minimapCanvas
  }

  // ----------------------------------------------------------
  // INIT
  // ----------------------------------------------------------
  init(): void {
    const brSet = useBr.getState().set
    // v9: BR allows LOW/MEDIUM only — cap the profile for stability
    const q = useGame.getState().settings.quality
    const eff = (q === 'alta' || q === 'ultra') ? 'media' : q
    if (eff !== q) brSet({ qualityNote: 'Graphics profile capped to MEDIUM in Battle Royale for stability' })

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: eff === 'media' })
    this.renderer.setPixelRatio(eff === 'baja' ? 0.75 : Math.min(devicePixelRatio, 1))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02

    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 900)

    // ---- LOBBY SCENE (island) ----
    this.lobbyScene = this.buildLobbyScene()

    // ---- MAP SCENE (built progressively) ----
    this.mapScene = new THREE.Scene()
    this.mapScene.background = new THREE.Color(0x0c1420)
    this.mapScene.fog = new THREE.FogExp2(0x0c1420, eff === 'baja' ? 0.0032 : 0.0024)
    this.buildMapSky(this.mapScene)
    this.buildMapLights(this.mapScene, eff)
    this.enqueueMapBuild(eff)

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
    })

    getAudio().setDuck(true)   // music ducks down during BR

    this.bindInput()
    this.lastT = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ----------------------------------------------------------
  // INPUT
  // ----------------------------------------------------------
  private onKeyDown = (e: KeyboardEvent): void => {
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

    // waiting operators (bots idle/walking on the island as they "connect")
    for (let i = 0; i < 10; i++) {
      const g = this.buildBotMesh(0x3a4a5a, 0x2c3642)
      g.position.set(rand(-18, 18), 0, rand(-16, 16))
      g.rotation.y = rand(0, Math.PI * 2)
      scene.add(g)
      this.lobbyWalkers.push({ group: g, phase: rand(0, 10), dest: [rand(-16, 16), rand(-16, 16)] })
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
    // gradient sky dome (dusk)
    const skyGeo = new THREE.SphereGeometry(820, 24, 12)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x1c2c47) },
        mid: { value: new THREE.Color(0x8f6a4a) },
        bot: { value: new THREE.Color(0x2a2018) },
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
  }

  private buildMapLights(scene: THREE.Scene, eff: string): void {
    const sun = new THREE.DirectionalLight(0xffcf9e, 1.35)
    sun.position.set(-120, 150, -60)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0x9db8d0, 0x4a4636, 0.62))
    if (eff === 'media') {
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      const c = sun.shadow.camera
      c.left = -90; c.right = 90; c.top = 90; c.bottom = -90
      c.far = 420
      sun.shadow.bias = -0.0004
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
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }))
    this.mapScene.add(mesh)

    // ocean plane around the island (to the horizon)
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({ color: 0x27435c, roughness: 0.3, metalness: 0.1 }),
    )
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -2.2
    this.mapScene.add(ocean)
  }

  private buildWater(): void {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3d7a9e, roughness: 0.18, metalness: 0.25,
      transparent: true, opacity: 0.92,
      emissive: 0x0c2432, emissiveIntensity: 0.35,
    })
    for (const l of LAKES) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(l.r, 36), waterMat)
      w.rotation.x = -Math.PI / 2
      w.position.set(l.x, -0.75, l.z)
      this.mapScene.add(w)
    }
  }

  /** building material set — the user's own Pared1/Piso1 textures */
  private buildingMats(): { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial } {
    const repo = getRepoTextures()
    const pared = (repo as { pared?: THREE.Texture } | null)?.pared ?? null
    const piso = (repo as { piso?: THREE.Texture } | null)?.piso ?? null
    if (pared) { pared.wrapS = pared.wrapT = THREE.RepeatWrapping }
    if (piso) { piso.wrapS = piso.wrapT = THREE.RepeatWrapping }
    const wall = new THREE.MeshStandardMaterial(
      pared ? { map: pared, roughness: 0.92 } : { color: 0x9a8f7d, roughness: 0.92 },
    )
    const roof = new THREE.MeshStandardMaterial(
      piso ? { map: piso, roughness: 0.95 } : { color: 0x6b6257, roughness: 0.95 },
    )
    return { wall, roof }
  }

  private buildCity(idx: number): void {
    const city = CITIES[idx]
    const mats = this.buildingMats()
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x18202a, roughness: 0.4, metalness: 0.3,
      emissive: 0xffb45e, emissiveIntensity: 0.55,
    })
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 })

    // roads: a cross + ring
    const road = (w: number, d: number, x: number, z: number, ry: number): void => {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat)
      r.rotation.x = -Math.PI / 2
      r.rotation.z = ry
      r.position.set(x, terrainH(x, z) + 0.05, z)
      this.mapScene.add(r)
    }
    road(3 * city.r / 2, 7, city.x, city.z, 0)
    road(7, 3 * city.r / 2, city.x, city.z, 0)
    road(3 * city.r / 2, 7, city.x, city.z, Math.PI / 2)

    // buildings: 10-12 per city, non overlapping
    const placed: { x: number; z: number; w: number; d: number }[] = []
    let tries = 0
    while (placed.length < 11 && tries < 220) {
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
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall)
      b.position.set(x, gy + h / 2, z)
      b.castShadow = true
      b.receiveShadow = true
      this.mapScene.add(b)
      // roof slab
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), mats.roof)
      roof.position.set(x, gy + h + 0.17, z)
      this.mapScene.add(roof)
      // parapet
      const par = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 })
      for (const [ox, oz, sw, sd] of [
        [0, d / 2, w, 0.35], [0, -d / 2, w, 0.35], [w / 2, 0, 0.35, d], [-w / 2, 0, 0.35, d],
      ] as const) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.85, sd), par)
        p.position.set(x + ox, gy + h + 0.6, z + oz)
        this.mapScene.add(p)
      }
      // emissive window strips (2-3 per face, only on ±z faces for cheapness)
      const rows = Math.max(1, Math.floor(h / 4.5))
      for (let rI = 0; rI < rows; rI++) {
        for (const s of [-1, 1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 1.15, 0.18), windowMat)
          win.position.set(x, gy + 2.6 + rI * 4.2, z + s * (d / 2 + 0.12))
          this.mapScene.add(win)
        }
      }
      this.aabbs.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: gy + h })

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

  private buildPois(): void {
    const mats = this.buildingMats()
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
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall)
        b.position.set(x, gy + h / 2, z)
        b.castShadow = true
        this.mapScene.add(b)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), mats.roof)
        roof.position.set(x, gy + h + 0.15, z)
        this.mapScene.add(roof)
        this.aabbs.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: gy + h })
      }
    }
  }

  private buildForests(eff: string): void {
    const count = eff === 'baja' ? 150 : 230
    const spots: TreeCol[] = []
    let tries = 0
    while (spots.length < count && tries < count * 6) {
      tries++
      const x = rand(-MAP + 8, MAP - 8)
      const z = rand(-MAP + 8, MAP - 8)
      const h = terrainH(x, z)
      if (h < -0.6 || h > 20) continue
      if (CITIES.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 4)) continue
      if (POIS.some(p => Math.hypot(x - p.x, z - p.z) < p.r)) continue
      if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 3.4)) continue
      spots.push({ x, z, r: 0.55 })
    }
    this.trees = spots
    // instanced trunks + cones
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
    leaves.castShadow = eff === 'media'
    this.mapScene.add(trunks, leaves)
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
    const addSpot = (x: number, z: number, kind: LootSpot['kind'], weapon: WeaponId): void => {
      const gy = terrainH(x, z)
      if (gy < -0.8) return
      this.loot.push({ x, z, kind, weapon, taken: false, mesh: null })
    }
    // cities: dense floor loot
    for (const c of CITIES) {
      for (let i = 0; i < 10; i++) {
        const ang = rand(0, Math.PI * 2)
        const rr = rand(5, c.r - 5)
        const x = c.x + Math.cos(ang) * rr
        const z = c.z + Math.sin(ang) * rr
        const roll = Math.random()
        addSpot(x, z, roll < 0.5 ? 'weapon' : roll < 0.75 ? 'ammo' : 'med', WEAPON_POOL[Math.floor(rand(0, WEAPON_POOL.length))])
      }
      // 2 supply crates per city
      for (let i = 0; i < 2; i++) {
        addSpot(c.x + rand(-20, 20), c.z + rand(-20, 20), 'crate', WEAPON_POOL[Math.floor(rand(3, WEAPON_POOL.length))])
      }
    }
    // POIs
    for (const p of POIS) {
      for (let i = 0; i < 3; i++) {
        const roll = Math.random()
        addSpot(p.x + rand(-p.r, p.r), p.z + rand(-p.r, p.r),
          roll < 0.45 ? 'weapon' : roll < 0.75 ? 'ammo' : 'med', WEAPON_POOL[Math.floor(rand(0, WEAPON_POOL.length))])
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
    const color = s.kind === 'crate' ? 0xf59e0b : s.kind === 'med' ? 0x38d9a9 : s.kind === 'ammo' ? 0x8f8f5a : 0x9fd4ff
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
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    )
    beam.position.y = 3.5
    group.add(beam)
    // floating item
    const item = new THREE.Group()
    if (s.kind === 'weapon') {
      const model = buildWeaponModel(s.weapon).group
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
    group.position.set(s.x, gy, s.z)
    this.mapScene.add(group)
    return group
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
      const anchor = Math.random() < 0.62
        ? (Math.random() < 0.5 ? CITIES : [{ x: rand(-60, 60), z: rand(-60, 60), r: 10 }])[Math.floor(rand(0, 2))]
        : { x: rand(-MAP + 14, MAP - 14), z: rand(-MAP + 14, MAP - 14), r: 10 }
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
        destX: anchor.x + rand(-8, 8),
        destZ: anchor.z + rand(-8, 8),
        thinkAt: 0,
        nextShotAt: 0,
        accuracy: rand(0.32, 0.6),
        targetBot: -1,
        targetPlayer: false,
        mesh: null,
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

  /** low-poly soldier for bots + lobby walkers */
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
    // small rifle
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6, metalness: 0.4 })
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat)
    gun.position.set(0.2, 1.28, 0.24)
    g.add(gun)
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false })
    // animation handles
    ;(g as THREE.Group & { _legs?: THREE.Mesh[] })._legs = legs
    ;(g as THREE.Group & { _arms?: THREE.Mesh[] })._arms = arms
    return g
  }

  private ensureBotMesh(b: BrBot): void {
    if (b.mesh || !b.landed || !b.alive) return
    const g = this.buildBotMesh(0x4a4636, 0x5a4430)
    b.mesh = g
    this.mapScene.add(g)
  }

  private updateBots(dt: number, t: number): void {
    if (this.phase !== 'live') return
    for (const b of this.bots) {
      if (!b.alive) continue
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
              const dmg = rand(7, 13) * (WEAPONS[b.weapon].damage / 34)
              this.damagePlayer(dmg, b.name)
            }
          } else {
            // bot vs bot: probabilistic damage
            const victim = this.bots.find(o => o.id === b.targetBot)
            if (victim && victim.alive) {
              const hitChance = b.accuracy * (1 - d / 78)
              if (Math.random() < hitChance) {
                victim.hp -= rand(9, 16)
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
        const legs = (b.mesh as THREE.Group & { _legs?: THREE.Mesh[] })._legs ?? []
        const arms = (b.mesh as THREE.Group & { _arms?: THREE.Mesh[] })._arms ?? []
        const sw = Math.sin(b.legPhase) * 0.55
        if (legs[0]) legs[0].rotation.x = sw
        if (legs[1]) legs[1].rotation.x = -sw
        if (arms[0]) arms[0].rotation.x = -sw * 0.6
        if (arms[1]) arms[1].rotation.x = sw * 0.6
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
    if (b.mesh) {
      // fall over + stay as a body for a while
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
    this.loot.push({ x: b.x, z: b.z, kind: 'ammo', weapon: b.weapon, taken: false, mesh: null })
    const spot = this.loot[this.loot.length - 1]
    spot.mesh = this.buildLootMesh(spot)
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
          const g = this.buildBotMesh(0x3a4a5a, 0x2c3642)
          g.position.set(rand(-16, 16), 0, rand(-14, 14))
          this.lobbyScene.add(g)
          this.lobbyWalkers.push({ group: g, phase: rand(0, 10), dest: [rand(-16, 16), rand(-16, 16)] })
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
    // lobby walkers wander
    for (const w of this.lobbyWalkers) {
      const dx = w.dest[0] - w.group.position.x
      const dz = w.dest[1] - w.group.position.z
      const d = Math.hypot(dx, dz)
      if (d < 1) { w.dest = [rand(-16, 16), rand(-16, 16)] }
      else {
        w.group.position.x += (dx / d) * 1.5 * dt
        w.group.position.z += (dz / d) * 1.5 * dt
        w.group.rotation.y = Math.atan2(dx, dz)
        w.phase += dt * 8
        const legs = (w.group as THREE.Group & { _legs?: THREE.Mesh[] })._legs ?? []
        const sw = Math.sin(w.phase) * 0.5
        if (legs[0]) legs[0].rotation.x = sw
        if (legs[1]) legs[1].rotation.x = -sw
      }
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
        ? WEAPONS[bestLoot.weapon].name.toUpperCase()
        : bestLoot.kind === 'crate' ? 'SUPPLY CRATE'
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
      useBr.getState().addFeed(`PICKED UP ${WEAPONS[wid].name.toUpperCase()}`, true)
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
      s.mesh.traverse(o => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
      })
      s.mesh = null
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
      this.vmGroup.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.() })
    }
    const built = buildWeaponModel(wid)
    const model = built.group
    this.vmMuzzle = built.muzzle
    model.position.set(0.34, -0.3, -0.62)
    model.rotation.y = Math.PI
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
      // damage with weapon stats + falloff
      const w2 = WEAPONS[this.weapon]
      let dmg = w2.damage * (headshot ? w2.headMult : 1)
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
      this.vmGroup.position.z = -0.62 + this.vmKick * 0.09
      this.vmGroup.rotation.x = this.vmKick * 0.16
      const bob = this.movingFast() && this.phase === 'live' && !this.inVehicle
        ? Math.sin(this.clock * 9.5) * 0.008
        : 0
      this.vmGroup.position.y = -0.3 + bob
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

    // free ALL GPU resources (isolated architecture: nothing leaks)
    const disposeScene = (scene: THREE.Scene | null): void => {
      if (!scene) return
      scene.traverse(o => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material
        if (mat) {
          for (const m of Array.isArray(mat) ? mat : [mat]) {
            const mm = m as THREE.MeshStandardMaterial
            mm.map?.dispose?.()
            mm.dispose()
          }
        }
      })
    }
    disposeScene(this.lobbyScene)
    disposeScene(this.mapScene)
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
