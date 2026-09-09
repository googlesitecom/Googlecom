// ============================================================
// FRONTERA CERO — Jugadores remotos
// Modelo de soldado realista (soldier.glb) + interpolación de red
// + hitboxes. Fallback: humanoide low-poly si el GLB no carga.
// ============================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js'
import { makeNameTag } from './textures'
import { type Team, type WeaponId, type NetPlayerState } from './shared'
import { buildWeaponModel } from './viewmodel'

interface BufferEntry {
  t: number
  x: number; y: number; z: number
  yaw: number; pitch: number
  dead: boolean
  crouch: boolean
}

export interface RemotePlayer {
  id: string
  name: string
  team: Team
  bot: boolean
  root: THREE.Group
  bodyGroup: THREE.Group
  legs: [THREE.Object3D, THREE.Object3D]
  arms: [THREE.Object3D, THREE.Object3D]
  forearms: [THREE.Object3D, THREE.Object3D]
  head: THREE.Object3D
  torso: THREE.Object3D
  weaponHolder: THREE.Group
  weaponId: WeaponId | null
  weaponMuzzle: THREE.Object3D | null
  tag: THREE.Sprite
  tagBg: THREE.Mesh
  buffer: BufferEntry[]
  lastDead: boolean
  deathTime: number
  walkPhase: number
  hp: number
  state: NetPlayerState | null
  lastFootstep: number
  usingSoldier: boolean
  /** 0..1 — fusión hacia la pose de apuntado (agarrar el arma) */
  aimPose: number
  /** 0..1 — patada de retroceso al disparar (decae) */
  fireKick: number
  /** balanceo de caminar suavizado */
  walkSwing: number
}

const TEAM_COLORS: Record<Team, number> = { A: 0xd99a2b, B: 0x35b04a }
const SKIN = 0xb08a60
const UNIFORM: Record<Team, number> = { A: 0x6b5a3a, B: 0x3a4a5a }

// ---- tinte de equipo para el uniforme del soldado (sutil) ----
const SOLDIER_TINT: Record<Team, number> = { A: 0xc79a4a, B: 0x5a9a6a }
const TINTABLE_MATS = new Set(['Topmat', 'Hatmat', 'Bottommat'])

// ---- pose de reposo del soldado (bajar brazos de la T-pose) ----
// Ejes verificados empíricamente en el rig mixamo: rotation.x baja ambos
// brazos con el MISMO signo (los ejes locales no están alineados al mundo)
const ARM_REST_X = 1.28    // brazos a los costados (manos a ~0.95 m)
const FORE_BEND_X = -0.45  // codo ligeramente flexionado

// ---- pose de APUNTADO (agarrar el arma a dos manos) ----
// El arma se lleva ligeramente al lado −X (hombro derecho del modelo,
// que mira a +Z) → el brazo del lado −X es el del GATILLO y el del
// lado +X el de APOYO (guardamanos), como un tirador diestro.
// Soldado mixamo — calibrada visualmente contra el rig:
//   trigger = arms[1] (mixamorigRightArm, lado −X)
//   support = arms[0] (mixamorigLeftArm, lado +X)
const SOLDIER_AIM = {
  tArm: { x: 1.45, y: -0.59, z: -1.17 },   // hombro gatillo (RightArm) — calibrado por descenso de coordenadas
  tFore: { x: -0.34, z: -0.24 },           // codo gatillo
  sArm: { x: 1.5, y: 0.43, z: 1.5 },       // hombro apoyo (LeftArm)
  sFore: { x: -0.01, z: 0.05 },            // codo apoyo
}
// Humanoide low-poly (fallback) — pivotes en hombro, brazos hacia el arma:
//   trigger = arms[0] (armL en x −0.3) · support = arms[1] (armR en x +0.3)
const HUM_AIM = {
  tArm: { x: -1.12, z: 0.44 },     // alcanza la empuñadura (al frente)
  sArm: { x: -1.37, z: -0.56 },    // alcanza el guardamanos (al frente)
}
// posición del arma en reposo vs. apuntando (lado −X, hombro derecho)
const WPN_REST = { x: -0.16, y: 1.28, z: 0.32 }
const WPN_AIM = { x: -0.1, y: 1.3, z: 0.36 }

