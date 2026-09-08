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
  head: THREE.Object3D
  torso: THREE.Object3D
  weaponHolder: THREE.Group
  weaponId: WeaponId | null
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
  weaponHolder.position.set(0.16, 1.28, 0.32)
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
    const rest = new THREE.Object3D()
    rp.legs = [legL ?? rest, legR ?? rest]
    rp.arms = [armL ?? rest, armR ?? rest]
    rp.head = findBone(rig, /^mixamorigHead_/) ?? rest
    rp.torso = findBone(rig, /^mixamorigSpine1_/) ?? rest
    // el arma queda a la altura de las manos
    rp.weaponHolder.position.set(0.14, 1.26, 0.34)
    rp.usingSoldier = true
  }

  upsert(state: NetPlayerState, t: number): RemotePlayer {
    let rp = this.map.get(state.id)
    if (!rp) {
      const h = buildHumanoid(state.team)
      rp = {
        id: state.id, name: state.name, team: state.team, bot: state.bot,
        root: h.root, bodyGroup: h.bodyGroup, legs: h.legs, arms: h.arms,
        head: h.head, torso: h.torso, weaponHolder: h.weaponHolder, tag: h.tag, tagBg: h.tagBg,
        weaponId: null,
        buffer: [], lastDead: state.dead, deathTime: 0, walkPhase: Math.random() * 10,
        hp: state.hp, state, lastFootstep: 0, usingSoldier: false,
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
      if (state.weapon && state.weapon !== 'knife') {
        const { group } = buildWeaponModel(state.weapon)
        group.scale.setScalar(0.9)
        group.rotation.y = Math.PI
        group.position.set(0, -0.05, -0.1)
        rp.weaponHolder.add(group)
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

      // animación de caminar (piernas y brazos: huesos o pivotes)
      const speed = state.speed
      if (speed > 0.5) {
        rp.walkPhase += dt * speed * 2.4
        const swing = Math.min(0.65, speed * 0.13)
        rp.legs[0].rotation.x = Math.sin(rp.walkPhase) * swing
        rp.legs[1].rotation.x = -Math.sin(rp.walkPhase) * swing
        if (rp.usingSoldier) {
          // los brazos del soldado descansan abajo (ARM_REST_X) y se balancean
          rp.arms[0].rotation.x = ARM_REST_X - Math.sin(rp.walkPhase) * swing * 0.45
          rp.arms[1].rotation.x = ARM_REST_X + Math.sin(rp.walkPhase) * swing * 0.45
        } else {
          rp.arms[0].rotation.x = -Math.sin(rp.walkPhase) * swing * 0.5
          rp.arms[1].rotation.x = Math.sin(rp.walkPhase) * swing * 0.3
        }
      } else {
        if (rp.usingSoldier) {
          rp.legs[0].rotation.x *= 1 - Math.min(1, dt * 8)
          rp.legs[1].rotation.x *= 1 - Math.min(1, dt * 8)
          rp.arms[0].rotation.x += (ARM_REST_X - rp.arms[0].rotation.x) * Math.min(1, dt * 8)
          rp.arms[1].rotation.x += (ARM_REST_X - rp.arms[1].rotation.x) * Math.min(1, dt * 8)
        } else {
          rp.legs[0].rotation.x *= 1 - Math.min(1, dt * 8)
          rp.legs[1].rotation.x *= 1 - Math.min(1, dt * 8)
          rp.arms[0].rotation.x *= 1 - Math.min(1, dt * 8)
          rp.arms[1].rotation.x *= 1 - Math.min(1, dt * 8)
        }
      }
      // apuntar con pitch
      rp.weaponHolder.rotation.x = -state.pitch

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
