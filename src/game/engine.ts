// ============================================================
// FRONTERA CERO — Motor del juego (Three.js)
// Movimiento, colisiones, cámara, armas, efectos, minimapa
// ============================================================
import * as THREE from 'three'
import {
  GAME, WEAPONS, MAP_BOXES, MAP_AABBS, SPAWN_A, SPAWN_B,
  type Team, type WeaponId, type NetSnapshot, type NetPlayerState,
} from './shared'
import { AudioEngine } from './audio'
import { Effects } from './effects'
import { RemotePlayers } from './remote-players'
import { buildWeaponModel, weaponPose, buildGrenadeModel } from './viewmodel'
import { makeWorldTextures, makeSkyTexture } from './textures'
import { useGame } from './store'
import { NetClient } from './net'

interface DamageNumber { x: number; y: number; amount: number; t: number; headshot: boolean }
interface HitMarker { t: number; headshot: boolean }
interface DamageDir { angle: number; t: number }
interface Ping { x: number; z: number; t: number }

interface WeaponRuntime { mag: number; reserve: number }

const PRIMARY_PREF: WeaponId[] = ['awp338', 'cr4', 'ar47', 'breacher', 'mp9']
const SECONDARY_PREF: WeaponId[] = ['aguila', 'p9']
const HALF_W = 0.36
const EYE_STAND = 1.62
const EYE_CROUCH = 1.14
const BASE_FOV = 75

export class Game {
  // three
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private sunLight!: THREE.DirectionalLight

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
  armor = 0
  money = 1000
  team: Team = 'A'
  private owned: WeaponId[] = ['knife', 'p9']
  private ammo: Partial<Record<WeaponId, WeaponRuntime>> = {}
  weapon: WeaponId = 'p9'
  private lastWeapon: WeaponId = 'knife'
  frags = 0

  // runtime de armas
  private nextShotAt = 0
  private sprayIdx = 0
  private lastShotTime = 0
  private reloading = false
  private reloadEndAt = 0
  private reloadStage = 0
  private ads = false
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

  // granadas visibles
  private grenadeViews = new Map<string, { group: THREE.Group; last: THREE.Vector3; trailT: number }>()