// ----------------------------------------------------------
// Humanoide low-poly (fallback si no hay GLB)
// ----------------------------------------------------------
function buildHumanoid(team: Team): {
  root: THREE.Group, bodyGroup: THREE.Group,
  legs: [THREE.Object3D, THREE.Object3D], arms: [THREE.Object3D, THREE.Object3D],
  head: THREE.Object3D, torso: THREE.Object3D, weaponHolder: THREE.Group, tag: THREE.Sprite, tagBg: THREE.Mesh
} {
  const root = new THREE.Group()
  const bodyGroup = new THREE.Group()
  root.add(bodyGroup)

  const uniform = UNIFORM[team]
  const teamColor = TEAM_COLORS[team]

  const matUniform = new THREE.MeshLambertMaterial({ color: uniform })
  const matTeam = new THREE.MeshLambertMaterial({ color: teamColor })
  const matSkin = new THREE.MeshLambertMaterial({ color: SKIN })
  const matDark = new THREE.MeshLambertMaterial({ color: 0x222226 })

  // torso con chaleco del color del equipo
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), matUniform)
  torso.position.y = 1.06
  bodyGroup.add(torso)
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.33), matTeam)
  vest.position.y = 1.12
  bodyGroup.add(vest)

  // cabeza + casco
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), matSkin)
  head.position.y = 1.62
  bodyGroup.add(head)
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.3), matTeam)
  helmet.position.y = 1.74
  bodyGroup.add(helmet)

  // piernas (pivot en cadera para animar)
  const legGeoL = new THREE.BoxGeometry(0.17, 0.78, 0.19)
  legGeoL.translate(0, -0.39, 0)
  const legL = new THREE.Mesh(legGeoL, matDark)
  const legGeoR = new THREE.BoxGeometry(0.17, 0.78, 0.19)
  legGeoR.translate(0, -0.39, 0)
  const legR = new THREE.Mesh(legGeoR, matDark)
  legL.position.set(-0.12, 0.78, 0)
  legR.position.set(0.12, 0.78, 0)
  bodyGroup.add(legL)
  bodyGroup.add(legR)

  // brazos (pivot en hombro)
  const armGeoL = new THREE.BoxGeometry(0.13, 0.6, 0.14)
  armGeoL.translate(0, -0.26, 0)
  const armL = new THREE.Mesh(armGeoL, matUniform)
  const armGeoR = new THREE.BoxGeometry(0.13, 0.6, 0.14)
  armGeoR.translate(0, -0.26, 0)
  const armR = new THREE.Mesh(armGeoR, matUniform)
  armL.position.set(-0.3, 1.32, 0)
  armR.position.set(0.3, 1.32, 0)
  bodyGroup.add(armL)
  bodyGroup.add(armR)

  // soporte del arma en las manos
  const weaponHolder = new THREE.Group()
  weaponHolder.position.set(WPN_REST.x, WPN_REST.y, WPN_REST.z)
  bodyGroup.add(weaponHolder)

  // etiqueta de nombre
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthTest: false, depthWrite: false,
  }))
  tag.position.y = 2.1
  tag.scale.set(1.4, 0.35, 1)
  root.add(tag)
  const tagBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthTest: false }),
  )
  tagBg.visible = false
  root.add(tagBg)

  root.traverse(o => {
    if (o instanceof THREE.Mesh) { o.castShadow = true }
  })

  return { root, bodyGroup, legs: [legL, legR], arms: [armL, armR], head, torso, weaponHolder, tag, tagBg }
}

// ----------------------------------------------------------
// Soldado realista (GLB del usuario, esqueleto mixamo)
// ----------------------------------------------------------
interface SoldierAssets {
  template: THREE.Group
  tintCache: Record<Team, Map<THREE.Material, THREE.Material>>
}

let soldierAssets: SoldierAssets | null = null

