// ============================================================
// EMERGENCY STRIKE — Motor del juego (Three.js)
// Movimiento, colisiones, cámara, armas, efectos, minimapa
// ============================================================
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  GAME, WEAPONS, MAP_BOXES, MAP_AABBS, SPAWN_A, SPAWN_B, TREES, LAMPS, NEONS, PUDDLES,
  PICKUP_INFO, EXPLODING_BARRELS, ZIPLINES, JUMP_PADS, FLAG_A, FLAG_B, DOM_ZONES,
  STORY_EXTRACTION, EQUIPMENT,
  getMapData, keyLabel,
  type MapData, type MapId,
  type Team, type WeaponId, type GameMode, type NetSnapshot, type NetPlayerState, type NetPickup, type PickupKind, type MatKey, type GrenadeKind, type ActionId,
  isMouseButton, mouseButtonIndex,
} from './shared'
import { AudioEngine, getAudio } from './audio'
import { Effects } from './effects'
import { RemotePlayers, buildCineSoldier } from './remote-players'
import { buildWeaponModel, weaponPose, buildGrenadeModel } from './viewmodel'
import { makeWorldTextures, makeAOBlobTexture, makeNeonTexture, makeSparkTexture, makeSmokeTexture, makeCloudTexture, makeWaterNoiseTexture, makeBirdTexture } from './textures'
import { useGame } from './store'
import { useChat } from './chat'
import { NetClient } from './net'
import { preloadAssets, buildGLBWeapon, ensureWeaponGLB, getTreeTemplate, getRepoTextures, onWeaponGLBsReady } from './assets'
import { StoryDirector, type StorySyncData, type StoryRemoteMsg } from './story'

interface DamageNumber { x: number; y: number; amount: number; t: number; headshot: boolean }
interface HitMarker { t: number; headshot: boolean; dmg?: number }
interface DamageDir { angle: number; t: number }
interface Ping { x: number; z: number; t: number }
interface PickupView { group: THREE.Group; glow: THREE.Sprite; phase: number }

interface WeaponRuntime { mag: number; reserve: number }

/** niveles de calidad gráfica (v6.2: ULTRA opcional, desactivado por defecto) */
type Quality = 'baja' | 'media' | 'alta' | 'ultra'

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

/** línea de diálogo de una cinemática (v6.3) */
export interface CineDialogue {
  at: number
  dur?: number
  who: string
  text: string
}

/** batalla visible durante una cinemática (v7: varias por escena) */
export interface CineBattleSpec {
  cx: number
  cz: number
  /** orientación de la línea de frente (rad; los bandos miran perpendicular) */
  yaw: number
  /** soldados por bando */
  count: number
}

interface CineSoldier {
  root: THREE.Group
  body: THREE.Group
  muzzle: THREE.Object3D | null
  team: Team
  weapon: WeaponId
  fallen: boolean
  fallT: number
  /** variación de fase para no disparar en sincronía */
  phase: number
}

interface JumpPadView {
  x: number; z: number
  ring: THREE.Mesh
  glow: THREE.Sprite
  phase: number
}

// (v6.1: PRIMARY_PREF/SECONDARY_PREF eliminados — los huecos 1/2 los
// asigna el jugador en la tienda y se guardan en this.slots)
const HALF_W = 0.36
const UP_AXIS = new THREE.Vector3(0, 1, 0)
const EYE_STAND = 1.62
const EYE_CROUCH = 1.14
const BASE_FOV = 75

/** Parámetros PBR por material del mapa */
const MAT_PBR: Record<MatKey, { roughness: number; metalness: number }> = {
  sand: { roughness: 0.95, metalness: 0.0 },
  concrete: { roughness: 0.9, metalness: 0.0 },
  floor: { roughness: 0.82, metalness: 0.0 },
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
  rock: { roughness: 0.96, metalness: 0.0 },
}

/** colores de locutor para los diálogos de cinemática (v6.3) */
const CINE_SPEAKERS: Record<string, string> = {
  COMMAND: '#f5c04a',   // command amber
  RED: '#6ee7a0',       // net ops green
  RIVERA: '#7db8f5',    // resistance blue
  VEGA: '#f06a6a',      // villain red
  PILOT: '#ffd9a6',     // extraction pilot
  OPERATOR: '#ffe9c4',
}

export class Game {
  // three
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  /** escena 3D (la usa el director del modo historia) */
  getStoryScene(): THREE.Scene { return this.scene }
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
  audio: AudioEngine = getAudio()
  private effects!: Effects
  private remotes!: RemotePlayers
  net!: NetClient
  /** v6.4: fase del frame anterior (detecta pausa/reanudación) */
  private prevPhase: string = ''
  /** director del modo historia (solo en la misión) */
  story: StoryDirector | null = null
  private storyStarted = false
  /** mapa activo: ciudad o instalación militar de la misión */
  mapId: MapId = 'ciudad'
  md!: MapData

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
  /** v6.1: arsenal completo (compras conservadas) — espejo del simulador */
  private armory: WeaponId[] = ['knife', 'p9']
  /** v6.1: huecos [1, 2] — teclas 1/2; el cuchillo es el hueco 3 fijo */
  private slots: [WeaponId | null, WeaponId | null] = [null, 'p9']
  private ammo: Partial<Record<WeaponId, WeaponRuntime>> = {}
  weapon: WeaponId = 'p9'
  private lastWeapon: WeaponId = 'knife'
  frags = 0
  smokes = 0

  // runtime de armas
  private nextShotAt = 0
  /** v9: última vez que se avisó del bloqueo de disparo (CTF) */
  private flagWarnAt = 0
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
  /** v7: velocidad del muelle de retroceso del viewmodel */
  private vmKickVel = 0
  /** v7: amplitud de bob suavizada */
  private bobAmt = 0
  /** v8: inercia posicional del arma (sigue al ratón con retraso suave) */
  private swayPX = 0
  private swayPY = 0
  /** v8: muelle de aterrizaje (el arma cae y rebota al tocar suelo) */
  private landDip = 0
  private landDipVel = 0
  private prevOnGround = true
  /** v8: velocidad vertical justo antes de aterrizar (para el muelle del arma) */
  private lastFallSpeed = 0
  /** v8: balanceo lateral suavizado por velocidad lateral */
  private strafeRoll = 0
  /** v8: sacudida de la fase de recarga (cargador fuera/dentro) */
  private reloadJolt = 0
  private reloadJoltVel = 0

  // ---- v8: equipo táctico (bengala + estímulo) ----
  private flares = 0
  private stims = 0
  private vest = false
  private helmet = false
  private flareUntil = 0
  private stimUntilMs = 0
  /** bengalas visibles (proyectil que sube y arde) */
  private flareViews: { group: THREE.Group; light: THREE.PointLight; t: number; born: number; px: number; py: number; pz: number }[] = []

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

  // cinemática de entrada / cinemáticas del modo historia
  private cine = {
    active: false,
    played: false,
    t0: 0,
    dur: 9.5,
    curve: null as THREE.CatmullRomCurve3 | null,
    look: null as THREE.CatmullRomCurve3 | null,
    kind: 'entry' as 'entry' | 'story',
    title: '',
    subtitle: '',
    onDone: null as (() => void) | null,
    dialogues: null as CineDialogue[] | null,
  }
  private cineTitleFade = 0

  // ---- v6.3: batalla visible durante la cinemática ----
  private cineSoldiers: CineSoldier[] = []
  private cineBattles: CineBattleSpec[] = []
  private cineShotNext = 0
  private cineBoomNext = 0
  private cineBattlePos = new THREE.Vector3()

  // ---- ambiente v6: cielo con shader, nubes, agua, polvo y aves ----
  private clouds: THREE.Sprite[] = []
  private cloudSpeeds: number[] = []
  private waterMat: THREE.ShaderMaterial | null = null
  private dust: THREE.Points | null = null
  private dustVel: Float32Array | null = null
  private birds: THREE.Sprite[] = []
  private birdPhase: number[] = []
  private skyUniforms: { uSunDir: { value: THREE.Vector3 } } | null = null

  // ---- v6.2: modo ULTRA (luces/sol/sombras/reflejos realistas) ----
  private waterMeshes: THREE.Mesh[] = []      // superficies de agua (para elegir la mayor)
  private ultraReflector: Reflector | null = null
  private ultraReflectorBase: THREE.Mesh | null = null // agua original (se restaura si ULTRA se degrada)
  private muzzleLight: THREE.PointLight | null = null  // luz real del fogonazo
  private ultraScaled = false                 // el guardia de FPS ya redujo ULTRA
  private lowFpsMs = 0
  private ultraBloom: UnrealBloomPass | null = null
  private ultraAnchor: THREE.Object3D | null = null // punto del sol con el lens flare

  // ---- v6.4: calidad EN VIVO (el selector de AJUSTES se nota al instante) ----
  private curQuality: Quality | null = null
  /** textura de entorno PBR (se restaura al volver de BAJA) */
  private envTex: THREE.Texture | null = null
  /** mallas de árboles GLB horneadas (para reconstruir al cambiar calidad) */
  private glbTreeMeshes: THREE.Mesh[] = []
  /** materiales de las calles (brillo húmedo de ULTRA en vivo) */
  private streetMats: { asphalt: THREE.MeshStandardMaterial; sidewalk: THREE.MeshStandardMaterial } | null = null

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
  // (v5: sin malla de pasto — eliminada para reducir el lag)
  private grassUniform = { value: 0 }

  // ---- objetivos de los modos (banderas / zonas) ----
  private flagViews = new Map<'a' | 'b', { group: THREE.Group; cloth: THREE.Mesh; beam: THREE.Mesh; pad?: THREE.Mesh }>()
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
  /** v7: familia Rajdhani real (next/font la registra con nombre hash) */
  private tacFont = '"Courier New"'
  private mapMeshes: THREE.Mesh[] = []
  private disposed = false

  // pool de luces de farola (6 luces recolocables en las 18 farolas)
  private lampLights: THREE.PointLight[] = []
  private lampPos: [number, number][] = []
  private lampLightNext = 0
  // scratch reutilizado por updateLampLights (sin asignaciones por frame)
  private lampOrder: number[] = []
  private lampDist: number[] = []

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

    // mapa según el modo: la misión usa la instalación militar (v5)
    this.mapId = useGame.getState().gameMode === 'historia' ? 'instalacion' : 'ciudad'
    this.md = getMapData(this.mapId)
    this.pos.set(this.md.spawnA[0], 0.02, this.md.spawnA[2])
    this.audio.setDuck(true)

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas3d,
      antialias: quality !== 'baja',
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(quality === 'ultra' || quality === 'alta' ? Math.min(devicePixelRatio, 2) : quality === 'media' ? Math.min(devicePixelRatio, 1.5) : 1)
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    // v7: exposure pulled back — ULTRA sun no longer blows out walls
    this.renderer.toneMappingExposure = quality === 'ultra' ? 1.08 : 1.12
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
    this.buildAmbience(quality)
    if (this.mapId === 'ciudad') this.buildStreets(quality)
    if (this.mapId !== 'instalacion') this.buildObjectives()
    this.buildMinimapStatic()
    this.curQuality = quality
    this.applyAmbienceQuality(quality)
    this.applyLampQuality(quality)
    // v6.2: extras de ULTRA (destello de sol, reflejo real del agua, luz de
    // fogonazo) — OPCIONAL, solo si el jugador lo activó en AJUSTES
    if (quality === 'ultra') this.buildUltraFX()

    // v7 assets: texturas siempre · árboles SOLO en el mapa ciudad ·
    // armas GLB perezosas (ensureWeaponGLB al blandirla) → el modo que
    // juegas descarga solo lo que usa (~18 MB menos al entrar)
    preloadAssets({ trees: this.mapId === 'ciudad' }).then(() => {
      if (this.disposed) return
      // DIAGNÓSTICO: partes integradas por separado para localizar cuelgues
      const parts = (new URLSearchParams(location.search).get('assets') ?? 'all').split(',')
      if (parts.includes('all') || parts.includes('tex')) this.applyRepoTextures()
      if (parts.includes('all') || parts.includes('tree')) this.applyRepoTrees()
    })
    onWeaponGLBsReady(() => {
      if (this.disposed) return
      // refrescar el arma en mano y las de los remotos con los modelos GLB
      // (v7: se dispara cada vez que llega un GLB nuevo — carga perezosa)
      this.setWeapon(this.weapon, true)
      this.remotes.refreshWeapons()
    })

    this.effects = new Effects(this.scene)
    this.remotes = new RemotePlayers(this.scene)

    // director de la misión (modo historia): begin() espera al primer
    // spawn — si no, la cinemática correría tapada por la pantalla de
    // conexión mientras arranca el worker de simulación
    if (this.mapId === 'instalacion') {
      this.story = new StoryDirector(this)
    }

    // viewmodel holder
    this.vmHolder = new THREE.Group()
    this.camera.add(this.vmHolder)
    this.setWeapon('p9', true)

