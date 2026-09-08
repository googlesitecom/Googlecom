// ============================================================
// FRONTERA CERO — Efectos visuales
// Trazadoras, fogonazos, impactos, sangre, decals, explosiones
// ============================================================
import * as THREE from 'three'
import {
  makeMuzzleTexture, makeSmokeTexture, makeSparkTexture,
  makeBloodTexture, makeDecalTexture,
} from './textures'

interface Particle {
  mesh: THREE.Mesh | THREE.Sprite
  vel: THREE.Vector3
  life: number
  maxLife: number
  gravity: number
  spin: number
  fade: number
  kind: 'spark' | 'blood' | 'smoke' | 'debris' | 'casing'
}

interface Tracer {
  mesh: THREE.Mesh
  life: number
}

interface Decal {
  mesh: THREE.Mesh
  life: number
}

export class Effects {
  scene: THREE.Scene
  private particles: Particle[] = []
  private tracers: Tracer[] = []
  private decals: Decal[] = []
  private pool: THREE.Mesh[] = []

  private sparkTex: THREE.Texture
  private smokeTex: THREE.Texture
  private bloodTex: THREE.Texture
  private decalTex: THREE.Texture
  private muzzleTex: THREE.Texture

  private tracerMat!: THREE.MeshBasicMaterial
  private sparkMat: THREE.SpriteMaterial
  private bloodMat: THREE.SpriteMaterial
  private smokeMat: THREE.SpriteMaterial
  private debrisGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06)
  private debrisMat = new THREE.MeshLambertMaterial({ color: 0x5a4a38 })
  private casingGeo = new THREE.BoxGeometry(0.015, 0.015, 0.04)
  private casingMat = new THREE.MeshLambertMaterial({ color: 0xc8a028 })
  private decalGeo = new THREE.PlaneGeometry(0.14, 0.14)
  private tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1)

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
    this.sparkMat = new THREE.SpriteMaterial({
      map: this.sparkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this.bloodMat = new THREE.SpriteMaterial({ map: this.bloodTex, transparent: true, depthWrite: false })
    this.smokeMat = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.7 })
  }

  // ----------------------------------------------------------
  // Trazadora (línea de disparo)
  // ----------------------------------------------------------
  tracer(from: THREE.Vector3, to: THREE.Vector3, thin = false): void {
    const dir = to.clone().sub(from)
    const dist = dir.length()
    if (dist < 0.5) return
    let mesh = this.pool.pop()
    if (!mesh) {
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
  // Fogonazo (sprite + luz)
  // ----------------------------------------------------------
  private flashLights: { light: THREE.PointLight; until: number }[] = []

  muzzleFlash(pos: THREE.Vector3, scale = 1): void {
    // sprite efímero
    const mat = new THREE.SpriteMaterial({
      map: this.muzzleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const s = new THREE.Sprite(mat)
    s.position.copy(pos)
    s.scale.setScalar(0.55 * scale)
    s.material.rotation = Math.random() * Math.PI * 2
    this.scene.add(s)
    this.particles.push({
      mesh: s, vel: new THREE.Vector3(), life: 0.05, maxLife: 0.05, gravity: 0, spin: 0, fade: 1, kind: 'spark',
    })
    // luz puntual breve (reutilizada)
    let light: THREE.PointLight | null = this.flashLights.find(f => f.until < performance.now() / 1000)?.light ?? null
    if (!light) {
      light = new THREE.PointLight(0xffb050, 0, 14, 2)
      this.scene.add(light)
      this.flashLights.push({ light, until: 0 })
    }
    light.position.copy(pos)
    light.intensity = 26 * scale
    light.distance = 16
    const fl = this.flashLights.find(f => f.light === light)!
    fl.until = performance.now() / 1000 + 0.05
  }

  // ----------------------------------------------------------
  // Impacto en superficie
  // ----------------------------------------------------------
  impact(point: THREE.Vector3, normal: THREE.Vector3, onFlesh = false): void {
    const count = onFlesh ? 7 : 6
    for (let i = 0; i < count; i++) {
      const mat = (onFlesh ? this.bloodMat : this.sparkMat).clone()
      const s = new THREE.Sprite(mat)
      s.position.copy(point)
      const sc = onFlesh ? 0.12 + Math.random() * 0.1 : 0.05 + Math.random() * 0.06
      s.scale.setScalar(sc)
      this.scene.add(s)
      const v = normal.clone().multiplyScalar(2 + Math.random() * 3)
      v.x += (Math.random() - 0.5) * 3
      v.y += Math.random() * 2.5
      v.z += (Math.random() - 0.5) * 3
      this.particles.push({
        mesh: s, vel: v, life: onFlesh ? 0.4 : 0.3, maxLife: onFlesh ? 0.4 : 0.3,
        gravity: onFlesh ? 9 : 11, spin: 0, fade: 1, kind: onFlesh ? 'blood' : 'spark',
      })
    }
    if (!onFlesh) {
      // humo pequeño
      const mat = this.smokeMat.clone()
      const s = new THREE.Sprite(mat)
      s.position.copy(point).add(normal.clone().multiplyScalar(0.05))
      s.scale.setScalar(0.18)
      this.scene.add(s)
      this.particles.push({
        mesh: s, vel: normal.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.5, 0)),
        life: 0.6, maxLife: 0.6, gravity: -0.5, spin: 0, fade: 1, kind: 'smoke',
      })
      // decal
      this.addDecal(point, normal)
    }
  }

  private addDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    })
    const m = new THREE.Mesh(this.decalGeo, mat)
    m.position.copy(point).add(normal.clone().multiplyScalar(0.012))
    m.lookAt(point.clone().add(normal))
    m.rotation.z = Math.random() * Math.PI * 2
    m.scale.setScalar(0.8 + Math.random() * 0.5)
    this.scene.add(m)
    this.decals.push({ mesh: m, life: 14 })
    if (this.decals.length > 44) {
      const d = this.decals.shift()!
      this.scene.remove(d.mesh)
      ;(d.mesh.material as THREE.Material).dispose()
    }
  }

  // ----------------------------------------------------------
  // Casquillo expulsado
  // ----------------------------------------------------------
  casing(pos: THREE.Vector3, rightDir: THREE.Vector3): void {
    const m = new THREE.Mesh(this.casingGeo, this.casingMat)
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
    const flashMat = new THREE.SpriteMaterial({
      map: this.muzzleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const flash = new THREE.Sprite(flashMat)
    flash.position.copy(pos)
    flash.scale.setScalar(1.2)
    this.scene.add(flash)
    this.particles.push({
      mesh: flash, vel: new THREE.Vector3(), life: 0.14, maxLife: 0.14, gravity: 0, spin: 0, fade: 1, kind: 'spark',
    })

    // luz
    const light = new THREE.PointLight(0xffa040, 90, 30, 2)
    light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0))
    this.scene.add(light)
    this.flashLights.push({ light, until: performance.now() / 1000 + 0.22 })

    // anillo de onda expansiva
    const ringGeo = new THREE.RingGeometry(0.3, 0.55, 24)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcf90, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.1, 0))
    ring.rotation.x = -Math.PI / 2
    this.scene.add(ring)
    this.particles.push({
      mesh: ring, vel: new THREE.Vector3(0, 0.4, 0), life: 0.5, maxLife: 0.5, gravity: 0, spin: 0, fade: 1, kind: 'smoke',
    })

    // humo
    for (let i = 0; i < 14; i++) {
      const mat = this.smokeMat.clone()
      mat.color = new THREE.Color(0x9a8a72)
      const s = new THREE.Sprite(mat)
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
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat)
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
    // partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.scene.remove(p.mesh)
        const mat = (p.mesh as THREE.Sprite).material ?? (p.mesh as THREE.Mesh).material
        if (mat) (mat as THREE.Material).dispose()
        if (p.mesh instanceof THREE.Mesh && p.mesh.geometry === this.tracerGeo) this.pool.push(p.mesh)
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
        this.pool.push(t.mesh)
      }
    }
    // decals
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]
      d.life -= dt
      if (d.life < 2) {
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 2)
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh)
        ;(d.mesh.material as THREE.Material).dispose()
        this.decals.splice(i, 1)
      }
    }
    // luces de fogonazo
    const tNow = performance.now() / 1000
    for (const f of this.flashLights) {
      if (f.until < tNow) {
        if (f.light.intensity !== 0) f.light.intensity = 0
        // las luces de la explosación se limpian aparte
      }
    }
    this.flashLights = this.flashLights.filter(f => {
      if (f.light.intensity >= 70) { // luz de explosión: desvanecer y eliminar
        f.light.intensity *= Math.max(0, 1 - dt * 7)
        return f.light.intensity > 1
      }
      return f.until >= tNow - 2
    })
    void camera
  }
}