/** Busca un hueso por nombre dentro del rig (prefijo mixamorig…) */
function findBone(root: THREE.Object3D, pattern: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse(o => {
    if (!found && pattern.test(o.name)) found = o
  })
  return found
}

/** Prepara la plantilla del soldado: escala, sombras, tinte por equipo */
function prepareSoldier(scene: THREE.Group): SoldierAssets {
  const template = scene
  // el GLB mide ~184 unidades (cm) → escalar a 1.84 m
  const box = new THREE.Box3().setFromObject(template)
  const scale = 1.84 / Math.max(0.01, box.max.y - box.min.y)
  template.scale.setScalar(scale)
  template.position.y = -box.min.y * scale
  template.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = false
      o.frustumCulled = false   // la piel se anima: no dejar que el frustum la descarte
    }
  })
  return { template, tintCache: { A: new Map(), B: new Map() } }
}

/** Clona el soldado con el uniforme tintado del equipo */
function buildSoldier(team: Team): THREE.Object3D | null {
  if (!soldierAssets) return null
  const rig = skeletonClone(soldierAssets.template)
  const tintCache = soldierAssets.tintCache[team]
  rig.traverse(o => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const out = mats.map(orig => {
        if (!TINTABLE_MATS.has(orig.name)) return orig
        const cached: THREE.Material | undefined = tintCache.get(orig)
        if (cached) return cached
        const v: THREE.Material = orig.clone()
        const std = v as THREE.MeshStandardMaterial
        if (std.color) std.color = new THREE.Color(SOLDIER_TINT[team])
        tintCache.set(orig, v)
        return v
      })
      o.material = Array.isArray(o.material) ? out : out[0]
      o.castShadow = true
      o.frustumCulled = false
    }
  })
  // pose de reposo: brazos abajo (eje x) + codos flexionados
  const armL = findBone(rig, /^mixamorigLeftArm_/)
  const armR = findBone(rig, /^mixamorigRightArm_/)
  if (armL) armL.rotation.set(ARM_REST_X, 0, 0)
  if (armR) armR.rotation.set(ARM_REST_X, 0, 0)
  const foreL = findBone(rig, /^mixamorigLeftForeArm_/)
  const foreR = findBone(rig, /^mixamorigRightForeArm_/)
  if (foreL) foreL.rotation.set(FORE_BEND_X, 0, 0)
  if (foreR) foreR.rotation.set(FORE_BEND_X, 0, 0)
  return rig
}

