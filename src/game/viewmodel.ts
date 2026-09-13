// ============================================================
// EMERGENCY STRIKE — Modelos de armas (viewmodel procedural)
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
      // ===== v13.4: ESCOPETA DE BOMBEO TÁCTICA realista (estilo 870 MCS) =====
      // reconstruida pieza a pieza: receptor parkerizado, cañón pavonado
      // cónico con corona y nervadura, tubo de cargador, bomba de polímero
      // estriada con barras de acción, riel picatinny, ghost ring + mira de
      // latón, guardamanos con porta-cartuchos y culata táctica con tope
      const std = (c: number, metal: number, rough: number): THREE.MeshStandardMaterial =>
        new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, envMapIntensity: 1.0 })
      const STEEL = std(0x24262b, 0.68, 0.5)     // receptor parkerizado
      const STEEL2 = std(0x2e3036, 0.62, 0.46)   // puentes/accesorio acero
      const BLUED = std(0x15161a, 0.82, 0.36)    // cañón pavonado
      const HOLE = std(0x0b0c0e, 0.4, 0.6)       // puertos/huecos
      const POLY = std(0x1e2024, 0.06, 0.9)      // polímero negro
      const POLY2 = std(0x26282d, 0.06, 0.82)    // polímero claro
      const RUBB = std(0x121316, 0.0, 0.97)      // goma (tope de culata)
      const GOLD = std(0xc9a24a, 0.85, 0.3)      // gatillo latonado
      const SHELL = std(0x9c2622, 0.04, 0.72)    // vaina roja
      const BRASS = std(0xb08742, 0.88, 0.32)    // base latón
      const put = (m: THREE.Mesh, x: number, y: number, z: number, rx = 0): void => {
        m.position.set(x, y, z)
        if (rx) m.rotation.x = rx
        g.add(m)
      }
      const boxM = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh =>
        new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      const cylZ = (r1: number, r2: number, h: number, mat: THREE.Material, seg = 14): THREE.Mesh => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat)
        m.rotation.x = Math.PI / 2
        return m
      }

      // ---- CAÑÓN: cónico pavonado + corona + nervadura + mira de latón ----
      put(cylZ(0.0165, 0.0195, 0.38, BLUED, 16), 0, 0.056, -0.51)        // tubo cónico
      put(cylZ(0.0205, 0.0205, 0.028, BLUED, 16), 0, 0.056, -0.70)      // corona de boca
      put(boxM(0.008, 0.012, 0.33, BLUED), 0, 0.072, -0.52)             // nervadura sup.
      put(boxM(0.014, 0.016, 0.028, STEEL2), 0, 0.068, -0.655)          // rampa frontal
      const bead = cylZ(0.0055, 0.0055, 0.012, GOLD, 8)                  // mira de latón
      put(bead, 0, 0.081, -0.662)
      // chimenea de carga del cañón hacia el receptor
      put(boxM(0.024, 0.03, 0.07, STEEL), 0, 0.052, -0.315)

      // ---- TUBO DEL CARGADOR + tapa con reten ----
      put(cylZ(0.014, 0.014, 0.42, BLUED, 12), 0, 0.012, -0.46)
      put(cylZ(0.0175, 0.0175, 0.036, STEEL, 12), 0, 0.012, -0.676)
      put(cylZ(0.006, 0.006, 0.02, STEEL2, 8), 0, 0.012, -0.695)        // retén del tapón

      // ---- BOMBA (guardamanos deslizante) ----
      put(boxM(0.06, 0.058, 0.15, POLY), 0, 0.012, -0.49)               // cuerpo polímero
      for (let i = 0; i < 6; i++) {                                      // estrías antiderrapantes
        put(boxM(0.063, 0.061, 0.007, HOLE), 0, 0.012, -0.553 + i * 0.026)
      }
      put(boxM(0.05, 0.014, 0.05, POLY2), 0, -0.02, -0.49)              // labio inferior
      // barras de acción (unen la bomba al receptor)
      put(boxM(0.007, 0.024, 0.3, STEEL2), 0.027, 0.024, -0.34)
      put(boxM(0.007, 0.024, 0.3, STEEL2), -0.027, 0.024, -0.34)

      // ---- RECEPTOR (caja de mecanismos parkerizada) ----
      put(boxM(0.058, 0.076, 0.23, STEEL), 0, 0.036, -0.11)             // bloque central
      put(boxM(0.062, 0.014, 0.23, STEEL2), 0, 0.079, -0.11)            // puente superior
      put(boxM(0.062, 0.01, 0.23, STEEL2), 0, -0.003, -0.11)            // base inferior
      // puerto de eyección (lado derecho, hundido)
      put(boxM(0.004, 0.03, 0.08, HOLE), 0.031, 0.042, -0.145)
      put(boxM(0.003, 0.036, 0.09, STEEL2), 0.032, 0.042, -0.145)       // marco del puerto
      // manija del cerrojo a la derecha
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.036, 8), STEEL2)
      bolt.rotation.z = Math.PI / 2
      put(bolt, 0.036, 0.036, -0.19)
      put(boxM(0.012, 0.014, 0.014, STEEL2), 0.048, 0.036, -0.19)       // bola del cerrojo
      // puerto de carga inferior + empujador
      put(boxM(0.03, 0.007, 0.075, HOLE), 0, -0.008, -0.075)

      // ---- RIEL PICATINNY sobre el receptor ----
      put(boxM(0.046, 0.012, 0.19, STEEL2), 0, 0.09, -0.11)             // base del riel
      for (let i = 0; i < 7; i++) {                                      // ranuras transversales
        put(boxM(0.05, 0.007, 0.009, STEEL), 0, 0.096, -0.185 + i * 0.026)
      }
      // GHOST RING trasero (anillo envolvente)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0035, 8, 16), STEEL2)
      ring.position.set(0, 0.081, 0.005)
      g.add(ring)
      put(boxM(0.012, 0.014, 0.012, STEEL2), 0, 0.07, 0.005)            // pie del anillo

      // ---- PORTA-CARTUCHOS (side saddle, lado izquierdo, 2×2) ----
      put(boxM(0.006, 0.078, 0.165, POLY), -0.031, 0.04, -0.1)           // placa portadora
      const shellSpots: [number, number][] = [[0.021, -0.045], [0.055, -0.045], [0.021, -0.115], [0.055, -0.115]]
      for (const [sy, sz] of shellSpots) {
        put(cylZ(0.0105, 0.0105, 0.052, SHELL, 10), -0.038, sy, sz)     // vaina roja
        put(cylZ(0.0115, 0.0115, 0.012, BRASS, 10), -0.038, sy, sz + 0.032) // base de latón
        // clips del porta-cartuchos (anclan la vaina a la placa)
        put(boxM(0.009, 0.007, 0.014, POLY2), -0.037, sy + 0.0125, sz)
        put(boxM(0.009, 0.007, 0.014, POLY2), -0.037, sy - 0.0125, sz)
      }

      // ---- GUARDAMANOS Y GATILLO ----
      put(boxM(0.03, 0.008, 0.075, STEEL2), 0, -0.042, 0.045)           // arco inferior
      put(boxM(0.03, 0.03, 0.008, STEEL2), 0, -0.026, 0.012)            // arco frontal
      put(boxM(0.03, 0.03, 0.008, STEEL2), 0, -0.026, 0.078)            // arco trasero
      const trig = boxM(0.007, 0.024, 0.007, GOLD)                       // gatillo latonado
      trig.rotation.x = 0.18
      put(trig, 0, -0.022, 0.04)
      const safety = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 8), STEEL2)
      safety.rotation.z = Math.PI / 2
      put(safety, 0.032, 0.012, -0.02)                                   // seguro trasero

      // ---- CULATA TÁCTICA (polímero + tope de goma) ----
      const stock = boxM(0.05, 0.088, 0.2, POLY)
      stock.rotation.x = 0.1                                             // caída clásica de culata
      put(stock, 0, 0.006, 0.16)
      put(boxM(0.052, 0.03, 0.15, POLY2), 0, 0.052, 0.15)                // carrillera
      put(boxM(0.046, 0.07, 0.06, POLY), 0, 0.0, 0.08)                   // unión pistolete
      put(boxM(0.054, 0.1, 0.032, RUBB), 0, -0.004, 0.272)               // tope antirrebote
      // anilla de correa
      const swivel = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 12), STEEL2)
      swivel.rotation.y = Math.PI / 2
      swivel.position.set(0, -0.045, 0.24)
      g.add(swivel)

      muzzle.position.set(0, 0.056, -0.715)
      barrelZ = -0.71
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
    case 'pico': {
      // ===== v13.5: PICO DE RECOLECCIÓN (hacha/pico estilo Fortnite) =====
      // mango de madera con empuñadura de goma, cabeza de acero forjado
      // con pico curvo + pala plana, remaches y guarda-mano de acero
      const STEEL = new THREE.MeshLambertMaterial({ color: 0x8f949c })
      const STEELD = new THREE.MeshLambertMaterial({ color: 0x5a5f66 })
      const WOODM = new THREE.MeshLambertMaterial({ color: 0x8a5f34 })
      const RUB = new THREE.MeshLambertMaterial({ color: 0x1b1d21 })
      // mango (ligeramente cónico, agarre natural)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.58, 10), WOODM)
      shaft.rotation.x = Math.PI / 2
      shaft.position.set(0, -0.02, 0.02)
      g.add(shaft)
      // empuñadura de goma + pomo
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.14, 10), RUB)
      grip.rotation.x = Math.PI / 2
      grip.position.set(0, -0.02, 0.26)
      g.add(grip)
      const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 10), STEELD)
      pommel.rotation.x = Math.PI / 2
      pommel.position.set(0, -0.02, 0.33)
      g.add(pommel)
      // guarda-mano de acero (refuerzo del mango)
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 10), STEELD)
      collar.rotation.x = Math.PI / 2
      collar.position.set(0, -0.02, -0.1)
      g.add(collar)
      // cabeza: bloque central + pico curvo (adelante) + pala (atrás)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.09), STEEL)
      head.position.set(0, 0.045, -0.14)
      g.add(head)
      // pico: cuña curvada hacia abajo (perfora/golpea)
      const pickTip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.3, 8), STEEL)
      pickTip.rotation.x = -Math.PI / 2 - 0.5
      pickTip.position.set(0, 0.052, -0.32)
      g.add(pickTip)
      // pala trasera plana (excava)
      const spade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.16), STEEL)
      spade.rotation.x = 0.35
      spade.position.set(0, 0.038, 0.02)
      g.add(spade)
      // remaches visibles en la cabeza
      for (const rx of [-0.028, 0.028]) {
        const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 6), STEELD)
        rivet.rotation.z = Math.PI / 2
        rivet.position.set(rx, 0.045, -0.14)
        g.add(rivet)
      }
      muzzle.position.set(0, 0.05, -0.45)
      barrelZ = -0.44
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
      hip: new THREE.Vector3(0.15, -0.19, -0.32),
      // v13.4: y alineado a la línea de mira nueva (latón 0.081 + ghost ring)
      ads: new THREE.Vector3(0, -0.081, -0.24),
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
    // v13.5: pico — se lleva en alto y cruzado, listo para golpear
    case 'pico': return {
      hip: new THREE.Vector3(0.2, -0.16, -0.3),
      ads: new THREE.Vector3(0.2, -0.16, -0.3),
      hipRot: new THREE.Euler(0.22, 0.5, 0.12),
    }
  }
}

/** Modelo de granada en mano / en vuelo */
export function buildGrenadeModel(kind: 'frag' | 'smoke' = 'frag'): THREE.Group {
  const g = new THREE.Group()
  if (kind === 'smoke') {
    // bote de humo: cilindro metálico gris con franjas azules
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.13, 12),
      new THREE.MeshLambertMaterial({ color: 0x5a6a72 }),
    )
    g.add(body)
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.047, 0.047, 0.028, 12),
      new THREE.MeshLambertMaterial({ color: 0x2a6ac8 }),
    )
    stripe.position.y = 0.02
    g.add(stripe)
    const stripe2 = stripe.clone()
    stripe2.position.y = -0.03
    g.add(stripe2)
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a2020 }),
    )
    top.position.y = 0.075
    g.add(top)
    return g
  }
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
