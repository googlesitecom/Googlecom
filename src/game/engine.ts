// ============================================================
// FRONTERA CERO — Motor del juego (Three.js)
// Movimiento, colisiones, cámara, armas, efectos, minimapa
// ============================================================
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  GAME, WEAPONS, MAP_BOXES, MAP_AABBS, SPAWN_A, SPAWN_B, TREES, LAMPS, NEONS, PUDDLES,
  PICKUP_INFO, EXPLODING_BARRELS, ZIPLINES, JUMP_PADS, FLAG_A, FLAG_B, DOM_ZONES,
  type Team, type WeaponId, type NetSnapshot, type NetPlayerState, type NetPickup, type PickupKind, type MatKey, type GrenadeKind, type ActionId,
  isMouseButton, mouseButtonIndex,
} from './shared'
import { AudioEngine } from './audio'
import { Effects } from './effects'
import { RemotePlayers } from './remote-players'
import { buildWeaponModel, weaponPose, buildGrenadeModel } from './viewmodel'
import { makeWorldTextures, makeSkyTexture, makeAOBlobTexture, makeNeonTexture, makeSparkTexture, makeSmokeTexture } from './textures'
import { useGame } from './store'
import { NetClient } from './net'
import { preloadAssets, buildGLBWeapon, getTreeTemplate, getRepoTextures, onWeaponGLBsReady } from './assets'

interface DamageNumber { x: number; y: number; amount: number; t: number; headshot: boolean }
interface HitMarker { t: number; headshot: boolean }
interface DamageDir { angle: number; t: number }
interface Ping { x: number; z: number; t: number }
interface PickupView { group: THREE.Group; glow: THREE.Sprite; phase: number }

interface WeaponRuntime { mag: number; reserve: number }

interface BarrelView {
  mesh: THREE.Mesh
  x: number; z: number
  alive: boolean
  respawnAt: number
}

interface ZiplineView {
  from: THREE.Vector3
  to: THREE.Vector3
  dir: THREE.Vector3
  len: number
}

interface JumpPadView {
  x: number; z: number
  ring: THREE.Mesh
  glow: THREE.Sprite
  phase: number
}

const PRIMARY_PREF: WeaponId[] = ['awp338', 'cr4', 'ar47', 'breacher', 'mp9']
const SECONDARY_PREF: WeaponId[] = ['aguila', 'p9']
const HALF_W = 0.36
const UP_AXIS = new THREE.Vector3(0, 1, 0)
const EYE_STAND = 1.62
const EYE_CROUCH = 1.14
const BASE_FOV = 75

/** Parámetros PBR por material del mapa */
const MAT_PBR: Record<MatKey, { roughness: number; metalness: number }> = {
  sand: { roughness: 0.95, metalness: 0.0 },
  concrete: { roughness: 0.9, metalness: 0.0 },
  wood: { roughness: 0.85, metalness: 0.0 },
  metalRed: { roughness: 0.5, metalness: 0.55 },
  metalBlue: { roughness: 0.5, metalness: 0.55 },
  metalGreen: { roughness: 0.5, metalness: 0.55 },
  metalOrange: { roughness: 0.5, metalness: 0.55 },
  metalGrey: { roughness: 0.45, metalness: 0.65 },
  sandbag: { roughness: 1.0, metalness: 0.0 },
  crate: { roughness: 0.8, metalness: 0.0 },
  barrel: { roughness: 0.45, metalness: 0.5 },
  roof: { roughness: 0.65, metalness: 0.3 },
  explosive: { roughness: 0.42, metalness: 0.45 },
}

export class Game {
  // three
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private sunLight!: THREE.DirectionalLight
  private composer: EffectComposer | null = null

  // canvas
  private canvas3d!: HTMLCanvasElement
  private overlay!: HTMLCanvasElement
  private octx!: CanvasRenderingContext2D
  private minimap!: HTMLCanvasElement
  private mctx!: CanvasRenderingContext2D
  private mapStatic!: HTMLCanvasElement

  // módulos
  audio = new AudioEngine()
  private effects!: Effects
  private remotes!: RemotePlayers
  net!: NetClient

  // estado del jugador local
  pos = new THREE.Vector3(SPAWN_A[0], 0.02, SPAWN_A[2])
  private vel = new THREE.Vector3()
  yaw = Math.PI * 0.25
  pitch = 0
  private keys = new Set<string>()
  private onGround = true
  private crouching = false
  private sprinting = false
  dead = false
  hp = 100
  shield = 0
  money = 1000
  team: Team = 'A'
  private owned: WeaponId[] = ['knife', 'p9']
  private ammo: Partial<Record<WeaponId, WeaponRuntime>> = {}
  weapon: WeaponId = 'p9'
  private lastWeapon: WeaponId = 'knife'
  frags = 0
  smokes = 0

  // runtime de armas
  private nextShotAt = 0
  private sprayIdx = 0
  private lastShotTime = 0
  private reloading = false
  private reloadEndAt = 0
  private reloadStage = 0
  private adsAmt = 0
  private recoilP = 0
  private recoilY = 0
  private trauma = 0
  private sprintAmt = 0
  private bobT = 0
  private stepT = 0
  private throwCooldown = 0
  private lastInputSent = 0

  // viewmodel
  private vmHolder!: THREE.Group
  private vmGroup: THREE.Group | null = null
  private vmMuzzle: THREE.Object3D | null = null
  private drawT = 1
  private swayX = 0
  private swayY = 0
  private vmKick = 0

  // overlay 2D
  private dmgNumbers: DamageNumber[] = []
  private hitMarkers: HitMarker[] = []
  private dmgDirs: DamageDir[] = []
  private pings: Ping[] = []
  private deathT = 0
  private hurtFlash = 0

  // mando (gamepad)
  private padConnected = false
  private padIx = 0
  private padIz = 0
  private padSprint = false
  private padCrouch = false
  private padJump = false
  private padShootHeld = false
  private padAdsHeld = false
  private padSelectPrev = false
  private prevPadButtons: boolean[] = []

  // granadas visibles
  private grenadeViews = new Map<string, { group: THREE.Group; last: THREE.Vector3; trailT: number }>()
  // cortinas de humo visibles
  private smokeViews = new Map<string, { group: THREE.Group; sprites: THREE.Sprite[]; born: number; life: number }>()
  private smokeTex: THREE.Texture | null = null

  // cinemática de entrada
  private cine = {
    active: false,
    played: false,
    t0: 0,
    dur: 9.5,
    curve: null as THREE.CatmullRomCurve3 | null,
    look: null as THREE.CatmullRomCurve3 | null,
  }
  private cineTitleFade = 0

  // pociones visibles
  private pickupViews = new Map<string, PickupView>()

  // ---- mecánicas del mapa ----
  private barrels: BarrelView[] = []
  private ziplines: ZiplineView[] = []
  private jumpPads: JumpPadView[] = []
  /** tirolina en uso (índice) o null */
  private ziplineIdx = -1
  private ziplineT = 0
  /** deslizamiento (slide) */
  private slideT = 0
  private slideDir = new THREE.Vector3()
  /** aviso contextual ([E] tirolina) */
  interactHint = ''
  // pasto instanciado (viento)
  private grassUniform = { value: 0 }
  private grassMesh: THREE.InstancedMesh | null = null

  // ---- objetivos de los modos (banderas / zonas) ----
  private flagViews = new Map<'a' | 'b', { group: THREE.Group; cloth: THREE.Mesh; beam: THREE.Mesh }>()
  private zoneViews: { id: 'A' | 'B' | 'C'; ring: THREE.Mesh; ring2: THREE.Mesh; letter: THREE.Sprite }[] = []
  private zoneMatCache = new Map<string, THREE.MeshBasicMaterial>()

  // botones del ratón pulsados (para binds de disparar/apuntar)
  private mouseButtons = new Set<number>()

  // assets del usuario (GLB + texturas)
  private procTrees: THREE.Group | null = null
  private skyMesh: THREE.Mesh | null = null
  private groundMesh: THREE.Mesh | null = null

  // minimapa / mundo
  private shootables: THREE.Object3D[] = []
  private raycaster = new THREE.Raycaster()
  // reutilizados en cada raycast de bala (sin asignaciones por perdigón)
  private bulletRay = new THREE.Ray()
  private bulletPoint = new THREE.Vector3()
  private clock = new THREE.Clock()
  private raf = 0
  private fpsFrames = 0
  private fpsT = 0
  private minimapT = 0
  private scoreboardT = 0
  private mapMeshes: THREE.Mesh[] = []
  private disposed = false

  // pool de luces de farola (6 luces recolocables en las 18 farolas)
  private lampLights: THREE.PointLight[] = []
  private lampPos: [number, number][] = []
  private lampLightNext = 0