    // post-proceso: bloom de neones y fogonazos (calidad alta y ULTRA)
    if (quality === 'alta' || quality === 'ultra') {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), quality === 'ultra' ? 0.46 : 0.42, 0.7, 0.9)
      this.composer.addPass(bloom)
      this.ultraBloom = bloom   // v6.4: referencia al pase (ajustable en vivo)
      this.composer.addPass(new OutputPass())
    }

    // eventos
    this.bindEvents()

    this.net = new NetClient(this)

    // gancho de depuración (tests automatizados)
    ;(window as unknown as Record<string, unknown>).__game = this

    // v7: fuente táctica real para el canvas (Rajdhani con hash de next/font)
    try {
      const v = getComputedStyle(document.body).getPropertyValue('--font-rajdhani')
      const first = v.split(',')[0].trim()
      if (first) this.tacFont = first
    } catch { /* sin estilos: monospace del sistema */ }

    this.clock.start()
    this.loop()
  }

  private buildSky(): void {
    // ---- CIELO CON SHADER (v6): degradado atmosférico suave con resplandor
    // solar real integrado — sustituye a la textura de canvas (sin
    // estiramiento en los polos, sin banding y el halo del sol se funde con
    // el horizonte). Coste: el mismo fragment de siempre en UNA esfera. ----
    const sunDir = new THREE.Vector3(0.62, 0.47, -0.48).normalize()
    const uniforms = {
      uSunDir: { value: sunDir.clone() },
    }
    this.skyUniforms = uniforms
    const skyMat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uSunDir;
        // paleta del atardecer (zenit → horizonte → suelo)
        const vec3 ZENITH  = vec3(0.125, 0.204, 0.337);
        const vec3 MID     = vec3(0.415, 0.525, 0.639);
        const vec3 HORIZON = vec3(0.918, 0.627, 0.357);
        const vec3 GLOWCOL = vec3(1.000, 0.678, 0.392);
        const vec3 GROUND  = vec3(0.353, 0.243, 0.161);
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // cielo arriba
          float t = pow(clamp(h * 1.55 + 0.12, 0.0, 1.0), 0.58);
          vec3 col = mix(HORIZON, mix(MID, ZENITH, clamp((h - 0.28) * 2.2, 0.0, 1.0)), t);
          // cálido extra pegado al horizonte (lado del sol más intenso)
          float sunSide = clamp(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5, 0.0, 1.0);
          col = mix(col, GLOWCOL * 0.85, (1.0 - clamp(abs(h) * 3.4, 0.0, 1.0)) * (0.25 + sunSide * 0.45));
          // suelo/bajo horizonte
          col = mix(col, GROUND, clamp(-h * 4.0, 0.0, 1.0));
          // resplandor del sol: halo ancho + halo medio + disco
          float s = clamp(dot(d, uSunDir), 0.0, 1.0);
          col += GLOWCOL * 0.16 * pow(s, 6.0);
          col += vec3(1.0, 0.88, 0.66) * 0.55 * pow(s, 48.0);
          col += vec3(1.0, 0.97, 0.88) * smoothstep(0.99955, 0.99985, s);
          // dithering anti-banding (1/255)
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          col += (n - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(340, 48, 28), skyMat)
    this.scene.add(sky)
    this.skyMesh = sky

    // ---- SOL: disco + corona + halo con degradado radial propio,
    // alineados con la dirección de la luz (y con el sol del shader) ----
    const sunTex = this.makeSunTexture()
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: 0xffb566, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
    }))
    halo.position.copy(sunDir).multiplyScalar(315)
    halo.scale.set(230, 230, 1)
    this.scene.add(halo)
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: 0xffd9a6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
    }))
    corona.position.copy(sunDir).multiplyScalar(302)
    corona.scale.set(95, 95, 1)
    this.scene.add(corona)
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: 0xfff6e0, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
    }))
    disc.position.copy(sunDir).multiplyScalar(299)
    disc.scale.set(30, 30, 1)
    this.scene.add(disc)
  }

  /** textura del sol: núcleo blanco → ámbar → transparente (degradado radial) */
  private makeSunTexture(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0.0, 'rgba(255,255,255,1)')
    g.addColorStop(0.18, 'rgba(255,246,225,1)')
    g.addColorStop(0.35, 'rgba(255,214,150,0.85)')
    g.addColorStop(0.6, 'rgba(255,178,96,0.32)')
    g.addColorStop(1.0, 'rgba(255,150,60,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  /** Mapa de entorno para reflexiones PBR (PMREM del cielo shader de atardecer) */
  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    // el mismo shader del cielo → reflexiones coherentes con lo que se ve
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: new THREE.Vector3(0.42, 0.32, -0.32).normalize() } },
      side: THREE.BackSide,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uSunDir;
        const vec3 ZENITH  = vec3(0.125, 0.204, 0.337);
        const vec3 MID     = vec3(0.415, 0.525, 0.639);
        const vec3 HORIZON = vec3(0.918, 0.627, 0.357);
        const vec3 GLOWCOL = vec3(1.000, 0.678, 0.392);
        const vec3 GROUND  = vec3(0.353, 0.243, 0.161);
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float t = pow(clamp(h * 1.55 + 0.12, 0.0, 1.0), 0.58);
          vec3 col = mix(HORIZON, mix(MID, ZENITH, clamp((h - 0.28) * 2.2, 0.0, 1.0)), t);
          float sunSide = clamp(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5, 0.0, 1.0);
          col = mix(col, GLOWCOL * 0.85, (1.0 - clamp(abs(h) * 3.4, 0.0, 1.0)) * (0.25 + sunSide * 0.45));
          col = mix(col, GROUND, clamp(-h * 4.0, 0.0, 1.0));
          float s = clamp(dot(d, uSunDir), 0.0, 1.0);
          col += GLOWCOL * 0.30 * pow(s, 6.0);
          col += vec3(1.0, 0.88, 0.66) * 1.6 * pow(s, 48.0);
          col += vec3(6.0, 5.2, 4.0) * smoothstep(0.9993, 0.9998, s);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyMat)
    envScene.add(envSky)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({ color: 0x93714e }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -3
    envScene.add(ground)
    const envRT = pmrem.fromScene(envScene, 0.05)
    this.scene.environment = envRT.texture
    this.envTex = envRT.texture   // v6.4: guardar para restaurar al salir de BAJA
    envRT.texture.needsUpdate = true
    pmrem.dispose()
  }

  private buildLights(quality: Quality): void {
    // v7: sun dialed back (ULTRA was a bit blinding): 2.6 → 2.15
    const sun = new THREE.DirectionalLight(0xffdcae, quality === 'ultra' ? 2.15 : 2.35)
    sun.position.set(52, 58, -40)
    if (quality !== 'baja') {
      sun.castShadow = true
      // v6.4: escalera de sombras 1K (MEDIA) · 2K (ALTA) · 4K (ULTRA) —
      // el salto entre niveles se nota a simple vista
      sun.shadow.mapSize.set(quality === 'ultra' ? 4096 : quality === 'alta' ? 2048 : 1024, quality === 'ultra' ? 4096 : quality === 'alta' ? 2048 : 1024)
      // la cámara de sombras sigue al jugador → sombras detalladas donde importa
      // ULTRA: caja 20 % más estrecha → sombras más nítidas a la misma 4K
      const box = quality === 'ultra' ? 40 : 48
      sun.shadow.camera.left = -box
      sun.shadow.camera.right = box
      sun.shadow.camera.top = box
      sun.shadow.camera.bottom = -box
      sun.shadow.camera.near = 4
      sun.shadow.camera.far = 260
      sun.shadow.bias = -0.00035
      sun.shadow.normalBias = quality === 'ultra' ? 0.028 : 0.035
      // ULTRA: radios del filtro PCF suave más finos (contactos marcados)
      if (quality === 'ultra') {
        sun.shadow.radius = 2.2
      }
    }
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sunLight = sun

    const hemi = new THREE.HemisphereLight(0x9db4d0, 0x8a6a4a, quality === 'ultra' ? 0.58 : 0.5)
    this.scene.add(hemi)

    // relleno cálido del atardecer desde el oeste
    const fill = new THREE.DirectionalLight(0xc7a17a, 0.42)
    fill.position.set(-40, 30, 30)
    this.scene.add(fill)
  }

  // ----------------------------------------------------------
  // AMBIENTE V6 (sin coste de FPS apreciable): nubes a la deriva,
  // agua animada con shader, motas de polvo y aves en el cielo
  // ----------------------------------------------------------
  /** crea (una sola vez) el material de agua animada del atardecer —
   *  lo comparten río/lago/fuente y, desde v6.1, los CHARCOS de la ciudad */
  private ensureWaterMaterial(): THREE.ShaderMaterial {
    if (this.waterMat) return this.waterMat
    const noiseTex = makeWaterNoiseTexture()
    noiseTex.repeat.set(3, 3)
    const sunDir = new THREE.Vector3(0.62, 0.47, -0.48).normalize()
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uNoise: { value: noiseTex },
        uSunDir: { value: sunDir },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 p = position;
          // oleaje suave (2 ondas cruzadas)
          float w = sin(p.x * 1.7 + uTime * 1.1) * 0.045 + sin(p.y * 2.3 + uTime * 0.8) * 0.04;
          p.z += w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec3 uSunDir;
        const vec3 DEEP = vec3(0.045, 0.110, 0.135);
        const vec3 SHALLOW = vec3(0.130, 0.310, 0.330);
        const vec3 SKYH = vec3(0.880, 0.560, 0.320);
        const vec3 SUNCOL = vec3(1.0, 0.72, 0.45);
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          // normal perturbada por dos capas de ruido desplazándose
          vec2 uv1 = vUv * 2.2 + vec2(uTime * 0.014, uTime * 0.009);
          vec2 uv2 = vUv * 3.6 - vec2(uTime * 0.011, uTime * 0.017);
          float n1 = texture2D(uNoise, uv1).r;
          float n2 = texture2D(uNoise, uv2).r;
          vec3 n = normalize(vec3((n1 - 0.5) * 0.55, 1.0, (n2 - 0.5) * 0.55));
          // base del agua: teal con variación clara de ruido
          vec3 base = mix(DEEP, SHALLOW, 0.25 + 0.65 * n1);
          // fresnel (potencia 5): el cielo solo se refleja MUY rasante
          float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
          vec3 col = mix(base, SKYH, clamp(fres * 1.15, 0.0, 0.8));
          // destello solar especular (brillante y compacto)
          vec3 refl = reflect(-viewDir, n);
          float spec = pow(max(dot(refl, uSunDir), 0.0), 160.0);
          col += SUNCOL * spec * 2.2;
          // chispeo del ruido (destellos sueltos, sin franjas)
          col += SUNCOL * 0.12 * smoothstep(0.60, 0.82, n1 * (0.75 + 0.25 * n2));
          gl_FragColor = vec4(col, 0.93);
        }
      `,
    })
    return this.waterMat
  }

  // ----------------------------------------------------------
  // v6.2 — MODO ULTRA (OPCIONAL, desactivado por defecto)
  // Luces · sol · sombras · reflejos realistas. Todo se construye solo
  // si el jugador activó ULTRA, y un guardia de FPS lo degrada solo si
  // hace falta (por eso ULTRA no causa lag sostenido).
  // ----------------------------------------------------------
  private buildUltraFX(): void {
    // v6.4: idempotente — crea lo que falte (para poder volver a ULTRA
    // en vivo tras degradarlo o apagarlo) y restaura los niveles
    // completos si el guardia de FPS los había rebajado
    // ---- 1) SOL REALISTA: destello de lente (lens flare) dinámico —
    // parpadea al asomarse entre edificios, como una cámara real ----
    const sunDir = new THREE.Vector3(0.62, 0.47, -0.48).normalize()
    if (!this.ultraAnchor) {
      const anchor = new THREE.Object3D()
      anchor.position.copy(sunDir).multiplyScalar(299)
      const flare = new Lensflare()
      // v7: flare toned down ~25% (sun was a bit excessive on ULTRA)
      const haloTex = this.makeFlareTexture(0, 'rgba(255,255,255,1)', 0.42)
      const hexTexA = this.makeFlareTexture(6, 'rgba(255,190,120,0.9)', 0.28)
      const hexTexB = this.makeFlareTexture(6, 'rgba(140,190,255,0.55)', 0.24)
      const dotTex = this.makeFlareTexture(0, 'rgba(255,220,170,0.9)', 0.4)
      flare.addElement(new LensflareElement(haloTex, 255, 0, new THREE.Color(0xffe8c4)))
      flare.addElement(new LensflareElement(hexTexA, 58, 0.28))
      flare.addElement(new LensflareElement(dotTex, 38, 0.46))
      flare.addElement(new LensflareElement(hexTexB, 92, 0.62))
      flare.addElement(new LensflareElement(dotTex, 24, 0.8))
      flare.addElement(new LensflareElement(hexTexA, 128, 1.0, new THREE.Color(0xffd9a6)))
      anchor.add(flare)
      this.scene.add(anchor)
      this.ultraAnchor = anchor
    }
    this.ultraAnchor.visible = true

    // ---- 2) REFLEXIÓN REALISTA: el lago (mayor lámina de agua) pasa de
    // «cielo pintado por fresnel» a un REFLECTOR de verdad: la escena se
    // renderiza reflejada (montañas, cielo, edificios) y se mezcla con
    // las olas del shader de agua. 1024 px: coste contenido.
    // (v6.4: solo si aún no existe — idempotente) ----
    if (!this.ultraReflector && this.waterMeshes.length && this.md.water.length) {
      let best = 0
      let bestArea = -1
      for (let i = 0; i < this.md.water.length; i++) {
        const w = this.md.water[i]
        const area = w.w * w.d
        if (area > bestArea) { bestArea = area; best = i }
      }
      const w = this.md.water[best]
      if (w.w * w.d >= 180) { // solo en láminas grandes se aprecia
        const noiseTex = makeWaterNoiseTexture()
        noiseTex.repeat.set(3, 3)
        const shader = {
          name: 'UltraWater',
          uniforms: {
            color: { value: null },
            tDiffuse: { value: null },
            textureMatrix: { value: null },
            uTime: { value: 0 },
            uNoise: { value: noiseTex },
            uSunDir: { value: sunDir.clone() },
          },
          vertexShader: /* glsl */`
            uniform mat4 textureMatrix;
            varying vec4 vUvR;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
              vUv = uv;
              vUvR = textureMatrix * vec4(position, 1.0);
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: /* glsl */`
            uniform sampler2D tDiffuse;
            uniform float uTime;
            uniform sampler2D uNoise;
            uniform vec3 uSunDir;
            varying vec4 vUvR;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            const vec3 DEEP = vec3(0.045, 0.110, 0.135);
            const vec3 SHALLOW = vec3(0.130, 0.310, 0.330);
            void main() {
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              vec2 uv1 = vUv * 2.2 + vec2(uTime * 0.014, uTime * 0.009);
              vec2 uv2 = vUv * 3.6 - vec2(uTime * 0.011, uTime * 0.017);
              float n1 = texture2D(uNoise, uv1).r;
              float n2 = texture2D(uNoise, uv2).r;
              vec3 n = normalize(vec3((n1 - 0.5) * 0.55, 1.0, (n2 - 0.5) * 0.55));
              // reflejo REAL (render target del Reflector) perturbado por olas
              vec2 perturb = (vec2(n1, n2) - 0.5) * 0.07 * vUvR.w;
              vec4 refl = texture2DProj(tDiffuse, vUvR + vec4(perturb, 0.0, 0.0));
              // base del agua + fresnel (rasante refleja MUCHO: espejo)
              vec3 base = mix(DEEP, SHALLOW, 0.25 + 0.65 * n1);
              float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
              float rf = clamp(0.18 + fres * 1.7, 0.0, 0.92);
              vec3 col = mix(base, refl.rgb, rf);
              // destello solar sobre la ola
              vec3 reflDir = reflect(-viewDir, n);
              float spec = pow(max(dot(reflDir, uSunDir), 0.0), 160.0);
              col += vec3(1.0, 0.72, 0.45) * spec * 2.2;
              col += vec3(1.0, 0.72, 0.45) * 0.12 * smoothstep(0.60, 0.82, n1 * (0.75 + 0.25 * n2));
              gl_FragColor = vec4(col, 0.94);
            }
          `,
        }
        const reflector = new Reflector(new THREE.PlaneGeometry(w.w, w.d), {
          textureWidth: 1024,
          textureHeight: 1024,
          clipBias: 0.003,
          shader: shader as unknown as { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string },
        })
        reflector.rotation.x = -Math.PI / 2
        reflector.position.set(w.x, 0.055, w.z)
        ;(reflector.material as THREE.ShaderMaterial).transparent = true
        ;(reflector.material as THREE.ShaderMaterial).uniforms.uTime.value = 0
        ;(reflector.material as THREE.ShaderMaterial).uniforms.uNoise.value = noiseTex
        ;(reflector.material as THREE.ShaderMaterial).uniforms.uSunDir.value = sunDir
        this.scene.add(reflector)
        this.ultraReflector = reflector
        // ocultar la lámina de agua original (queda como respaldo si ULTRA se degrada)
        this.ultraReflectorBase = this.waterMeshes[best] ?? null
        if (this.ultraReflectorBase) this.ultraReflectorBase.visible = false
      }
    }

    // ---- 3) LUCES REALISTAS: fogonazos que ILUMINAN de verdad —
    // un PointLight reutilizable que salta a cada disparo y se apaga
    // solo (los disparos del jugador iluminan muros y compañeros) ----
    if (!this.muzzleLight) {
      this.muzzleLight = new THREE.PointLight(0xffb46a, 0, 15, 2)
      this.scene.add(this.muzzleLight)
    }
    this.muzzleLight.distance = 15
    // restaurar el bloom fuerte de ULTRA si el guardia lo rebajó
    if (this.ultraBloom) this.ultraBloom.strength = 0.55
  }

  /** textura de un elemento del lens flare: halo suave o hexágono de diafragma */
  private makeFlareTexture(sides: number, core: string, alpha: number): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const cx = 64, cy = 64
    if (sides >= 3) {
      // hexágono de diafragma con núcleo brillante
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60)
      g.addColorStop(0, core.replace(/[\d.]+\)$/, `${alpha})`))
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2
        const r = i === 0 ? 62 : 56
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = core.replace(/[\d.]+\)$/, `${Math.min(1, alpha + 0.25)})`)
      ctx.lineWidth = 3
      ctx.stroke()
    } else {
      // halo radial suave
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 62)
      g.addColorStop(0, core.replace(/[\d.]+\)$/, `${Math.min(1, alpha + 0.3)})`))
      g.addColorStop(0.45, core.replace(/[\d.]+\)$/, `${alpha * 0.6})`))
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 128, 128)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  // ----------------------------------------------------------
  // v6.2: guardia de FPS del modo ULTRA — si el equipo no da abasto,
  // se quitan las piezas caras (reflejo del lago, bloom fuerte, luces
  // extra) para mantener la fluidez. Solo actúa UNA vez.
  // ----------------------------------------------------------
  private updateUltraGuard(dt: number, fps: number): void {
    // v6.4: el guardia solo vigila el modo ULTRA activo
    if (this.curQuality !== 'ultra') return
    if (this.ultraScaled || !this.muzzleLight && !this.ultraReflector && !this.ultraBloom) return
    if (fps > 0 && fps < 38) this.lowFpsMs += dt * 1000
    else if (this.lowFpsMs > 0) this.lowFpsMs = Math.max(0, this.lowFpsMs - dt * 400)
    if (this.lowFpsMs < 3500) return
    this.ultraScaled = true
    // 1) reflejo del lago fuera → vuelve el agua animada (coste ~0)
    if (this.ultraReflector) {
      this.scene.remove(this.ultraReflector)
      this.ultraReflector.dispose?.()
      this.ultraReflector = null
      if (this.ultraReflectorBase) this.ultraReflectorBase.visible = true
    }
    // 2) bloom de vuelta al nivel de ALTA
    if (this.ultraBloom) this.ultraBloom.strength = 0.4
    // 3) menos fogonazos con luz
    if (this.muzzleLight) this.muzzleLight.distance = 9
    useGame.getState().addAnnouncement('ULTRA graphics auto-adjusted to keep your FPS stable', 'info')
  }

  // ----------------------------------------------------------
  // v6.4: CALIDAD EN VIVO — cambiar el ajuste se NOTA al instante
  // (resolución interna, sombras, bloom, niebla, entorno, árboles,
  // luces y extras ULTRA) y hasta el FPS del HUD se mueve.
  // ----------------------------------------------------------
  applyQuality(q: Quality): void {
    if (this.disposed || !this.renderer || this.curQuality === q) return
    this.curQuality = q
    const ultra = q === 'ultra'

    // 1) RESOLUCIÓN de render: lo que más salta a la vista (y en los FPS).
    //    BAJA renderiza a 0,7× (image pixelada estilo rendimiento) y ULTRA
    //    hasta 2× con devicePixelRatio
    const pr = q === 'baja' ? 0.7 : q === 'media' ? 1 : q === 'alta' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(innerWidth, innerHeight)

    // 2) tono/exposición
    this.renderer.toneMappingExposure = ultra ? 1.08 : q === 'alta' ? 1.12 : q === 'media' ? 1.1 : 1.05

    // 3) SOMBRAS (diferencia brutal entre niveles): BAJA sin sombras,
    //    MEDIA 1K, ALTA 2K, ULTRA 4K con caja cerrada y PCF fino
    const wantShadows = q !== 'baja'
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows
      // recompilar materiales para activar/desactivar sombras en vivo
      this.scene.traverse(o => {
        const mat = (o as THREE.Mesh).material
        if (!mat) return
        for (const mm of Array.isArray(mat) ? mat : [mat]) mm.needsUpdate = true
      })
    }
    if (wantShadows) {
      const sun = this.sunLight
      sun.castShadow = true
      const size = ultra ? 4096 : q === 'alta' ? 2048 : 1024
      // regenerar el mapa de sombras a la nueva resolución
      if (sun.shadow.map) { sun.shadow.map.dispose(); (sun.shadow as unknown as { map: null }).map = null }
      sun.shadow.mapSize.set(size, size)
      const box = ultra ? 40 : 48
      sun.shadow.camera.left = -box
      sun.shadow.camera.right = box
      sun.shadow.camera.top = box
      sun.shadow.camera.bottom = -box
      sun.shadow.camera.updateProjectionMatrix()
      sun.shadow.normalBias = ultra ? 0.028 : 0.035
      sun.shadow.radius = ultra ? 2.2 : 1
    }

    // 4) NIEBLA: BAJA cierra el horizonte (menos mundo que dibujar);
    //    ALTA/ULTRA abren la vista completa del valle/sierra
    if (this.scene.fog) (this.scene.fog as THREE.FogExp2).density = q === 'baja' ? 0.011 : q === 'media' ? 0.008 : 0.0062

    // 5) BLOOM/post-proceso: BAJA/MEDIA dibujan directo (cero coste);
    //    ALTA/ULTRA encienden el compositor con neones y fogonazos
    if ((q === 'alta' || ultra) && !this.composer) {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.7, 0.88)
      this.composer.addPass(bloom)
      this.composer.addPass(new OutputPass())
      this.ultraBloom = bloom
    } else if (q === 'baja' || q === 'media') {
      if (this.composer) {
        this.composer.dispose()
        this.composer = null
        this.ultraBloom = null
      }
    }
    if (this.composer) this.composer.setSize(innerWidth, innerHeight)
    if (this.ultraBloom) this.ultraBloom.strength = ultra ? 0.46 : 0.42

    // 6) entorno PBR (reflejos de atardecer en muros y metal): BAJA lo
    //    apaga → materiales planos y mucho más baratos
    this.scene.environment = q === 'baja' ? null : this.envTex

    // 7) ambiente: nubes/aves fuera en BAJA, polvo solo en ALTA/ULTRA
    this.applyAmbienceQuality(q)
    this.applyLampQuality(q)
    this.applyStreetQuality(q)

    // 8) extras de ULTRA en vivo (sol con destello, reflejo real del
    //    lago, fogonazos con luz, calles mojadas)
    if (ultra) {
      this.ultraScaled = false
      this.lowFpsMs = 0
      this.buildUltraFX()
    } else {
      this.disableUltraFX()
    }

    // 9) árboles GLB: reconstruir con el número de la nueva calidad
    //    (BAJA 16 · MEDIA 28 · ALTA/ULTRA todos) — si aún no han
    //    cargado, se hornearán ya con el valor nuevo
    if (this.glbTreeMeshes.length || getTreeTemplate()) this.applyRepoTrees(q)

    const NAMES: Record<Quality, string> = { baja: 'LOW', media: 'MEDIUM', alta: 'HIGH', ultra: 'ULTRA' }
    useGame.getState().addAnnouncement(`${NAMES[q]} graphics applied instantly`, 'info')
  }

  /** v6.4: visibilidad del ambiente según calidad (nubes, aves, polvo) */
  private applyAmbienceQuality(q: Quality): void {
    const full = q === 'alta' || q === 'ultra'
    for (const c of this.clouds) c.visible = full
    for (const b of this.birds) b.visible = full
    if (this.dust) this.dust.visible = full
  }

  /** v6.4: cuántas luces de farola se encienden (2 · 4 · 6 · 10) */
  private applyLampQuality(q: Quality): void {
    const active = q === 'baja' ? 2 : q === 'media' ? 4 : q === 'alta' ? 6 : 10
    for (let i = 0; i < this.lampLights.length; i++) {
      const on = i < active
      this.lampLights[i].visible = on
      this.lampLights[i].intensity = q === 'ultra' ? 30 : 26
      this.lampLights[i].distance = q === 'ultra' ? 18 : 16
    }
  }

  /** v6.4: asfalto seco (BAJA/MEDIA) o calles mojadas (ULTRA) en vivo */
  private applyStreetQuality(q: Quality): void {
    if (!this.streetMats) return
    const ultra = q === 'ultra'
    const { asphalt, sidewalk } = this.streetMats
    asphalt.roughness = ultra ? 0.52 : 0.7
    asphalt.metalness = ultra ? 0.14 : 0.08
    asphalt.envMapIntensity = ultra ? 1.4 : 0.85
    sidewalk.roughness = ultra ? 0.62 : 0.78
    sidewalk.envMapIntensity = ultra ? 0.9 : 0.55
  }

  /** v6.4: quitar los extras de ULTRA al bajar de calidad (en vivo) */
  private disableUltraFX(): void {
    if (this.ultraAnchor) this.ultraAnchor.visible = false
    if (this.ultraReflector) {
      this.scene.remove(this.ultraReflector)
      this.ultraReflector.dispose?.()
      this.ultraReflector = null
      if (this.ultraReflectorBase) this.ultraReflectorBase.visible = true
    }
    if (this.muzzleLight) this.muzzleLight.intensity = 0
  }

  private buildAmbience(quality: Quality): void {
    // --- nubes: billboards altos a la deriva (12 sprites) ---
    const cloudTex = makeCloudTexture()
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, opacity: 0.34 + Math.random() * 0.2,
        depthWrite: false, fog: false, color: 0xffe8d0,
      }))
      const ang = (i / 12) * Math.PI * 2
      const rad = 60 + Math.random() * 90
      s.position.set(Math.cos(ang) * rad, 55 + Math.random() * 45, Math.sin(ang) * rad)
      const sc = 60 + Math.random() * 70
      s.scale.set(sc, sc * 0.42, 1)
      this.scene.add(s)
      this.clouds.push(s)
      this.cloudSpeeds.push(1.2 + Math.random() * 1.8)
    }

    // --- agua animada (río/lago/fuente del valle; v6.3: fuentes urbanas
    //     también, con su propia altura de lámina) ---
    if (this.md.water.length) {
      this.ensureWaterMaterial()
      this.waterMeshes = []
      for (const w of this.md.water) {
        const segs = Math.max(2, Math.round(w.w / 6))
        const segsZ = Math.max(2, Math.round(w.d / 6))
        const geo = new THREE.PlaneGeometry(w.w, w.d, segs, segsZ)
        const mesh = new THREE.Mesh(geo, this.waterMat!)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set(w.x, w.y ?? 0.052, w.z)
        this.scene.add(mesh)
        this.mapMeshes.push(mesh)
        this.waterMeshes.push(mesh)
      }
    }

    // --- motas de polvo flotando cerca de la cámara (180 puntos) ---
    // (v6.4: se crean SIEMPRE y la visibilidad se gobierna por calidad:
    // BAJA/MEDIA las oculta, ALTA/ULTRA las enciende — en vivo)
    {
      const N = 180
      const pos = new Float32Array(N * 3)
      this.dustVel = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 30
        pos[i * 3 + 1] = Math.random() * 7
        pos[i * 3 + 2] = (Math.random() - 0.5) * 30
        this.dustVel[i * 3] = (Math.random() - 0.5) * 0.14
        this.dustVel[i * 3 + 1] = -0.03 - Math.random() * 0.05
        this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.14
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const dustTex = makeSparkTexture()
      const mat = new THREE.PointsMaterial({
        map: dustTex, color: 0xffd9a8, size: 0.05, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      })
      this.dust = new THREE.Points(geo, mat)
      this.dust.frustumCulled = false
      this.scene.add(this.dust)
    }

    // --- aves del cielo (v6.1: en TODOS los mapas — la ciudad también
    // recibe el cielo vivo): 7 siluetas en círculo ---
    {
      const birdTex = makeBirdTexture()
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: birdTex, transparent: true, opacity: 0.75, depthWrite: false, fog: true,
        }))
        const sc = 1.1 + Math.random() * 0.7
        s.scale.set(sc, sc * 0.7, 1)
        this.scene.add(s)
        this.birds.push(s)
        this.birdPhase.push(Math.random() * Math.PI * 2)
      }
    }
  }

  private buildMap(quality: Quality): void {
    const texs = makeWorldTextures()
    const map = this.md

    // anisotropía al máximo: los suelos y muros en ángulo se ven nítidos
    // (coste de GPU ~nulo, gran mejora visual en perspectiva)
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    for (const key of Object.keys(texs) as MatKey[]) {
      texs[key].anisotropy = Math.min(8, maxAniso)
    }

    // suelo (ligeramente satinado para reflejar el cielo del atardecer)
    const groundMat = new THREE.MeshStandardMaterial({ map: texs.sand, roughness: 0.88, metalness: 0.05 })
    groundMat.map!.repeat.set(46, 46)
    const groundSize = map.half * 2 + 90
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat)
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
    for (const b of map.boxes) {
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
    this.buildDecor(texs, quality)

    // ---- mecánicas del mapa: tirolinas y plataformas ----
    // (v5: el pasto, arbustos y flores del suelo se ELIMINARON a petición
    // del usuario para reducir el lag — los árboles GLB se mantienen)
    this.buildZiplines()
    this.buildJumpPads()

    // marcas de spawn (zonas de compra) — solo en los modos con tienda
    if (this.mapId === 'ciudad') {
      for (const [sp, color] of [[SPAWN_A, 0xf59e0b], [SPAWN_B, 0x22c55e]] as [number[], number][]) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(GAME.BUY_RADIUS - 0.15, GAME.BUY_RADIUS, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(sp[0], 0.03, sp[2])
        this.scene.add(ring)
      }
    } else {
      // helipuerto de la misión: círculo con H en la posición de extracción
      const hx = STORY_EXTRACTION.x
      const hz = STORY_EXTRACTION.z
      const heli = new THREE.Group()
      const circle = new THREE.Mesh(
        new THREE.RingGeometry(4.4, 4.7, 48),
        new THREE.MeshBasicMaterial({ color: 0xd9b36c, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      )
      circle.rotation.x = -Math.PI / 2
      circle.position.y = 0.32
      heli.add(circle)
      const barMat = new THREE.MeshBasicMaterial({ color: 0xd9b36c, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      for (const [bx, bz, bw, bd] of [[-1.1, 0, 0.5, 4.4], [1.1, 0, 0.5, 4.4], [0, 0, 2.7, 0.55]] as number[][]) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), barMat)
        bar.rotation.x = -Math.PI / 2
        bar.position.set(bx, 0.32, bz)
        heli.add(bar)
      }
      heli.position.set(hx, 0, hz)
      this.scene.add(heli)
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
    for (const b of this.md.boxes) {
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
  private buildDecor(texs: Record<MatKey, THREE.Texture>, quality: Quality): void {
    // --- árboles (tronco con colisión ya está en el mapa) ---
    // (se agrupan para poder sustituirlos por el Arbol.glb al cargar)
    this.procTrees = new THREE.Group()
    const leafMatA = new THREE.MeshStandardMaterial({ color: 0x55683d, roughness: 0.95, flatShading: true })
    const leafMatB = new THREE.MeshStandardMaterial({ color: 0x47592f, roughness: 0.95, flatShading: true })
    const leafGeo = new THREE.SphereGeometry(1, 8, 7)
    for (const [tx, tz] of this.md.trees) {
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
    this.lampPos = this.md.lamps.map(([lx, lz]) => [lx, lz] as [number, number])
    for (const [lx, lz] of this.md.lamps) {
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
    // v6.4: el pool de luces se crea COMPLETO (hasta 10) y la cantidad
    // activa se gobierna en vivo por calidad (applyLampQuality)
    const nLampLights = Math.min(10, this.md.lamps.length)
    for (let i = 0; i < nLampLights; i++) {
      const light = new THREE.PointLight(0xffc477, 26, 16, 1.9)
      light.position.set(this.md.lamps[i][0], 4.85, this.md.lamps[i][1])
      this.scene.add(light)
      this.lampLights.push(light)
    }

    // --- letreros de neón ---
    for (const n of this.md.neons) {
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

    // --- charcos (v6.1: AGUA ANIMADA con el shader del atardecer —
    // ondulación, fresnel y destello solar en la ciudad también;
    // antes eran discos metálicos estáticos) ---
    const puddleMat = this.ensureWaterMaterial()
    for (const p of this.md.puddles) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), puddleMat)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(p.x, 0.052, p.z)
      puddle.scale.set(1, 0.75, 1)
      this.scene.add(puddle)
    }

    // --- neumáticos apilados (solo ciudad: barrio y gasolinera) ---
    if (this.mapId === 'ciudad') {
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
    }
    void texs
  }

  // (v5: pasto/arbustos/flores eliminados para reducir el lag)

  // ----------------------------------------------------------
  // Tirolinas: cable + anclas + agarre con E
  // ----------------------------------------------------------
  private buildZiplines(): void {
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.35, metalness: 0.85 })
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4235, roughness: 0.8, metalness: 0.2 })
    for (const z of this.md.ziplines) {
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
    for (const p of this.md.jumpPads) {
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
  private buildStreets(quality: Quality): void {
    // v6.1: asfalto y aceras menos mates (brillo húmedo del atardecer por
    // el mapa de entorno PBR — coste 0, solo parámetros del material)
    // v6.2 ULTRA: asfalto aún más pulido — las calles reflejan el atardecer
    // como después de la lluvia (solo cambia roughness/envMap del material)
    const ultra = quality === 'ultra'
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2e32, roughness: ultra ? 0.52 : 0.7, metalness: ultra ? 0.14 : 0.08, envMapIntensity: ultra ? 1.4 : 0.85 })
    const sidewalk = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: ultra ? 0.62 : 0.78, envMapIntensity: ultra ? 0.9 : 0.55 })
    this.streetMats = { asphalt, sidewalk }   // v6.4: brillo húmedo regulable en vivo
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
      // v9: bandera MUY visible — mástil alto, paño emisivo, haz de luz
      // permanente y plataforma pulsante en la base
      const mk = (key: 'a' | 'b', pos: [number, number], team: Team): void => {
        const color = team === 'A' ? 0xf59e0b : 0x22c55e
        const group = new THREE.Group()
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8),
          new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.35, metalness: 0.85 }),
        )
        pole.position.y = 2.2
        pole.castShadow = true
        group.add(pole)
        // remate dorado
        const finial = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xffd25e, emissive: 0x8a5a12, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3 }),
        )
        finial.position.y = 4.5
        group.add(finial)
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 0.95),
          new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.75, emissive: color, emissiveIntensity: 0.55 }),
        )
        cloth.position.set(0.78, 3.85, 0)
        group.add(cloth)
        // haz vertical SIEMPRE visible (se intensifica al ser portada)
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.42, 16, 12, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
        )
        beam.position.y = 8
        group.add(beam)
        // plataforma pulsante en la base
        const pad = new THREE.Mesh(
          new THREE.RingGeometry(1.5, 2.3, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
        )
        pad.rotation.x = -Math.PI / 2
        pad.position.y = 0.06
        group.add(pad)
        group.position.set(pos[0], 0, pos[1])
        this.scene.add(group)
        this.flagViews.set(key, { group, cloth, beam, pad })
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
        // v9: BRAVO (tejado del almacén) — el anillo y la letra suben al tejado
        const baseY = z.minY !== undefined ? z.minY + 0.12 : 0.05
        ring.position.y = baseY
        group.add(ring)
        const ring2 = new THREE.Mesh(new THREE.RingGeometry(GAME.DOM_ZONE_RADIUS - 1.6, GAME.DOM_ZONE_RADIUS - 1.3, 48), mat)
        ring2.rotation.x = -Math.PI / 2
        ring2.position.y = baseY
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
        letter.position.set(z.x, z.minY !== undefined ? z.minY + 8.5 : 6.5, z.z)
        letter.scale.setScalar(2.2)
        this.scene.add(letter)
        group.position.set(z.x, 0, z.z)
        this.scene.add(group)
        this.zoneViews.push({ id: z.id, ring, ring2, letter })
        // v9: aviso vertical "CAPTURE ON THE ROOF" en la zona del tejado
        if (z.minY !== undefined) {
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.9, 14, 10, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
          )
          beam.position.set(z.x, z.minY + 7, z.z)
          this.scene.add(beam)
        }
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
      const t = performance.now()
      const place = (key: 'a' | 'b', fs: { status: string; x: number; z: number }): void => {
        const v = this.flagViews.get(key)
        if (!v) return
        v.group.position.set(fs.x, 0, fs.z)
        v.group.visible = true
        // paño ondeando (más vivo al ser portada)
        v.cloth.rotation.y = Math.sin(t / 350 + (key === 'a' ? 0 : 2)) * (fs.status === 'carried' ? 0.42 : 0.28)
        v.beam.visible = true
        const bm = v.beam.material as THREE.MeshBasicMaterial
        bm.opacity = fs.status === 'carried' ? 0.3 : 0.16
        // plataforma pulsante en la base
        if (v.pad) {
          const pm = v.pad.material as THREE.MeshBasicMaterial
          pm.opacity = 0.3 + 0.18 * Math.sin(t / 420 + (key === 'a' ? 0 : 1.7))
          const s = 1 + 0.06 * Math.sin(t / 420 + (key === 'a' ? 0 : 1.7))
          v.pad.scale.set(s, s, 1)
        }
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

  /** v9: el INVITADO adopta el modo de juego del ANFITRIÓN — reconstruye
   *  los objetivos (banderas CTF / zonas DOM) que su menú no conocía */
  applyServerMode(mode: GameMode): void {
    if (this.disposed) return
    const cur = useGame.getState().gameMode
    if (cur === mode || mode === 'historia') return
    // retirar los objetivos del modo anterior
    for (const v of this.flagViews.values()) {
      this.scene.remove(v.group)
      v.group.traverse(o => {
        const m = (o as THREE.Mesh).material
        for (const mm of Array.isArray(m) ? m : [m]) mm?.dispose()
      })
    }
    this.flagViews.clear()
    for (const v of this.zoneViews) {
      this.scene.remove(v.ring.parent as THREE.Object3D)
      this.scene.remove(v.letter)
      v.letter.material.dispose()
    }
    this.zoneViews.length = 0
    useGame.getState().setHud({ gameMode: mode })
    this.buildObjectives()
  }

  /** v9 COOP: el anfitrión difunde el estado de la misión */
  storySyncPayload(): StorySyncData | null {
    return this.story ? this.story.syncPayload() : null
  }

  /** v9 COOP: el invitado aplica el estado del anfitrión */
  onStorySync(d: StorySyncData): void {
    this.story?.remoteSync(d)
  }

  /** v9 COOP: un invitado completó una interacción de campaña */
  storyRemoteComplete(d: StoryRemoteMsg): void {
    this.story?.remoteComplete(d)
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
      // re-generar el entorno PBR con el cielo nuevo (solo en calidad alta/ULTRA:
      // el PMREM en rendering por software puede tardar muchísimo)
      if (quality === 'alta' || quality === 'ultra') {
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
          this.envTex = envRT.texture   // v6.4: guardar para restaurar al salir de BAJA
          envRT.texture.needsUpdate = true
          pmrem.dispose()
        } catch { /* mantener el entorno anterior */ }
      }
    }
    // --- muros (Pared.jpg) y suelos interiores (Piso.jpg) ---
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
    // v8: los forjados/suelos interiores usan la textura Piso1.jpg del usuario
    if (piso) {
      const floorTex = piso.clone()
      floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
      floorTex.needsUpdate = true
      for (const m of this.mapMeshes) {
        const mat = m.material as THREE.MeshStandardMaterial
        if (!mat || !mat.map) continue
        if (m.userData.matKey === 'floor') {
          mat.map = floorTex
          mat.color.set(0xffffff)
          mat.roughness = 0.8
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

  private applyRepoTrees(q?: Quality): void {
    // v6.4: la calidad se puede forzar (cambio en vivo) o leer del ajuste
    const quality = q ?? useGame.getState().settings.quality
    const tree = getTreeTemplate()
    if (tree && this.procTrees) {
      // v6.4: quitar horneados anteriores (cambio de calidad en vivo →
      // se rehornea con el nuevo número de árboles)
      for (const m of this.glbTreeMeshes) {
        this.scene.remove(m)
        m.geometry.dispose()
      }
      this.glbTreeMeshes = []
      // quitar las copas procedurales
      for (const c of [...this.procTrees.children]) {
        const i = this.shootables.indexOf(c as THREE.Mesh)
        if (i >= 0) this.shootables.splice(i, 1)
        this.procTrees.remove(c)
      }
      // número de árboles según calidad (el modelo es detallado: ~12k tris)
      const count = quality === 'ultra' || quality === 'alta' ? this.md.trees.length : quality === 'media' ? Math.min(this.md.trees.length, 28) : Math.min(this.md.trees.length, 16)
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
          const [tx, tz] = this.md.trees[i]
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
        mesh.castShadow = quality === 'ultra' || quality === 'alta'
        mesh.receiveShadow = false
        mesh.frustumCulled = false   // geometría gigante: no dejar que el frustum la descarte entera
        this.scene.add(mesh)
        this.glbTreeMeshes.push(mesh)
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
    this.story?.dispose()
    this.story = null
    this.audio.setDuck(false)   // devolver la música a su volumen de menú
    this.effects?.dispose()
    for (const sv of this.smokeViews.values()) {
      this.scene.remove(sv.group)
      for (const sp of sv.sprites) (sp.material as THREE.SpriteMaterial).dispose()
    }
    this.smokeViews.clear()
    // v8: bengalas visibles
    for (const f of this.flareViews) {
      this.scene.remove(f.group)
      for (const c of f.group.children) {
        const m = (c as THREE.Sprite).material as THREE.Material | undefined
        m?.dispose()
      }
    }
    this.flareViews = []
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

  /** teclas pulsadas ahora (las usa el director de la misión) */
  heldKeys(): Set<string> { return this.keys }

  /** código de la acción indicada (para interactuar en la misión) */
  bindCode(action: ActionId): string { return this.kb(action) }

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
    try {
      // puede fallar si no hay gesto reciente (p.ej. al acabar la cinemática):
      // el jugador verá el overlay de "haz clic para jugar"
      const p = this.canvas3d.requestPointerLock() as unknown as Promise<void> | undefined
      if (p && typeof p.catch === 'function') p.catch(() => { /* sin gesto: reintento al clicar */ })
    } catch { /* navegador antiguo: ignorar */ }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const s = useGame.getState()
    // v10: con el chat abierto, el teclado pertenece al input de texto
    if (useChat.getState().open) return
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
    else if (code === this.kb('flare')) this.useFlare()
    else if (code === this.kb('stim')) this.useStim()
    else if (code === this.kb('lastWeapon')) this.switchTo(this.lastWeapon)
    else if (code === this.kb('zipline')) this.tryAttachZipline()
    else if (code === this.kb('slot1')) {
      // v6.1: hueco 1 asignado en la tienda (antes era por preferencia fija)
      const p = this.slots[0]
      if (p) this.switchTo(p)
    } else if (code === this.kb('slot2')) {
      const p = this.slots[1]
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
    if (this.mapId === 'instalacion') {
      useGame.getState().addAnnouncement('No shop in the campaign — use the field kits on the terrain', 'info')
      return
    }
    const s = useGame.getState()
    if (this.dead) return
    if (!s.buyZone) {
      s.addAnnouncement('The shop only works inside your base (colored ring)', 'info')
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

  /**
   * Pool de luces de farola: recoloca las 6 luces en las farolas más
   * cercanas al jugador. Sin raíces ni asignaciones (distancias al
   * cuadrado + selección parcial in-place sobre arrays reutilizados).
   */
  private updateLampLights(p: THREE.Vector3): void {
    const lamps = this.lampPos
    const n = lamps.length
    const lights = this.lampLights
    if (!n || !lights.length) return
    const order = this.lampOrder
    const dist = this.lampDist
    order.length = n
    dist.length = n
    for (let i = 0; i < n; i++) {
      const dx = lamps[i][0] - p.x
      const dz = lamps[i][1] - p.z
      dist[i] = dx * dx + dz * dz
      order[i] = i
    }
    const k = Math.min(lights.length, n)
    for (let i = 0; i < k; i++) {
      let best = i
      for (let j = i + 1; j < n; j++) if (dist[order[j]] < dist[order[best]]) best = j
      if (best !== i) { const tmp = order[i]; order[i] = order[best]; order[best] = tmp }
    }
    for (let i = 0; i < k; i++) {
      const li = order[i]
      lights[i].position.set(lamps[li][0], 4.85, lamps[li][1])
    }
  }

  // ----------------------------------------------------------
  // Actualización del ambiente (nubes/agua/polvo/aves)
  // ----------------------------------------------------------
  private updateAmbience(dt: number, t: number): void {
    // nubes a la deriva (dan vida al cielo con coste ~0)
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]
      c.position.x += this.cloudSpeeds[i] * dt
      if (c.position.x > 170) c.position.x = -170
    }
    // agua: reloj del shader (y del reflejo ULTRA del lago)
    if (this.waterMat) this.waterMat.uniforms.uTime.value = t
    if (this.ultraReflector) {
      ;(this.ultraReflector.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    }
    // polvo: deriva lenta + envolvimiento alrededor de la cámara
    if (this.dust && this.dustVel) {
      const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      const cx = this.camera.position.x, cz = this.camera.position.z
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += this.dustVel[i] * dt
        arr[i + 1] += this.dustVel[i + 1] * dt
        arr[i + 2] += this.dustVel[i + 2] * dt
        if (arr[i + 1] < 0.1) arr[i + 1] = 7
        if (arr[i] - cx > 15) arr[i] -= 30; else if (arr[i] - cx < -15) arr[i] += 30
        if (arr[i + 2] - cz > 15) arr[i + 2] -= 30; else if (arr[i + 2] - cz < -15) arr[i + 2] += 30
      }
      pos.needsUpdate = true
    }
    // aves del valle: círculos amplios con aleteo
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      const ph = this.birdPhase[i]
      const ang = t * (0.11 + 0.02 * (i % 3)) + ph
      const rad = 24 + (i % 4) * 6
      b.position.set(Math.cos(ang) * rad + (i % 2 ? 8 : -6), 24 + Math.sin(t * 0.9 + ph) * 3, Math.sin(ang) * rad + 12)
      const flap = 0.62 + 0.38 * Math.sin(t * 7 + ph)
      const base = 1.1 + (i % 3) * 0.3
      b.scale.y = base * 0.7 * flap
      b.scale.x = base
    }
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

    // v6.4: pausa REAL offline — al entrar en pausa se congela la
    // simulación (los bots dejan de disparar); al volver, se reanuda
    if (phase !== this.prevPhase) {
      this.prevPhase = phase
      const offline = useGame.getState().mode === 'solo'
      if (offline) this.net.setPaused(phase === 'paused')
    }

    if (playing && !this.cine.active) {
      this.updateGamepad(dt)
      this.pollActionInputs()
      this.updateMovement(dt)
      this.updateWeapon(dt, t)
      this.updateShooting(t)
    }
    this.updateCamera(dt, t)
    this.updateViewmodel(dt, t)

    // director del modo historia
    this.story?.update(dt, t)

    // v6.3: batalla de la cinemática (fogonazos/trazas/explosiones)
    if (this.cine.active && this.cineBattles.length) this.updateCineBattle(dt)

    // remotos (interpolación)
    const renderT = performance.now() - GAME.INTERP_DELAY
    const states = this.remotes.update(dt, renderT, this.team, this.camera.position, this.cine.active)
    this.updateRemoteFootsteps(dt, states)

    // granadas visibles
    this.updateGrenadeViews(dt)
    this.updateSmokeViews(dt)
    // v8: bengalas localizadoras
    this.updateFlareViews(dt)

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

    // mecánicas del mapa: barriles y saltadores
    this.updateBarrels()
    this.updateJumpPadFX(dt)

    // ambiente v6: nubes, agua, polvo y aves
    this.updateAmbience(dt, t)

    // HUD canvas
    this.drawOverlay(t)
    // v7: minimapa a 30 Hz (rotación suave; el dibujo es barato)
    if (performance.now() - this.minimapT > 33) {
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
      // v6.2: guardia del modo ULTRA (se degrada UNA vez si hace falta)
      this.updateUltraGuard(1, fpsNow)
    }

    // v6.2: luz del fogonazo (ULTRA) — se apaga sola en ~80 ms
    if (this.muzzleLight && this.muzzleLight.intensity > 0) {
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 900)
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
    for (let i = 0; i < this.md.aabbs.length; i++) {
      const b = this.md.aabbs[i]
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
    // v8: estímulo de adrenalina activo → +30% de velocidad de movimiento
    if (this.stimUntilMs > Date.now()) speed *= EQUIPMENT.STIM_SPEED
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
    // v6.3: el agarre también vale EN EL AIRE — saltar hacia el cable y
    // pulsar salto/interactuar lo coge a media trayectoria
    const wantJump = inputActive && (this.keys.has(this.kb('jump')) || this.consumePadJump())
    if (wantJump) {
      if (this.tryAttachZipline()) {
        // agarrado a la tirolina (suelo o aire)
      } else if (this.onGround && (!this.crouching || sliding)) {
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
      for (let i = 0; i < this.md.aabbs.length; i++) {
        const b = this.md.aabbs[i]
        if (this.pos.x + HALF_W > b.minX && this.pos.x - HALF_W < b.maxX &&
            this.pos.z + HALF_W > b.minZ && this.pos.z - HALF_W < b.maxZ) {
          if (b.maxY <= this.pos.y + 0.01 && b.maxY > groundY) groundY = b.maxY
        }
      }
      if (ny <= groundY + 0.001) {
        if (!this.onGround && this.vel.y < -6) this.audio.land()
        this.lastFallSpeed = this.vel.y   // v8: para el muelle de aterrizaje del viewmodel
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
    const lim = this.md.half - 0.8
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
    const sp = this.team === 'A' ? this.md.spawnA : this.md.spawnB
    const inZone = Math.hypot(this.pos.x - sp[0], this.pos.z - sp[2]) < GAME.BUY_RADIUS
    if (inZone !== useGame.getState().buyZone) {
      useGame.getState().setHud({ buyZone: inZone })
    }
  }

  /** Aviso contextual: tirolina cerca (v6.3: en CUALQUIER punto del cable) */
  private updateInteractHint(): void {
    this.interactHint = ''
    if (this.dead) return
    if (this.ziplineIdx >= 0) {
      this.interactHint = `[${keyLabel(this.kb('jump'))}] RELEASE ZIPLINE`
      return
    }
    if (performance.now() < this.ziplineCooldownUntil) return
    const reach = this.ziplineReach()
    if (reach) this.interactHint = `[${keyLabel(this.kb('zipline'))} / ${keyLabel(this.kb('jump'))}] ZIPLINE`
  }

  // ----------------------------------------------------------
  // Tirolinas (v6.3: agarre en cualquier punto del cable —
  // antes solo valía pegado al poste de salida, y mantener el
  // salto pulsado te soltaba nada más agarrarte)
  // ----------------------------------------------------------
  private ziplineCooldownUntil = 0
  /** estaba pulsado el salto el frame anterior (detección de flanco) */
  private ziplineJumpPrev = false

  /** punto más cercano del cable al jugador (si está al alcance) */
  private ziplineReach(): { idx: number; t: number } | null {
    for (let i = 0; i < this.ziplines.length; i++) {
      const z = this.ziplines[i]
      // proyección del jugador sobre el segmento del cable
      const px = this.pos.x - z.from.x
      const pz = this.pos.z - z.from.z
      const t = Math.min(0.97, Math.max(0, (px * z.dir.x + pz * z.dir.z) / z.len))
      const cx = z.from.x + z.dir.x * z.len * t
      const cy = z.from.y + z.dir.y * z.len * t
      const cz = z.from.z + z.dir.z * z.len * t
      const dh = Math.hypot(cx - this.pos.x, cz - this.pos.z)
      const dy = cy - this.pos.y
      // alcance horizontal 2,8 m y el cable entre las rodillas y ~2,9 m sobre los pies
      if (dh <= 2.8 && dy >= -1.2 && dy <= 2.9) return { idx: i, t }
    }
    return null
  }

  private tryAttachZipline(): boolean {
    if (this.ziplineIdx >= 0 || this.dead) return false
    if (performance.now() < this.ziplineCooldownUntil) return false
    const reach = this.ziplineReach()
    if (!reach) return false
    const z = this.ziplines[reach.idx]
    this.ziplineIdx = reach.idx
    // se engancha DONDE está el jugador (sin teletransporte al poste)
    this.ziplineT = Math.max(0.02, reach.t)
    this.crouching = false
    this.slideT = 0
    this.vel.set(0, 0, 0)
    // recordar si el salto ya estaba pulsado: la MISMA pulsación no soltará
    this.ziplineJumpPrev = this.keys.has(this.kb('jump'))
    this.audio.throwSound()
    void z
    return true
  }

  private updateZiplineRide(dt: number): void {
    const z = this.ziplines[this.ziplineIdx]
    if (!z) { this.ziplineIdx = -1; return }
    // soltar: PULSACIÓN NUEVA de salto (la que te enganchó no cuenta)
    const jumpHeld = this.keys.has(this.kb('jump'))
    const freshPress = jumpHeld && !this.ziplineJumpPrev
    this.ziplineJumpPrev = jumpHeld
    if ((freshPress || this.consumePadJump()) && this.ziplineT > 0.05) {
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
    this.ziplineCooldownUntil = performance.now() + 700
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

    // bob (v7: amplitud con el mismo suavizado del viewmodel — se siente unido)
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const bobAmp = this.bobAmt * (this.adsAmt > 0.3 ? 0.008 : 0.028)
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
    // v7: descarga perezosa del GLB de ESTA arma (aviso → refresco en vivo)
    ensureWeaponGLB(id)
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

  /** v6.1: equipar desde la tienda — pide al simulador colocar el arma en el hueco */
  equip(weapon: WeaponId, slot: 0 | 1): void {
    this.net.equip(weapon, slot)
  }

  refillAmmo(id: WeaponId): void {
    this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }
    this.updateHudWeapon()
  }

  /** v6.1: sincronía total de inventario con el simulador (compra/equipar/entrega/spawn) */
  onLoadout(owned: WeaponId[], armory: WeaponId[], slots: [WeaponId | null, WeaponId | null], weapon: WeaponId): void {
    this.owned = owned.slice()
    this.armory = armory.slice()
    this.slots = [slots[0] ?? null, slots[1] ?? null]
    // ¿arma nueva en mano? (compra, equipado en la tienda o entrega de la misión)
    if (weapon && weapon !== this.weapon && this.owned.includes(weapon)) {
      this.setWeapon(weapon)
    } else {
      this.updateHudWeapon()
    }
  }

  private updateHudWeapon(): void {
    const a = this.ammo[this.weapon]
    useGame.getState().setHud({
      weapon: this.weapon,
      mag: a?.mag ?? 0,
      reserve: a?.reserve ?? 0,
      owned: [...this.owned],
      armory: [...this.armory],
      slots: [this.slots[0], this.slots[1]],
    })
  }

  private updateViewmodel(dt: number, t: number): void {
    if (!this.vmGroup) return
    const pose = weaponPose(this.weapon)
    // ---- desenfundado: easeOutBack (entra rápido y frena con un pequeño
    // rebote de sobrepaso — antes era lineal y se veía robótico) ----
    this.drawT = Math.min(1, this.drawT + dt * 4.2)
    const raw = this.drawT
    const c1 = 1.70158, c3 = c1 + 1
    // easeOutBack normalizado; el sobrepaso solo en el último tramo
    const draw = raw >= 1 ? 1 : 1 + c3 * Math.pow(raw - 1, 3) + c1 * Math.pow(raw - 1, 2)
    const drawInv = 1 - draw   // 1→0 con rebote

    // ---- sway (decaimiento exponencial suave) + inercia POSICIONAL ----
    // v8: el arma no solo rota con el ratón, también se desplaza con retraso
    this.swayX *= Math.max(0, 1 - dt * 6)
    this.swayY *= Math.max(0, 1 - dt * 6)
    this.swayPX += (this.swayX * 0.012 - this.swayPX) * Math.min(1, dt * 9)
    this.swayPY += (this.swayY * 0.010 - this.swayPY) * Math.min(1, dt * 9)

    // ---- muelle de aterrizaje: al tocar suelo el arma cae y rebota ----
    if (this.prevOnGround && !this.onGround) { /* despegue: nada */ }
    if (!this.prevOnGround && this.onGround) {
      const impact = Math.min(1, Math.abs(this.lastFallSpeed) / 9)
      this.landDipVel -= impact * 0.85
      this.reloadJoltVel -= impact * 0.3
    }
    this.prevOnGround = this.onGround
    this.landDipVel += (-120 * this.landDip - 11 * this.landDipVel) * dt
    this.landDip += this.landDipVel * dt
    if (Math.abs(this.landDip) < 0.0005 && Math.abs(this.landDipVel) < 0.01) { this.landDip = 0; this.landDipVel = 0 }

    // ---- posiciones (ADS con curva suavestep: arranque rápido, freno suave) ----
    const hip = pose.hip
    const ads = pose.ads
    const adsLin = this.adsAmt
    const adsS = adsLin * adsLin * (3 - 2 * adsLin)
    const sprintA = this.sprintAmt * (1 - adsLin)
    // v7: retroceso con MUELLE (sube rápido, vuelve con un pequeño rebote)
    const vmKick = this.vmKick
    this.vmKickVel += (-140 * this.vmKick - 13 * this.vmKickVel) * dt
    this.vmKick += this.vmKickVel * dt
    if (this.vmKick < 0.0001 && Math.abs(this.vmKickVel) < 0.01) { this.vmKick = 0; this.vmKickVel = 0 }
    // v8: sacudida de recarga (cargador fuera/dentro) — muelle corto y seco
    this.reloadJoltVel += (-220 * this.reloadJolt - 16 * this.reloadJoltVel) * dt
    this.reloadJolt += this.reloadJoltVel * dt
    if (Math.abs(this.reloadJolt) < 0.0005 && Math.abs(this.reloadJoltVel) < 0.01) { this.reloadJolt = 0; this.reloadJoltVel = 0 }

    // bob del arma (amplitud suavizada)
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const bobTarget = this.onGround ? Math.min(1, hSpeed / 5) * (1 - adsLin * 0.85) : 0
    this.bobAmt += (bobTarget - this.bobAmt) * Math.min(1, dt * 8)
    const bob = this.bobAmt

    // v8: balanceo lateral por velocidad lateral (inclinación al esquivar)
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw)
    const latVel = this.vel.x * rightX + this.vel.z * rightZ
    this.strafeRoll += (latVel * 0.012 - this.strafeRoll) * Math.min(1, dt * 7)

    // v7: respiración en reposo (el arma nunca está muerta en pantalla)
    const breathX = Math.cos(t * 1.15) * 0.0022 * (1 - adsLin)
    const breathY = Math.sin(t * 1.55) * 0.0028 * (1 - adsLin)

    let px = hip.x + (ads.x - hip.x) * adsS
    let py = hip.y + (ads.y - hip.y) * adsS
    let pz = hip.z + (ads.z - hip.z) * adsS + vmKick * 0.09

    // ---- animación de recarga en TRES fases (v8) ----
    // 0-30%: inclina y baja · 30%: cargador FUERA (sacudida) · 30-82%:
    // cargador fuera de pantalla · 82%: cargador DENTRO (sacudida) · 95%: cerrojo
    let reloadRot = 0
    let reloadTiltZ = 0
    if (this.reloading) {
      const now = performance.now()
      const w = WEAPONS[this.weapon]
      const progress = 1 - (this.reloadEndAt - now) / (w.reloadTime * 1000)
      const p = Math.min(1, Math.max(0, progress))
      // envolvente: entra (0→0.25), se mantiene, sale (0.85→1)
      const env = p < 0.25 ? p / 0.25 : p > 0.85 ? Math.max(0, (1 - p) / 0.15) : 1
      reloadRot = env * 0.75
      reloadTiltZ = env * 0.5
      py -= env * 0.13
      pz += env * 0.045
      // sacudidas sincronizadas con los sonidos por etapas
      if (progress > 0.3 && this.reloadStage === 0) { this.reloadStage = 1; this.reloadJoltVel += 2.6; this.audio.reload('mag') }
      if (progress > 0.82 && this.reloadStage === 1) { this.reloadStage = 2; this.reloadJoltVel += 3.4; this.audio.reload('end') }
      if (progress > 0.95 && this.reloadStage === 2) { this.reloadStage = 3; this.reloadJoltVel += 1.8 }
    }

    // ---- composición final de posición ----
    px += Math.cos(this.bobT) * 0.012 * bob - this.swayPX * (1 - adsLin * 0.85)
    py += Math.abs(Math.sin(this.bobT)) * 0.010 * bob - this.swayPY * (1 - adsLin * 0.85)
    py -= drawInv * 0.35          // desenfundado: sube desde abajo
    pz -= drawInv * 0.12
    px += breathX
    py += breathY + this.landDip * 0.06   // v8: el aterrizaje hunde el arma
    if (!this.onGround) {          // v8: en el aire el arma baja y se acerca
      py -= 0.025
      pz += 0.015
    }

    this.vmGroup.position.set(px, py, pz)
    this.vmGroup.rotation.set(
      pose.hipRot.x + reloadRot + vmKick * 0.14 + this.swayY * 0.06 * (1 - adsLin) + drawInv * 0.7 + this.landDip * 0.22 + this.reloadJolt * 0.05,
      pose.hipRot.y * (1 - adsS) + sprintA * 0.5 - this.swayX * 0.05 * (1 - adsLin) + drawInv * 0.35 - this.reloadJolt * 0.03,
      pose.hipRot.z + sprintA * 0.25 + reloadTiltZ * 0.4 + Math.sin(this.bobT) * 0.008 * bob + this.strafeRoll + this.reloadJolt * 0.06,
    )
    // sprint: arma apuntando abajo
    if (sprintA > 0.01) {
      this.vmGroup.rotation.x += sprintA * 0.5
      this.vmGroup.position.y -= sprintA * 0.08
    }

    // francotirador ADS: ocultar modelo
    const w = WEAPONS[this.weapon]
    this.vmHolder.visible = !(w.sniper && adsLin > 0.7) && !this.dead

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
    // v9 CTF: mientras portas la bandera no puedes disparar (corre a tu base)
    if (useGame.getState().carryingFlag) {
      if (!this.flagWarnAt || now - this.flagWarnAt > 1600) {
        this.flagWarnAt = now
        useGame.getState().addAnnouncement('WEAPONS DISABLED — you carry the flag! RUN!', 'info')
        this.audio.dryFire()
      }
      this.shooting = false
      return
    }

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
        // v7: brillo aditivo rojo en el punto de impacto — el daño se VE
        this.effects.hitGlow(hit.point, hit.part === 'head' ? 1.35 : 1)
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
    // v6.2 ULTRA: el disparo ILUMINA de verdad (luz puntual que se apaga sola)
    // v6.4: solo con calidad ULTRA activa (en vivo)
    if (this.muzzleLight && this.curQuality === 'ultra') {
      this.muzzleLight.position.copy(mzl)
      this.muzzleLight.intensity = 42 + Math.random() * 14
    }
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
        useGame.getState().addAnnouncement('No smoke grenades — buy them at the shop (B)', 'info')
        return
      }
      this.smokes--
      useGame.getState().setHud({ smokes: this.smokes })
    } else {
      if (this.frags <= 0) {
        useGame.getState().addAnnouncement('No MOLO grenades — buy them at the shop (B)', 'info')
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

  // ----------------------------------------------------------
  // v8 — Equipo táctico: bengala localizadora y estímulo
  // ----------------------------------------------------------
  /** Dispara una bengala: la simulación valida y responde con flareUsed */
  useFlare(): void {
    const s = useGame.getState()
    if (s.phase !== 'playing' || this.dead || s.buyOpen || this.cine.active) return
    if ((s.flares ?? 0) <= 0) {
      useGame.getState().addAnnouncement('No locator flares — buy them at the shop (B)', 'info')
      return
    }
    this.net.useFlare()
  }

  /** Se inyecta un estímulo de adrenalina */
  useStim(): void {
    const s = useGame.getState()
    if (s.phase !== 'playing' || this.dead || s.buyOpen || this.cine.active) return
    if ((s.stims ?? 0) <= 0) {
      useGame.getState().addAnnouncement('No stims — buy them at the shop (B)', 'info')
      return
    }
    this.net.useStim()
  }

  /** La simulación activó la revelación de enemigos para este cliente */
  onFlareUsed(until: number): void {
    this.flareUntil = Math.max(this.flareUntil, until)
    useGame.getState().addAnnouncement('ENEMY POSITIONS REVEALED', 'round')
    this.audio.announceDing()
  }

  /** Estímulo activo (velocidad +) */
  onStimUsed(until: number): void {
    this.stimUntilMs = Math.max(this.stimUntilMs, until)
    useGame.getState().addAnnouncement('ADRENALINE ACTIVE — MOVE FAST', 'info')
  }

  /** Bengala visible: proyectil que sube ardiendo y queda flotando */
  onFlareFx(x: number, y: number, z: number): void {
    const group = new THREE.Group()
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xff5030, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    core.scale.setScalar(1.6)
    group.add(core)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xff9060, transparent: true, opacity: 0.4, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    halo.scale.setScalar(4.5)
    group.add(halo)
    const light = new THREE.PointLight(0xff5a30, 14, 34, 1.6)
    group.add(light)
    group.position.set(x, y + 1.4, z)
    this.scene.add(group)
    this.flareViews.push({ group, light, t: 0, born: performance.now(), px: x, py: y + 1.4, pz: z })
  }

  /** Anima las bengalas visibles: suben en arco y se consumen */
  private updateFlareViews(dt: number): void {
    for (let i = this.flareViews.length - 1; i >= 0; i--) {
      const f = this.flareViews[i]
      f.t += dt
      const life = 22
      if (f.t < 1.1) {
        // fase de subida: arco vertical con deriva ligera
        const k = f.t / 1.1
        f.group.position.set(
          f.px + Math.sin(f.t * 5) * 0.35 * (1 - k),
          f.py + (26 * k - 4.5 * k * k),
          f.pz,
        )
        f.light.intensity = 14 + Math.sin(f.t * 30) * 4
      } else {
        // fase de quema flotando: parpadeo y descenso muy lento
        const burn = Math.min(1, (f.t - 1.1) / life)
        f.group.position.y = f.py + 21.5 - burn * 2.2
        const flick = 0.75 + 0.25 * Math.sin(f.t * 21 + Math.sin(f.t * 7) * 2)
        f.light.intensity = 9 * (1 - burn) * flick + 1
        const core = f.group.children[0] as THREE.Sprite
        const halo = f.group.children[1] as THREE.Sprite
        if (core) (core.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - burn * 0.6) * flick
        if (halo) (halo.material as THREE.SpriteMaterial).opacity = 0.4 * (1 - burn) * flick
        f.group.scale.setScalar(1 + Math.sin(f.t * 3) * 0.06)
      }
      if (f.t > 1.1 + life) {
        this.scene.remove(f.group)
        for (const c of f.group.children) {
          const m = (c as THREE.Sprite).material as THREE.Material | undefined
          m?.dispose()
        }
        this.flareViews.splice(i, 1)
      }
    }
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
  // Cinemáticas: sobrevuelo de entrada (PvP) e cinemáticas del
  // modo historia (v6: título + subtítulo + callback al acabar)
  // ----------------------------------------------------------
  startCinematic(): void {
    if (this.cine.played || this.cine.active) return
    this.cine.played = true
    this.cine.kind = 'entry'
    this.cine.title = 'EMERGENCY STRIKE'
    this.cine.subtitle = 'MERIDIAN STATION 59 · TOTAL EXCLUSION ZONE'
    this.cine.onDone = null
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

  /** cinemática del modo historia (la lanza el director) */
  playStoryCine(spec: {
    points: THREE.Vector3[]
    looks: THREE.Vector3[]
    dur: number
    title: string
    subtitle: string
    dialogues?: CineDialogue[]
    /** v7: varios frentes de batalla visibles durante la escena */
    battles?: CineBattleSpec[]
    /** compat: un solo frente */
    battle?: CineBattleSpec
    onDone?: () => void
  }): void {
    if (this.cine.active) return
    this.cine.played = true          // evita la cinemática de entrada después
    this.cine.kind = 'story'
    this.cine.title = spec.title
    this.cine.subtitle = spec.subtitle
    this.cine.onDone = spec.onDone ?? null
    this.cine.dialogues = spec.dialogues ?? null
    this.cine.active = true
    this.cine.t0 = performance.now()
    this.cine.dur = spec.dur
    this.cine.curve = new THREE.CatmullRomCurve3(spec.points, false, 'catmullrom', 0.4)
    this.cine.look = new THREE.CatmullRomCurve3(spec.looks, false, 'catmullrom', 0.4)
    this.minimap.style.opacity = '0'
    useGame.getState().setHud({ cineActive: true })
    // v7: batallas (varios frentes) visibles durante el sobrevuelo
    const battles = spec.battles ?? (spec.battle ? [spec.battle] : null)
    if (battles?.length) this.startCineBattle(battles)
  }

  /** teletransporte suave del jugador (puntos de control de capítulo) */
  setPlayerPos(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0.02, z)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = 0
    this.onGround = true
  }

  endCinematic(): void {
    if (!this.cine.active) return
    this.cine.active = false
    this.cine.dialogues = null
    this.endCineBattle()
    this.minimap.style.opacity = '1'
    useGame.getState().setHud({ cineActive: false })
    const cb = this.cine.onDone
    this.cine.onDone = null
    this.requestLock()
    cb?.()
  }

  // ----------------------------------------------------------
  // v6.3 — BATALLA de cinemática: soldados enfrentados que
  // intercambian fuego (fogonazos, trazadoras, caídas y
  // explosiones) mientras la cámara sobrevuela la escena
  // ----------------------------------------------------------
  private startCineBattle(specs: CineBattleSpec[]): void {
    this.endCineBattle()
    this.cineBattles = specs
    this.cineShotNext = performance.now() + 400
    this.cineBoomNext = performance.now() + 2200 + Math.random() * 1800
    const gap = 7.5          // media distancia entre bandos
    const weapons: WeaponId[] = ['ar47', 'ar47', 'mp9', 'p9']
    for (const spec of specs) {
      const dir = new THREE.Vector2(Math.sin(spec.yaw), Math.cos(spec.yaw))
      const perp = new THREE.Vector2(-dir.y, dir.x)
      for (let side = 0; side < 2; side++) {
        const team: Team = side === 0 ? 'A' : 'B'
        const sgn = side === 0 ? -1 : 1
        for (let i = 0; i < spec.count; i++) {
          // línea de frente: separación a lo largo del eje perpendicular,
          // pequeño escalonamiento en profundidad para que no parezcan latas
          const along = (i - (spec.count - 1) / 2) * 2.6 + (Math.random() - 0.5) * 0.8
          const depth = gap + Math.random() * 2.2
          const x = spec.cx + perp.x * along + dir.x * depth * sgn
          const z = spec.cz + perp.y * along + dir.y * depth * sgn
          const w = weapons[(i + side) % weapons.length]
          const parts = buildCineSoldier(team, w)
          // mirar al bando contrario (el modelo mira a +Z: yaw = atan2(dx,dz))
          // bando A (lado −dir) mira a +dir; bando B (lado +dir) mira a −dir
          parts.root.position.set(x, 0.02, z)
          parts.root.rotation.y = (sgn === -1 ? spec.yaw : spec.yaw + Math.PI) + (Math.random() - 0.5) * 0.14
          this.scene.add(parts.root)
          this.cineSoldiers.push({
            root: parts.root, body: parts.body, muzzle: parts.muzzle,
            team, weapon: w, fallen: false, fallT: 0,
            phase: Math.random() * Math.PI * 2,
          })
        }
      }
    }
  }

  private updateCineBattle(dt: number): void {
    const specs = this.cineBattles
    if (!specs.length || !this.cineSoldiers.length) return
    const now = performance.now()
    // caídas en curso
    for (const s of this.cineSoldiers) {
      if (!s.fallen) continue
      s.fallT = Math.min(1, s.fallT + dt * 2.4)
      s.body.rotation.x = Math.PI / 2 * s.fallT
      s.body.position.y = -0.62 * s.fallT
    }
    // disparos: fogonazo + trazadora + sonido lejano
    if (now >= this.cineShotNext) {
      this.cineShotNext = now + 110 + Math.random() * 220
      const standing = this.cineSoldiers.filter(s => !s.fallen)
      if (standing.length > 1) {
        const shooter = standing[Math.floor(Math.random() * standing.length)]
        const enemies = this.cineSoldiers.filter(s => s.team !== shooter.team)
        if (enemies.length) {
          const target = enemies[Math.floor(Math.random() * enemies.length)]
          const from = new THREE.Vector3()
          if (shooter.muzzle) {
            shooter.muzzle.updateWorldMatrix(true, false)
            from.setFromMatrixPosition(shooter.muzzle.matrixWorld)
          } else {
            from.copy(shooter.root.position).setY(1.35)
          }
          // apuntar al pecho del objetivo (con dispersión: fallan a veces)
          const to = target.root.position.clone().setY(1.25)
          to.x += (Math.random() - 0.5) * 1.7
          to.z += (Math.random() - 0.5) * 1.7
          this.effects.muzzleFlash(from, 1.15)
          this.effects.tracer(from, to, true)
          const dist = from.distanceTo(this.camera.position)
          this.audio.gunshot(shooter.weapon === 'p9' ? 'pistol' : 'rifle', Math.max(18, dist))
          // impacto del bando rival: chispas + a veces cae
          if (!target.fallen && Math.random() < 0.16) {
            this.effects.impact(to, new THREE.Vector3(0, 1, 0))
            const alive = this.cineSoldiers.filter(s => s.team === target.team && !s.fallen).length
            if (alive > 1) target.fallen = true
          }
        }
      }
    }
    // explosión periódica: elige UNO de los frentes al azar
    if (now >= this.cineBoomNext) {
      this.cineBoomNext = now + 3400 + Math.random() * 3200
      const spec = specs[Math.floor(Math.random() * specs.length)]
      const p = new THREE.Vector3(spec.cx, 1.0, spec.cz)
      p.x += (Math.random() - 0.5) * 13
      p.z += (Math.random() - 0.5) * 13
      p.y = 0.6 + Math.random() * 1.2
      this.effects.explosion(p)
      this.audio.explosion(Math.max(24, p.distanceTo(this.camera.position)))
    }
  }

  private endCineBattle(): void {
    for (const s of this.cineSoldiers) this.scene.remove(s.root)
    this.cineSoldiers.length = 0
    this.cineBattles = []
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
    // modo historia: la misión (y su cinemática) arranca aquí, ya jugable
    // — antes del chequeo de la cinemática de entrada para no duplicarla
    if (this.story && !this.storyStarted) {
      this.storyStarted = true
      this.story.begin()
    }
    // cinemática de entrada en el primer despliegue (modos PvP)
    if (!this.cine.played && !this.storyStarted) this.startCinematic()
  }

  onDeath(killerName: string, respawnIn: number): void {
    this.dead = true
    this.deathT = 0
    this.audio.deathSound()
    this.trauma = 1
    this.story?.onPlayerDeath()
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
    if (hpGain > 0) parts.push(`+${hpGain} HP`)
    if (shieldGain > 0) parts.push(`+${shieldGain} SHIELD`)
    useGame.getState().addAnnouncement(parts.join(' '), 'info')
  }

  setMoney(money: number, frags?: number, smokes?: number, econ?: { vest?: number; helmet?: number; flares?: number; stims?: number; stimUntil?: number }): void {
    this.money = money
    if (frags !== undefined) this.frags = frags
    if (smokes !== undefined) this.smokes = smokes
    // v8: equipo táctico sincronizado con la simulación
    const patch: Partial<Record<string, unknown>> = { money, frags: this.frags, smokes: this.smokes }
    if (econ) {
      if (econ.vest !== undefined) { this.vest = !!econ.vest; patch.vest = !!econ.vest }
      if (econ.helmet !== undefined) { this.helmet = !!econ.helmet; patch.helmet = !!econ.helmet }
      if (econ.flares !== undefined) { this.flares = econ.flares; patch.flares = econ.flares }
      if (econ.stims !== undefined) { this.stims = econ.stims; patch.stims = econ.stims }
      if (econ.stimUntil !== undefined) { this.stimUntilMs = econ.stimUntil; patch.stimUntil = econ.stimUntil }
    }
    useGame.getState().setHud(patch)
  }

  onHitConfirm(dmg: number, headshot: boolean): void {
    // v7: hitmarker con escala según daño y animación de entrada
    this.hitMarkers.push({ t: performance.now(), headshot, dmg })
    // v7: los números de daño se APILAN (cada uno nace un poco más arriba
    // para que las ráfagas se lean bien)
    const recent = this.dmgNumbers.filter(d => performance.now() - d.t < 500).length
    this.dmgNumbers.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 64,
      y: innerHeight / 2 - 34 + (Math.random() - 0.5) * 30 - recent * 22,
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
    this.story?.onSnapshot(snap)
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

    // cinemáticas: barras de cine + título + subtítulo (v6: dinámicos)
    if (this.cine.active) {
      const tCine = (performance.now() - this.cine.t0) / 1000
      const dur = this.cine.dur
      const barH = Math.min(1, tCine / 0.7) * H * 0.115
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, barH)
      ctx.fillRect(0, H - barH, W, barH)
      // fundido de entrada/salida del texto
      const fadeIn = Math.min(1, tCine / 0.8)
      const fadeOut = Math.max(0, 1 - Math.max(0, tCine - (dur - 1.6)) / 1.5)
      const fade = Math.min(fadeIn, fadeOut)
      if (fade > 0.01) {
        ctx.save()
        ctx.globalAlpha = fade
        ctx.textAlign = 'center'
        ctx.font = `900 ${Math.min(64, W * 0.052)}px "Arial Black", system-ui, sans-serif`
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillText(this.cine.title, cx + 3, H * 0.28 + 3)
        ctx.fillStyle = '#f5f0e6'
        ctx.fillText(this.cine.title, cx, H * 0.28)
        ctx.font = 'bold 15px monospace'
        ctx.fillStyle = 'rgba(216,164,24,0.95)'
        ctx.fillText(this.cine.subtitle, cx, H * 0.28 + 34)
        ctx.restore()
      }
      // subtítulo de localización en el tercio inferior
      if (fadeOut > 0.01 && this.cine.kind === 'story') {
        ctx.save()
        ctx.globalAlpha = Math.min(1, tCine / 1.2) * fadeOut
        ctx.textAlign = 'center'
        ctx.font = 'bold 17px "Courier New", monospace'
        const tw = ctx.measureText(this.cine.subtitle).width
        ctx.fillStyle = 'rgba(8,10,8,0.62)'
        ctx.fillRect(cx - tw / 2 - 12, H * 0.78 - 22, tw + 24, 32)
        ctx.fillStyle = 'rgba(255,229,180,0.96)'
        ctx.fillText(this.cine.subtitle, cx, H * 0.78)
        ctx.restore()
      }
      // v6.3 — DIÁLOGOS de la cinemática: subtítulos con locutor,
      // estilo radio táctica (la caja baja junto a la barra de cine)
      if (this.cine.dialogues) {
        const line = this.cine.dialogues.find(d => tCine >= d.at && tCine < d.at + (d.dur ?? 5.4))
        if (line) {
          const lineDur = line.dur ?? 5.4
          const aIn = Math.min(1, (tCine - line.at) / 0.3)
          const aOut = Math.min(1, Math.max(0, (line.at + lineDur - tCine) / 0.4))
          ctx.save()
          ctx.globalAlpha = Math.min(aIn, aOut)
          ctx.textAlign = 'left'
          ctx.font = 'bold 16px "Courier New", monospace'
          // color del locutor
          const whoColor = CINE_SPEAKERS[line.who] ?? '#ffd9a6'
          const whoW = ctx.measureText(line.who).width
          ctx.font = '15px "Courier New", monospace'
          // partir en dos líneas si es largo
          const maxW = Math.min(W * 0.72, 860)
          const words = line.text.split(' ')
          const lines: string[] = []
          let cur = ''
          for (const wd of words) {
            const test = cur ? `${cur} ${wd}` : wd
            if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd } else cur = test
          }
          if (cur) lines.push(cur)
          const boxW = Math.max(whoW + 18, ...lines.map(l => ctx.measureText(l).width)) + 28
          const boxH = 30 + lines.length * 22
          const bx = cx - boxW / 2
          const by = H - Math.min(1, tCine / 0.7) * H * 0.115 - boxH - 26
          ctx.fillStyle = 'rgba(6,8,6,0.74)'
          ctx.fillRect(bx, by, boxW, boxH)
          ctx.strokeStyle = 'rgba(216,164,24,0.55)'
          ctx.lineWidth = 1.5
          ctx.strokeRect(bx, by, boxW, boxH)
          // barra lateral del color del locutor
          ctx.fillStyle = whoColor
          ctx.fillRect(bx, by, 4, boxH)
          ctx.font = 'bold 16px "Courier New", monospace'
          ctx.fillStyle = whoColor
          ctx.fillText(line.who, bx + 16, by + 21)
          ctx.font = '15px "Courier New", monospace'
          ctx.fillStyle = 'rgba(245,240,230,0.96)'
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], bx + 16 + whoW + 14, by + 21 + li * 22)
          }
          ctx.restore()
        }
      }
      // fundido a negro al final de la cinemática de historia
      if (this.cine.kind === 'story' && dur - tCine < 0.9 && dur > 2) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (0.9 - (dur - tCine)) / 0.9)})`
        ctx.fillRect(0, 0, W, H)
      }
      const pulse = 0.6 + 0.4 * Math.sin(now / 300)
      ctx.textAlign = 'center'
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.fillText('CLICK OR ANY KEY TO SKIP', cx, H - barH - 18)
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

    // hitmarkers (v7: escala según daño, pop de entrada, crítico largo)
    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
      const hm = this.hitMarkers[i]
      const life = hm.headshot ? 420 : 260
      const age = (now - hm.t) / life
      if (age >= 1) { this.hitMarkers.splice(i, 1); continue }
      const a = 1 - age
      // pop inicial (0→1 en 60 ms) + escala según daño
      const pop = Math.min(1, (now - hm.t) / 60)
      const dmgScale = 1 + Math.min(0.6, (hm.dmg ?? 30) / 90)
      const g = (6 + 2 * pop) * dmgScale * (1 - age * 0.25)
      const l = 9 * dmgScale
      ctx.strokeStyle = hm.headshot
        ? `rgba(255,45,45,${a})`
        : hm.dmg !== undefined && hm.dmg >= 80 ? `rgba(255,140,40,${a})` : `rgba(255,255,255,${a})`
      ctx.lineWidth = hm.headshot ? 3.2 : 2.6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - g - l, cy - g - l); ctx.lineTo(cx - g, cy - g)
      ctx.moveTo(cx + g, cy + g); ctx.lineTo(cx + g + l, cy + g + l)
      ctx.moveTo(cx - g - l, cy + g + l); ctx.lineTo(cx - g, cy + g)
      ctx.moveTo(cx + g, cy - g); ctx.lineTo(cx + g + l, cy - g - l)
      ctx.stroke()
      // núcleo de impacto (punto que late)
      if (hm.headshot) {
        ctx.fillStyle = `rgba(255,60,60,${a * 0.9})`
        ctx.beginPath()
        ctx.arc(cx, cy, 2.6 * dmgScale * (1 - age), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // v8 — BENGALA LOCALIZADORA: marcadores de enemigos a través de las
    // paredes (rombos rojos con distancia, estilo pulso de radar)
    if (this.flareUntil > Date.now() && s.phase === 'playing' && !this.dead) {
      const remain = Math.max(0, (this.flareUntil - Date.now()) / 1000)
      const blink = 0.55 + 0.45 * Math.sin(now / 160)
      const pv = new THREE.Vector3()
      let drawn = 0
      for (const rp of this.remotes.map.values()) {
        if (drawn >= 14) break
        const st = rp.state
        if (!st || st.dead || st.team === this.team) continue
        pv.set(rp.root.position.x, rp.root.position.y + 1.75, rp.root.position.z)
        const distCam = pv.distanceTo(this.camera.position)
        pv.project(this.camera)
        if (pv.z > 1 || pv.x < -1.05 || pv.x > 1.05 || pv.y < -1.05 || pv.y > 1.05) continue
        const sx = (pv.x * 0.5 + 0.5) * W
        const sy = (-pv.y * 0.5 + 0.5) * H
        drawn++
        // rombo pulsante
        const size = 11 + Math.min(10, 90 / Math.max(4, distCam)) + Math.sin(now / 200 + sx) * 1.4
        ctx.save()
        ctx.translate(sx, sy)
        ctx.globalAlpha = blink
        ctx.fillStyle = 'rgba(255,60,50,0.92)'
        ctx.beginPath()
        ctx.moveTo(0, -size * 0.62); ctx.lineTo(size * 0.5, 0); ctx.lineTo(0, size * 0.62); ctx.lineTo(-size * 0.5, 0)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,220,220,0.95)'
        ctx.lineWidth = 1.6
        ctx.stroke()
        // distancia en metros
        ctx.globalAlpha = 0.95
        ctx.font = `700 11px ${this.tacFont}, monospace`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,120,110,0.95)'
        ctx.fillText(`${Math.round(distCam)}m`, 0, size * 0.62 + 13)
        ctx.restore()
      }
      // aviso de duración (arriba, centrado)
      ctx.save()
      ctx.globalAlpha = blink
      ctx.textAlign = 'center'
      ctx.font = `700 14px ${this.tacFont}, monospace`
      const label = `RECON ${Math.ceil(remain)}s`
      const lw2 = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(60,10,8,0.72)'
      ctx.fillRect(cx - lw2 / 2 - 12, 84, lw2 + 24, 26)
      ctx.strokeStyle = 'rgba(255,80,70,0.85)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx - lw2 / 2 - 12, 84, lw2 + 24, 26)
      ctx.fillStyle = 'rgba(255,110,100,0.98)'
      ctx.fillText(label, cx, 102)
      ctx.restore()
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

    // números de daño (v7: tipografía táctica, contorno y rebote de entrada)
    ctx.textAlign = 'center'
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const dn = this.dmgNumbers[i]
      const age = (now - dn.t) / 850
      if (age >= 1) { this.dmgNumbers.splice(i, 1); continue }
      // rebote: sube rápido al nacer y luego flota
      const rise = age < 0.18 ? (age / 0.18) * 26 : 26 + (age - 0.18) * 34
      const y = dn.y - rise
      const alpha = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88
      const scale = age < 0.14 ? 1.25 - (age / 0.14) * 0.25 : 1
      const size = (dn.headshot ? 24 : 19) * scale
      ctx.font = `700 ${size}px ${this.tacFont}, "Courier New", monospace`
      ctx.lineWidth = 3
      ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.75})`
      ctx.strokeText(String(dn.amount), dn.x, y)
      ctx.fillStyle = dn.headshot
        ? `rgba(255,64,64,${alpha})`
        : dn.amount >= 80 ? `rgba(255,150,50,${alpha})` : `rgba(255,226,90,${alpha})`
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
    // fondo: verde-táctico oscuro (papel de mapa militar)
    ctx.fillStyle = 'rgba(14,19,16,0.96)'
    ctx.fillRect(0, 0, 240, 240)
    const S = 240 / (this.md.half * 2 + 2) // escala px/m
    const O = 120

    // rejilla táctica cada 20 m
    ctx.strokeStyle = 'rgba(120,150,130,0.10)'
    ctx.lineWidth = 1
    for (let g = -60; g <= 60; g += 20) {
      const p = O + g * S
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 240); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(240, p); ctx.stroke()
    }

    // agua (río / lago / fuentes) en azul
    ctx.fillStyle = 'rgba(48,110,138,0.55)'
    for (const w of this.md.water) {
      const x = O + w.x * S, y = O + w.z * S
      const ww = Math.max(3, w.w * S), dd = Math.max(3, w.d * S)
      ctx.fillRect(x - ww / 2, y - dd / 2, ww, dd)
    }

    // edificios: relleno por altura + contorno fino (huellas nítidas)
    for (const b of this.md.boxes) {
      if (b.h < 1.0) continue
      const x = O + b.x * S, y = O + b.z * S
      const w = Math.max(2, b.w * S), d = Math.max(2, b.d * S)
      if (b.h > 2.5) {
        ctx.fillStyle = 'rgba(172,162,140,0.82)'
        ctx.fillRect(x - w / 2, y - d / 2, w, d)
        ctx.strokeStyle = 'rgba(226,220,204,0.28)'
        ctx.lineWidth = 0.7
        ctx.strokeRect(x - w / 2, y - d / 2, w, d)
      } else {
        ctx.fillStyle = 'rgba(122,132,116,0.5)'
        ctx.fillRect(x - w / 2, y - d / 2, w, d)
      }
    }

    // zonas de spawn (círculo punteado del color del equipo)
    if (this.mapId === 'ciudad') {
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1.4
      ctx.strokeStyle = 'rgba(245,158,11,0.6)'
      ctx.beginPath(); ctx.arc(O + this.md.spawnA[0] * S, O + this.md.spawnA[2] * S, GAME.BUY_RADIUS * S, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(34,197,94,0.6)'
      ctx.beginPath(); ctx.arc(O + this.md.spawnB[0] * S, O + this.md.spawnB[2] * S, GAME.BUY_RADIUS * S, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // barriles explosivos (puntos rojos)
    ctx.fillStyle = 'rgba(228,82,56,0.9)'
    for (const b of this.md.barrels) {
      ctx.beginPath()
      ctx.arc(O + b.x * S, O + b.z * S, 2.1, 0, Math.PI * 2)
      ctx.fill()
    }

    // tirolinas (líneas discontinuas claras)
    ctx.strokeStyle = 'rgba(196,208,214,0.6)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 3])
    for (const z of this.md.ziplines) {
      ctx.beginPath()
      ctx.moveTo(O + z.from[0] * S, O + z.from[2] * S)
      ctx.lineTo(O + z.to[0] * S, O + z.to[2] * S)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // plataformas de salto (rombos naranjas)
    ctx.fillStyle = 'rgba(255,140,26,0.9)'
    for (const p of this.md.jumpPads) {
      const x = O + p.x * S, y = O + p.z * S
      ctx.beginPath()
      ctx.moveTo(x, y - 3.4)
      ctx.lineTo(x + 3.4, y)
      ctx.lineTo(x, y + 3.4)
      ctx.lineTo(x - 3.4, y)
      ctx.closePath()
      ctx.fill()
    }
    this.mapStatic = c
  }

  private drawMinimap(): void {
    const ctx = this.mctx
    const W = this.minimap.width
    const now = performance.now()
    const C = W / 2
    const R = W / 2 - 5            // radio útil (marco circular)
    const ZOOM = 1.9               // zoom táctico: ~37 m de radio visible
    const S = 240 / (this.md.half * 2 + 2)
    const O = 120
    const px = O + this.pos.x * S
    const py = O + this.pos.z * S

    ctx.clearRect(0, 0, W, W)

    // ---- clip circular + fondo ----
    ctx.save()
    ctx.beginPath()
    ctx.arc(C, C, R, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(10,13,11,0.94)'
    ctx.fillRect(0, 0, W, W)

    // ---- mundo ROTADO con el jugador al centro (estilo Warzone) ----
    ctx.save()
    ctx.translate(C, C)
    ctx.rotate(this.yaw)
    ctx.scale(ZOOM, ZOOM)
    ctx.translate(-px, -py)
    ctx.drawImage(this.mapStatic, 0, 0)

    const lw = (n: number): number => n / ZOOM

    // pings de disparos enemigos (círculos que se expanden y desvanecen)
    for (const p of this.pings) {
      const age = (now - p.t) / 2500
      const rad = 3 + age * 7
      ctx.strokeStyle = `rgba(255,72,72,${(1 - age) * 0.9})`
      ctx.lineWidth = lw(1.6)
      ctx.beginPath()
      ctx.arc(O + p.x * S, O + p.z * S, rad, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(255,72,72,${1 - age})`
      ctx.beginPath()
      ctx.arc(O + p.x * S, O + p.z * S, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // granadas en vuelo
    ctx.fillStyle = 'rgba(250,204,21,0.95)'
    for (const gv of this.grenadeViews.values()) {
      ctx.beginPath()
      ctx.arc(O + gv.group.position.x * S, O + gv.group.position.z * S, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }

    // banderas (CTF): rombos con borde blanco
    for (const [key, fv] of this.flagViews) {
      const x = O + fv.group.position.x * S, y = O + fv.group.position.z * S
      ctx.fillStyle = key === 'a' ? '#f59e0b' : '#22c55e'
      ctx.beginPath()
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = lw(1)
      ctx.stroke()
    }

    // zonas de dominación
    for (const zv of this.zoneViews) {
      const mat = zv.ring.material as THREE.MeshBasicMaterial
      ctx.strokeStyle = `#${mat.color.getHexString()}`
      ctx.lineWidth = lw(1.8)
      ctx.beginPath()
      ctx.arc(O + zv.letter.position.x * S, O + zv.letter.position.z * S, GAME.DOM_ZONE_RADIUS * S, 0, Math.PI * 2)
      ctx.stroke()
    }

    // aliados: puntos verdes con tick de orientación
    for (const rp of this.remotes.map.values()) {
      const st = rp.state
      if (!st || st.dead) continue
      const isTeam = st.team === this.team
      // v8: BENGALA ACTIVA → los enemigos también se dibujan (rojos,
      // parpadeantes, con tick de orientación — como un radar táctico)
      const flareOn = !isTeam && this.flareUntil > Date.now()
      if (!isTeam && !flareOn) continue
      const x = O + rp.root.position.x * S, y = O + rp.root.position.z * S
      if (isTeam) {
        ctx.fillStyle = '#4ade80'
        ctx.globalAlpha = 1
      } else {
        const blink = 0.6 + 0.4 * Math.sin(now / 150)
        ctx.fillStyle = '#ff4545'
        ctx.globalAlpha = blink
      }
      ctx.beginPath()
      ctx.arc(x, y, isTeam ? 3 : 3.4, 0, Math.PI * 2)
      ctx.fill()
      if (!isTeam) {
        // halo para destacar el blip enemigo revelado
        ctx.strokeStyle = 'rgba(255,70,70,0.5)'
        ctx.lineWidth = lw(1.2)
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      // dirección a la que mira (yaw del modelo, frente +Z)
      const myaw = rp.root.rotation.y
      ctx.strokeStyle = isTeam ? 'rgba(220,255,230,0.9)' : 'rgba(255,180,180,0.9)'
      ctx.lineWidth = lw(1.6)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.sin(myaw) * 6.5, y + Math.cos(myaw) * 6.5)
      ctx.stroke()
    }

    // objetivos del modo historia (parpadeantes)
    if (this.story) {
      const blink = 0.55 + 0.45 * Math.sin(now / 260)
      for (const mk of this.story.minimapMarkers()) {
        ctx.globalAlpha = blink
        ctx.fillStyle = mk.color
        ctx.beginPath()
        ctx.arc(O + mk.x * S, O + mk.z * S, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()

    // ---- capa fija (sin rotación) ----

    // cono de visión del jugador (hacia arriba)
    const cone = ctx.createRadialGradient(C, C, 6, C, C, R * 0.92)
    cone.addColorStop(0, 'rgba(255,244,214,0.16)')
    cone.addColorStop(1, 'rgba(255,244,214,0)')
    ctx.fillStyle = cone
    ctx.beginPath()
    ctx.moveTo(C, C)
    ctx.arc(C, C, R * 0.92, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62)
    ctx.closePath()
    ctx.fill()

    // flecha del jugador (siempre apuntando arriba)
    ctx.save()
    ctx.translate(C, C)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(0, -7.5)
    ctx.lineTo(5.4, 5.4)
    ctx.lineTo(0, 2.6)
    ctx.lineTo(-5.4, 5.4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // marcadores de objetivo FUERA del radio (fijos al borde, estilo baliza)
    if (this.story) {
      for (const mk of this.story.minimapMarkers()) {
        // posición en pantalla tras la rotación
        const wx = O + mk.x * S - px, wy = O + mk.z * S - py
        const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw)
        const sx = (wx * cs - wy * sn) * ZOOM + C
        const sy = (wx * sn + wy * cs) * ZOOM + C
        const d = Math.hypot(sx - C, sy - C)
        if (d < R - 12) continue
        const k = (R - 11) / Math.max(1, d)
        const bx = C + (sx - C) * k, by = C + (sy - C) * k
        ctx.save()
        ctx.translate(bx, by)
        ctx.rotate(Math.atan2(sy - C, sx - C) + Math.PI / 2)
        const blink = 0.6 + 0.4 * Math.sin(now / 260)
        ctx.globalAlpha = blink
        ctx.fillStyle = mk.color
        ctx.beginPath()
        ctx.moveTo(0, -6); ctx.lineTo(4.6, 2.4); ctx.lineTo(0, 0.6); ctx.lineTo(-4.6, 2.4)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()   // fin del clip circular

    // ---- anillo exterior + brújula (N siempre visible) ----
    ctx.strokeStyle = 'rgba(120,124,116,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(C, C, R + 1.5, 0, Math.PI * 2)
    ctx.stroke()
    // puntos cardinales (rotan con el mundo)
    const card: [string, number][] = [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]]
    for (const [label, base] of card) {
      // dirección en pantalla: norte del mapa rotado por yaw
      const a = base + this.yaw
      const x = C + Math.sin(a) * (R + 1.5)
      const y = C - Math.cos(a) * (R + 1.5)
      ctx.fillStyle = label === 'N' ? 'rgba(240,190,90,0.95)' : 'rgba(190,196,188,0.8)'
      ctx.font = `700 10px ${this.tacFont}, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x, y)
    }

    // pings del minimapa expiran
    this.pings = this.pings.filter(p => now - p.t < 2500)
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
