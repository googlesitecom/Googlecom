// ============================================================
// FRONTERA CERO — Assets del usuario (GLB + texturas)
// Armas reales (Pistola/Smg/Rifle/sniper.glb), árbol (Arbol.glb)
// y texturas (Pared/Piso/Cielo.jpg) subidos al repositorio.
//
// CALIBRACIÓN DETERMINISTA: cada archivo tiene una rotación fija
// (medida sobre los vértices en espacio-mundo) que deja el arma
// con la boca del cañón hacia -Z, las miras hacia +Y y la
// empuñadura en el origen. Se verifica visualmente (página
// /calibra + VLM), no se auto-detecta en runtime.
//
// TEXTURAS: los meshes se agrupan POR MATERIAL (la Smg tiene 2)
// para que cada parte conserve su textura real. Fallback
// procedural si falta un archivo.
// ============================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { WeaponId } from './shared'
import { ASSET_BASE } from './shared'

// ------------------------------------------------------------
// Especificaciones de las armas GLB (subidas por el usuario)
// ------------------------------------------------------------
interface WeaponCalib {
  /** rotaciones horneadas en la geometría, en radianes (orden: Z, Y, X) */
  rz?: number
  ry?: number
  rx?: number
}

interface WeaponFileSpec {
  file: string
  /** longitud objetivo del arma completa en metros (culata→boca) */
  length: number
  /** fracción de la longitud desde la culata donde está la empuñadura */
  gripFrac: number
  /** calibración fija medida sobre el espacio-mundo horneado */
  cal: WeaponCalib
}

const HALF_PI = Math.PI / 2

/** Por arma: qué archivo GLB usar. breacher/knife siguen siendo procedurales. */
const WEAPON_FILES: Partial<Record<WeaponId, WeaponFileSpec>> = {
  // CALIBRACIONES MEDIDAS sobre los vértices en espacio-mundo (scripts/
  // verify-weapons-three.mjs + parts-world-bbox.mjs):
  // Pistola: eje largo X, boca en X−, corredera arriba (+Y), empuñadura
  // descendiendo en X+ → ry=−π/2 lleva la boca a −Z sin voltearla
  p9:      { file: 'Pistola.glb', length: 0.24, gripFrac: 0.24, cal: { ry: -HALF_PI } },
  aguila:  { file: 'Pistola.glb', length: 0.30, gripFrac: 0.24, cal: { ry: -HALF_PI } },
  // Smg (P90): eje largo X, boca en X+ (el cañón fino sobresale por el
  // máximo de X; la culata queda en X−) → ry=+π/2 lleva la boca a −Z
  mp9:     { file: 'Smg.glb',     length: 0.55, gripFrac: 0.30, cal: { ry: HALF_PI } },
  // Rifle (M16): ya apunta a −Z en espacio-mundo (cañón Z[−490,−111])
  ar47:    { file: 'Rifle.glb',   length: 0.97, gripFrac: 0.34, cal: {} },
  cr4:     { file: 'Rifle.glb',   length: 0.90, gripFrac: 0.31, cal: {} },
  // Sniper: apunta a +Z en espacio-mundo (boca en Z+) → media vuelta
  awp338:  { file: 'sniper.glb',  length: 1.22, gripFrac: 0.33, cal: { ry: Math.PI } },
}

/** parte de arma lista para instanciar (una por material del GLB) */
interface WeaponPart {
  geo: THREE.BufferGeometry
  mat: THREE.Material
}

interface WeaponCacheEntry {
  /** partes por material, rotación ya horneada (boca → −Z) */
  parts: WeaponPart[]
  /** longitud de la bbox en el eje del cañón, en unidades del modelo */
  rawLen: number
  /** bbox combinada tras la calibración (espacio local del arma) */
  bb: THREE.Box3
}

const weaponCache = new Map<string, WeaponCacheEntry>()

// ------------------------------------------------------------
// Carga de texturas (Pared/Piso/Cielo)
// ------------------------------------------------------------
export interface RepoTextures {
  pared: THREE.Texture | null
  piso: THREE.Texture | null
  cielo: THREE.Texture | null
}