  // ----------------------------------------------------------
  // Inicialización
  // ----------------------------------------------------------
  init(canvas3d: HTMLCanvasElement, overlay: HTMLCanvasElement, minimap: HTMLCanvasElement): void {
    this.canvas3d = canvas3d
    this.overlay = overlay
    this.minimap = minimap
    this.octx = overlay.getContext('2d')!
    this.mctx = minimap.getContext('2d')!

    const quality = useGame.getState().settings.quality

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas3d,
      antialias: quality !== 'baja',
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(quality === 'alta' ? Math.min(devicePixelRatio, 2) : quality === 'media' ? Math.min(devicePixelRatio, 1.5) : 1)
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.renderer.shadowMap.enabled = quality !== 'baja'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0xd9ab7c, 0.0062)

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 560)
    this.scene.add(this.camera)

    this.buildSky()
    this.buildEnvironment()
    this.buildLights(quality)
    this.buildMap(quality)
    this.buildStreets()
    this.buildObjectives()
    this.buildMinimapStatic()

    // assets del usuario (GLB de armas/árbol + texturas): se cargan en segundo
    // plano y se integran al llegar (con fallback procedural hasta entonces)
    preloadAssets().then(() => {
      if (this.disposed) return
      // DIAGNÓSTICO: partes integradas por separado para localizar cuelgues
      const parts = (new URLSearchParams(location.search).get('assets') ?? 'all').split(',')
      if (parts.includes('all') || parts.includes('tex')) this.applyRepoTextures()
      if (parts.includes('all') || parts.includes('tree')) this.applyRepoTrees()
    })
    onWeaponGLBsReady(() => {
      if (this.disposed) return
      // refrescar el arma en mano y las de los remotos con los modelos GLB
      this.setWeapon(this.weapon, true)
      this.remotes.refreshWeapons()
    })

    this.effects = new Effects(this.scene)
    this.remotes = new RemotePlayers(this.scene)

    // viewmodel holder
    this.vmHolder = new THREE.Group()
    this.camera.add(this.vmHolder)
    this.setWeapon('p9', true)

    // post-proceso: bloom de neones y fogonazos (solo en calidad alta)
    if (quality === 'alta') {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.7, 0.88)
      this.composer.addPass(bloom)
      this.composer.addPass(new OutputPass())
    }

    // eventos
    this.bindEvents()

    this.net = new NetClient(this)

    // gancho de depuración (tests automatizados)
    ;(window as unknown as Record<string, unknown>).__game = this

    this.clock.start()
    this.loop()
  }

  private buildSky(): void {
    const skyTex = makeSkyTexture()
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(340, 32, 20),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    )
    this.scene.add(sky)
    this.skyMesh = sky
    // halo del sol bajo (atardecer)
    const sunDir = new THREE.Vector3(0.62, 0.42, -0.52).normalize()
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSkyTexture(), color: 0xffd9a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false,
    }))
    glow.position.copy(sunDir.clone().multiplyScalar(300))
    glow.scale.setScalar(150)
    this.scene.add(glow)
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSkyTexture(), color: 0xfff2cc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false,
    }))
    core.position.copy(sunDir.clone().multiplyScalar(298))
    core.scale.setScalar(46)
    this.scene.add(core)
  }

  /** Mapa de entorno para reflexiones PBR (PMREM del cielo de atardecer) */
  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide }),
    )
    envScene.add(envSky)
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
    )
    sunBall.position.set(30, 20, -25)
    envScene.add(sunBall)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({ color: 0x93714e }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -3
    envScene.add(ground)
    const envRT = pmrem.fromScene(envScene, 0.05)
    this.scene.environment = envRT.texture
    envRT.texture.needsUpdate = true
    pmrem.dispose()
  }

  private buildLights(quality: 'baja' | 'media' | 'alta'): void {
    const sun = new THREE.DirectionalLight(0xffdcae, 2.6)
    sun.position.set(52, 58, -40)
    if (quality !== 'baja') {
      sun.castShadow = true
      sun.shadow.mapSize.set(quality === 'alta' ? 4096 : 2048, quality === 'alta' ? 4096 : 2048)
      // la cámara de sombras sigue al jugador → sombras detalladas donde importa
      sun.shadow.camera.left = -48
      sun.shadow.camera.right = 48
      sun.shadow.camera.top = 48
      sun.shadow.camera.bottom = -48
      sun.shadow.camera.near = 4
      sun.shadow.camera.far = 260
      sun.shadow.bias = -0.00035
      sun.shadow.normalBias = 0.035
    }
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sunLight = sun

    const hemi = new THREE.HemisphereLight(0x9db4d0, 0x8a6a4a, 0.5)
    this.scene.add(hemi)

    // relleno cálido del atardecer desde el oeste
    const fill = new THREE.DirectionalLight(0xc7a17a, 0.5)
    fill.position.set(-40, 30, 30)
    this.scene.add(fill)
  }

  private buildMap(quality: 'baja' | 'media' | 'alta'): void {
    const texs = makeWorldTextures()

    // suelo (ligeramente satinado para reflejar el cielo del atardecer)
    const groundMat = new THREE.MeshStandardMaterial({ map: texs.sand, roughness: 0.88, metalness: 0.05 })
    groundMat.map!.repeat.set(46, 46)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(230, 230), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    this.shootables.push(ground)
    this.groundMesh = ground

    // materiales PBR compartidos (uno por tipo)
    const mats = new Map<MatKey, THREE.MeshStandardMaterial>()
    for (const key of Object.keys(MAT_PBR) as MatKey[]) {
      const p = MAT_PBR[key]
      mats.set(key, new THREE.MeshStandardMaterial({ map: texs[key], roughness: p.roughness, metalness: p.metalness }))
    }

    // cajas del mapa (UVs escaladas por cara para densidad de texel constante)
    // OPTIMIZACIÓN DE LAG (sin tocar el aspecto): las ~1100 cajas se hornean
    // y se FUSIONAN por material → ~10 mallas en vez de ~1100 meshes. El
    // número de draw calls (principal + pasada de sombras) pasa de ~2000
    // por frame a ~20; los triángulos son los mismos, el GPU apenas nota
    // la diferencia y el CPU se libera de enviar miles de comandos.
    const geoCache = new Map<string, THREE.BufferGeometry>()
    let barrelSeq = 0
    const staticGeos = new Map<MatKey, THREE.BufferGeometry[]>()
    for (const b of MAP_BOXES) {
      if (b.mat === 'barrel' || b.mat === 'explosive') {
        // los barriles siguen siendo meshes individuales (explotan/desaparecen)
        const key = `b${b.h}`
        let geo = geoCache.get(key)
        if (!geo) { geo = new THREE.CylinderGeometry(0.36, 0.36, b.h, 12); geoCache.set(key, geo) }
        const mesh = new THREE.Mesh(geo, mats.get(b.mat)!)
        if (b.mat === 'explosive') {
          mesh.userData.barrelIdx = barrelSeq
          this.barrels.push({ mesh, x: b.x, z: b.z, alive: true, respawnAt: 0 })
          barrelSeq++
        }
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.position.set(b.x, b.y, b.z)
        mesh.userData.matKey = b.mat
        this.scene.add(mesh)
        this.shootables.push(mesh)
        this.mapMeshes.push(mesh)
      } else {
        const key = `${b.w}|${b.h}|${b.d}`
        let geo = geoCache.get(key)
        if (!geo) {
          geo = new THREE.BoxGeometry(b.w, b.h, b.d)
          this.scaleBoxUVs(geo as THREE.BoxGeometry, b.w, b.h, b.d)
          geoCache.set(key, geo)
        }
        // clonar y hornear la posición (las cajas del mapa no rotan: AABB)
        const g = geo.clone()
        g.translate(b.x, b.y, b.z)
        let arr = staticGeos.get(b.mat)
        if (!arr) { arr = []; staticGeos.set(b.mat, arr) }
        arr.push(g)
      }
    }
    // fusionar por material (cada material conserva su textura y su UV)
    for (const [matKey, geos] of staticGeos) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!
      for (const g of geos) { if (g !== merged) g.dispose() }
      const mesh = new THREE.Mesh(merged, mats.get(matKey)!)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.matKey = matKey
      this.scene.add(mesh)
      this.shootables.push(mesh)
      this.mapMeshes.push(mesh)
    }

    // ---- oclusión de contacto fusionada (sombra suave bajo los objetos) ----
    this.buildContactShadows()

    // ---- decoración: árboles, farolas, neones, charcos, neumáticos ----
    this.buildDecor(texs)

    // ---- mecánicas del mapa: pasto, arbustos, flores, tirolinas, plataformas ----
    this.buildGrass(quality)
    this.buildBushes(quality)
    this.buildFlowers(quality)
    this.buildZiplines()
    this.buildJumpPads()

    // marcas de spawn (zonas de compra)
    for (const [sp, color] of [[SPAWN_A, 0xf59e0b], [SPAWN_B, 0x22c55e]] as [number[], number][]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(GAME.BUY_RADIUS - 0.15, GAME.BUY_RADIUS, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(sp[0], 0.03, sp[2])
      this.scene.add(ring)
    }
  }

  /** Escala las UVs de cada cara de una caja para texel uniforme con material compartido */
  private scaleBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const dims: [number, number][] = [
      [d, h], [d, h],  // +x, -x
      [w, d], [w, d],  // +y, -y
      [w, h], [w, h],  // +z, -z
    ]
    for (let f = 0; f < 6; f++) {
      const [du, dv] = dims[f]
      const su = Math.max(1, Math.round(Math.max(du, 0.6) / 2.4))
      const sv = Math.max(1, Math.round(Math.max(dv, 0.6) / 2.4))
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
      }
    }
    uv.needsUpdate = true
  }

  /** Quads de sombra suave fusionados en una sola malla (1 draw call) */
  private buildContactShadows(): void {
    const pos: number[] = []
    const uvs: number[] = []
    for (const b of MAP_BOXES) {
      if (b.h < 1.0) continue                       // solo objetos altos
      if (b.y - b.h / 2 > 0.6) continue             // apoyados en el suelo
      if (b.w > 26 || b.d > 26) continue            // sin muros de perímetro
      if (b.w < 1.4 && b.d < 1.4) continue
      const ex = b.w * 0.68, ez = b.d * 0.68
      const y = 0.021
      const x0 = b.x - ex, x1 = b.x + ex, z0 = b.z - ez, z1 = b.z + ez
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1)
      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
    }
    if (!pos.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    const mat = new THREE.MeshBasicMaterial({
      map: makeAOBlobTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 1
    this.scene.add(mesh)
  }

  /** Decoración sin colisión: árboles, farolas con luz, neones, charcos reflectantes */
  private buildDecor(texs: Record<MatKey, THREE.Texture>): void {
    // --- árboles (tronco con colisión ya está en el mapa) ---
    // (se agrupan para poder sustituirlos por el Arbol.glb al cargar)
    this.procTrees = new THREE.Group()
    const leafMatA = new THREE.MeshStandardMaterial({ color: 0x55683d, roughness: 0.95, flatShading: true })
    const leafMatB = new THREE.MeshStandardMaterial({ color: 0x47592f, roughness: 0.95, flatShading: true })
    const leafGeo = new THREE.SphereGeometry(1, 8, 7)
    for (const [tx, tz] of TREES) {
      for (const [ox, oy, oz, s, m] of [
        [0, 4.6, 0, 2.1, leafMatA], [0.9, 3.8, 0.4, 1.5, leafMatB], [-0.8, 3.9, -0.3, 1.4, leafMatB],
      ] as [number, number, number, number, THREE.MeshStandardMaterial][]) {
        const leaf = new THREE.Mesh(leafGeo, m)
        leaf.position.set(tx + ox, oy, tz + oz)
        leaf.scale.setScalar(s)
        leaf.castShadow = true
        this.procTrees.add(leaf)
        this.shootables.push(leaf)
      }
    }
    this.scene.add(this.procTrees)

    // --- farolas: cabezal + bombilla emisiva + luz puntual cálida ---
    // OPTIMIZACIÓN DE LAG: 18 farolas con PointLight propio = 18 luces
    // que el shader evalúa POR PÍXEL en todos los materiales (23 luces
    // puntuales en total). Se usan 6 luces de pool que se recolocan en
    // las farolas más cercanas al jugador (la bombilla emisiva + el
    // resplandor de todas las farolas se siguen viendo igual; a >30 m la
    // niebla oculta el charco de luz del suelo).
    const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.7 })
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc26b, emissiveIntensity: 4, roughness: 0.4 })
    const sparkTex = makeSparkTexture()
    this.lampPos = LAMPS.map(([lx, lz]) => [lx, lz] as [number, number])
    for (const [lx, lz] of LAMPS) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.42), headMat)
      head.position.set(lx, 5.15, lz)
      head.castShadow = true
      this.scene.add(head)
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.3), bulbMat)
      bulb.position.set(lx, 5.02, lz)
      this.scene.add(bulb)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sparkTex, color: 0xffc98a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      glow.position.set(lx, 5.0, lz)
      glow.scale.setScalar(1.6)
      this.scene.add(glow)
    }
    const nLampLights = Math.min(6, LAMPS.length)
    for (let i = 0; i < nLampLights; i++) {
      const light = new THREE.PointLight(0xffc477, 26, 16, 1.9)
      light.position.set(LAMPS[i][0], 4.85, LAMPS[i][1])
      this.scene.add(light)
      this.lampLights.push(light)
    }

    // --- letreros de neón ---
    for (const n of NEONS) {
      const tex = makeNeonTexture(n.text, n.color)
      const aspect = tex.image ? (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height : 4
      const h = n.w / aspect
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true })
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(n.w, h), mat)
      plane.position.set(n.x, n.y, n.z)
      plane.rotation.y = n.ry
      this.scene.add(plane)
      // marco trasero discreto
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(n.w + 0.3, h + 0.25),
        new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 }),
      )
      frame.position.set(n.x - Math.sin(n.ry) * 0.08, n.y, n.z - Math.cos(n.ry) * 0.08)
      frame.rotation.y = n.ry
      this.scene.add(frame)
    }

    // --- charcos reflectantes (reflejan el cielo del atardecer) ---
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x2a3038, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.8,
    })
    for (const p of PUDDLES) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(p.r, 20), puddleMat)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(p.x, 0.024, p.z)
      puddle.scale.set(1, 0.75, 1)
      this.scene.add(puddle)
    }

    // --- neumáticos apilados (barrio y gasolinera) ---
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 })
    const tireGeo = new THREE.TorusGeometry(0.46, 0.2, 8, 16)
    for (const [tx, tz, count] of [
      [-46.5, -9.6, 3], [33.5, -25.5, 2], [-33.5, 25.5, 2], [41.5, -26.5, 3],
    ] as [number, number, number][]) {
      for (let i = 0; i < count; i++) {
        const tire = new THREE.Mesh(tireGeo, tireMat)
        tire.rotation.x = -Math.PI / 2
        tire.rotation.z = Math.random() * Math.PI
        tire.position.set(tx + (Math.random() - 0.5) * 0.15, 0.2 + i * 0.38, tz + (Math.random() - 0.5) * 0.15)
        tire.castShadow = true
        tire.receiveShadow = true
        this.scene.add(tire)
      }
    }
    void texs
  }

  // ----------------------------------------------------------
  // Pasto instanciado (1 draw call, viento en el vertex shader)
  // ----------------------------------------------------------
  private buildGrass(quality: 'baja' | 'media' | 'alta'): void {
    const bladeH = 0.55
    // dos quads cruzados por brizna
    const plane = new THREE.PlaneGeometry(0.095, bladeH)
    plane.translate(0, bladeH / 2, 0)
    const plane2 = plane.clone()
    plane2.rotateY(Math.PI / 2)
    const geo = mergeGeometries([plane, plane2])!
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, side: THREE.DoubleSide, fog: true,
    })
    // viento: balanceo en el vertex shader usando la fase por instancia
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.grassUniform
      // declarar el uniform en el GLSL (sin esto el programa no compila)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float gwx = instanceMatrix[3][0];
          float gwz = instanceMatrix[3][2];
          float gph = gwx * 0.35 + gwz * 0.41;
          float gsway = sin(uTime * 1.7 + gph) * 0.5 + sin(uTime * 2.6 + gph * 1.7) * 0.5;
          float ghFac = max(0.0, position.y) / ${bladeH.toFixed(2)};
          transformed.x += gsway * 0.085 * ghFac;
          transformed.z += cos(uTime * 1.3 + gph) * 0.045 * ghFac;
        #endif`,
      )
    }

    const count = quality === 'alta' ? 14000 : quality === 'media' ? 9000 : 3200
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    mesh.frustumCulled = false
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const col = new THREE.Color()
    let placed = 0
    // matones alrededor de puntos abiertos (evitando AABBs y charcos)
    const clumps = Math.floor(count / 78)
    for (let c = 0; c < clumps && placed < count; c++) {
      const cx = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 4)
      const cz = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 4)
      // cerca de árboles: matones más densos y verdes
      let nearTree = 0
      for (const [tx, tz] of TREES) {
        const d = Math.hypot(tx - cx, tz - cz)
        if (d < 18) { nearTree = Math.max(nearTree, 1 - d / 18); break }
      }
      if (this.grassBlocked(cx, cz, 1.4)) continue
      const per = 58 + Math.floor(Math.random() * 34) + Math.floor(nearTree * 34)
      for (let i = 0; i < per && placed < count; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.pow(Math.random(), 0.6) * 1.5
        const gx = cx + Math.cos(a) * r
        const gz = cz + Math.sin(a) * r
        if (this.grassBlocked(gx, gz, 0.45)) continue
        pos.set(gx, 0, gz)
        q.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI)
        const hS = 0.65 + Math.random() * 0.75 + nearTree * 0.25
        sc.set(1, hS, 1)
        m.compose(pos, q, sc)
        mesh.setMatrixAt(placed, m)
        // tonos de pasto seco del desierto (más verde cerca de árboles)
        const t = Math.random()
        // verde oliva más marcado (tonos pajizos claros se leían como palos
        // pálidos en la distancia; el usuario pidió pasto más verde)
        col.setRGB(
          0.30 + t * 0.11 + nearTree * 0.04,
          0.44 + t * 0.16 + nearTree * 0.16,
          0.18 + t * 0.07,
        )
        mesh.setColorAt(placed, col)
        placed++
      }
    }
    // rellenar hasta el total con briznas sueltas si faltó
    while (placed < count) {
      const gx = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 4)
      const gz = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 4)
      if (this.grassBlocked(gx, gz, 0.45)) { mesh.setMatrixAt(placed, m.makeScale(0, 0, 0)); placed++; continue }
      pos.set(gx, 0, gz)
      q.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI)
      sc.set(1, 0.6 + Math.random() * 0.6, 1)
      m.compose(pos, q, sc)
      mesh.setMatrixAt(placed, m)
      col.setRGB(0.30 + Math.random() * 0.08, 0.44 + Math.random() * 0.14, 0.18 + Math.random() * 0.06)
      mesh.setColorAt(placed, col)
      placed++
    }
    mesh.count = placed
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
    this.grassMesh = mesh
    this.scene.add(mesh)
  }

  /** ¿hay un obstáculo, charco o CALLE en (x,z)? (para no plantar pasto en el asfalto) */
  private grassBlocked(x: number, z: number, margin: number): boolean {
    // calles y aceras (más un margen)
    if (Math.abs(x) < 6.2 + margin || Math.abs(z) < 6.2 + margin) return true
    if (Math.abs(Math.abs(x) - 35) < 4.2 + margin || Math.abs(Math.abs(z) - 35) < 4.2 + margin) return true
    if (Math.hypot(x, z) < 10.4 + margin) return true   // rotonda
    for (let i = 0; i < MAP_AABBS.length; i++) {
      const b = MAP_AABBS[i]
      if (b.minY > 0.6) continue // encima del suelo (techos) no importa
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) {
        if (b.maxY > 0.25) return true
      }
    }
    for (const p of PUDDLES) {
      if (Math.hypot(p.x - x, p.z - z) < p.r + 0.3) return true
    }
    return false
  }

  // ----------------------------------------------------------
  // Arbustos instanciados (1 draw call, sombra suave)
  // ----------------------------------------------------------
  private buildBushes(quality: 'baja' | 'media' | 'alta'): void {
    const count = quality === 'alta' ? 170 : quality === 'media' ? 110 : 50
    const geo = new THREE.IcosahedronGeometry(0.55, 1)
    geo.translate(0, 0.3, 0)
    geo.scale(1, 0.65, 1)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true })
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const col = new THREE.Color()
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 30) {
      const gx = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 5)
      const gz = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 5)
      if (this.grassBlocked(gx, gz, 0.8)) continue
      pos.set(gx, 0, gz)
      q.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI * 2)
      const s = 0.7 + Math.random() * 0.9
      sc.set(s, s * (0.75 + Math.random() * 0.5), s)
      m.compose(pos, q, sc)
      mesh.setMatrixAt(placed, m)
      const t = Math.random()
      col.setRGB(0.26 + t * 0.12, 0.36 + t * 0.16, 0.18 + t * 0.08)
      mesh.setColorAt(placed, col)
      placed++
    }
    mesh.count = placed
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
  }

  // ----------------------------------------------------------
  // Flores silvestres instanciadas (toques de color)
  // ----------------------------------------------------------
  private buildFlowers(quality: 'baja' | 'media' | 'alta'): void {
    const count = quality === 'alta' ? 700 : quality === 'media' ? 420 : 140
    const plane = new THREE.PlaneGeometry(0.17, 0.17)
    plane.translate(0, 0.12, 0)
    const plane2 = plane.clone()
    plane2.rotateY(Math.PI / 2)
    const geo = mergeGeometries([plane, plane2])!
    // Lambert (NO Basic): instanceColor no se aplica en MeshBasicMaterial
    // (las flores salían blancas); con Lambert el color por instancia funciona
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: true })
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const col = new THREE.Color()
    const palette = [0xffd94d, 0xfff3c8, 0xb18cff, 0xff8fb0]
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 30) {
      const gx = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 5)
      const gz = (Math.random() * 2 - 1) * (GAME.MAP_HALF - 5)
      if (this.grassBlocked(gx, gz, 0.4)) continue
      pos.set(gx, 0, gz)
      q.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI)
      const s = 0.7 + Math.random() * 0.7
      sc.set(s, s, s)
      m.compose(pos, q, sc)
      mesh.setMatrixAt(placed, m)
      col.setHex(palette[Math.floor(Math.random() * palette.length)])
      mesh.setColorAt(placed, col)
      placed++
    }
    mesh.count = placed
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
  }

  // ----------------------------------------------------------
  // Tirolinas: cable + anclas + agarre con E
  // ----------------------------------------------------------
  private buildZiplines(): void {
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.35, metalness: 0.85 })
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4235, roughness: 0.8, metalness: 0.2 })
    for (const z of ZIPLINES) {
      const from = new THREE.Vector3(...z.from)
      const to = new THREE.Vector3(...z.to)
      const dir = to.clone().sub(from)
      const len = dir.length()
      dir.normalize()
      // cable (cilindro orientado)
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), cableMat)
      cable.position.copy(from).addScaledVector(dir, len / 2)
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      cable.castShadow = true
      this.scene.add(cable)
      // postes en los extremos
      for (const [end, up] of [[from, 0.5], [to, 0.35]] as [THREE.Vector3, number][]) {
        const base = end.clone(); base.y = 0
        const h = Math.max(0.5, end.y - base.y + up)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, h, 8), postMat)
        post.position.set(end.x, base.y + h / 2, end.z)
        post.castShadow = true
        this.scene.add(post)
      }
      // polea colgante al inicio (señal visual)
      const pulley = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.03, 8, 14),
        new THREE.MeshStandardMaterial({ color: 0xd8a418, roughness: 0.4, metalness: 0.8 }),
      )
      pulley.position.copy(from).addScaledVector(dir, 0.25)
      pulley.position.y -= 0.12
      this.scene.add(pulley)
      this.ziplines.push({ from, to, dir, len })
    }
  }

  // ----------------------------------------------------------
  // Plataformas de salto (impulso automático al pisarlas)
  // ----------------------------------------------------------
  private buildJumpPads(): void {
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.5, metalness: 0.6 })
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    const sparkTex = makeSparkTexture()
    for (const p of JUMP_PADS) {
      const g = new THREE.Group()
      g.position.set(p.x, 0, p.z)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.14, 20), baseMat)
      base.position.y = 0.07
      base.castShadow = true
      base.receiveShadow = true
      g.add(base)
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.22, 26), ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.145
      g.add(ring)
      // chevrones de "salto"
      const chevMat = new THREE.MeshBasicMaterial({ color: 0xffb054, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      for (let i = 0; i < 3; i++) {
        const chev = new THREE.Mesh(new THREE.RingGeometry(0.18 + i * 0.14, 0.24 + i * 0.14, 3), chevMat)
        chev.rotation.x = -Math.PI / 2
        chev.rotation.z = Math.PI / 6
        chev.position.y = 0.15
        g.add(chev)
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sparkTex, color: 0xff9a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      glow.position.y = 0.5
      glow.scale.setScalar(2.4)
      g.add(glow)
      this.scene.add(g)
      this.jumpPads.push({ x: p.x, z: p.z, ring, glow, phase: Math.random() * Math.PI * 2 })
    }
  }

  // ----------------------------------------------------------
  // CALLES URBANAS (asfalto + líneas + aceras) — look Warzone
  // ----------------------------------------------------------
  private buildStreets(): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2e32, roughness: 0.94, metalness: 0.04 })
    const sidewalk = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.9 })
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 })
    // alturas escalonadas para evitar z-fighting con el terreno (mm → cm)
    const Y_ASPHALT = 0.03
    const Y_SIDEWALK = 0.06
    const Y_RING = 0.05
    const Y_DASH = 0.08
    const planes: [number, number, number, number][] = [
      // [cx, cz, w, d] — avenidas y calles secundarias
      [0, 0, 140, 12],      // avenida E-O
      [0, 0, 12, 140],      // avenida N-S
      [35, 0, 140, 8], [-35, 0, 140, 8],    // secundarias N-S
      [0, 35, 8, 140], [0, -35, 8, 140],    // secundarias E-O
    ]
    for (const [cx, cz, w, d] of planes) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt)
      m.rotation.x = -Math.PI / 2
      m.position.set(cx, Y_ASPHALT, cz)
      m.receiveShadow = true
      this.scene.add(m)
    }
    // rotonda: anillo de asfalto + pavimento interior
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 9.8, 40), asphalt)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, Y_RING, 0)
    this.scene.add(ring)
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.9, 32), sidewalk)
    inner.rotation.x = -Math.PI / 2
    inner.position.set(0, Y_RING + 0.01, 0)
    this.scene.add(inner)
    // aceras (franjas claras junto a las avenidas)
    const walks: [number, number, number, number][] = [
      [0, 7.1, 140, 1.4], [0, -7.1, 140, 1.4],
      [7.1, 0, 1.4, 140], [-7.1, 0, 1.4, 140],
      [35, 4.6, 140, 1.2], [35, -4.6, 140, 1.2], [-35, 4.6, 140, 1.2], [-35, -4.6, 140, 1.2],
      [4.6, 35, 1.2, 140], [-4.6, 35, 1.2, 140], [4.6, -35, 1.2, 140], [-4.6, -35, 1.2, 140],
    ]
    for (const [cx, cz, w, d] of walks) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sidewalk)
      m.rotation.x = -Math.PI / 2
      m.position.set(cx, Y_SIDEWALK, cz)
      m.receiveShadow = true
      this.scene.add(m)
    }
    // líneas discontinuas centrales (una sola malla fusionada)
    const dashes: THREE.BufferGeometry[] = []
    const dashGeo = new THREE.PlaneGeometry(1.1, 0.16)
    const addDash = (x: number, z: number, rot: boolean): void => {
      const g = dashGeo.clone()
      if (rot) g.rotateY(Math.PI / 2)
      g.translate(x, Y_DASH, z)
      dashes.push(g)
    }
    for (let x = -66; x <= 66; x += 4) {
      if (Math.abs(x) < 11) continue          // rotonda
      addDash(x, 0, false)
    }
    for (let z = -66; z <= 66; z += 4) {
      if (Math.abs(z) < 11) continue
      addDash(0, z, true)
    }
    if (dashes.length) {
      const merged = mergeGeometries(dashes, false)!
      const lines = new THREE.Mesh(merged, lineMat)
      lines.renderOrder = 2
      this.scene.add(lines)
    }
  }

  // ----------------------------------------------------------
  // OBJETIVOS DE MODO (banderas CTF · zonas de dominación)
  // ----------------------------------------------------------
  private buildObjectives(): void {
    const mode = useGame.getState().gameMode
    if (mode === 'bandera') {
      const mk = (key: 'a' | 'b', pos: [number, number], team: Team): void => {
        const color = team === 'A' ? 0xf59e0b : 0x22c55e
        const group = new THREE.Group()
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, 3.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.4, metalness: 0.8 }),
        )
        pole.position.y = 1.65
        pole.castShadow = true
        group.add(pole)
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 0.7),
          new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8, emissive: color, emissiveIntensity: 0.25 }),
        )
        cloth.position.set(0.56, 2.9, 0)
        group.add(cloth)
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.3, 12, 10, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
        )
        beam.position.y = 6
        group.add(beam)
        group.position.set(pos[0], 0, pos[1])
        this.scene.add(group)
        this.flagViews.set(key, { group, cloth, beam })
      }
      mk('a', FLAG_A, 'A')
      mk('b', FLAG_B, 'B')
    }
    if (mode === 'dominacion') {
      for (const z of DOM_ZONES) {
        const group = new THREE.Group()
        const mat = this.zoneMat(null)
        const ring = new THREE.Mesh(new THREE.RingGeometry(GAME.DOM_ZONE_RADIUS - 0.4, GAME.DOM_ZONE_RADIUS, 48), mat)
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        group.add(ring)
        const ring2 = new THREE.Mesh(new THREE.RingGeometry(GAME.DOM_ZONE_RADIUS - 1.6, GAME.DOM_ZONE_RADIUS - 1.3, 48), mat)
        ring2.rotation.x = -Math.PI / 2
        ring2.position.y = 0.05
        group.add(ring2)
        // letra de la zona (sprite de canvas)
        const c = document.createElement('canvas')
        c.width = 64; c.height = 64
        const ctx2 = c.getContext('2d')!
        ctx2.fillStyle = 'rgba(10,12,14,0.85)'
        ctx2.beginPath(); ctx2.arc(32, 32, 26, 0, Math.PI * 2); ctx2.fill()
        ctx2.fillStyle = '#ffffff'
        ctx2.font = '900 34px monospace'
        ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle'
        ctx2.fillText(z.name[0], 32, 34)
        const tex = new THREE.CanvasTexture(c)
        const letter = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
        letter.position.set(z.x, 6.5, z.z)
        letter.scale.setScalar(2.2)
        this.scene.add(letter)
        group.position.set(z.x, 0, z.z)
        this.scene.add(group)
        this.zoneViews.push({ id: z.id, ring, ring2, letter })
      }
    }
  }

  /** material de zona por propietario (cachéado) */
  private zoneMat(owner: Team | null): THREE.MeshBasicMaterial {
    const key = owner ?? 'null'
    let m = this.zoneMatCache.get(key)
    if (!m) {
      const color = owner === 'A' ? 0xf59e0b : owner === 'B' ? 0x22c55e : 0xb8bcc2
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
      this.zoneMatCache.set(key, m)
    }
    return m
  }

  /** actualiza visuales de banderas/zonas desde el snapshot */
  private updateObjectiveViews(round: NetSnapshot['round']): void {
    if (round.flags) {
      const place = (key: 'a' | 'b', fs: { status: string; x: number; z: number }): void => {
        const v = this.flagViews.get(key)
        if (!v) return
        v.group.position.set(fs.x, 0, fs.z)
        v.group.visible = true
        // paño ondeando
        v.cloth.rotation.y = Math.sin(performance.now() / 350 + (key === 'a' ? 0 : 2)) * 0.28
        v.beam.visible = fs.status === 'carried'
      }
      place('a', round.flags.a)
      place('b', round.flags.b)
    }
    if (round.zones) {
      for (const zs of round.zones) {
        const v = this.zoneViews.find(q => q.id === zs.id)
        if (!v) continue
        const mat = this.zoneMat(zs.owner)
        v.ring.material = mat
        v.ring2.material = mat
        // escala del progreso interior
        const s = 0.2 + (zs.prog || 0) * 0.8
        v.ring2.scale.setScalar(s)
        v.letter.material.opacity = zs.owner ? 1 : 0.55
      }
    }
  }

  // ----------------------------------------------------------
  // Eventos de modos (llamados por la red)
  // ----------------------------------------------------------
  onFlagEvent(_flag: 'a' | 'b', type: string, x?: number, z?: number): void {
    if (type === 'carried') this.audio.pickup(true)
    else if (type === 'home') this.audio.hitmarker(false)
    if (x !== undefined && z !== undefined) {
      // pequeño destello donde ocurre el evento
      this.effects.impact(new THREE.Vector3(x, 1.2, z), new THREE.Vector3(0, 1, 0))
    }
  }

  onZoneEvent(_zone: 'A' | 'B' | 'C', _owner: Team | null): void {
    this.audio.announceDing()
  }

  onCaptureFX(x: number, z: number, team: Team): void {
    const color = team === 'A' ? 0xf59e0b : 0x22c55e
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.1, z)
    this.scene.add(ring)
    const t0 = performance.now()
    const anim = (): void => {
      if (this.disposed) return
      const t = (performance.now() - t0) / 700
      if (t >= 1) { this.scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); return }
      ring.scale.setScalar(1 + t * 9)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t)
      requestAnimationFrame(anim)
    }
    anim()
  }

  // ----------------------------------------------------------
  // Integración de los assets del repositorio (texturas + árbol GLB)
  // ----------------------------------------------------------
  private applyRepoTextures(): void {
    const quality = useGame.getState().settings.quality
    const { pared, piso, cielo } = getRepoTextures()
    // --- cielo del usuario (Cielo.jpg) ---
    if (cielo && this.skyMesh) {
      const mat = this.skyMesh.material as THREE.MeshBasicMaterial
      mat.map = cielo
      mat.needsUpdate = true
      // re-generar el entorno PBR con el cielo nuevo (solo en calidad alta:
      // el PMREM en rendering por software puede tardar muchísimo)
      if (quality === 'alta') {
        try {
          const pmrem = new THREE.PMREMGenerator(this.renderer)
          const envScene = new THREE.Scene()
          const envSky = new THREE.Mesh(
            new THREE.SphereGeometry(60, 24, 16),
            new THREE.MeshBasicMaterial({ map: cielo, side: THREE.BackSide }),
          )
          envScene.add(envSky)
          const envRT = pmrem.fromScene(envScene, 0.05)
          this.scene.environment?.dispose()
          this.scene.environment = envRT.texture
          envRT.texture.needsUpdate = true
          pmrem.dispose()
        } catch { /* mantener el entorno anterior */ }
      }
    }
    // --- muros (Pared.jpg) y suelos (Piso.jpg) ---
    if (pared) {
      for (const m of this.mapMeshes) {
        const mat = m.material as THREE.MeshStandardMaterial
        if (!mat || !mat.map) continue
        if (m.userData.matKey === 'sand' || m.userData.matKey === 'concrete') {
          mat.map = pared
          mat.color.set(m.userData.matKey === 'sand' ? 0xd6c6a4 : 0xc2c6ca)
          mat.needsUpdate = true
        }
      }
    }
    if (piso) {
      const g = this.groundMesh
      if (g) {
        const mat = g.material as THREE.MeshStandardMaterial
        const tex = piso.clone()
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(58, 58)
        tex.needsUpdate = true
        mat.map = tex
        mat.color.set(0xb9ad93)
        mat.needsUpdate = true
      }
    }
    // --- árboles GLB (Arbol.glb) ---
  }

  private applyRepoTrees(): void {
    const quality = useGame.getState().settings.quality
    const tree = getTreeTemplate()
    if (tree && this.procTrees) {
      // quitar las copas procedurales
      for (const c of [...this.procTrees.children]) {
        const i = this.shootables.indexOf(c)
        if (i >= 0) this.shootables.splice(i, 1)
        this.procTrees.remove(c)
      }
      // número de árboles según calidad (el modelo es detallado: ~12k tris)
      const count = quality === 'alta' ? TREES.length : quality === 'media' ? Math.min(TREES.length, 28) : Math.min(TREES.length, 16)
      const s = 9.5 / tree.rawHeight
      // hornear las transformaciones de todos los árboles en UNA geometría por
      // material (4 draw calls, sin instancing: el combo instancing+alphaTest
      // puede colgar el rasterizador por software)
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const sc = new THREE.Vector3()
      const pos = new THREE.Vector3()
      const onlyBark = new URLSearchParams(location.search).get('assets') === 'bark'
      for (const part of tree.parts) {
        if (onlyBark && !/^sugar_maple_bark$/i.test(part.mat.name)) continue
        const geos: THREE.BufferGeometry[] = []
        for (let i = 0; i < count; i++) {
          const [tx, tz] = TREES[i]
          pos.set(tx, 0, tz)
          q.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI * 2)
          const v = 0.8 + Math.random() * 0.45
          sc.set(s * v, s * v, s * v)
          m.compose(pos, q, sc)
          const g = part.geo.clone()
          g.applyMatrix4(m)
          geos.push(g)
        }
        const merged = mergeGeometries(geos, false)
        if (!merged) continue
        const mesh = new THREE.Mesh(merged, part.mat)
        mesh.castShadow = quality === 'alta'
        mesh.receiveShadow = false
        mesh.frustumCulled = false   // geometría gigante: no dejar que el frustum la descarte entera
        this.scene.add(mesh)
      }
      this.procTrees.visible = false
    }
  }

  // ----------------------------------------------------------
  // Eventos de entrada
  // ----------------------------------------------------------
  private bindEvents(): void {
    addEventListener('resize', this.onResize)
    addEventListener('keydown', this.onKeyDown)
    addEventListener('keyup', this.onKeyUp)
    this.canvas3d.addEventListener('mousedown', this.onMouseDown)
    addEventListener('mouseup', this.onMouseUp)
    addEventListener('mousemove', this.onMouseMove)
    addEventListener('wheel', this.onWheel, { passive: false })
    document.addEventListener('pointerlockchange', this.onLockChange)
    addEventListener('contextmenu', this.onCtxMenu)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    if ((window as unknown as Record<string, unknown>).__game === this) {
      delete (window as unknown as Record<string, unknown>).__game
    }
    removeEventListener('resize', this.onResize)
    removeEventListener('keydown', this.onKeyDown)
    removeEventListener('keyup', this.onKeyUp)
    this.canvas3d.removeEventListener('mousedown', this.onMouseDown)
    removeEventListener('mouseup', this.onMouseUp)
    removeEventListener('mousemove', this.onMouseMove)
    removeEventListener('wheel', this.onWheel)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    removeEventListener('contextmenu', this.onCtxMenu)
    this.net?.disconnect()
    this.effects?.dispose()
    for (const sv of this.smokeViews.values()) {
      this.scene.remove(sv.group)
      for (const sp of sv.sprites) (sp.material as THREE.SpriteMaterial).dispose()
    }
    this.smokeViews.clear()
    this.composer?.dispose()
    this.renderer?.dispose()
  }

  private onResize = (): void => {
    this.renderer.setSize(innerWidth, innerHeight)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    this.composer?.setSize(innerWidth, innerHeight)
    this.overlay.width = innerWidth
    this.overlay.height = innerHeight
  }

  private onCtxMenu = (e: Event): void => { e.preventDefault() }

  /** Tecla asignada a una acción (configurable en el menú CONTROLES) */
  private kb(action: ActionId): string {
    return useGame.getState().settings.keybinds[action] || ''
  }

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas3d
  }

  private get inputsLive(): boolean {
    // el input funciona con puntero bloqueado o con mando conectado
    return this.locked || this.padConnected
  }

  private onLockChange = (): void => {
    const s = useGame.getState()
    if (!this.locked && s.phase === 'playing' && !s.buyOpen) {
      s.setPhase('paused')
    } else if (this.locked && s.phase === 'paused') {
      s.setPhase('playing')
    }
  }

  requestLock(): void {
    this.canvas3d.requestPointerLock()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const s = useGame.getState()
    if (this.cine.active) { this.endCinematic(); return }
    if (e.code === 'Tab') {
      e.preventDefault()
      s.setHud({ scoreboardOpen: true })
      return
    }
    if (s.buyOpen) {
      if (e.code === 'KeyB' || e.code === 'Escape' || e.code === this.kb('buy')) {
        e.preventDefault()
        this.closeBuyMenu()
      }
      return
    }
    if (s.phase !== 'playing') return
    this.keys.add(e.code)
    const code = e.code
    if (code === this.kb('buy')) this.openBuyMenu()
    else if (code === this.kb('reload')) this.startReload()
    else if (code === this.kb('grenadeFrag')) this.throwGrenade('frag')
    else if (code === this.kb('grenadeSmoke')) this.throwGrenade('smoke')
    else if (code === this.kb('lastWeapon')) this.switchTo(this.lastWeapon)
    else if (code === this.kb('zipline')) this.tryAttachZipline()
    else if (code === this.kb('slot1')) {
      const p = PRIMARY_PREF.find(w => this.owned.includes(w))
      if (p) this.switchTo(p)
    } else if (code === this.kb('slot2')) {
      const p = SECONDARY_PREF.find(w => this.owned.includes(w))
      if (p) this.switchTo(p)
    } else if (code === this.kb('slot3')) this.switchTo('knife')
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      useGame.getState().setHud({ scoreboardOpen: false })
      return
    }
    this.keys.delete(e.code)
  }

  private shooting = false
  private ads = false

  /** disparar/apuntar desde cualquier fuente (TECLA · RATÓN · MANDO) — reasignables */
  private pollActionInputs(): void {
    const s = useGame.getState()
    if (s.phase !== 'playing' || s.buyOpen || this.dead) {
      this.shooting = false
      this.ads = false
      return
    }
    const shootBind = this.kb('shoot')
    const aimBind = this.kb('aim')
    let shoot = false
    let aim = false
    if (shootBind) {
      const mi = mouseButtonIndex(shootBind)
      if (mi !== null) shoot = this.locked && this.mouseButtons.has(mi)
      else shoot = this.keys.has(shootBind)
    }
    if (aimBind) {
      const mi = mouseButtonIndex(aimBind)
      if (mi !== null) aim = this.locked && this.mouseButtons.has(mi)
      else aim = this.keys.has(aimBind)
    }
    if (this.padConnected) {
      shoot = shoot || this.padShootHeld
      aim = aim || this.padAdsHeld
    }
    this.shooting = shoot
    this.ads = aim
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (this.cine.active) { this.endCinematic(); return }
    const s = useGame.getState()
    if (s.phase === 'paused') { this.requestLock(); return }
    if (s.phase !== 'playing') return
    if (!this.locked) { this.requestLock(); return }
    this.mouseButtons.add(e.button)
  }

  private onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.delete(e.button)
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.dead) return
    const s = useGame.getState()
    const zoomFactor = this.adsAmt > 0.05 ? Math.max(0.28, this.camera.fov / BASE_FOV) * (s.settings.adsSens ?? 0.75) : 1
    const sens = 0.0021 * s.settings.sens * (this.ads ? zoomFactor : 1) * (this.sprinting ? 1.12 : 1)
    this.yaw -= e.movementX * sens
    this.pitch -= e.movementY * sens
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch))
    // sway del arma
    this.swayX = Math.max(-1, Math.min(1, this.swayX - e.movementX * 0.0006))
    this.swayY = Math.max(-1, Math.min(1, this.swayY - e.movementY * 0.0006))
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return
    e.preventDefault()
    const idx = this.owned.indexOf(this.weapon)
    const dir = e.deltaY > 0 ? 1 : -1
    const next = this.owned[(idx + dir + this.owned.length) % this.owned.length]
    this.switchTo(next)
  }

  // ----------------------------------------------------------
  // Mando (gamepad) — sondeo por frame
  // ----------------------------------------------------------
  private updateGamepad(dt: number): void {
    const pads = navigator.getGamepads?.() ?? []
    let pad: Gamepad | null = null
    for (const p of pads) {
      if (p && p.connected) { pad = p; break }
    }
    const wasConnected = this.padConnected
    this.padConnected = !!pad
    if (this.padConnected !== wasConnected) {
      useGame.getState().setHud({ gamepadConnected: this.padConnected })
      if (this.padConnected) useGame.getState().addAnnouncement('MANDO CONECTADO', 'info')
    }
    if (!pad) {
      this.padIx = 0
      this.padIz = 0
      this.padSprint = false
      return
    }

    const s = useGame.getState()
    const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84)

    // --- mirar (stick derecho) ---
    const rsx = dz(pad.axes[2] ?? 0)
    const rsy = dz(pad.axes[3] ?? 0)
    if (s.phase === 'playing' && !this.dead && (rsx !== 0 || rsy !== 0)) {
      const zoomFactor = this.adsAmt > 0.05 ? Math.max(0.28, this.camera.fov / BASE_FOV) * (s.settings.adsSens ?? 0.75) : 1
      const look = 3.4 * (s.settings.padSens ?? 1) * (this.ads ? zoomFactor : 1)
      this.yaw -= rsx * look * dt
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - rsy * look * dt))
      this.swayX = Math.max(-1, Math.min(1, this.swayX - rsx * dt * 2.5))
      this.swayY = Math.max(-1, Math.min(1, this.swayY - rsy * dt * 2.5))
    }

    // --- mover (stick izquierdo) ---
    this.padIz = -dz(pad.axes[1] ?? 0) // empujar arriba = adelante
    this.padIx = dz(pad.axes[0] ?? 0)

    // --- botones ---
    const b = pad.buttons.map(btn => !!btn.pressed)
    const pressed = (i: number) => i >= 0 && !!b[i] && !this.prevPadButtons[i]
    const held = (i: number) => i >= 0 && !!b[i]

    // binds del mando (reasignables en CONTROLES)
    const pb = s.settings.padBinds ?? { shoot: 7, aim: 6, sprint: 10, jump: 0, crouch: 1, reload: 2, weaponNext: 3, grenadeFrag: 4, grenadeSmoke: 13, buy: 5, scoreboard: 8, pause: 9 }
    // correr: botón asignado (L3 por defecto) o stick a fondo
    this.padSprint = held(pb.sprint) || (pad.axes[1] ?? 0) < -0.92
    this.padShootHeld = held(pb.shoot)
    this.padAdsHeld = held(pb.aim)

    if (s.phase === 'playing' && !this.dead && !s.buyOpen) {
      if (pressed(pb.jump)) this.padJump = true                       // A/Cruz: saltar
      if (pressed(pb.crouch)) this.padCrouch = !this.padCrouch        // B/Círculo: agacharse (conmutar)
      if (pressed(pb.reload)) this.startReload()                     // X/Cuadrado: recargar
      if (pressed(pb.weaponNext)) this.cycleWeapon(1)                 // Y/Triángulo: cambiar arma
      if (pressed(pb.grenadeFrag)) this.throwGrenade('frag')          // LB: granada MOLO
      if (pressed(pb.buy)) this.openBuyMenu()                        // RB: comprar
      if (pressed(pb.grenadeSmoke)) this.throwGrenade('smoke')        // cruceta abajo: humo
      if (pressed(12)) this.openBuyMenu()                            // cruceta arriba: comprar
      if (pressed(14)) this.cycleWeapon(-1)                          // cruceta izq.
      if (pressed(15)) this.cycleWeapon(1)                           // cruceta der.
    }

    // pausa
    if (pressed(pb.pause)) {
      if (s.phase === 'playing') {
        document.exitPointerLock?.()
        useGame.getState().setPhase('paused')
      } else if (s.phase === 'paused') {
        useGame.getState().setPhase('playing')
      }
    }

    // marcador (mantener)
    if (s.phase === 'playing' || s.phase === 'dead') {
      if (held(pb.scoreboard) && !this.padSelectPrev) useGame.getState().setHud({ scoreboardOpen: true })
      if (!held(pb.scoreboard) && this.padSelectPrev) useGame.getState().setHud({ scoreboardOpen: false })
    }
    this.padSelectPrev = held(pb.scoreboard)

    this.prevPadButtons = b
  }

  private cycleWeapon(dir: number): void {
    const idx = this.owned.indexOf(this.weapon)
    if (idx < 0) return
    const next = this.owned[(idx + dir + this.owned.length) % this.owned.length]
    this.switchTo(next)
  }

  private consumePadJump(): boolean {
    if (this.padJump) { this.padJump = false; return true }
    return false
  }

  // ----------------------------------------------------------
  // Menú de compra
  // ----------------------------------------------------------
  openBuyMenu(): void {
    const s = useGame.getState()
    if (this.dead) return
    if (!s.buyZone) {
      s.addAnnouncement('La tienda solo funciona en tu base (anillo de color)', 'info')
      return
    }
    s.setHud({ buyOpen: true })
    document.exitPointerLock()
  }

  closeBuyMenu(): void {
    const s = useGame.getState()
    s.setHud({ buyOpen: false })
    if (s.phase === 'playing') this.requestLock()
  }

  buy(itemId: string): void {
    this.net.buy(itemId)
  }

  // ----------------------------------------------------------
  // Bucle principal
  // ----------------------------------------------------------
  private loop = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, this.clock.getDelta())
    const t = performance.now() / 1000

    const phase = useGame.getState().phase
    const playing = phase === 'playing' || phase === 'dead'

    if (playing && !this.cine.active) {
      this.updateGamepad(dt)
      this.pollActionInputs()
      this.updateMovement(dt)
      this.updateWeapon(dt, t)
      this.updateShooting(t)
    }
    this.updateCamera(dt, t)
    this.updateViewmodel(dt, t)

    // remotos (interpolación)
    const renderT = performance.now() - GAME.INTERP_DELAY
    const states = this.remotes.update(dt, renderT, this.team, this.camera.position)
    this.updateRemoteFootsteps(dt, states)

    // granadas visibles
    this.updateGrenadeViews(dt)
    this.updateSmokeViews(dt)

    // efectos
    this.effects.update(dt, this.camera)
    this.trauma = Math.max(0, this.trauma - dt * 1.4)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6)

    // el sol sigue al jugador → sombras detalladas a su alrededor
    const p = this.camera.position
    this.sunLight.position.set(p.x + 52, 58, p.z - 40)
    this.sunLight.target.position.set(p.x, 0, p.z)
    this.sunLight.target.updateMatrixWorld()

    // pool de luces de farola → recolocar en las más cercanas cada 0,5 s
    const nowMs = performance.now()
    if (nowMs >= this.lampLightNext) {
      this.lampLightNext = nowMs + 500
      this.updateLampLights(p)
    }

    // pociones flotantes
    this.updatePickupViews(dt, t)

    // mecánicas del mapa: viento del pasto, barriles, saltadores
    this.grassUniform.value = t
    this.updateBarrels()
    this.updateJumpPadFX(dt)

    // HUD canvas
    this.drawOverlay(t)
    if (performance.now() - this.minimapT > 100) {
      this.minimapT = performance.now()
      this.drawMinimap()
    }

    // scoreboard y HUD numérico
    if (performance.now() - this.scoreboardT > 400) {
      this.scoreboardT = performance.now()
      useGame.getState().setHud({ scoreboard: states })
    }

    // envío de input al servidor
    if (playing && performance.now() - this.lastInputSent > GAME.INPUT_RATE) {
      this.lastInputSent = performance.now()
      this.net.sendInput()
    }

    // FPS
    this.fpsFrames++
    if (t - this.fpsT > 1) {
      const fpsNow = Math.round(this.fpsFrames / (t - this.fpsT))
      useGame.getState().setHud({ fps: fpsNow })
      this.fpsFrames = 0
      this.fpsT = t
    }

    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  // ----------------------------------------------------------
  // Movimiento y colisiones
  // ----------------------------------------------------------
  private playerHeight(): number {
    return this.crouching ? 1.25 : 1.8
  }

  private collides(x: number, y: number, z: number, h: number): boolean {
    const minX = x - HALF_W, maxX = x + HALF_W
    const minY = y, maxY = y + h
    const minZ = z - HALF_W, maxZ = z + HALF_W
    for (let i = 0; i < MAP_AABBS.length; i++) {
      const b = MAP_AABBS[i]
      if (maxX > b.minX && minX < b.maxX && maxY > b.minY && minY < b.maxY && maxZ > b.minZ && minZ < b.maxZ) {
        return true
      }
    }
    return false
  }

  private updateMovement(dt: number): void {
    const s = useGame.getState()

    // ---- tirolina en curso: movimiento guiado por el cable ----
    if (this.ziplineIdx >= 0) {
      this.updateZiplineRide(dt)
      this.updateBuyZone()
      return
    }

    const inputActive = s.phase === 'playing' && !this.dead && this.inputsLive

    // sprint del frame ANTERIOR (para detectar el inicio del deslizamiento:
    // agacharse apaga this.sprinting en el mismo frame, hay que recordarlo)
    const wasSprint = this.sprinting

    const w = WEAPONS[this.weapon]
    const wantCrouch = inputActive && (this.keys.has(this.kb('crouch')) || this.padCrouch)
    const canStand = !this.collides(this.pos.x, this.pos.y, this.pos.z, 1.8)
    const sliding = this.slideT > 0
    this.crouching = wantCrouch || sliding || (!canStand && this.pos.y < 3)

    const wantSprint = inputActive && (this.keys.has(this.kb('sprint')) || this.padSprint) && !this.crouching && !this.ads
    const movingFwd = this.keys.has(this.kb('fwd')) || this.padIz > 0.5

    let speed = 4.6 * w.moveMult
    this.sprinting = false
    if (wantSprint && movingFwd && this.onGround) {
      speed *= 1.45
      this.sprinting = true
    }
    if (this.crouching) speed *= 0.5
    if (this.adsAmt > 0.3) speed *= 0.65

    // ---- deslizamiento (agacharse corriendo) ----
    this.slideT = Math.max(0, this.slideT - dt)
    const hSpeedNow = Math.hypot(this.vel.x, this.vel.z)
    if (inputActive && wantCrouch && wasSprint && this.onGround && this.slideT <= 0 && hSpeedNow > 5.4) {
      this.slideT = 0.85
      this.vel.x *= 1.34
      this.vel.z *= 1.34
      this.audio.land()
    }

    // dirección de input (teclado + mando)
    let ix = 0, iz = 0
    if (inputActive) {
      if (this.keys.has(this.kb('fwd'))) iz += 1
      if (this.keys.has(this.kb('back'))) iz -= 1
      if (this.keys.has(this.kb('left'))) ix -= 1
      if (this.keys.has(this.kb('right'))) ix += 1
      ix += this.padIx
      iz += this.padIz
    }
    const len = Math.hypot(ix, iz)
    if (len > 1) { ix /= len; iz /= len } // clampear diagonales sin perder inclinación analógica

    // base yaw (forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw)))
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw)
    const dirX = ix * cos - iz * sin
    const dirZ = -ix * sin - iz * cos

    // aceleración / fricción (durante el deslizamiento: poca fricción para conservar impulso)
    const accel = this.onGround ? (sliding ? 1.7 : 12) : 2.2
    const fric = this.onGround ? (sliding ? 1.3 : 10) : 0.3
    this.vel.x += (dirX * speed - this.vel.x) * Math.min(1, accel * dt)
    this.vel.z += (dirZ * speed - this.vel.z) * Math.min(1, accel * dt)
    if (len === 0 && this.onGround) {
      const damp = Math.max(0, 1 - fric * dt)
      this.vel.x *= damp
      this.vel.z *= damp
    }

    // salto / gravedad (con salto-agarre de tirolina y salto-deslizamiento)
    const wantJump = inputActive && (this.keys.has(this.kb('jump')) || this.consumePadJump())
    if (wantJump && this.onGround && (!this.crouching || sliding)) {
      if (this.tryAttachZipline()) {
        // agarrado a la tirolina
      } else {
        this.vel.y = sliding ? 6.2 : 5.6
        this.slideT = 0
        this.onGround = false
        this.audio.jump()
      }
    }
    this.vel.y -= GAME.GRAVITY * dt

    // --- resolución por ejes ---
    const h = this.playerHeight()
    // eje X
    let nx = this.pos.x + this.vel.x * dt
    if (this.collides(nx, this.pos.y, this.pos.z, h)) {
      // intentar subir escalón
      if (this.onGround && !this.collides(nx, this.pos.y + 0.58, this.pos.z, h)) {
        this.pos.y += 0.58
        this.pos.x = nx
      } else {
        this.vel.x = 0
        nx = this.pos.x
      }
    } else {
      this.pos.x = nx
    }
    // eje Z
    let nz = this.pos.z + this.vel.z * dt
    if (this.collides(this.pos.x, this.pos.y, nz, h)) {
      if (this.onGround && !this.collides(this.pos.x, this.pos.y + 0.58, nz, h)) {
        this.pos.y += 0.58
        this.pos.z = nz
      } else {
        this.vel.z = 0
        nz = this.pos.z
      }
    } else {
      this.pos.z = nz
    }
    // eje Y
    let ny = this.pos.y + this.vel.y * dt
    if (this.vel.y <= 0) {
      // buscar suelo
      let groundY = 0
      for (let i = 0; i < MAP_AABBS.length; i++) {
        const b = MAP_AABBS[i]
        if (this.pos.x + HALF_W > b.minX && this.pos.x - HALF_W < b.maxX &&
            this.pos.z + HALF_W > b.minZ && this.pos.z - HALF_W < b.maxZ) {
          if (b.maxY <= this.pos.y + 0.01 && b.maxY > groundY) groundY = b.maxY
        }
      }
      if (ny <= groundY + 0.001) {
        if (!this.onGround && this.vel.y < -6) this.audio.land()
        ny = groundY
        this.vel.y = 0
        this.onGround = true
      } else {
        this.onGround = false
      }
    } else {
      if (this.collides(this.pos.x, ny, this.pos.z, h)) {
        this.vel.y = 0
        ny = this.pos.y
      } else {
        this.onGround = false
      }
    }
    this.pos.y = Math.max(0, ny)
    const lim = GAME.MAP_HALF - 0.8
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x))
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z))

    // ---- plataformas de salto (impulso automático al pisarlas) ----
    if (this.onGround && this.pos.y < 0.45) {
      for (const pad of this.jumpPads) {
        if (Math.hypot(this.pos.x - pad.x, this.pos.z - pad.z) < 1.5) {
          this.vel.y = 12
          this.onGround = false
          this.slideT = 0
          this.audio.jump()
          pad.glow.scale.setScalar(3.6)
          break
        }
      }
    }

    // bob y pasos
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (this.onGround && hSpeed > 0.5) {
      this.bobT += dt * hSpeed * 1.6
      this.stepT += dt
      const cadence = hSpeed > 5.5 ? 0.31 : hSpeed > 2 ? 0.42 : 0.55
      if (this.stepT > cadence) {
        this.stepT = 0
        this.audio.footstep(0, true)
      }
    } else {
      this.bobT += dt * 0.4
    }
    this.sprintAmt += ((this.sprinting && hSpeed > 4 ? 1 : 0) - this.sprintAmt) * Math.min(1, dt * 8)

    // zona de compra + pista de interacción
    this.updateBuyZone()
    this.updateInteractHint()

    // parámetros calculados (no usados directamente)
  }

  /** Zona de compra (anillo de la base) */
  private updateBuyZone(): void {
    const sp = this.team === 'A' ? SPAWN_A : SPAWN_B
    const inZone = Math.hypot(this.pos.x - sp[0], this.pos.z - sp[2]) < GAME.BUY_RADIUS
    if (inZone !== useGame.getState().buyZone) {
      useGame.getState().setHud({ buyZone: inZone })
    }
  }

  /** Aviso contextual: tirolina cerca */
  private updateInteractHint(): void {
    this.interactHint = ''
    if (this.ziplineIdx >= 0 || this.dead) return
    if (performance.now() < this.ziplineCooldownUntil) return
    for (const z of this.ziplines) {
      const d = Math.hypot(z.from.x - this.pos.x, z.from.z - this.pos.z)
      if (d < 2.6 && Math.abs(this.pos.y - z.from.y) < 2.6) {
        this.interactHint = '[E / ESPACIO] TIROLINA'
        return
      }
    }
  }

  // ----------------------------------------------------------
  // Tirolinas (montar/descender)
  // ----------------------------------------------------------
  private ziplineCooldownUntil = 0

  private tryAttachZipline(): boolean {
    if (this.ziplineIdx >= 0 || this.dead) return false
    if (performance.now() < this.ziplineCooldownUntil) return false
    for (let i = 0; i < this.ziplines.length; i++) {
      const z = this.ziplines[i]
      const d = Math.hypot(z.from.x - this.pos.x, z.from.z - this.pos.z)
      if (d < 2.4 && Math.abs(this.pos.y - z.from.y) < 2.6) {
        this.ziplineIdx = i
        this.ziplineT = 0
        this.crouching = false
        this.slideT = 0
        this.vel.set(0, 0, 0)
        this.audio.throwSound()
        return true
      }
    }
    return false
  }

  private updateZiplineRide(dt: number): void {
    const z = this.ziplines[this.ziplineIdx]
    if (!z) { this.ziplineIdx = -1; return }
    // soltar con salto
    const wantOff = this.keys.has(this.kb('jump')) || this.consumePadJump()
    if (wantOff && this.ziplineT > 0.06) {
      this.detachZipline(false)
      return
    }
    const SPEED = 10.5
    this.ziplineT += (SPEED / z.len) * dt
    const t = Math.min(1, this.ziplineT)
    const cx = z.from.x + z.dir.x * z.len * t
    const cy = z.from.y + z.dir.y * z.len * t
    const cz = z.from.z + z.dir.z * z.len * t
    this.pos.set(cx, cy - 0.85, cz)
    this.vel.set(z.dir.x * SPEED, z.dir.y * SPEED, z.dir.z * SPEED)
    this.onGround = false
    // viento en la cara: pasos suaves como sonido de deslizamiento
    this.bobT += dt * 6
    if (t >= 1) this.detachZipline(true)
  }

  private detachZipline(atEnd: boolean): void {
    const z = this.ziplines[this.ziplineIdx]
    this.ziplineIdx = -1
    this.ziplineCooldownUntil = performance.now() + 1400
    this.onGround = false
    if (z) {
      const keep = atEnd ? 8.5 : 4
      this.vel.set(z.dir.x * keep, z.dir.y * keep - (atEnd ? 1 : 2.5), z.dir.z * keep)
    }
    this.audio.jump()
  }

  // ----------------------------------------------------------
  // Cámara
  // ----------------------------------------------------------
  private updateCamera(dt: number, t: number): void {
    // cinemática de entrada: la cámara vuela sobre el mapa hasta el despliegue
    if (this.cine.active) {
      const t01 = Math.min(1, (performance.now() - this.cine.t0) / (this.cine.dur * 1000))
      const p = this.cine.curve!.getPoint(t01)
      const lk = this.cine.look!.getPoint(Math.min(1, t01 * 1.04))
      this.camera.position.copy(p)
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(lk)
      if (t01 >= 1) this.endCinematic()
      return
    }
    // altura de ojos
    const targetEye = this.dead ? 0.4 : this.crouching ? EYE_CROUCH : EYE_STAND
    const curEye = this.camera.position.y - this.pos.y
    const eye = curEye + (targetEye - curEye) * Math.min(1, dt * 10)
    void t

    // bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const bobAmp = this.onGround ? Math.min(1, hSpeed / 5) * (this.adsAmt > 0.3 ? 0.008 : 0.028) : 0
    const bobX = Math.cos(this.bobT) * bobAmp * 0.6
    const bobY = Math.abs(Math.sin(this.bobT)) * bobAmp

    // sacudida (trauma) — amplitud reducida al 45 %
    const sh = this.trauma * this.trauma
    const shakeP = (Math.random() - 0.5) * 0.022 * sh
    const shakeR = (Math.random() - 0.5) * 0.018 * sh

    this.camera.position.set(
      this.pos.x + bobX,
      this.pos.y + eye + bobY - (this.dead ? this.deathT * 1.2 : 0),
      this.pos.z,
    )

    // FOV
    const w = WEAPONS[this.weapon]
    const targetFov = this.ads && !this.dead ? w.zoomFov : this.sprintAmt > 0.3 ? BASE_FOV + 7 * this.sprintAmt : BASE_FOV
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10)
    this.camera.updateProjectionMatrix()
    this.adsAmt += ((this.ads && !this.dead && !this.reloading ? 1 : 0) - this.adsAmt) * Math.min(1, dt * 9)

    // recuperación del retroceso (más rápida)
    const rec = WEAPONS[this.weapon].recoilRecover
    this.recoilP *= Math.max(0, 1 - rec * dt * 8)
    this.recoilY *= Math.max(0, 1 - rec * dt * 8)
    if (t * 1000 - this.lastShotTime > 380) {
      this.sprayIdx = Math.max(0, this.sprayIdx - dt * 18)
    }

    // muerte: cámara cae
    if (this.dead) this.deathT = Math.min(1, this.deathT + dt * 1.8)

    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw + this.recoilY + shakeR * 0.4
    this.camera.rotation.x = Math.max(-1.5, Math.min(1.5, this.pitch + this.recoilP + shakeP - this.deathT * 0.8))
    // inclinación sutil al deslizarse
    const slideRoll = this.slideT > 0 ? Math.min(1, this.slideT * 2.5) * 0.1 : 0
    this.camera.rotation.z = shakeR + slideRoll + (this.dead ? this.deathT * 0.6 : 0) + Math.cos(this.bobT * 0.5) * bobAmp * 0.2
  }

  // ----------------------------------------------------------
  // Viewmodel (arma en mano)
  // ----------------------------------------------------------
  setWeapon(id: WeaponId, initial = false): void {
    if (!initial && (id === this.weapon || !this.owned.includes(id))) return
    if (!this.owned.includes(id)) return
    if (!initial && id === this.weapon) return
    if (!initial) this.lastWeapon = this.weapon
    this.weapon = id
    this.reloading = false
    this.sprayIdx = 0
    this.drawT = 0
    // limpiar viewmodel
    if (this.vmGroup) {
      this.vmHolder.remove(this.vmGroup)
      this.vmGroup = null
      this.vmMuzzle = null
    }
    const { group, muzzle } = buildGLBWeapon(id) ?? buildWeaponModel(id)
    this.vmGroup = group
    this.vmMuzzle = muzzle
    this.vmHolder.add(group)
    if (!this.ammo[id] && WEAPONS[id].mag > 0) {
      this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }
    }
    this.updateHudWeapon()
    this.audio.draw()
  }

  private switchTo(id: WeaponId): void {
    if (this.reloading) this.reloading = false
    this.setWeapon(id)
  }

  giveWeapon(id: WeaponId): void {
    if (!this.owned.includes(id)) this.owned.push(id)
    this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }
    this.setWeapon(id)
    this.updateHudWeapon()
  }

  refillAmmo(id: WeaponId): void {
    this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }
    this.updateHudWeapon()
  }

  private updateHudWeapon(): void {
    const a = this.ammo[this.weapon]
    useGame.getState().setHud({
      weapon: this.weapon,
      mag: a?.mag ?? 0,
      reserve: a?.reserve ?? 0,
      owned: [...this.owned],
    })
  }

  private updateViewmodel(dt: number, t: number): void {
    if (!this.vmGroup) return
    const pose = weaponPose(this.weapon)
    this.drawT = Math.min(1, this.drawT + dt * 4.5)
    const draw = this.drawT

    // sway
    this.swayX *= Math.max(0, 1 - dt * 6)
    this.swayY *= Math.max(0, 1 - dt * 6)

    // posiciones
    const hip = pose.hip
    const ads = pose.ads
    const adsA = this.adsAmt
    const sprintA = this.sprintAmt * (1 - adsA)
    const vmKick = this.vmKick
    this.vmKick *= Math.max(0, 1 - dt * 9)

    // bob del arma
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const bob = this.onGround ? Math.min(1, hSpeed / 5) * (1 - adsA * 0.85) : 0

    let px = hip.x + (ads.x - hip.x) * adsA
    let py = hip.y + (ads.y - hip.y) * adsA
    let pz = hip.z + (ads.z - hip.z) * adsA + vmKick * 0.09

    // animación de recarga
    let reloadRot = 0
    if (this.reloading) {
      const now = performance.now()
      const w = WEAPONS[this.weapon]
      const progress = 1 - (this.reloadEndAt - now) / (w.reloadTime * 1000)
      const dip = Math.sin(Math.min(1, progress) * Math.PI)
      reloadRot = dip * 0.9
      py -= dip * 0.16
      // sonidos por etapas
      if (progress > 0.25 && this.reloadStage === 0) { this.reloadStage = 1; this.audio.reload('mag') }
      if (progress > 0.85 && this.reloadStage === 1) { this.reloadStage = 2; this.audio.reload('end') }
    }

    px += Math.cos(this.bobT) * 0.012 * bob - this.swayX * 0.028 * (1 - adsA * 0.8)
    py += Math.abs(Math.sin(this.bobT)) * 0.010 * bob + this.swayY * 0.024 * (1 - adsA * 0.8)
    py -= (1 - draw) * 0.35   // animación de desenfundado
    pz -= (1 - draw) * 0.12

    this.vmGroup.position.set(px, py, pz)
    this.vmGroup.rotation.set(
      pose.hipRot.x + reloadRot + vmKick * 0.14 + this.swayY * 0.06 * (1 - adsA),
      pose.hipRot.y * (1 - adsA) + sprintA * 0.5 - this.swayX * 0.05 * (1 - adsA),
      pose.hipRot.z + sprintA * 0.25 + reloadRot * 0.4,
    )
    // sprint: arma apuntando abajo
    if (sprintA > 0.01) {
      this.vmGroup.rotation.x += sprintA * 0.5
      this.vmGroup.position.y -= sprintA * 0.08
    }

    // francotirador ADS: ocultar modelo
    const w = WEAPONS[this.weapon]
    this.vmHolder.visible = !(w.sniper && adsA > 0.7) && !this.dead

    void t
  }

  private updateWeapon(dt: number, t: number): void {
    this.throwCooldown = Math.max(0, this.throwCooldown - dt)
    void t
  }

  // ----------------------------------------------------------
  // Disparo
  // ----------------------------------------------------------
  private currentSpread(): number {
    const w = WEAPONS[this.weapon]
    if (this.weapon === 'knife') return 0
    let spread = w.spreadBase
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    spread += w.spreadMove * Math.min(1, hSpeed / 6)
    if (!this.onGround) spread += w.spreadAir
    if (this.crouching) spread *= 0.72
    if (this.adsAmt > 0.6) spread *= 0.45
    spread += this.sprayIdx * w.sprayInacc
    return spread
  }

  private updateShooting(t: number): void {
    const s = useGame.getState()
    if (s.phase !== 'playing' || this.dead || s.buyOpen) { this.shooting = false; return }
    const w = WEAPONS[this.weapon]
    const now = t * 1000

    // fin de recarga
    if (this.reloading && now >= this.reloadEndAt) {
      this.reloading = false
      const a = this.ammo[this.weapon]
      if (a) {
        const need = w.mag - a.mag
        const take = Math.min(need, a.reserve)
        a.mag += take
        a.reserve -= take
      }
      this.updateHudWeapon()
    }

    if (!this.shooting || this.reloading || now < this.nextShotAt) return
    if (this.drawT < 0.8) return

    const a = this.ammo[this.weapon]
    if (w.mag > 0 && (a?.mag ?? 0) <= 0) {
      this.audio.dryFire()
      this.nextShotAt = now + 250
      this.shooting = false
      this.startReload()
      return
    }

    this.fireWeapon(t)
  }

  private fireWeapon(t: number): void {
    const w = WEAPONS[this.weapon]
    const now = t * 1000
    this.nextShotAt = now + 60000 / w.rpm
    const a = this.ammo[this.weapon]
    if (a && w.mag > 0) a.mag--

    // dirección con dispersión
    this.camera.updateMatrixWorld()
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion)

    const eye = this.camera.position.clone()

    if (this.weapon === 'knife') {
      // ataque cuerpo a cuerpo
      this.audio.knifeSwing()
      this.vmKick = 1.4
      const dir = forward.clone()
      const hbCache = this.buildHitboxCache()
      const hit = this.castBullet(eye, dir, 2.4, hbCache)
      if (hit) this.processHit(hit, dir)
      this.updateHudWeapon()
      return
    }

    const spread = this.currentSpread()
    const pellets = w.pellets
    const hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3 }[] = []

    // caché de hitboxes: UNA vez por disparo, no por perdigón
    const hbCache = this.buildHitboxCache()

    // punto final del disparo para la traza de red
    let shotEnd = eye.clone().addScaledVector(forward, 60)
    let shotEndSet = false

    for (let i = 0; i < pellets; i++) {
      const r = (spread * Math.PI / 180) * Math.sqrt(Math.random())
      const ang = Math.random() * Math.PI * 2
      const dir = forward.clone()
        .addScaledVector(right, Math.cos(ang) * r)
        .addScaledVector(up, Math.sin(ang) * r)
        .normalize()

      const hit = this.castBullet(eye, dir, 200, hbCache)
      if (!hit) {
        // castBullet ya trazó el rayo completo (far 200) y no tocó nada
        continue
      }
      if (!shotEndSet) { shotEnd = hit.point.clone(); shotEndSet = true }
      // efecto local
      this.effects.tracer(this.muzzleWorld(), hit.point)
      if (hit.barrel !== undefined) {
        this.igniteBarrel(hit.barrel)
        continue
      }
      if (hit.player) {
        this.effects.impact(hit.point, dir.clone().negate(), true)
        hits.push({ target: hit.player, part: hit.part, dist: hit.dist, point: hit.point })
      } else {
        this.effects.impact(hit.point, hit.normal ?? dir.clone().negate())
      }
    }

    // enviar el disparo a la red (traza + animación de disparo para los demás)
    this.net.sendShot(
      [Math.round(eye.x * 100) / 100, Math.round(eye.y * 100) / 100, Math.round(eye.z * 100) / 100],
      [Math.round(shotEnd.x * 100) / 100, Math.round(shotEnd.y * 100) / 100, Math.round(shotEnd.z * 100) / 100],
    )

    // enviar aciertos al servidor (de una vez: válido para escopeta)
    if (hits.length > 0) {
      this.net.sendHits(this.weapon, hits.map(h => ({ target: h.target, part: h.part, dist: h.dist })))
      if (this.audio) this.audio.fleshHit(0)
    }

    // audio + fogonazo
    this.audio.gunshot(w.sound, 0)
    const mzl = this.muzzleWorld()
    this.effects.muzzleFlash(mzl, this.weapon === 'awp338' ? 1.6 : this.weapon === 'breacher' ? 1.3 : 1)
    // casquillo
    if (this.vmMuzzle) {
      const ejectPos = mzl.clone().addScaledVector(forward, -0.25)
      ejectPos.y += 0.05
      const rightDir = right.clone()
      this.effects.casing(ejectPos, rightDir)
    }

    // retroceso (recoilV/H están en GRADOS → convertir a radianes)
    const spray = this.sprayIdx
    this.recoilP += (w.recoilV * Math.PI / 180) * (0.85 + Math.random() * 0.3) * (this.crouching ? 0.85 : 1) * (this.adsAmt > 0.6 ? 0.8 : 1)
    this.recoilY += (w.recoilH * Math.PI / 180) * Math.sin(spray * 0.9 + 0.6) * (Math.random() * 0.5 + 0.75)
    this.sprayIdx++
    this.vmKick = 1
    this.lastShotTime = now
    // sacudida de cámara muy contenida (la mira ya no "vuela")
    this.trauma = Math.min(1, this.trauma + (w.id === 'awp338' ? 0.2 : w.id === 'breacher' ? 0.16 : 0.06))

    // sonido de bomba para la escopeta
    if (this.weapon === 'breacher') {
      setTimeout(() => this.audio.reload('pump'), 260)
    }
    // recarga automática al vaciar
    if (a && a.mag === 0 && a.reserve > 0) {
      setTimeout(() => this.startReload(), 350)
    }
    this.updateHudWeapon()
  }

  private muzzleWorld(): THREE.Vector3 {
    if (this.vmMuzzle) {
      this.vmMuzzle.updateWorldMatrix(true, false)
      return new THREE.Vector3().setFromMatrixPosition(this.vmMuzzle.matrixWorld)
    }
    return this.camera.position.clone()
  }

  /** Hitboxes de todos los remotos, calculadas una sola vez por disparo */
  private buildHitboxCache(): Map<string, { head: THREE.Box3; body: THREE.Box3; legs: THREE.Box3 } | null> {
    const cache = new Map<string, { head: THREE.Box3; body: THREE.Box3; legs: THREE.Box3 } | null>()
    for (const [id] of this.remotes.map) {
      cache.set(id, this.remotes.hitboxes(id))
    }
    return cache
  }

  /** Raycast local: mapa + hitboxes de jugadores remotos (hitboxes cacheadas) */
  private castBullet(eye: THREE.Vector3, dir: THREE.Vector3, maxDist: number,
    hbCache?: Map<string, { head: THREE.Box3; body: THREE.Box3; legs: THREE.Box3 } | null>): {
    player: string | null; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3; normal?: THREE.Vector3; barrel?: number
  } | null {
    const cache = hbCache ?? this.buildHitboxCache()

    // 1) mapa
    this.raycaster.set(eye, dir)
    this.raycaster.far = maxDist
    const mapHits = this.raycaster.intersectObjects(this.shootables, false)
    const mapHit = mapHits[0]
    const mapDist = mapHit ? mapHit.distance : Infinity

    // 2) jugadores remotos (enemigos vivos — en TODOS CONTRA TODOS, todos)
    const ffa = useGame.getState().round?.mode === 'ffa'
    const ray = this.bulletRay
    ray.set(eye, dir)
    let bestPlayer: string | null = null
    let bestPart: 'head' | 'body' | 'legs' = 'body'
    let bestDist = Infinity
    let bestPoint: THREE.Vector3 | null = null

    for (const [id] of this.remotes.map) {
      const st = this.remotes.map.get(id)!.state
      if (!st || st.dead) continue
      if (!ffa && st.team === this.team) continue
      const boxes = cache.get(id)
      if (!boxes) continue
      const parts: ['head' | 'body' | 'legs', THREE.Box3][] = [
        ['head', boxes.head], ['body', boxes.body], ['legs', boxes.legs],
      ]
      for (const [part, box] of parts) {
        if (ray.intersectBox(box, this.bulletPoint)) {
          const d = this.bulletPoint.distanceTo(eye)
          if (d < bestDist) {
            bestDist = d
            bestPlayer = id
            bestPart = part
            bestPoint = this.bulletPoint.clone()
          }
        }
      }
    }

    if (bestPlayer && bestDist < mapDist && bestPoint) {
      return { player: bestPlayer, part: bestPart, dist: bestDist, point: bestPoint }
    }
    if (mapHit) {
      const normal = mapHit.face ? mapHit.face.normal.clone().transformDirection(mapHit.object.matrixWorld) : dir.clone().negate()
      const barrelIdx = (mapHit.object.userData as { barrelIdx?: number }).barrelIdx
      return { player: null, part: 'body', dist: mapHit.distance, point: mapHit.point, normal, barrel: barrelIdx }
    }
    return null
  }

  private processHit(hit: { player: string | null; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3; normal?: THREE.Vector3; barrel?: number }, dir: THREE.Vector3): void {
    if (hit.barrel !== undefined) {
      this.igniteBarrel(hit.barrel)
      return
    }
    if (hit.player) {
      this.net.sendHits('knife', [{ target: hit.player, part: hit.part, dist: hit.dist }])
      this.effects.impact(hit.point, dir.clone().negate(), true)
    } else {
      this.effects.impact(hit.point, hit.normal ?? dir.clone().negate())
    }
  }

  // ----------------------------------------------------------
  // Recarga
  // ----------------------------------------------------------
  startReload(): void {
    const w = WEAPONS[this.weapon]
    if (w.mag === 0 || this.reloading || this.dead) return
    const a = this.ammo[this.weapon]
    if (!a || a.mag >= w.mag || a.reserve <= 0) return
    this.reloading = true
    this.reloadStage = 0
    this.reloadEndAt = performance.now() + w.reloadTime * 1000
    this.audio.reload('start')
  }

  // ----------------------------------------------------------
  // Granadas (MOLO ofensiva · humo de cobertura)
  // ----------------------------------------------------------
  throwGrenade(kind: GrenadeKind = 'frag'): void {
    if (this.dead || this.throwCooldown > 0) return
    if (kind === 'smoke') {
      if (this.smokes <= 0) {
        useGame.getState().addAnnouncement('Sin granadas de humo — cómpralas en la tienda (B)', 'info')
        return
      }
      this.smokes--
      useGame.getState().setHud({ smokes: this.smokes })
    } else {
      if (this.frags <= 0) {
        useGame.getState().addAnnouncement('Sin granadas MOLO — cómpralas en la tienda (B)', 'info')
        return
      }
      this.frags--
      useGame.getState().setHud({ frags: this.frags })
    }
    this.throwCooldown = 0.8
    this.audio.throwSound()
    this.camera.updateMatrixWorld()
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const eye = this.camera.position.clone().addScaledVector(dir, 0.4)
    const speed = kind === 'smoke' ? 13 : 16
    const vel = dir.clone().multiplyScalar(speed)
    vel.y += kind === 'smoke' ? 4.2 : 3.5
    this.net.throwGrenade([eye.x, eye.y, eye.z], [vel.x, vel.y, vel.z], kind)
  }

  /** Cortina de humo desplegada por una granada (evento de la simulación) */
  onSmokeSpawn(id: string, pos: [number, number, number], duration: number): void {
    if (!this.smokeTex) this.smokeTex = makeSmokeTexture()
    const group = new THREE.Group()
    group.position.set(pos[0], pos[1], pos[2])
    const sprites: THREE.Sprite[] = []
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTex, color: 0xc9c5bd, transparent: true, opacity: 0, depthWrite: false,
      })
      const sp = new THREE.Sprite(mat)
      const a = (i / 14) * Math.PI * 2
      const r = 1.2 + Math.random() * 2.4
      sp.position.set(Math.cos(a) * r, 0.6 + Math.random() * 1.8, Math.sin(a) * r)
      sp.scale.setScalar(4 + Math.random() * 3)
      sp.userData.baseScale = sp.scale.x
      sprites.push(sp)
      group.add(sp)
    }
    this.scene.add(group)
    this.smokeViews.set(id, { group, sprites, born: performance.now(), life: duration })
  }

  private updateSmokeViews(dt: number): void {
    if (!this.smokeViews.size) return
    const now = performance.now()
    for (const [id, sv] of this.smokeViews) {
      const age = now - sv.born
      // despliegue (1,6 s) → cortina densa → disolución (últimos 3 s)
      const grow = Math.min(1, age / 1600)
      const fade = Math.max(0, Math.min(1, (sv.life - age) / 3000))
      for (const sp of sv.sprites) {
        const mat = sp.material as THREE.SpriteMaterial
        mat.opacity = 0.82 * grow * fade
        const base = (sp.userData.baseScale as number) * (0.55 + 0.45 * grow)
        sp.scale.setScalar(base + Math.sin(now / 900 + sp.position.x * 3) * 0.25)
        sp.position.y += dt * 0.14
      }
      if (age >= sv.life) {
        this.scene.remove(sv.group)
        for (const sp of sv.sprites) (sp.material as THREE.SpriteMaterial).dispose()
        this.smokeViews.delete(id)
      }
    }
  }

  private updateGrenadeViews(dt: number): void {
    for (const [id, gv] of this.grenadeViews) {
      gv.trailT += dt
      if (gv.trailT > 0.09) {
        gv.trailT = 0
        // pequeño rastro de humo
        const a = gv.group.position
        void a
      }
    }
  }

  // ----------------------------------------------------------
  // Pasos de remotos
  // ----------------------------------------------------------
  private updateRemoteFootsteps(dt: number, states: NetPlayerState[]): void {
    void dt
    const now = performance.now()
    for (const st of states) {
      if (st.dead || st.team === this.team || st.speed < 1.5) continue
      const rp = this.remotes.map.get(st.id)
      if (!rp) continue
      const d = this.camera.position.distanceTo(rp.root.position)
      if (d > 22) continue
      const cadence = st.speed > 5 ? 300 : 430
      if (now - rp.lastFootstep > cadence) {
        rp.lastFootstep = now
        this.audio.footstep(d, false)
      }
    }
  }

  // ----------------------------------------------------------
  // Cinemática de entrada (sobrevuelo del mapa hasta el despliegue)
  // ----------------------------------------------------------
  startCinematic(): void {
    if (this.cine.played || this.cine.active) return
    this.cine.played = true
    this.cine.active = true
    this.cine.t0 = performance.now()
    this.cine.dur = 11   // segundos (updateCamera multiplica por 1000)
    const s = this.pos
    const m = s.x < 0 ? 1 : -1   // espejo según el bando (A: vuela desde el SE · B: desde el NO)
    this.cine.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(m * 62, 30, m * 62),
      new THREE.Vector3(m * 26, 17, m * 36),
      new THREE.Vector3(-m * 2, 12, m * 6),        // sobre el mercado central
      new THREE.Vector3(-m * 40, 9, -m * 2),       // gasolinera / radar
      new THREE.Vector3(m * 30, 6.5, -m * 30),
      new THREE.Vector3(s.x + m * 5, 3.0, s.z + m * 8),
      new THREE.Vector3(s.x, 1.7, s.z),
    ], false, 'catmullrom', 0.4)
    this.cine.look = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(0, 2.4, 0),
      new THREE.Vector3(0, 2.2, 0),
      new THREE.Vector3(-m * 49, 2, 0),
      new THREE.Vector3(m * 44, 2, -m * 4),
      new THREE.Vector3(s.x - m * 10, 1.5, s.z - m * 10),
      new THREE.Vector3(s.x - m * 10, 1.5, s.z - m * 10),
    ], false, 'catmullrom', 0.4)
    this.minimap.style.opacity = '0'
    useGame.getState().setHud({ cineActive: true })
    this.audio.roundStart()
  }

  endCinematic(): void {
    if (!this.cine.active) return
    this.cine.active = false
    this.minimap.style.opacity = '1'
    useGame.getState().setHud({ cineActive: false })
    this.requestLock()
  }

  // ----------------------------------------------------------
  // Handlers de red (llamados por NetClient)
  // ----------------------------------------------------------
  onWelcome(team: Team, money: number): void {
    this.team = team
    this.money = money
    const s = useGame.getState()
    s.setHud({ team, money })
  }

  onSpawn(pos: [number, number, number], yaw: number, weapons: WeaponId[], weapon: WeaponId, hp: number, shield: number, frags: number, money: number): void {
    this.pos.set(pos[0], pos[1], pos[2])
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = 0
    this.dead = false
    this.deathT = 0
    this.hp = hp
    this.shield = shield
    this.frags = frags
    this.smokes = 0
    this.money = money
    this.owned = weapons.slice()
    this.ammo = {}
    for (const wid of this.owned) {
      if (WEAPONS[wid].mag > 0) this.ammo[wid] = { mag: WEAPONS[wid].mag, reserve: WEAPONS[wid].reserve }
    }
    this.reloading = false
    this.setWeapon(weapon, true)
    const s = useGame.getState()
    s.setHud({
      phase: 'playing',
      hp, armor: shield, frags, money, smokes: this.smokes,
      deathInfo: null,
      owned: [...this.owned],
    })
    // cinemática de entrada en el primer despliegue
    if (!this.cine.played) this.startCinematic()
  }

  onDeath(killerName: string, respawnIn: number): void {
    this.dead = true
    this.deathT = 0
    this.audio.deathSound()
    this.trauma = 1
    useGame.getState().setHud({
      phase: 'dead',
      deathInfo: { killer: killerName, respawnIn, diedAt: performance.now() },
    })
  }

  onTakeDamage(dmg: number, attackerPos: [number, number, number]): void {
    if (this.dead) return
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 60)
    this.trauma = Math.min(1, this.trauma + dmg / 130)
    this.audio.playerHurt()
    // dirección del atacante relativa a la vista
    const dx = attackerPos[0] - this.pos.x
    const dz = attackerPos[2] - this.pos.z
    const worldAngle = Math.atan2(dx, dz)
    const rel = worldAngle - (this.yaw + Math.PI)
    this.dmgDirs.push({ angle: -rel, t: performance.now() })
    // HUD de vida
    const s = useGame.getState()
    s.setHud({ hp: this.hp })
  }

  setHealth(hp: number, shield: number): void {
    this.hp = hp
    this.shield = shield
    useGame.getState().setHud({ hp, armor: shield })
  }

  /** Recogida de poción/botiquín */
  onPickup(kind: PickupKind, hpGain: number, shieldGain: number): void {
    const info = PICKUP_INFO[kind]
    this.audio.pickup(info.shield > 0)
    const parts: string[] = [info.name.toUpperCase()]
    if (hpGain > 0) parts.push(`+${hpGain} VIDA`)
    if (shieldGain > 0) parts.push(`+${shieldGain} ESCUDO`)
    useGame.getState().addAnnouncement(parts.join(' '), 'info')
  }

  setMoney(money: number, frags?: number, smokes?: number): void {
    this.money = money
    if (frags !== undefined) this.frags = frags
    if (smokes !== undefined) this.smokes = smokes
    useGame.getState().setHud({ money, frags: this.frags, smokes: this.smokes })
  }

  onHitConfirm(dmg: number, headshot: boolean): void {
    this.hitMarkers.push({ t: performance.now(), headshot })
    this.dmgNumbers.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 70,
      y: innerHeight / 2 - 40 + (Math.random() - 0.5) * 40,
      amount: dmg, t: performance.now(), headshot,
    })
    this.audio.hitmarker(headshot)
  }

  onShotFired(playerId: string, origin: [number, number, number], hit: [number, number, number], weapon: WeaponId): void {
    // animación de disparo del tirador (patada de brazos/arma)
    this.remotes.notifyShot(playerId)
    // el fogonazo y la traza salen de la boca del cañón del modelo si existe
    const muzzle = this.remotes.getMuzzleWorld(playerId)
    const from = muzzle ?? new THREE.Vector3(...origin)
    const to = new THREE.Vector3(...hit)
    const d = from.distanceTo(this.camera.position)
    if (d > 130) return
    this.effects.tracer(from, to, true)
    this.audio.gunshot(WEAPONS[weapon].sound, d)
    // fogonazo del tirador
    if (d < 60) this.effects.muzzleFlash(from, 0.8)
    // ping en minimapa si es enemigo
    const st = this.remotes.map.get(playerId)?.state
    if (st && st.team !== this.team) {
      this.pings.push({ x: origin[0], z: origin[2], t: performance.now() })
    }
  }

  // ----------------------------------------------------------
  // Barriles explosivos
  // ----------------------------------------------------------
  /** El jugador local revienta un barril: FX local + daño autoritativo en el servidor */
  private igniteBarrel(idx: number): void {
    const b = this.barrels[idx]
    if (!b || !b.alive) return
    b.alive = false
    b.respawnAt = performance.now() + 28000
    b.mesh.visible = false
    b.mesh.position.y = -80   // fuera del raycast hasta reaparecer
    const pos = new THREE.Vector3(b.x, 0.55, b.z)
    this.explodeBarrelFX(pos)
    this.net.sendBarrel([b.x, 0.55, b.z])
    // reacción en cadena: barriles cercanos estallan con retardo
    for (let i = 0; i < this.barrels.length; i++) {
      if (i === idx) continue
      const o = this.barrels[i]
      if (!o.alive) continue
      if (Math.hypot(o.x - b.x, o.z - b.z) < 3.6) {
        setTimeout(() => { if (!this.disposed) this.igniteBarrel(i) }, 150 + Math.random() * 220)
      }
    }
  }

  private explodeBarrelFX(pos: THREE.Vector3): void {
    this.effects.explosion(pos)
    this.audio.explosion(this.camera.position.distanceTo(pos))
    // empujón al jugador local si está cerca
    const dp = Math.hypot(this.pos.x - pos.x, this.pos.z - pos.z, (this.pos.y + 1 - pos.y) * 0.7)
    if (dp < 6 && !this.dead) {
      const k = 1 - dp / 6
      const push = new THREE.Vector3(this.pos.x - pos.x, 0, this.pos.z - pos.z)
      if (push.lengthSq() < 0.01) push.set(Math.random() - 0.5, 0, Math.random() - 0.5)
      push.normalize()
      this.vel.addScaledVector(push, k * 7)
      this.vel.y += k * 3.5
      this.trauma = Math.min(1, this.trauma + k * 0.55)
    } else {
      this.trauma = Math.min(1, this.trauma + 0.15)
    }
  }

  /** Explosión de barril causada por otro jugador (evento de red) */
  onBarrelExplode(pos: [number, number, number]): void {
    this.explodeBarrelFX(new THREE.Vector3(...pos))
    // ocultar el barril correspondiente también localmente
    for (const b of this.barrels) {
      if (b.alive && Math.hypot(b.x - pos[0], b.z - pos[2]) < 0.9) {
        b.alive = false
        b.respawnAt = performance.now() + 28000
        b.mesh.visible = false
        b.mesh.position.y = -80
      }
    }
  }

  private updateBarrels(): void {
    const t = performance.now()
    for (const b of this.barrels) {
      if (!b.alive && t >= b.respawnAt) {
        b.alive = true
        b.mesh.visible = true
        b.mesh.position.y = 0.5
      }
    }
  }

  onSnapshot(snap: NetSnapshot): void {
    const t = performance.now()
    for (const st of snap.players) {
      if (st.id === this.net.id) continue
      this.remotes.upsert(st, t)
    }
    // objetivos de modo (banderas / zonas)
    this.updateObjectiveViews(snap.round)
    // pociones
    const seenP = new Set<string>()
    for (const pk of snap.pickups ?? []) {
      seenP.add(pk.id)
      let pv = this.pickupViews.get(pk.id)
      if (!pv) {
        pv = this.buildPickupView(pk)
        this.pickupViews.set(pk.id, pv)
        this.scene.add(pv.group)
      }
      pv.group.visible = pk.active
    }
    for (const [id, pv] of this.pickupViews) {
      if (!seenP.has(id)) {
        this.scene.remove(pv.group)
        this.pickupViews.delete(id)
      }
    }
    // granadas visibles
    const seen = new Set<string>()
    for (const g of snap.grenades) {
      seen.add(g.id)
      let gv = this.grenadeViews.get(g.id)
      if (!gv) {
        const group = buildGrenadeModel(g.kind)
        this.scene.add(group)
        gv = { group, last: new THREE.Vector3(g.x, g.y, g.z), trailT: 0 }
        this.grenadeViews.set(g.id, gv)
      }
      gv.group.position.set(g.x, g.y, g.z)
    }
    for (const [id, gv] of this.grenadeViews) {
      if (!seen.has(id)) {
        this.scene.remove(gv.group)
        this.grenadeViews.delete(id)
      }
    }
    // ronda
    const me = snap.players.find(p => p.id === this.net.id)
    useGame.getState().setHud({ round: snap.round, carryingFlag: !!me?.flag })
  }

  private updateJumpPadFX(dt: number): void {
    for (const p of this.jumpPads) {
      p.phase += dt * 2.4
      const pulse = 0.5 + 0.32 * Math.sin(p.phase)
      const target = 2.2 + Math.sin(p.phase * 1.3) * 0.4
      // el glow decae hacia su tamaño normal tras el impulso
      p.glow.scale.setScalar(p.glow.scale.x + (target - p.glow.scale.x) * Math.min(1, dt * 5))
      const mat = p.ring.material as THREE.MeshBasicMaterial
      mat.opacity = pulse
    }
  }

  /** Modelo flotante de una poción/botiquín */
  private buildPickupView(pk: NetPickup): PickupView {
    const info = PICKUP_INFO[pk.kind]
    const group = new THREE.Group()
    group.position.set(pk.x, 0, pk.z)

    // anillo en el suelo
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.58, 26),
      new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    group.add(ring)

    // objeto flotante
    const item = new THREE.Group()
    item.position.y = 0.55
    if (pk.kind === 'medkit' || pk.kind === 'bandage') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(pk.kind === 'medkit' ? 0.42 : 0.24, pk.kind === 'medkit' ? 0.24 : 0.16, pk.kind === 'medkit' ? 0.3 : 0.22),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
      )
      item.add(body)
      if (pk.kind === 'medkit') {
        const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.09), new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.8 }))
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.26), cross1.material as THREE.Material)
        cross1.position.y = 0.13
        cross2.position.y = 0.13
        item.add(cross1, cross2)
      }
    } else {
      const big = pk.kind === 'shieldBig'
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(big ? 0.13 : 0.09, big ? 0.15 : 0.11, big ? 0.46 : 0.32, 12),
        new THREE.MeshStandardMaterial({
          color: info.color, roughness: 0.25, metalness: 0.1,
          emissive: info.color, emissiveIntensity: 0.85, transparent: true, opacity: 0.92,
        }),
      )
      item.add(bottle)
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(big ? 0.06 : 0.045, big ? 0.06 : 0.045, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 }),
      )
      cap.position.y = (big ? 0.46 : 0.32) / 2 + 0.04
      item.add(cap)
    }
    group.add(item)

    // halo aditivo
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSparkTexture(), color: info.color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    glow.scale.setScalar(1.1)
    glow.position.y = 0.55
    group.add(glow)

    return { group, glow, phase: Math.random() * Math.PI * 2 }
  }

  private updatePickupViews(dt: number, t: number): void {
    void dt
    for (const pv of this.pickupViews.values()) {
      if (!pv.group.visible) continue
      const item = pv.group.children[1]  // item group
      item.rotation.y = t * 1.8 + pv.phase
      item.position.y = 0.55 + Math.sin(t * 2.2 + pv.phase) * 0.08
      const glow = pv.glow
      glow.material.opacity = 0.55 + Math.sin(t * 3 + pv.phase) * 0.18
    }
  }

  onGrenadeExplode(pos: [number, number, number]): void {
    const p = new THREE.Vector3(...pos)
    const d = p.distanceTo(this.camera.position)
    this.effects.explosion(p)
    this.audio.explosion(d)
    this.trauma = Math.min(1, this.trauma + Math.max(0, 1 - d / 15) * 0.8)
  }

  // ----------------------------------------------------------
  // Overlay 2D (crosshair, hitmarkers, daño)
  // ----------------------------------------------------------
  private drawOverlay(t: number): void {
    const ctx = this.octx
    const W = this.overlay.width, H = this.overlay.height
    if (W !== innerWidth || H !== innerHeight) {
      this.overlay.width = innerWidth
      this.overlay.height = innerHeight
    }
    ctx.clearRect(0, 0, W, H)
    const now = performance.now()
    const s = useGame.getState()
    const cx = W / 2, cy = H / 2

    // cinemática de entrada: barras de cine + título
    if (this.cine.active) {
      const tCine = (performance.now() - this.cine.t0) / 1000
      const barH = Math.min(1, tCine / 0.7) * H * 0.115
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, barH)
      ctx.fillRect(0, H - barH, W, barH)
      const fade = tCine < 0.8 ? tCine / 0.8 : tCine > 6.5 ? Math.max(0, 1 - (tCine - 6.5) / 1.5) : 1
      if (fade > 0.01) {
        ctx.save()
        ctx.globalAlpha = fade
        ctx.textAlign = 'center'
        ctx.font = `900 ${Math.min(78, W * 0.062)}px "Arial Black", system-ui, sans-serif`
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillText('FRONTERA CERO', cx + 3, H * 0.28 + 3)
        ctx.fillStyle = '#f5f0e6'
        ctx.fillText('FRONTERA CERO', cx, H * 0.28)
        ctx.font = 'bold 15px monospace'
        ctx.fillStyle = 'rgba(216,164,24,0.95)'
        ctx.fillText('ESTACIÓN MERIDIANO 59 · ZONA DE EXCLUSIÓN TOTAL', cx, H * 0.28 + 36)
        ctx.restore()
      }
      const pulse = 0.6 + 0.4 * Math.sin(now / 300)
      ctx.textAlign = 'center'
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.fillText('CLIC O CUALQUIER TECLA PARA OMITIR', cx, H - barH - 18)
    }

    // mira telescópica
    const w = WEAPONS[this.weapon]
    if (w.sniper && this.adsAmt > 0.7 && !this.dead) {
      this.drawScope(ctx, W, H)
    } else if (!this.dead && s.phase === 'playing') {
      // crosshair compacto y estable (v4: mucho más pequeño y con poca apertura)
      const spread = this.currentSpread()
      const gap = (4 + spread * 7) * (1 - this.adsAmt * 0.4)
      const len = 6.5
      ctx.strokeStyle = 'rgba(140,255,160,0.92)'
      ctx.lineWidth = 1.6
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 1.5
      ctx.beginPath()
      // 4 líneas
      ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy)
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy)
      ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap)
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len)
      ctx.stroke()
      ctx.shadowBlur = 0
      // punto central
      ctx.fillStyle = 'rgba(80,255,120,0.9)'
      ctx.fillRect(cx - 1, cy - 1, 2, 2)
    }

    // hitmarkers
    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
      const hm = this.hitMarkers[i]
      const age = (now - hm.t) / 240
      if (age >= 1) { this.hitMarkers.splice(i, 1); continue }
      const a = 1 - age
      const g = 7, l = 8
      ctx.strokeStyle = hm.headshot ? `rgba(255,60,60,${a})` : `rgba(255,255,255,${a})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cx - g - l, cy - g - l); ctx.lineTo(cx - g, cy - g)
      ctx.moveTo(cx + g, cy + g); ctx.lineTo(cx + g + l, cy + g + l)
      ctx.moveTo(cx - g - l, cy + g + l); ctx.lineTo(cx - g, cy + g)
      ctx.moveTo(cx + g, cy - g); ctx.lineTo(cx + g + l, cy - g - l)
      ctx.stroke()
    }

    // pista de interacción (tirolina)
    if (this.interactHint && s.phase === 'playing' && !this.dead) {
      const pulse = 0.75 + 0.25 * Math.sin(now / 180)
      ctx.font = 'bold 20px "Courier New", monospace'
      ctx.textAlign = 'center'
      const tw = ctx.measureText(this.interactHint).width
      const bx = cx - tw / 2 - 14, by = H * 0.62
      ctx.fillStyle = `rgba(12,14,10,${0.55 * pulse + 0.3})`
      ctx.fillRect(bx, by, tw + 28, 34)
      ctx.strokeStyle = `rgba(216,164,24,${pulse})`
      ctx.lineWidth = 2
      ctx.strokeRect(bx, by, tw + 28, 34)
      ctx.fillStyle = `rgba(255,205,120,${pulse})`
      ctx.fillText(this.interactHint, cx, by + 23)
    }

    // números de daño
    ctx.textAlign = 'center'
    ctx.font = 'bold 18px "Courier New", monospace'
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const dn = this.dmgNumbers[i]
      const age = (now - dn.t) / 800
      if (age >= 1) { this.dmgNumbers.splice(i, 1); continue }
      const y = dn.y - age * 46
      const alpha = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85
      ctx.fillStyle = dn.headshot ? `rgba(255,70,70,${alpha})` : `rgba(255,220,80,${alpha})`
      ctx.fillText(String(dn.amount), dn.x, y)
    }

    // indicadores de dirección de daño
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const dd = this.dmgDirs[i]
      const age = (now - dd.t) / 1000
      if (age >= 1) { this.dmgDirs.splice(i, 1); continue }
      const alpha = 1 - age
      const R = 90
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(dd.angle)
      // arco rojo apuntando hacia el daño
      ctx.strokeStyle = `rgba(255,40,40,${alpha * 0.9})`
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(0, 0, R, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45)
      ctx.stroke()
      ctx.restore()
    }

    // destello de daño (vignette)
    if (this.hurtFlash > 0.02) {
      const g = ctx.createRadialGradient(cx, cy, H * 0.25, cx, cy, H * 0.75)
      g.addColorStop(0, 'rgba(255,0,0,0)')
      g.addColorStop(1, `rgba(160,0,0,${this.hurtFlash * 0.5})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }

    // vignette de poca vida
    if (this.hp < 40 && !this.dead) {
      const pulse = 0.35 + Math.sin(t * 5) * 0.15
      const g = ctx.createRadialGradient(cx, cy, H * 0.3, cx, cy, H * 0.72)
      g.addColorStop(0, 'rgba(120,0,0,0)')
      g.addColorStop(1, `rgba(140,0,0,${pulse * (1 - this.hp / 40)})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }

    // pings del minimapa expiran
    this.pings = this.pings.filter(p => now - p.t < 2500)
    this.dmgDirs = this.dmgDirs.filter(d => now - d.t < 1000)
  }

  private drawScope(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const cx = W / 2, cy = H / 2
    const R = Math.min(W, H) * 0.42
    // máscara negra
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true)
    ctx.fill()
    // cruz
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 12, cy)
    ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + R, cy)
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 12)
    ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + R)
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy)
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5)
    ctx.stroke()
    // marcas de rango
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    for (let i = 1; i <= 4; i++) {
      const y = cy + i * R * 0.16
      ctx.beginPath()
      ctx.moveTo(cx - 8 - i, y); ctx.lineTo(cx + 8 + i, y)
      ctx.stroke()
    }
    // borde del visor
    ctx.strokeStyle = 'rgba(20,20,20,0.95)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
  }

  // ----------------------------------------------------------
  // Minimapa
  // ----------------------------------------------------------
  private buildMinimapStatic(): void {
    const c = document.createElement('canvas')
    c.width = c.height = 240
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(12,14,10,0.88)'
    ctx.fillRect(0, 0, 240, 240)
    const S = 240 / (GAME.MAP_HALF * 2 + 2) // escala px/m
    const O = 120
    // cajas (solo muros altos visibles)
    for (const b of MAP_BOXES) {
      if (b.h < 1.0) continue
      const x = O + b.x * S, y = O + b.z * S
      ctx.fillStyle = b.h > 2.5 ? 'rgba(150,140,120,0.65)' : 'rgba(120,112,96,0.45)'
      ctx.fillRect(x - (b.w * S) / 2, y - (b.d * S) / 2, b.w * S, b.d * S)
    }
    // zonas de spawn
    ctx.strokeStyle = 'rgba(245,158,11,0.5)'
    ctx.beginPath(); ctx.arc(O + SPAWN_A[0] * S, O + SPAWN_A[2] * S, GAME.BUY_RADIUS * S, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(34,197,94,0.5)'
    ctx.beginPath(); ctx.arc(O + SPAWN_B[0] * S, O + SPAWN_B[2] * S, GAME.BUY_RADIUS * S, 0, Math.PI * 2); ctx.stroke()
    // barriles explosivos (puntos rojos)
    ctx.fillStyle = 'rgba(220,60,40,0.85)'
    for (const b of EXPLODING_BARRELS) {
      ctx.beginPath()
      ctx.arc(O + b.x * S, O + b.z * S, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // tirolinas (líneas)
    ctx.strokeStyle = 'rgba(190,200,210,0.55)'
    ctx.lineWidth = 1.4
    for (const z of ZIPLINES) {
      ctx.beginPath()
      ctx.moveTo(O + z.from[0] * S, O + z.from[2] * S)
      ctx.lineTo(O + z.to[0] * S, O + z.to[2] * S)
      ctx.stroke()
    }
    // plataformas de salto (cuadrados naranjas)
    ctx.fillStyle = 'rgba(255,140,26,0.9)'
    for (const p of JUMP_PADS) {
      ctx.fillRect(O + p.x * S - 2.5, O + p.z * S - 2.5, 5, 5)
    }
    this.mapStatic = c
  }

  private drawMinimap(): void {
    const ctx = this.mctx
    const W = this.minimap.width
    ctx.clearRect(0, 0, W, W)
    ctx.drawImage(this.mapStatic, 0, 0)
    const S = 240 / (GAME.MAP_HALF * 2 + 2)
    const O = 120
    const now = performance.now()

    // pings de enemigos
    for (const p of this.pings) {
      const age = (now - p.t) / 2500
      ctx.fillStyle = `rgba(255,60,60,${1 - age})`
      ctx.beginPath()
      ctx.arc(O + p.x * S, O + p.z * S, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // granadas
    ctx.fillStyle = 'rgba(250,204,21,0.9)'
    for (const gv of this.grenadeViews.values()) {
      ctx.beginPath()
      ctx.arc(O + gv.group.position.x * S, O + gv.group.position.z * S, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // banderas (CTF)
    for (const [key, fv] of this.flagViews) {
      ctx.fillStyle = key === 'a' ? '#f59e0b' : '#22c55e'
      const x = O + fv.group.position.x * S, y = O + fv.group.position.z * S
      ctx.fillRect(x - 3, y - 3, 6, 6)
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1
      ctx.strokeRect(x - 3, y - 3, 6, 6)
    }

    // zonas de dominación
    for (const zv of this.zoneViews) {
      const mat = zv.ring.material as THREE.MeshBasicMaterial
      ctx.strokeStyle = `#${mat.color.getHexString()}`
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(O + zv.letter.position.x * S, O + zv.letter.position.z * S, GAME.DOM_ZONE_RADIUS * S, 0, Math.PI * 2)
      ctx.stroke()
    }

    // remotos
    for (const rp of this.remotes.map.values()) {
      const st = rp.state
      if (!st || st.dead) continue
      const x = O + rp.root.position.x * S
      const y = O + rp.root.position.z * S
      if (st.team === this.team) {
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // jugador local (flecha)
    const px = O + this.pos.x * S, py = O + this.pos.z * S
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-this.yaw)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, -7)
    ctx.lineTo(5, 5)
    ctx.lineTo(0, 2.5)
    ctx.lineTo(-5, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // utilidades
  get currentAmmo(): { mag: number; reserve: number } {
    return this.ammo[this.weapon] ?? { mag: 0, reserve: 0 }
  }

  /** Estado de input para el servidor */
  inputState(): { pos: [number, number, number]; yaw: number; pitch: number; crouch: boolean; speed: number; weapon: string } {
    // el yaw del motor es de cámara (frente −Z); el de los remotos es de modelo
    // (frente +Z) → enviar girado π para que el rival nos vea de frente
    let ryaw = (this.yaw + Math.PI) % (Math.PI * 2)
    if (ryaw > Math.PI) ryaw -= Math.PI * 2
    if (ryaw < -Math.PI) ryaw += Math.PI * 2
    return {
      pos: [Math.round(this.pos.x * 100) / 100, Math.round(this.pos.y * 100) / 100, Math.round(this.pos.z * 100) / 100],
      yaw: Math.round(ryaw * 1000) / 1000,
      pitch: Math.round(this.pitch * 1000) / 1000,
      crouch: this.crouching,
      speed: Math.round(Math.hypot(this.vel.x, this.vel.z) * 10) / 10,
      weapon: this.weapon,
    }
  }
}
