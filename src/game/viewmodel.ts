// ============================================================
// FRONTERA CERO — Modelos de armas (viewmodel procedural)
// Armas low-poly construidas con primitivas + animaciones
// ============================================================
import * as THREE from 'three'
import type { WeaponId } from './shared'

const DARK = 0x1e1e22
const DARK2 = 0x2a2a30
const METAL = 0x3a3a40
const WOOD = 0x6b4a2a
const WOOD2 = 0x7a5630
const SILVER = 0xb8bcc2
const GREEN = 0x3a4a35

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  )
  m.position.set(x, y, z)
  return m
}

function cyl(r: number, h: number, color: number, x = 0, y = 0, z = 0, axis: 'x' | 'y' | 'z' = 'z'): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 12),
    new THREE.MeshLambertMaterial({ color }),
  )
  if (axis === 'z') m.rotation.x = Math.PI / 2
  if (axis === 'x') m.rotation.z = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

/** Construye el modelo de un arma. Devuelve el grupo + punta del cañón */
export function buildWeaponModel(id: WeaponId): { group: THREE.Group; muzzle: THREE.Object3D } {
  const g = new THREE.Group()
  const muzzle = new THREE.Object3D()
  let barrelZ = -0.5

  switch (id) {
    case 'knife': {
      g.add(box(0.024, 0.012, 0.20, SILVER, 0, 0.01, -0.16))       // hoja
      g.add(box(0.03, 0.03, 0.11, 0x14141a, 0, 0, 0.0))             // mango
      g.add(box(0.05, 0.036, 0.015, DARK2, 0, 0, -0.062))           // guarda
      muzzle.position.set(0, 0.01, -0.27)
      barrelZ = -0.28
      break
    }
    case 'p9': {
      g.add(box(0.05, 0.07, 0.20, DARK, 0, 0.025, -0.06))           // corredera
      g.add(box(0.016, 0.045, 0.06, METAL, 0, 0.025, -0.175))       // cañón
      g.add(box(0.046, 0.115, 0.07, DARK2, 0, -0.06, 0.045))        // empuñadura
      g.add(box(0.03, 0.02, 0.05, METAL, 0, -0.015, -0.02))         // disparador
      g.add(box(0.012, 0.02, 0.012, 0x101014, 0, 0.065, -0.15))     // mira frontal
      g.add(box(0.03, 0.016, 0.02, 0x101014, 0, 0.062, 0.03))       // mira trasera
      muzzle.position.set(0, 0.02, -0.21)
      barrelZ = -0.2
      break
    }
    case 'aguila': {
      g.add(box(0.055, 0.075, 0.28, SILVER, 0, 0.028, -0.08))       // corredera grande
      g.add(cyl(0.014, 0.06, METAL, 0, 0.028, -0.235))              // cañón
      g.add(box(0.05, 0.13, 0.075, 0x3a3020, 0, -0.065, 0.06))      // empuñadura madera
      g.add(box(0.032, 0.02, 0.05, METAL, 0, -0.018, -0.02))
      g.add(box(0.012, 0.022, 0.012, 0x101014, 0, 0.07, -0.21))
      muzzle.position.set(0, 0.025, -0.27)
      barrelZ = -0.26
      break
    }
    case 'mp9': {
      g.add(box(0.06, 0.09, 0.34, DARK, 0, 0.02, -0.1))             // cuerpo
      g.add(cyl(0.02, 0.18, 0x0c0c0e, 0, 0.03, -0.34))              // supresor
      g.add(box(0.05, 0.16, 0.06, DARK2, 0, -0.09, 0.04))           // culata plegada
      g.add(box(0.04, 0.14, 0.05, METAL, 0, -0.07, -0.08))          // cargador
      g.add(box(0.045, 0.045, 0.14, DARK2, 0, 0.055, 0.12))         // riel/culata
      g.add(box(0.014, 0.022, 0.014, 0x101014, 0, 0.075, -0.41))    // mira
      muzzle.position.set(0, 0.03, -0.44)
      barrelZ = -0.43
      break
    }
    case 'breacher': {
      g.add(box(0.065, 0.08, 0.5, 0x2e2418, 0, 0.02, -0.16))        // cuerpo madera
      g.add(cyl(0.022, 0.5, METAL, 0, 0.045, -0.4))                 // tubo cañón
      g.add(cyl(0.02, 0.44, METAL, 0, 0.0, -0.38))                  // tubo munición
      g.add(box(0.055, 0.06, 0.16, 0x3a2c1a, 0, -0.01, 0.0))        // bomba
      g.add(box(0.05, 0.12, 0.09, 0x3a2c1a, 0, -0.05, 0.18))        // culata
      muzzle.position.set(0, 0.045, -0.66)
      barrelZ = -0.65
      break
    }
    case 'ar47': {
      g.add(box(0.06, 0.085, 0.30, DARK, 0, 0.02, -0.06))           // receptor
      g.add(box(0.055, 0.06, 0.14, WOOD, 0, -0.005, 0.13))          // guardamanos
      g.add(cyl(0.015, 0.3, 0x101014, 0, 0.025, -0.35))             // cañón
      g.add(cyl(0.02, 0.05, 0x101014, 0, 0.025, -0.48))             // freno
      // cargador curvo (2 tramos)
      const mag1 = box(0.045, 0.16, 0.07, 0x3a2c18, 0, -0.1, -0.02)
      mag1.rotation.x = 0.25
      g.add(mag1)
      const mag2 = box(0.045, 0.12, 0.065, 0x3a2c18, 0, -0.19, 0.02)
      mag2.rotation.x = 0.55
      g.add(mag2)
      g.add(box(0.05, 0.1, 0.05, WOOD2, 0, -0.03, 0.22))            // culata
      g.add(box(0.05, 0.14, 0.05, WOOD2, 0, -0.075, 0.26))          // pistolete
      g.add(box(0.014, 0.045, 0.014, 0x101014, 0, 0.075, -0.49))    // punto de mira
      g.add(box(0.03, 0.024, 0.03, 0x101014, 0, 0.072, -0.02))      // alza
      muzzle.position.set(0, 0.025, -0.52)
      barrelZ = -0.51
      break
    }
    case 'cr4': {
      g.add(box(0.06, 0.09, 0.36, DARK, 0, 0.02, -0.08))            // receptor
      g.add(box(0.05, 0.05, 0.2, DARK2, 0, 0.02, -0.34))            // guardamanos riel
      g.add(cyl(0.014, 0.22, 0x101014, 0, 0.02, -0.5))              // cañón
      g.add(box(0.04, 0.15, 0.055, METAL, 0, -0.09, -0.05))         // cargador recto
      g.add(box(0.05, 0.08, 0.16, DARK2, 0, 0.0, 0.16))             // culata tubular
      g.add(box(0.05, 0.13, 0.05, DARK2, 0, -0.08, 0.12))           // pistolete
      g.add(box(0.012, 0.05, 0.012, 0x101014, 0, 0.075, -0.42))     // mira
      g.add(box(0.02, 0.03, 0.18, DARK2, 0, 0.075, -0.15))          // asa de transporte
      muzzle.position.set(0, 0.02, -0.62)
      barrelZ = -0.61
      break
    }
    case 'awp338': {
      g.add(box(0.06, 0.09, 0.44, GREEN, 0, 0.015, -0.1))           // cuerpo verde
      g.add(cyl(0.016, 0.42, 0x101014, 0, 0.02, -0.52))             // cañón largo
      g.add(cyl(0.022, 0.07, 0x101014, 0, 0.02, -0.72))             // freno de boca
      // mira telescópica
      g.add(cyl(0.03, 0.2, 0x0c0c0e, 0, 0.095, -0.12))
      g.add(cyl(0.045, 0.04, 0x0c0c0e, 0, 0.095, -0.02))
      g.add(cyl(0.038, 0.04, 0x0c0c0e, 0, 0.095, -0.21))
      g.add(box(0.015, 0.045, 0.02, METAL, 0, 0.06, -0.05))         // soporte
      g.add(box(0.015, 0.045, 0.02, METAL, 0, 0.06, -0.17))
      g.add(box(0.045, 0.14, 0.06, METAL, 0, -0.09, -0.04))         // cargador
      g.add(box(0.05, 0.1, 0.2, GREEN, 0, -0.01, 0.2))              // culata
      g.add(box(0.05, 0.13, 0.05, GREEN, 0, -0.075, 0.14))          // pistolete
      g.add(box(0.02, 0.06, 0.02, 0x101014, 0, 0.0, -0.62))         // bípode plegado
      muzzle.position.set(0, 0.02, -0.76)
      barrelZ = -0.75
      break
    }
  }

  muzzle.position.set(0, muzzle.position.y, barrelZ)
  g.add(muzzle)
  // todas las piezas proyectan sombra falsa: frustumCulled off para el viewmodel
  g.traverse(o => { o.frustumCulled = false })
  return { group: g, muzzle }
}