let repoTextures: RepoTextures = { pared: null, piso: null, cielo: null }

export function getRepoTextures(): RepoTextures {
  return repoTextures
}

// ------------------------------------------------------------
// Plantilla del árbol (geometrías fusionadas por material)
// ------------------------------------------------------------
export interface TreeTemplate {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[]
  /** altura sin escalar */
  rawHeight: number
}
let treeTemplate: TreeTemplate | null = null

export function getTreeTemplate(): TreeTemplate | null {
  return treeTemplate
}

// ------------------------------------------------------------
// Estado de carga
// ------------------------------------------------------------
let preloadStarted = false
let preloadDone = false
const weaponListeners: Array<() => void> = []

export function areWeaponGLBsReady(): boolean {
  return weaponCache.size > 0
}

/** Registra un callback para cuando las armas GLB estén listas (refresco de modelos) */
export function onWeaponGLBsReady(cb: () => void): () => void {
  if (preloadDone && weaponCache.size > 0) {
    cb()
    return () => undefined
  }
  weaponListeners.push(cb)
  return () => {
    const i = weaponListeners.indexOf(cb)
    if (i >= 0) weaponListeners.splice(i, 1)
  }
}

/**
 * Precarga todos los assets del usuario. No lanza si ya está en curso.
 * Resuelve siempre (los fallos dejan fallbacks procedurales).
 */
export function preloadAssets(): Promise<void> {
  if (preloadStarted) return Promise.resolve()
  preloadStarted = true

  const loader = new GLTFLoader()
  const texLoader = new THREE.TextureLoader()

  const tasks: Promise<void>[] = []

  // ---- texturas ----
  const loadTex = (url: string, repeat: [number, number] | null): Promise<THREE.Texture | null> =>
    new Promise(resolve => {
      texLoader.load(
        url,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping
          tex.anisotropy = 4
          if (repeat) tex.repeat.set(repeat[0], repeat[1])
          resolve(tex)
        },
        undefined,
        () => resolve(null),
      )
    })

  tasks.push(
    loadTex(`${ASSET_BASE}/textures/Pared.jpg`, null).then(t => { repoTextures.pared = t }),
    loadTex(`${ASSET_BASE}/textures/Piso.jpg`, null).then(t => { repoTextures.piso = t }),
    loadTex(`${ASSET_BASE}/textures/Cielo.jpg`, null).then(t => { repoTextures.cielo = t }),
  )

  // ---- armas (una entrada por archivo distinto) ----
  const files = [...new Set(Object.values(WEAPON_FILES).map(w => w.file))]
  for (const file of files) {
    tasks.push(
      new Promise<void>(resolve => {
        loader.load(
          `${ASSET_BASE}/models/${file}`,
          gltf => {
            try {
              const specs = Object.values(WEAPON_FILES).filter(w => w.file === file)
              const entry = buildWeaponCacheEntry(gltf.scene, specs[0].cal)
              if (entry) weaponCache.set(file, entry)
            } catch (e) {
              console.warn('FRONTERA CERO: no se pudo preparar', file, e)
            }
            resolve()
          },
          undefined,
          () => resolve(),   // sin archivo → fallback procedural
        )
      }),
    )
  }

  // ---- árbol ----
  tasks.push(
    new Promise<void>(resolve => {
      loader.load(
        `${ASSET_BASE}/models/Arbol.glb`,
        gltf => {
          try {
            treeTemplate = buildTreeTemplate(gltf.scene)
          } catch (e) {
            console.warn('FRONTERA CERO: no se pudo preparar Arbol.glb', e)
          }
          resolve()
        },
        undefined,
        () => resolve(),
      )
    }),
  )

  return Promise.allSettled(tasks).then(() => {
    preloadDone = true
    if (weaponCache.size > 0) {
      for (const cb of weaponListeners.splice(0)) {
        try { cb() } catch { /* listener propio */ }
      }
    }
  })
}

// ------------------------------------------------------------
// Utilidades de geometría
// ------------------------------------------------------------

/** recolecta [geometría clonada con transform mundial horneada, material] de todas las mallas */
function collectMeshes(root: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  root.updateMatrixWorld(true)
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    const geo = o.geometry.clone()
    geo.applyMatrix4(o.matrixWorld)
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    out.push({ geo, mat })
  })
  return out
}

