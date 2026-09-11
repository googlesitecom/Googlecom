// ============================================================
// EMERGENCY STRIKE — Efectos visuales (con pools de reciclaje)
// Trazadoras, fogonazos, impactos, sangre, decals, explosiones
//
// ⚠ RENDIMIENTO (bug del congelamiento al disparar):
// - Las luces de fogonazo/explosión vienen de un pool FIJO que se
//   crea en el constructor (antes del primer render). En Three.js,
//   cambiar el número de luces de la escena fuerza a recompilar
//   TODOS los shaders del mapa → congelamiento de cientos de ms.
//   Con el pool fijo, la cantidad de luces NUNCA cambia: solo se
//   modifica intensidad/posición (uniformes, sin recompilar).
// - Sprites, partículas, casquillos y decals también se reciclan
//   de pools: ningún material se crea/destruye durante el juego
//   (crear+destruir materiales libera y recompila programas GPU).
// ============================================================
import * as THREE from 'three'
import {
  makeMuzzleTexture, makeSmokeTexture, makeSparkTexture,
  makeBloodTexture, makeDecalTexture,
} from './textures'

type SpriteKind = 'spark' | 'blood' | 'smoke' | 'flash'
type ParticleKind = SpriteKind | 'debris' | 'casing' | 'ring'

interface Particle {
  mesh: THREE.Mesh | THREE.Sprite
  vel: THREE.Vector3
  life: number
  maxLife: number
  gravity: number
  spin: number
  fade: number
  kind: ParticleKind
}

interface Tracer {
  mesh: THREE.Mesh
  life: number
}

const MAX_DECALS = 44
const MAX_PARTICLES = 320   // techo de seguridad para ráfagas largas

/** vector cero compartido (solo para partículas con gravedad 0, nunca se muta) */
const V0 = new THREE.Vector3()

export class Effects {
  scene: THREE.Scene
  private particles: Particle[] = []
  private tracers: Tracer[] = []

  // ---- pools de reciclaje (se crean bajo demanda, nunca se destruyen) ----
  private matPool: Record<SpriteKind, THREE.SpriteMaterial[]> = { spark: [], blood: [], smoke: [], flash: [] }
  private spritePool: THREE.Sprite[] = []
  private debrisPool: THREE.Mesh[] = []
  private casingPool: THREE.Mesh[] = []
  private ringPool: THREE.Mesh[] = []
  private tracerPool: THREE.Mesh[] = []

  // ---- decals: anillo fijo pre-creado ----
  private decalMeshes: THREE.Mesh[] = []
  private decalLife: number[] = []
  private decalIdx = 0

  // ---- geometrías/materiales compartidos ----
  private sparkTex: THREE.Texture
  private smokeTex: THREE.Texture
  private bloodTex: THREE.Texture
  private decalTex: THREE.Texture
  private muzzleTex: THREE.Texture