/** Pose por defecto (cadera) y ADS por arma */
export function weaponPose(id: WeaponId): { hip: THREE.Vector3; ads: THREE.Vector3; hipRot: THREE.Euler } {
  switch (id) {
    case 'knife': return {
      hip: new THREE.Vector3(0.26, -0.22, -0.42),
      ads: new THREE.Vector3(0.22, -0.18, -0.4),
      hipRot: new THREE.Euler(0.1, 0.35, 0.15),
    }
    case 'p9': return {
      hip: new THREE.Vector3(0.17, -0.17, -0.38),
      ads: new THREE.Vector3(0, -0.085, -0.32),
      hipRot: new THREE.Euler(0.05, 0.06, 0),
    }
    case 'aguila': return {
      hip: new THREE.Vector3(0.19, -0.17, -0.4),
      ads: new THREE.Vector3(0, -0.1, -0.34),
      hipRot: new THREE.Euler(0.05, 0.06, 0),
    }
    case 'mp9': return {
      hip: new THREE.Vector3(0.16, -0.18, -0.34),
      ads: new THREE.Vector3(0, -0.075, -0.26),
      hipRot: new THREE.Euler(0.04, 0.05, 0),
    }
    case 'breacher': return {
      hip: new THREE.Vector3(0.15, -0.19, -0.3),
      ads: new THREE.Vector3(0, -0.062, -0.24),
      hipRot: new THREE.Euler(0.03, 0.04, 0),
    }
    case 'ar47': return {
      hip: new THREE.Vector3(0.17, -0.19, -0.36),
      ads: new THREE.Vector3(0, -0.068, -0.3),
      hipRot: new THREE.Euler(0.04, 0.05, 0),
    }
    case 'cr4': return {
      hip: new THREE.Vector3(0.16, -0.18, -0.36),
      ads: new THREE.Vector3(0, -0.066, -0.3),
      hipRot: new THREE.Euler(0.04, 0.05, 0),
    }
    case 'awp338': return {
      hip: new THREE.Vector3(0.2, -0.2, -0.32),
      ads: new THREE.Vector3(0, -0.02, -0.24),
      hipRot: new THREE.Euler(0.03, 0.04, 0),
    }
  }
}

/** Modelo de granada en mano / en vuelo */
export function buildGrenadeModel(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10),
    new THREE.MeshLambertMaterial({ color: 0x2a3a2a }),
  )
  g.add(body)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a2020 }),
  )
  cap.position.y = 0.07
  g.add(cap)
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.08, 0.02),
    new THREE.MeshLambertMaterial({ color: 0x606060 }),
  )
  lever.position.set(0.03, 0.03, 0)
  lever.rotation.z = -0.3
  g.add(lever)
  return g
}