/** deja la geometría lista para fusionar: solo position/normal/uv, sin índice, con normales */
function normalizeForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) {
    const n = g.attributes.position.count
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }
  return g
}

/** material PBR razonable para un arma (los Sketchfab vienen metallic=1 roughness=1) */
function fixWeaponMaterial(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial
  if (std && std.isMeshStandardMaterial === true) {
    if (std.map) {
      std.map.colorSpace = THREE.SRGBColorSpace
      // metal muy alto con envMap suave apaga la textura difusa → moderarlo
      std.metalness = Math.min(std.metalness, 0.4)
      std.roughness = Math.min(Math.max(std.roughness, 0.42), 0.78)
      std.envMapIntensity = 0.85
    } else {
      // sin textura: acero pistoleño con reflejos del entorno
      std.color = new THREE.Color(0x3a3e45)
      std.metalness = 0.55
      std.roughness = 0.35
      std.envMapIntensity = 1.2
    }
    return std
  }
  // extensión no soportada → material metálico limpio
  return new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.2 })
}

/**
 * Normaliza un arma GLB con calibración FIJA:
 * - agrupa las mallas por material (cada una conserva su textura)
 * - hornea la rotación de calibración (boca → −Z, culata → +Z)
 * Devuelve las partes + longitud bruta. La escala/traslación final
 * se aplica al construir cada instancia (por arma).
 */
function buildWeaponCacheEntry(scene: THREE.Object3D, cal: WeaponCalib): WeaponCacheEntry | null {
  const meshes = collectMeshes(scene)
  if (!meshes.length) return null

  // agrupar por material y fusionar cada grupo (mismos atributos, sin índice)
  const byMat = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material }>()
  for (const m of meshes) {
    const key = m.mat.uuid
    let g = byMat.get(key)
    if (!g) { g = { geos: [], mat: m.mat }; byMat.set(key, g) }
    g.geos.push(normalizeForMerge(m.geo))
  }

  const parts: WeaponPart[] = []
  for (const g of byMat.values()) {
    const merged = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false)
    if (!merged) continue
    // horneado de la calibración (orden Z→Y→X)
    if (cal.rz) merged.rotateZ(cal.rz)
    if (cal.ry) merged.rotateY(cal.ry)
    if (cal.rx) merged.rotateX(cal.rx)
    merged.computeBoundingBox()
    parts.push({ geo: merged, mat: fixWeaponMaterial(g.mat) })
  }
  if (!parts.length) return null

  // bbox combinada
  const bb = new THREE.Box3()
  for (const p of parts) bb.union(p.geo.boundingBox!)
  const size = new THREE.Vector3()
  bb.getSize(size)
  const rawLen = Math.max(size.x, size.y, size.z)

  return { parts, rawLen, bb }
}

/** altura del punto de mira sobre el origen (convención de los modelos procedurales) */
const SIGHT_Y = 0.06

/**
 * Construye el modelo normalizado de un arma (para viewmodel y para remotos).
 * Devuelve null si el GLB aún no está listo (usar fallback procedural).
 */
export function buildGLBWeapon(id: WeaponId): { group: THREE.Group; muzzle: THREE.Object3D } | null {
  const spec = WEAPON_FILES[id]
  if (!spec) return null
  const entry = weaponCache.get(spec.file)
  if (!entry) return null

  const group = new THREE.Group()
  // escala: del tamaño bruto al objetivo en metros
  const s = spec.length / entry.rawLen
  const bb = entry.bb

  const zMin = bb.min.z * s, zMax = bb.max.z * s
  const yMin = bb.min.y * s, yMax = bb.max.y * s
  const xMin = bb.min.x * s, xMax = bb.max.x * s
  const len = zMax - zMin
  // empuñadura a fracción de la longitud desde la culata (+Z)
  const gripZ = zMax - spec.gripFrac * len
  // centrado horizontal; la línea de mira queda a SIGHT_Y (como los procedurales)
  const px = -(xMin + xMax) / 2
  const py = SIGHT_Y - yMax

  for (const p of entry.parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat)
    mesh.scale.setScalar(s)
    mesh.position.set(px, py, -gripZ)
    mesh.castShadow = true
    mesh.frustumCulled = false
    group.add(mesh)
  }

  // boca del cañón (punta) en el espacio del grupo
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, SIGHT_Y - 0.035, zMin - gripZ - 0.015)
  group.add(muzzle)
  return { group, muzzle }
}