  private tracerMat!: THREE.MeshBasicMaterial
  private debrisGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06)
  private debrisMat = new THREE.MeshLambertMaterial({ color: 0x5a4a38 })
  private casingGeo = new THREE.BoxGeometry(0.015, 0.015, 0.04)
  private casingMat = new THREE.MeshLambertMaterial({ color: 0xc8a028 })
  private decalGeo = new THREE.PlaneGeometry(0.14, 0.14)
  private ringGeo = new THREE.RingGeometry(0.3, 0.55, 24)
  private tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1)

  // ---- luces FIJAS (creadas una sola vez; su número nunca cambia) ----
  private flashLights: THREE.PointLight[] = []
  private flashUntil: number[] = []
  private flashIdx = 0
  private boomLights: THREE.PointLight[] = []
  private boomActive: boolean[] = []
  private boomIdx = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.sparkTex = makeSparkTexture()
    this.smokeTex = makeSmokeTexture()
    this.bloodTex = makeBloodTexture()
    this.decalTex = makeDecalTexture()
    this.muzzleTex = makeMuzzleTexture()

    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    })

    // Pool de luces de fogonazo (3) y de explosión (2): intensidad 0,
    // añadidas AHORA (antes del primer render) para que todos los
    // shaders se compilen UNA sola vez con el número final de luces.
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb050, 0, 16, 2)
      scene.add(l)
      this.flashLights.push(l)
      this.flashUntil.push(0)
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 30, 2)
      scene.add(l)
      this.boomLights.push(l)
      this.boomActive.push(false)
    }

    // Decals pre-creados (anillo fijo, se reciclan en su sitio)
    for (let i = 0; i < MAX_DECALS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.decalTex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, opacity: 1,
      })
      const m = new THREE.Mesh(this.decalGeo, mat)
      m.visible = false
      scene.add(m)
      this.decalMeshes.push(m)
      this.decalLife.push(0)
    }
  }

  // ----------------------------------------------------------
  // Adquisición / reciclaje de materiales y objetos
  // ----------------------------------------------------------
  private makeMat(kind: SpriteKind): THREE.SpriteMaterial {
    switch (kind) {
      case 'spark':
        return new THREE.SpriteMaterial({
          map: this.sparkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      case 'blood':
        return new THREE.SpriteMaterial({ map: this.bloodTex, transparent: true, depthWrite: false })
      case 'smoke':
        return new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.7 })
      case 'flash':
        return new THREE.SpriteMaterial({
          map: this.muzzleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        })
    }
  }

  private acquireMat(kind: SpriteKind): THREE.SpriteMaterial {
    const m = this.matPool[kind].pop() ?? this.makeMat(kind)
    if (kind === 'smoke') m.color.set(0xffffff)
    m.opacity = kind === 'smoke' ? 0.7 : 1
    return m
  }

  private releaseMat(m: THREE.SpriteMaterial, kind: ParticleKind): void {
    if (kind === 'debris' || kind === 'casing' || kind === 'ring') return
    this.matPool[kind].push(m)
  }

  private acquireSprite(mat: THREE.SpriteMaterial): THREE.Sprite {
    const s = this.spritePool.pop() ?? new THREE.Sprite(mat)
    s.material = mat
    return s
  }

  /** devuelve una partícula muerta a los pools (nunca dispose) */
  private recycle(p: Particle): void {
    this.scene.remove(p.mesh)
    const mesh = p.mesh
    if (mesh instanceof THREE.Sprite) {
      this.releaseMat(mesh.material as THREE.SpriteMaterial, p.kind)
      this.spritePool.push(mesh)
    } else if (p.kind === 'debris') {
      this.debrisPool.push(mesh)
    } else if (p.kind === 'casing') {
      this.casingPool.push(mesh)
    } else if (p.kind === 'ring') {
      this.ringPool.push(mesh)
    }
  }

  // ----------------------------------------------------------
  // Trazadora (línea de disparo)
  // ----------------------------------------------------------
  tracer(from: THREE.Vector3, to: THREE.Vector3, thin = false): void {
    const dir = to.clone().sub(from)
    const dist = dir.length()
    if (dist < 0.5) return
    let mesh = this.tracerPool.pop()
    if (!mesh) {
      // material clonado SOLO cuando crece el pool (limitado por uso)
      mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone())
      this.scene.add(mesh)
    }
    mesh.visible = true
    mesh.scale.set(thin ? 0.6 : 1, thin ? 0.6 : 1, dist)
    mesh.position.copy(from).add(dir.clone().multiplyScalar(0.5))
    mesh.lookAt(to)
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.opacity = 0.85
    this.tracers.push({ mesh, life: 0.07 + dist * 0.0004 })
  }

  // ----------------------------------------------------------
  // Fogonazo (sprite + luz del pool fijo)
  // ----------------------------------------------------------
  muzzleFlash(pos: THREE.Vector3, scale = 1): void {
    if (this.particles.length < MAX_PARTICLES) {
      const mat = this.acquireMat('flash')
      mat.rotation = Math.random() * Math.PI * 2
      mat.color.set(0xffffff)
      const s = this.acquireSprite(mat)
      s.position.copy(pos)
      s.scale.setScalar(0.55 * scale)
      this.scene.add(s)
      this.particles.push({
        mesh: s, vel: V0, life: 0.05, maxLife: 0.05, gravity: 0, spin: 0, fade: 1, kind: 'flash',
      })
    }
    // luz puntual breve del pool FIJO (nunca se crea ni se elimina)
    const i = this.flashIdx
    const light = this.flashLights[i]
    this.flashIdx = (this.flashIdx + 1) % this.flashLights.length
    light.position.copy(pos)
    light.intensity = 26 * scale
    this.flashUntil[i] = performance.now() / 1000 + 0.05
  }

  // ----------------------------------------------------------
  // Impacto en superficie
  // ----------------------------------------------------------
  impact(point: THREE.Vector3, normal: THREE.Vector3, onFlesh = false): void {
    if (this.particles.length >= MAX_PARTICLES) return
    const count = onFlesh ? 9 : 6
    for (let i = 0; i < count; i++) {
      const mat = this.acquireMat(onFlesh ? 'blood' : 'spark')
      const s = this.acquireSprite(mat)
      s.position.copy(point)
      const sc = onFlesh ? 0.14 + Math.random() * 0.12 : 0.05 + Math.random() * 0.06
      s.scale.setScalar(sc)
      this.scene.add(s)
      const v = normal.clone().multiplyScalar(onFlesh ? 2.6 + Math.random() * 3.4 : 2 + Math.random() * 3)
      v.x += (Math.random() - 0.5) * (onFlesh ? 3.6 : 3)
      v.y += Math.random() * (onFlesh ? 3.0 : 2.5)
      v.z += (Math.random() - 0.5) * (onFlesh ? 3.6 : 3)
      this.particles.push({
        mesh: s, vel: v, life: onFlesh ? 0.5 : 0.3, maxLife: onFlesh ? 0.5 : 0.3,
        gravity: onFlesh ? 9 : 11, spin: 0, fade: 1, kind: onFlesh ? 'blood' : 'spark',
      })
    }
    if (onFlesh) {
      // v7: niebla de sangre — un sprite grande y rápido que se desvanece
      // en el punto de impacto (feedback de daño claro sin coste)
      const mat = this.acquireMat('blood')
      const mist = this.acquireSprite(mat)
      mist.position.copy(point)
      mist.scale.setScalar(0.55)
      this.scene.add(mist)
      this.particles.push({
        mesh: mist, vel: V0, life: 0.22, maxLife: 0.22, gravity: 0, spin: 0, fade: 1, kind: 'blood',
      })
    }
    if (!onFlesh) {
      // humo pequeño
      const mat = this.acquireMat('smoke')
      const s = this.acquireSprite(mat)
      s.position.copy(point).add(normal.clone().multiplyScalar(0.05))
      s.scale.setScalar(0.18)
      this.scene.add(s)
      this.particles.push({
        mesh: s, vel: normal.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.5, 0)),
        life: 0.6, maxLife: 0.6, gravity: -0.5, spin: 0, fade: 1, kind: 'smoke',
      })
      // decal (reciclado del anillo fijo)
      this.addDecal(point, normal)
    }
  }

  private addDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const i = this.decalIdx
    this.decalIdx = (this.decalIdx + 1) % MAX_DECALS
    const m = this.decalMeshes[i]
    m.visible = true
    m.position.copy(point).add(normal.clone().multiplyScalar(0.012))
    m.lookAt(point.clone().add(normal))
    m.rotation.z = Math.random() * Math.PI * 2
    m.scale.setScalar(0.8 + Math.random() * 0.5)
    const mat = m.material as THREE.MeshBasicMaterial
    mat.opacity = 1
    this.decalLife[i] = 14
  }

  // ----------------------------------------------------------
  // v7: brillo de impacto en enemigo — destello aditivo naranja-rojo
  // en el torso del enemigo alcanzado (feedback de daño evidente)
  // ----------------------------------------------------------
  hitGlow(point: THREE.Vector3, scale = 1): void {
    const mat = this.acquireMat('flash')
    mat.rotation = Math.random() * Math.PI * 2
    mat.color.set(0xff5030)   // tinte rojo-naranja: distinto del fogonazo
    const s = this.acquireSprite(mat)
    s.position.copy(point)
    s.scale.setScalar(0.5 * scale)
    this.scene.add(s)
    this.particles.push({
      mesh: s, vel: V0, life: 0.09, maxLife: 0.09, gravity: 0, spin: 0, fade: 1, kind: 'flash',
    })
  }

  // ----------------------------------------------------------
  // Casquillo expulsado
  // ----------------------------------------------------------
  casing(pos: THREE.Vector3, rightDir: THREE.Vector3): void {
    if (this.particles.length >= MAX_PARTICLES) return
    const m = this.casingPool.pop() ?? new THREE.Mesh(this.casingGeo, this.casingMat)
    m.visible = true
    m.position.copy(pos)
    this.scene.add(m)
    const v = rightDir.clone().multiplyScalar(1.4 + Math.random() * 0.8)
    v.y = 1.8 + Math.random() * 0.8
    this.particles.push({
      mesh: m, vel: v, life: 0.9, maxLife: 0.9, gravity: 10,
      spin: (Math.random() - 0.5) * 20, fade: 0, kind: 'casing',
    })
  }

  // ----------------------------------------------------------
  // Explosión de granada
  // ----------------------------------------------------------
  explosion(pos: THREE.Vector3): void {
    // destello central
    const flashMat = this.acquireMat('flash')
    flashMat.color.set(0xffffff)
    const flash = this.acquireSprite(flashMat)
    flash.position.copy(pos)
    flash.scale.setScalar(1.2)
    this.scene.add(flash)
    this.particles.push({
      mesh: flash, vel: V0, life: 0.14, maxLife: 0.14, gravity: 0, spin: 0, fade: 1, kind: 'flash',
    })

    // luz del pool FIJO de explosiones (se desvanece en update)
    const i = this.boomIdx
    const light = this.boomLights[i]
    this.boomIdx = (this.boomIdx + 1) % this.boomLights.length
    light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0))
    light.intensity = 90
    this.boomActive[i] = true

    // anillo de onda expansiva (pool)
    const ring = this.ringPool.pop() ?? (() => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcf90, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      return new THREE.Mesh(this.ringGeo, mat)
    })()
    ring.visible = true
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.1, 0))
    ring.rotation.set(-Math.PI / 2, 0, 0)
    this.scene.add(ring)
    this.particles.push({
      mesh: ring, vel: new THREE.Vector3(0, 0.4, 0), life: 0.5, maxLife: 0.5, gravity: 0, spin: 0, fade: 1, kind: 'ring',
    })

    // humo
    for (let i = 0; i < 14; i++) {
      if (this.particles.length >= MAX_PARTICLES) break
      const mat = this.acquireMat('smoke')
      mat.color.set(0x9a8a72)
      const s = this.acquireSprite(mat)
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8))
      s.scale.setScalar(0.5 + Math.random() * 0.7)
      this.scene.add(s)
      this.particles.push({
        mesh: s,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5),
        life: 1.6 + Math.random() * 0.8, maxLife: 2.4, gravity: -0.8, spin: 0, fade: 1, kind: 'smoke',
      })
    }
    // escombros
    for (let i = 0; i < 16; i++) {
      if (this.particles.length >= MAX_PARTICLES) break
      const m = this.debrisPool.pop() ?? new THREE.Mesh(this.debrisGeo, this.debrisMat)
      m.visible = true
      m.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0))
      this.scene.add(m)
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 12, 3 + Math.random() * 7, (Math.random() - 0.5) * 12),
        life: 1.1 + Math.random() * 0.5, maxLife: 1.6, gravity: 13,
        spin: (Math.random() - 0.5) * 24, fade: 0, kind: 'debris',
      })
    }
  }

  // ----------------------------------------------------------
  // Actualización
  // ----------------------------------------------------------
  update(dt: number, camera: THREE.Camera): void {
    void camera
    const tNow = performance.now() / 1000

    // partículas (reciclaje a los pools, nunca dispose)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.recycle(p)
        this.particles.splice(i, 1)
        continue
      }
      p.vel.y -= p.gravity * dt
      p.mesh.position.addScaledVector(p.vel, dt)
      if (p.kind === 'smoke') {
        p.mesh.scale.multiplyScalar(1 + dt * 0.8)
      }
      if (p.spin !== 0 && p.mesh instanceof THREE.Mesh) {
        p.mesh.rotation.x += p.spin * dt
        p.mesh.rotation.z += p.spin * 0.7 * dt
      }
      if (p.fade !== 0) {
        const mat = ((p.mesh as THREE.Sprite).material ?? (p.mesh as THREE.Mesh).material) as { opacity: number }
        mat.opacity = Math.max(0, (p.life / p.maxLife)) * (p.kind === 'smoke' ? 0.65 : 1)
      }
    }

    // trazadoras
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.life -= dt
      const mat = t.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, t.life * 10)
      if (t.life <= 0) {
        t.mesh.visible = false
        this.tracers.splice(i, 1)
        this.tracerPool.push(t.mesh)
      }
    }

    // decals (anillo fijo: solo se ocultan, nunca se eliminan)
    for (let i = 0; i < MAX_DECALS; i++) {
      const life = this.decalLife[i]
      if (life <= 0) continue
      const nl = life - dt
      this.decalLife[i] = nl
      const m = this.decalMeshes[i]
      if (nl <= 0) { m.visible = false; continue }
      if (nl < 2) {
        (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, nl / 2)
      }
    }

    // luces de fogonazo: apagar las caducadas (intensidad 0, siguen en escena)
    for (let i = 0; i < this.flashLights.length; i++) {
      if (this.flashUntil[i] < tNow && this.flashLights[i].intensity !== 0) {
        this.flashLights[i].intensity = 0
      }
    }
    // luces de explosión: desvanecer
    for (let i = 0; i < this.boomLights.length; i++) {
      if (!this.boomActive[i]) continue
      const light = this.boomLights[i]
      light.intensity *= Math.max(0, 1 - dt * 7)
      if (light.intensity <= 1) {
        light.intensity = 0
        this.boomActive[i] = false
      }
    }
  }

  /** limpieza total (al desmontar el juego) */
  dispose(): void {
    for (const l of this.flashLights) this.scene.remove(l)
    for (const l of this.boomLights) this.scene.remove(l)
    for (const m of this.decalMeshes) this.scene.remove(m)
    this.particles.length = 0
    this.tracers.length = 0
    this.matPool = { spark: [], blood: [], smoke: [], flash: [] }
  }
}