export class RemotePlayers {
  scene: THREE.Scene
  map = new Map<string, RemotePlayer>()
  private soldierLoading = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.loadSoldier()
  }

  /** Carga asíncrona del modelo del soldado; al terminar sustituye a los humanoides */
  private loadSoldier(): void {
    if (this.soldierLoading) return
    this.soldierLoading = true
    const loader = new GLTFLoader()
    loader.load(
      '/soldier.glb',
      gltf => {
        try {
          soldierAssets = prepareSoldier(gltf.scene)
          // sustituir en cascada (un jugador por tick) para repartir el costo
          const pending = [...this.map.values()]
          const step = (): void => {
            const rp = pending.shift()
            if (!rp) return
            this.swapToSoldier(rp)
            setTimeout(step, 30)
          }
          step()
        } catch (e) {
          console.error('FRONTERA CERO: error preparando soldier.glb', e)
        }
      },
      undefined,
      err => {
        // sin GLB → seguimos con los humanoides low-poly
        console.warn('FRONTERA CERO: soldier.glb no disponible, usando modelo simple', err)
      },
    )
  }

  /** Intercambia el cuerpo de un jugador por el soldado (mantiene arma/etiqueta) */
  private swapToSoldier(rp: RemotePlayer): void {
    if (rp.usingSoldier) return
    const rig = buildSoldier(rp.team)
    if (!rig) return
    // quitar el cuerpo viejo (la etiqueta y el arma se conservan)
    for (const child of [...rp.bodyGroup.children]) {
      if (child !== rp.weaponHolder) rp.bodyGroup.remove(child)
    }
    rp.bodyGroup.add(rig)
    // huesos para la animación procedural
    const legL = findBone(rig, /^mixamorigLeftUpLeg_/)
    const legR = findBone(rig, /^mixamorigRightUpLeg_/)
    const armL = findBone(rig, /^mixamorigLeftArm_/)
    const armR = findBone(rig, /^mixamorigRightArm_/)
    const foreL = findBone(rig, /^mixamorigLeftForeArm_/)
    const foreR = findBone(rig, /^mixamorigRightForeArm_/)
    const rest = new THREE.Object3D()
    rp.legs = [legL ?? rest, legR ?? rest]
    rp.arms = [armL ?? rest, armR ?? rest]
    rp.forearms = [foreL ?? rest, foreR ?? rest]
    rp.head = findBone(rig, /^mixamorigHead_/) ?? rest
    rp.torso = findBone(rig, /^mixamorigSpine1_/) ?? rest
    rp.usingSoldier = true
  }

  upsert(state: NetPlayerState, t: number): RemotePlayer {
    let rp = this.map.get(state.id)
    if (!rp) {
      const h = buildHumanoid(state.team)
      rp = {
        id: state.id, name: state.name, team: state.team, bot: state.bot,
        root: h.root, bodyGroup: h.bodyGroup, legs: h.legs, arms: h.arms,
        forearms: [new THREE.Object3D(), new THREE.Object3D()],
        head: h.head, torso: h.torso, weaponHolder: h.weaponHolder, tag: h.tag, tagBg: h.tagBg,
        weaponId: null, weaponMuzzle: null,
        buffer: [], lastDead: state.dead, deathTime: 0, walkPhase: Math.random() * 10,
        hp: state.hp, state, lastFootstep: 0, usingSoldier: false,
        aimPose: 0, fireKick: 0, walkSwing: 0,
      }
      const { tex } = makeNameTag(state.name, state.team, state.team === 'A' ? '#f59e0b' : '#22c55e')
      ;(rp.tag.material as THREE.SpriteMaterial).map = tex
      ;(rp.tag.material as THREE.SpriteMaterial).needsUpdate = true
      // las etiquetas de enemigos solo se ven de cerca
      this.scene.add(rp.root)
      this.map.set(state.id, rp)
      // si el soldado ya está cargado, usarlo directamente
      if (soldierAssets) this.swapToSoldier(rp)
    }
    // buffer de interpolación
    rp.buffer.push({
      t, x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch,
      dead: state.dead, crouch: state.crouch,
    })
    if (rp.buffer.length > 30) rp.buffer.shift()
    rp.name = state.name
    rp.hp = state.hp
    rp.state = state
    // cambio de arma → regenerar modelo
    if (rp.weaponId !== state.weapon) {
      rp.weaponId = state.weapon
      rp.weaponHolder.clear()
      rp.weaponMuzzle = null
      if (state.weapon && state.weapon !== 'knife') {
        const { group, muzzle } = buildWeaponModel(state.weapon)
        group.scale.setScalar(0.9)
        group.rotation.y = Math.PI
        group.position.set(0, -0.05, -0.1)
        rp.weaponHolder.add(group)
        rp.weaponMuzzle = muzzle
      }
    }
    return rp
  }

  remove(id: string): void {
    const rp = this.map.get(id)
    if (rp) {
      this.scene.remove(rp.root)
      this.map.delete(id)
    }
  }

  /** Dispara la animación de retroceso de un jugador remoto (evento shotFired) */
  notifyShot(id: string): void {
    const rp = this.map.get(id)
    if (rp && !rp.lastDead) rp.fireKick = 1
  }

  /** Boca del cañón de un remoto en coords. de mundo (para fogonazos/trazas) */
  getMuzzleWorld(id: string): THREE.Vector3 | null {
    const rp = this.map.get(id)
    if (!rp || !rp.weaponMuzzle || !rp.root.visible || rp.lastDead) return null
    rp.weaponMuzzle.updateWorldMatrix(true, false)
    return new THREE.Vector3().setFromMatrixPosition(rp.weaponMuzzle.matrixWorld)
  }

  /** Interpola y anima todos los remotos. Devuelve lista para minimapa */
  update(dt: number, renderT: number, localTeam: Team, cameraPos: THREE.Vector3): NetPlayerState[] {
    const result: NetPlayerState[] = []
    for (const rp of this.map.values()) {
      const buf = rp.buffer
      if (buf.length === 0) continue
      // buscar par de interpolación
      let a = buf[0], b = buf[buf.length - 1]
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderT && buf[i + 1].t >= renderT) { a = buf[i]; b = buf[i + 1]; break }
        if (buf[i].t > renderT) { b = buf[i]; break }
      }
      const span = Math.max(1, b.t - a.t)
      const alpha = Math.min(1, Math.max(0, (renderT - a.t) / span))
      const x = a.x + (b.x - a.x) * alpha
      const y = a.y + (b.y - a.y) * alpha
      const z = a.z + (b.z - a.z) * alpha
      const dead = b.dead
      const crouch = b.crouch

      rp.root.position.set(x, y, z)
      // interpolar yaw por el camino corto
      let dy = ((b.yaw - a.yaw + Math.PI) % (Math.PI * 2)) - Math.PI
      if (dy < -Math.PI) dy += Math.PI * 2
      rp.root.rotation.y = a.yaw + dy * alpha

      const state = rp.state!
      result.push(state)

      // visibilidad al morir
      if (dead !== rp.lastDead) {
        rp.lastDead = dead
        if (dead) rp.deathTime = renderT / 1000
      }
      if (dead) {
        // caer
        const dt2 = renderT / 1000 - rp.deathTime
        rp.bodyGroup.rotation.x = Math.min(Math.PI / 2, dt2 * 6)
        rp.bodyGroup.position.y = -Math.min(0.7, dt2 * 2.5)
        rp.tag.visible = false
        if (dt2 > 8) { rp.root.visible = false } else { rp.root.visible = true }
        continue
      }
      rp.root.visible = true
      rp.bodyGroup.rotation.x = 0
      rp.bodyGroup.position.y = 0
      rp.tag.visible = true

      // agacharse
      const targetH = crouch ? 0.72 : 1
      rp.bodyGroup.scale.y += (targetH - rp.bodyGroup.scale.y) * Math.min(1, dt * 10)

      // ---- pose de apuntado + animación de disparo ----
      const hasWeapon = !!(state.weapon && state.weapon !== 'knife')
      rp.aimPose += ((hasWeapon ? 1 : 0) - rp.aimPose) * Math.min(1, dt * 7)
      rp.fireKick = Math.max(0, rp.fireKick - dt * 5.5)
      const aim = rp.aimPose
      const kick = rp.fireKick

      // caminar (piernas y balanceo suavizado)
      const speed = state.speed
      const targetSwing = speed > 0.5 ? Math.min(0.65, speed * 0.13) : 0
      rp.walkSwing += (targetSwing - rp.walkSwing) * Math.min(1, dt * 8)
      const swing = rp.walkSwing
      if (speed > 0.5) rp.walkPhase += dt * speed * 2.4
      const sPh = Math.sin(rp.walkPhase) * swing
      rp.legs[0].rotation.x = sPh
      rp.legs[1].rotation.x = -sPh

      if (rp.usingSoldier) {
        // soldado mixamo: gatillo = arms[1] (RightArm, −X) · apoyo = arms[0] (LeftArm, +X)
        const sRestX = ARM_REST_X - sPh * 0.45
        const tRestX = ARM_REST_X + sPh * 0.45
        const sAimX = SOLDIER_AIM.sArm.x + sPh * 0.10
        const tAimX = SOLDIER_AIM.tArm.x - sPh * 0.06
        rp.arms[0].rotation.x = sRestX + (sAimX - sRestX) * aim
        rp.arms[0].rotation.y = SOLDIER_AIM.sArm.y * aim
        rp.arms[0].rotation.z = SOLDIER_AIM.sArm.z * aim
        rp.arms[1].rotation.x = tRestX + (tAimX - tRestX) * aim + kick * 0.14
        rp.arms[1].rotation.y = SOLDIER_AIM.tArm.y * aim
        rp.arms[1].rotation.z = SOLDIER_AIM.tArm.z * aim - kick * 0.1
        rp.forearms[0].rotation.x = FORE_BEND_X + (SOLDIER_AIM.sFore.x - FORE_BEND_X) * aim
        rp.forearms[0].rotation.z = SOLDIER_AIM.sFore.z * aim
        rp.forearms[1].rotation.x = FORE_BEND_X + (SOLDIER_AIM.tFore.x - FORE_BEND_X) * aim - kick * 0.2
        rp.forearms[1].rotation.z = SOLDIER_AIM.tFore.z * aim
        // la cabeza mira donde apunta (pitch)
        rp.head.rotation.x = -state.pitch * 0.5 * (0.4 + 0.6 * aim)
      } else {
        // humanoide: gatillo = arms[0] (x −0.3) · apoyo = arms[1] (x +0.3)
        const tRestX = -sPh * 0.5
        const sRestX = sPh * 0.3
        const tAimX = HUM_AIM.tArm.x - sPh * 0.08
        const sAimX = HUM_AIM.sArm.x - sPh * 0.05
        rp.arms[0].rotation.x = tRestX + (tAimX - tRestX) * aim + kick * 0.16
        rp.arms[0].rotation.z = HUM_AIM.tArm.z * aim
        rp.arms[1].rotation.x = sRestX + (sAimX - sRestX) * aim
        rp.arms[1].rotation.z = HUM_AIM.sArm.z * aim
        rp.head.rotation.x = -state.pitch * 0.35 * aim
      }

      // arma: subirla/centrarla al apuntar, apuntar con pitch, patada al disparar
      const hx = WPN_REST.x + (WPN_AIM.x - WPN_REST.x) * aim
      const hy = WPN_REST.y + (WPN_AIM.y - WPN_REST.y) * aim
      const hz = WPN_REST.z + (WPN_AIM.z - WPN_REST.z) * aim
      rp.weaponHolder.position.set(hx, hy, hz - kick * 0.07)
      rp.weaponHolder.rotation.x = -state.pitch + kick * 0.16

      // etiqueta: teammates siempre, enemigos a < 22 m
      const d = cameraPos.distanceTo(rp.root.position)
      const isTeam = rp.team === localTeam
      rp.tag.visible = (isTeam && d < 60) || (!isTeam && d < 22)
      rp.tag.material.rotation = 0
    }
    return result
  }

  /** Hitboxes en espacio mundial para el raycast local */
  hitboxes(id: string): { head: THREE.Box3, body: THREE.Box3, legs: THREE.Box3 } | null {
    const rp = this.map.get(id)
    if (!rp || !rp.root.visible || rp.lastDead) return null
    const p = rp.root.position
    const crouch = rp.bodyGroup.scale.y
    const hScale = crouch
    const yaw = rp.root.rotation.y
    const cos = Math.abs(Math.cos(yaw))
    const sin = Math.abs(Math.sin(yaw))
    // dimensiones rotadas (yaw)
    const wHalf = (0.30 * cos + 0.16 * sin)
    const dHalf = (0.30 * sin + 0.16 * cos)
    const headY = 1.62 * hScale
    return {
      head: new THREE.Box3(
        new THREE.Vector3(p.x - 0.16, p.y + headY - 0.15, p.z - 0.16),
        new THREE.Vector3(p.x + 0.16, p.y + headY + 0.15, p.z + 0.16),
      ),
      body: new THREE.Box3(
        new THREE.Vector3(p.x - wHalf, p.y + 0.75 * hScale, p.z - dHalf),
        new THREE.Vector3(p.x + wHalf, p.y + 1.4 * hScale, p.z + dHalf),
      ),
      legs: new THREE.Box3(
        new THREE.Vector3(p.x - wHalf * 0.9, p.y, p.z - dHalf * 0.9),
        new THREE.Vector3(p.x + wHalf * 0.9, p.y + 0.75 * hScale, p.z + dHalf * 0.9),
      ),
    }
  }
}