// ------------------------------------------------------------
// Árbol: fusionar por material para instanciar después
// ------------------------------------------------------------

/**
 * Genera un canal alfa a partir del brillo (keying de fondo blanco).
 * La textura de hojas viene exportada OPACA con fondo blanco: los píxeles
 * casi blancos se vuelven transparentes y el resto se mantiene opaco.
 */
function keyOutWhite(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as CanvasImageSource | undefined
  const w = (img as { width?: number })?.width ?? 0
  const h = (img as { height?: number })?.height ?? 0
  if (!img || !w || !h) return tex
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return tex   // imagen contaminada (CORS) → dejar como está
  }
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const mn = Math.min(px[i], px[i + 1], px[i + 2])
    px[i + 3] = Math.max(0, Math.min(255, (238 - mn) * 2.1))
  }
  ctx.putImageData(data, 0, 0)
  const out = new THREE.CanvasTexture(c)
  out.colorSpace = THREE.SRGBColorSpace
  out.wrapS = out.wrapT = THREE.RepeatWrapping
  out.anisotropy = tex.anisotropy || 4
  out.flipY = false   // CanvasTexture ya viene orientada como la original
  return out
}

function buildTreeTemplate(scene: THREE.Object3D): TreeTemplate | null {
  const meshes = collectMeshes(scene)
  if (!meshes.length) return null
  // agrupar por material (nombre) y fusionar cada grupo
  const byMat = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material }>()
  for (const m of meshes) {
    const key = m.mat.name || m.mat.uuid
    let g = byMat.get(key)
    if (!g) { g = { geos: [], mat: m.mat }; byMat.set(key, g) }
    g.geos.push(normalizeForMerge(m.geo))
  }
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  for (const g of byMat.values()) {
    const merged = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false)
    if (!merged) continue
    const name = g.mat.name || ''
    if (/leaf/i.test(name)) {
      // textura de hojas SIN canal alfa (exportada opaca) → recortar el
      // fondo blanco generando alfa por luminancia (keying).
      // Material BÁSICO: el shader PBR (env) + alphaTest + doble cara puede
      // colgar los rasterizadores por software; básico es simple y estable.
      const stdMat = g.mat as THREE.MeshStandardMaterial
      if (stdMat.map) stdMat.map = keyOutWhite(stdMat.map)
      const basic = new THREE.MeshBasicMaterial({
        map: stdMat.map ?? null,
        color: 0xd8e2c0,
        side: THREE.DoubleSide,
        alphaTest: 0.45,
        fog: true,
      })
      parts.push({ geo: merged, mat: basic })
    } else if (/grass|groundcover|wood_mix/i.test(name)) {
      // cobertura del suelo: básico oscurecido, doble cara
      const basic = new THREE.MeshBasicMaterial({
        map: (g.mat as THREE.MeshStandardMaterial).map ?? null,
        color: 0x93a37c,
        side: THREE.DoubleSide,
        fog: true,
      })
      parts.push({ geo: merged, mat: basic })
    } else {
      // tronco y demás: PBR estándar (funciona en todos los lados)
      parts.push({ geo: merged, mat: fixWeaponMaterial(g.mat) })
    }
  }
  if (!parts.length) return null
  // altura bruta (para escalar al objetivo)
  let minY = Infinity, maxY = -Infinity
  for (const p of parts) {
    p.geo.computeBoundingBox()
    const bb = p.geo.boundingBox!
    minY = Math.min(minY, bb.min.y)
    maxY = Math.max(maxY, bb.max.y)
  }
  // bajar la plantilla para que la base quede en y=0
  for (const p of parts) p.geo.translate(0, -minY, 0)
  return { parts, rawHeight: maxY - minY }
}