  // minimapa / mundo
  private shootables: THREE.Object3D[] = []
  private raycaster = new THREE.Raycaster()
  private clock = new THREE.Clock()
  private raf = 0
  private fpsFrames = 0
  private fpsT = 0
  private minimapT = 0
  private scoreboardT = 0
  private mapMeshes: THREE.Mesh[] = []
  private disposed = false

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
    this.renderer.toneMappingExposure = 1.06
    this.renderer.shadowMap.enabled = quality !== 'baja'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0xd8bd97, 0.0075)

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 300)
    this.scene.add(this.camera)

    this.buildSky()
    this.buildLights(quality !== 'baja')
    this.buildMap()
    this.buildMinimapStatic()

    this.effects = new Effects(this.scene)
    this.remotes = new RemotePlayers(this.scene)

    // viewmodel holder
    this.vmHolder = new THREE.Group()
    this.camera.add(this.vmHolder)
    this.setWeapon('p9', true)

    // eventos
    this.bindEvents()

    this.net = new NetClient(this)

    this.clock.start()
    this.loop()
  }

  private buildSky(): void {
    const skyTex = makeSkyTexture()
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    )
    this.scene.add(sky)
    // sol
    const sunDir = new THREE.Vector3(0.55, 0.6, -0.45).normalize()
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSkyTexture(), color: 0xfff5d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false,
    }))
    sunSprite.position.copy(sunDir.clone().multiplyScalar(160))
    sunSprite.scale.setScalar(24)
    this.scene.add(sunSprite)
  }

  private buildLights(shadows: boolean): void {
    const sun = new THREE.DirectionalLight(0xffe6bf, 2.1)
    sun.position.set(38, 42, -30)
    if (shadows) {
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.left = -48
      sun.shadow.camera.right = 48
      sun.shadow.camera.top = 48
      sun.shadow.camera.bottom = -48
      sun.shadow.camera.far = 160
      sun.shadow.bias = -0.0006
      sun.shadow.normalBias = 0.02
    }
    this.scene.add(sun)
    this.sunLight = sun

    const hemi = new THREE.HemisphereLight(0xcfdce8, 0xc9a870, 0.55)
    this.scene.add(hemi)
  }

  private buildMap(): void {
    const texs = makeWorldTextures()

    // suelo
    const groundMat = new THREE.MeshLambertMaterial({ map: texs.sand })
    groundMat.map!.repeat.set(22, 22)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    this.shootables.push(ground)

    // cajas del mapa
    for (const b of MAP_BOXES) {
      let mesh: THREE.Mesh
      if (b.mat === 'barrel') {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, b.h, 12),
          new THREE.MeshLambertMaterial({ map: texs.barrel }),
        )
      } else {
        const tex = texs[b.mat].clone()
        tex.needsUpdate = true
        tex.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 2.5)), Math.max(1, Math.round(b.h / 2.5)))
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(b.w, b.h, b.d),
          new THREE.MeshLambertMaterial({ map: tex }),
        )
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
      mesh.position.set(b.x, b.y, b.z)
      this.scene.add(mesh)
      this.shootables.push(mesh)
      this.mapMeshes.push(mesh)
    }

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
    this.renderer?.dispose()
  }

  private onResize = (): void => {
    this.renderer.setSize(innerWidth, innerHeight)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    this.overlay.width = innerWidth
    this.overlay.height = innerHeight
  }

  private onCtxMenu = (e: Event): void => { e.preventDefault() }

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas3d
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
    if (e.code === 'Tab') {
      e.preventDefault()
      s.setHud({ scoreboardOpen: true })
      return
    }
    if (s.buyOpen) {
      if (e.code === 'KeyB' || e.code === 'Escape') {
        e.preventDefault()
        this.closeBuyMenu()
      }
      return
    }
    if (s.phase !== 'playing') return
    this.keys.add(e.code)
    switch (e.code) {
      case 'KeyB': this.openBuyMenu(); break
      case 'KeyR': this.startReload(); break
      case 'KeyG': this.throwGrenade(); break
      case 'KeyQ': this.switchTo(this.lastWeapon); break
      case 'Digit1': {
        const p = PRIMARY_PREF.find(w => this.owned.includes(w))
        if (p) this.switchTo(p)
        break
      }
      case 'Digit2': {
        const p = SECONDARY_PREF.find(w => this.owned.includes(w))
        if (p) this.switchTo(p)
        break
      }
      case 'Digit3': this.switchTo('knife'); break
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      useGame.getState().setHud({ scoreboardOpen: false })
      return
    }
    this.keys.delete(e.code)
  }

  private shooting = false

  private onMouseDown = (e: MouseEvent): void => {
    const s = useGame.getState()
    if (s.phase === 'paused') { this.requestLock(); return }
    if (s.phase !== 'playing') return
    if (!this.locked) { this.requestLock(); return }
    if (e.button === 0) this.shooting = true
    if (e.button === 2) this.ads = true
  }

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.shooting = false
    if (e.button === 2) this.ads = false
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.dead) return
    const s = useGame.getState()
    const zoomFactor = this.adsAmt > 0.05 ? Math.max(0.28, this.camera.fov / BASE_FOV) : 1
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
  // Menú de compra
  // ----------------------------------------------------------
  openBuyMenu(): void {
    const s = useGame.getState()
    if (!s.buyZone || this.dead) return
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

    if (playing) {
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

    // efectos
    this.effects.update(dt, this.camera)
    this.trauma = Math.max(0, this.trauma - dt * 1.4)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6)

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
      useGame.getState().setHud({ fps: Math.round(this.fpsFrames / (t - this.fpsT)) })
      this.fpsFrames = 0
      this.fpsT = t
    }

    this.renderer.render(this.scene, this.camera)
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
    const inputActive = s.phase === 'playing' && this.locked && !this.dead

    const w = WEAPONS[this.weapon]
    const wantCrouch = inputActive && (this.keys.has('ControlLeft') || this.keys.has('KeyC'))
    const canStand = !this.collides(this.pos.x, this.pos.y, this.pos.z, 1.8)
    this.crouching = wantCrouch || (!canStand && this.pos.y < 3)

    const wantSprint = inputActive && this.keys.has('ShiftLeft') && !this.crouching && !this.ads
    const movingFwd = this.keys.has('KeyW')

    let speed = 4.6 * w.moveMult
    this.sprinting = false
    if (wantSprint && movingFwd && this.onGround) {
      speed *= 1.45
      this.sprinting = true
    }
    if (this.crouching) speed *= 0.5
    if (this.adsAmt > 0.3) speed *= 0.65

    // dirección de input
    let ix = 0, iz = 0
    if (inputActive) {
      if (this.keys.has('KeyW')) iz += 1
      if (this.keys.has('KeyS')) iz -= 1
      if (this.keys.has('KeyA')) ix -= 1
      if (this.keys.has('KeyD')) ix += 1
    }
    const len = Math.hypot(ix, iz)
    if (len > 0) { ix /= len; iz /= len }

    // base yaw
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw)
    const dirX = ix * cos + iz * sin
    const dirZ = -ix * sin + iz * cos

    // aceleración / fricción
    const accel = this.onGround ? 12 : 2.2
    const fric = this.onGround ? 10 : 0.3
    this.vel.x += (dirX * speed - this.vel.x) * Math.min(1, accel * dt)
    this.vel.z += (dirZ * speed - this.vel.z) * Math.min(1, accel * dt)
    if (len === 0 && this.onGround) {
      const damp = Math.max(0, 1 - fric * dt)
      this.vel.x *= damp
      this.vel.z *= damp
    }

    // salto / gravedad
    if (inputActive && this.keys.has('Space') && this.onGround && !this.crouching) {
      this.vel.y = 5.6
      this.onGround = false
      this.audio.jump()
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
    this.pos.x = Math.max(-34.2, Math.min(34.2, this.pos.x))
    this.pos.z = Math.max(-34.2, Math.min(34.2, this.pos.z))

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

    // zona de compra
    const sp = this.team === 'A' ? SPAWN_A : SPAWN_B
    const inZone = Math.hypot(this.pos.x - sp[0], this.pos.z - sp[2]) < GAME.BUY_RADIUS
    if (inZone !== useGame.getState().buyZone) {
      useGame.getState().setHud({ buyZone: inZone })
    }

    // parámetros calculados (no usados directamente)
  }

  // ----------------------------------------------------------
  // Cámara
  // ----------------------------------------------------------
  private updateCamera(dt: number, t: number): void {
    // altura de ojos
    const targetEye = this.dead ? 0.4 : this.crouching ? EYE_CROUCH : EYE_STAND
    const curEye = this.camera.position.y - this.pos.y
    const eye = curEye + (targetEye - curEye) * Math.min(1, dt * 10)

    // bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z)
    const bobAmp = this.onGround ? Math.min(1, hSpeed / 5) * (this.adsAmt > 0.3 ? 0.008 : 0.028) : 0
    const bobX = Math.cos(this.bobT) * bobAmp * 0.6
    const bobY = Math.abs(Math.sin(this.bobT)) * bobAmp

    // sacudida (trauma)
    const sh = this.trauma * this.trauma
    const shakeP = (Math.random() - 0.5) * 0.05 * sh
    const shakeR = (Math.random() - 0.5) * 0.04 * sh

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

    // recuperación del retroceso
    const rec = WEAPONS[this.weapon].recoilRecover
    this.recoilP *= Math.max(0, 1 - rec * dt * 6)
    this.recoilY *= Math.max(0, 1 - rec * dt * 6)
    if (t * 1000 - this.lastShotTime > 380) {
      this.sprayIdx = Math.max(0, this.sprayIdx - dt * 18)
    }

    // muerte: cámara cae
    if (this.dead) this.deathT = Math.min(1, this.deathT + dt * 1.8)

    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw + this.recoilY + shakeR * 0.4
    this.camera.rotation.x = Math.max(-1.5, Math.min(1.5, this.pitch + this.recoilP + shakeP - this.deathT * 0.8))
    this.camera.rotation.z = shakeR + (this.dead ? this.deathT * 0.6 : 0) + Math.cos(this.bobT * 0.5) * bobAmp * 0.2
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
    const { group, muzzle } = buildWeaponModel(id)
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
      const hit = this.castBullet(eye, dir, 2.4)
      if (hit) this.processHit(hit, dir)
      this.updateHudWeapon()
      return
    }

    const spread = this.currentSpread()
    const pellets = w.pellets
    const hits: { target: string; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3 }[] = []

    for (let i = 0; i < pellets; i++) {
      const r = (spread * Math.PI / 180) * Math.sqrt(Math.random())
      const ang = Math.random() * Math.PI * 2
      const dir = forward.clone()
        .addScaledVector(right, Math.cos(ang) * r)
        .addScaledVector(up, Math.sin(ang) * r)
        .normalize()

      const hit = this.castBullet(eye, dir, 200)
      if (!hit) {
        // impacto lejano en el mapa
        this.raycaster.set(eye, dir)
        this.raycaster.far = 200
        const intersect = this.raycaster.intersectObjects(this.shootables, false)[0]
        if (intersect) {
          const normal = intersect.face ? intersect.face.normal.clone().transformDirection(intersect.object.matrixWorld) : dir.clone().negate()
          this.effects.impact(intersect.point, normal)
          this.effects.tracer(this.muzzleWorld(), intersect.point)
        }
        continue
      }
      // efecto local
      this.effects.tracer(this.muzzleWorld(), hit.point)
      if (hit.player) {
        this.effects.impact(hit.point, dir.clone().negate(), true)
        hits.push({ target: hit.player, part: hit.part, dist: hit.dist, point: hit.point })
      } else {
        this.effects.impact(hit.point, hit.normal ?? dir.clone().negate())
      }
    }

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

    // retroceso
    const spray = this.sprayIdx
    this.recoilP += w.recoilV * (0.85 + Math.random() * 0.3) * (this.crouching ? 0.85 : 1) * (this.adsAmt > 0.6 ? 0.8 : 1)
    this.recoilY += w.recoilH * Math.sin(spray * 0.9 + 0.6) * (Math.random() * 0.5 + 0.75)
    this.sprayIdx++
    this.vmKick = 1
    this.lastShotTime = now
    this.trauma = Math.min(1, this.trauma + (w.id === 'awp338' ? 0.35 : w.id === 'breacher' ? 0.3 : 0.12))

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

  /** Raycast local: mapa + hitboxes de jugadores remotos */
  private castBullet(eye: THREE.Vector3, dir: THREE.Vector3, maxDist: number): {
    player: string | null; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3; normal?: THREE.Vector3
  } | null {
    // 1) mapa
    this.raycaster.set(eye, dir)
    this.raycaster.far = maxDist
    const mapHits = this.raycaster.intersectObjects(this.shootables, false)
    const mapHit = mapHits[0]
    const mapDist = mapHit ? mapHit.distance : Infinity

    // 2) jugadores remotos (enemigos vivos)
    const ray = new THREE.Ray(eye, dir)
    let bestPlayer: string | null = null
    let bestPart: 'head' | 'body' | 'legs' = 'body'
    let bestDist = Infinity
    let bestPoint: THREE.Vector3 | null = null

    for (const [id] of this.remotes.map) {
      const st = this.remotes.map.get(id)!.state
      if (!st || st.dead || st.team === this.team) continue
      const boxes = this.remotes.hitboxes(id)
      if (!boxes) continue
      const parts: ['head' | 'body' | 'legs', THREE.Box3][] = [
        ['head', boxes.head], ['body', boxes.body], ['legs', boxes.legs],
      ]
      for (const [part, box] of parts) {
        const p = new THREE.Vector3()
        if (ray.intersectBox(box, p)) {
          const d = p.distanceTo(eye)
          if (d < bestDist) {
            bestDist = d
            bestPlayer = id
            bestPart = part
            bestPoint = p
          }
        }
      }
    }

    if (bestPlayer && bestDist < mapDist && bestPoint) {
      return { player: bestPlayer, part: bestPart, dist: bestDist, point: bestPoint }
    }
    if (mapHit) {
      const normal = mapHit.face ? mapHit.face.normal.clone().transformDirection(mapHit.object.matrixWorld) : dir.clone().negate()
      return { player: null, part: 'body', dist: mapHit.distance, point: mapHit.point, normal }
    }
    return null
  }

  private processHit(hit: { player: string | null; part: 'head' | 'body' | 'legs'; dist: number; point: THREE.Vector3; normal?: THREE.Vector3 }, dir: THREE.Vector3): void {
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
  // Granadas
  // ----------------------------------------------------------
  throwGrenade(): void {
    if (this.dead || this.frags <= 0 || this.throwCooldown > 0) return
    this.throwCooldown = 0.8
    this.frags--
    useGame.getState().setHud({ frags: this.frags })
    this.audio.throwSound()
    this.camera.updateMatrixWorld()
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const eye = this.camera.position.clone().addScaledVector(dir, 0.4)
    const vel = dir.clone().multiplyScalar(16)
    vel.y += 3.5
    this.net.throwGrenade([eye.x, eye.y, eye.z], [vel.x, vel.y, vel.z])
    useGame.getState().setHud({ frags: this.frags })
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
  // Handlers de red (llamados por NetClient)
  // ----------------------------------------------------------
  onWelcome(team: Team, money: number): void {
    this.team = team
    this.money = money
    const s = useGame.getState()
    s.setHud({ team, money })
  }

  onSpawn(pos: [number, number, number], yaw: number, weapons: WeaponId[], weapon: WeaponId, hp: number, armor: number, frags: number, money: number): void {
    this.pos.set(pos[0], pos[1], pos[2])
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = 0
    this.dead = false
    this.deathT = 0
    this.hp = hp
    this.armor = armor
    this.frags = frags
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
      hp, armor, frags, money,
      deathInfo: null,
      owned: [...this.owned],
    })
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
    this.hurtFlash = 1
    this.trauma = Math.min(1, this.trauma + dmg / 90)
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

  setHealth(hp: number, armor: number): void {
    this.hp = hp
    this.armor = armor
    useGame.getState().setHud({ hp, armor })
  }

  setMoney(money: number, frags?: number): void {
    this.money = money
    if (frags !== undefined) this.frags = frags
    useGame.getState().setHud({ money, frags: this.frags })
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
    const from = new THREE.Vector3(...origin)
    const to = new THREE.Vector3(...hit)
    const d = from.distanceTo(this.camera.position)
    if (d > 90) return
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

  onSnapshot(snap: NetSnapshot): void {
    const t = performance.now()
    for (const st of snap.players) {
      if (st.id === this.net.id) continue
      this.remotes.upsert(st, t)
    }
    // granadas
    const seen = new Set<string>()
    for (const g of snap.grenades) {
      seen.add(g.id)
      let gv = this.grenadeViews.get(g.id)
      if (!gv) {
        const group = buildGrenadeModel()
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
    useGame.getState().setHud({ round: snap.round })
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

    // mira telescópica
    const w = WEAPONS[this.weapon]
    if (w.sniper && this.adsAmt > 0.7 && !this.dead) {
      this.drawScope(ctx, W, H)
    } else if (!this.dead && s.phase === 'playing') {
      // crosshair dinámico
      const spread = this.currentSpread()
      const gap = 6 + spread * 46
      const len = 9
      ctx.strokeStyle = 'rgba(80,255,120,0.95)'
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 2
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
    c.width = c.height = 190
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(12,14,10,0.88)'
    ctx.fillRect(0, 0, 190, 190)
    const S = 190 / 76 // escala: 76 m de mapa
    const O = 95
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
    this.mapStatic = c
  }

  private drawMinimap(): void {
    const ctx = this.mctx
    const W = this.minimap.width
    ctx.clearRect(0, 0, W, W)
    ctx.drawImage(this.mapStatic, 0, 0)
    const S = 190 / 76
    const O = 95
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
    return {
      pos: [Math.round(this.pos.x * 100) / 100, Math.round(this.pos.y * 100) / 100, Math.round(this.pos.z * 100) / 100],
      yaw: Math.round(this.yaw * 1000) / 1000,
      pitch: Math.round(this.pitch * 1000) / 1000,
      crouch: this.crouching,
      speed: Math.round(Math.hypot(this.vel.x, this.vel.z) * 10) / 10,
      weapon: this.weapon,
    }
  }
}
