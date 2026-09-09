// ============================================================
// FRONTERA CERO — Assets del usuario (GLB + texturas)
// Armas reales (Pistola/Smg/Rifle/sniper.glb), árbol (Arbol.glb)
// y texturas (Pared/Piso/Cielo.jpg) subidos al repositorio.
// Normalización automática: escala, orientación (cañón → -Z) y
// punto de empuñadura en el origen. Fallback: modelos procedurales.
// ============================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { WeaponId } from './shared'

// ------------------------------------------------------------
// Especificaciones de las armas GLB (subidas por el usuario)
// ------------------------------------------------------------
interface WeaponFileSpec {
  file: string
  /** longitud objetivo del arma completa en metros (culata→boca) */
  length: number
  /** fracción de la longitud desde la culata donde está la empuñadura */
  gripFrac: number
}

/** Por arma: qué archivo GLB usar. breacher/knife siguen siendo procedurales. */
const WEAPON_FILES: Partial<Record<WeaponId, WeaponFileSpec>> = {
  p9:      { file: 'Pistola.glb', length: 0.24, gripFrac: 0.16 },
  aguila:  { file: 'Pistola.glb', length: 0.30, gripFrac: 0.16 },
  mp9:     { file: 'Smg.glb',     length: 0.55, gripFrac: 0.28 },
  ar47:    { file: 'Rifle.glb',   length: 0.97, gripFrac: 0.33 },
  cr4:     { file: 'Rifle.glb',   length: 0.90, gripFrac: 0.30 },
  awp338:  { file: 'sniper.glb',  length: 1.22, gripFrac: 0.30 },
}

/** geometrías fusionadas por archivo + materiales ya preparados */
interface WeaponCacheEntry {
  /** geometría fusionada (todas las mallas, transformada al espacio local del arma SIN escalar) */
  geo: THREE.BufferGeometry
  /** material (uno solo tras fusionar; los GLB de armas usan 1-2 materiales) */
  mat: THREE.Material
  /** longitud de la bbox en el eje del cañón, en unidades del modelo */
  rawLen: number
  /** rotación ya horneada en la geometría: eje largo alineado a Z con la boca en -Z */
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
    loadTex('/textures/Pared.jpg', null).then(t => { repoTextures.pared = t }),
    loadTex('/textures/Piso.jpg', null).then(t => { repoTextures.piso = t }),
    loadTex('/textures/Cielo.jpg', null).then(t => { repoTextures.cielo = t }),
  )

  // ---- armas (una entrada por archivo distinto) ----
  const files = [...new Set(Object.values(WEAPON_FILES).map(w => w.file))]
  for (const file of files) {
    tasks.push(
      new Promise<void>(resolve => {
        loader.load(
          `/models/${file}`,
          gltf => {
            try {
              const entry = buildWeaponCacheEntry(gltf.scene)
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
        '/models/Arbol.glb',
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
    // normalizar atributos para poder fusionar
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name)
    }
    if (!geo.attributes.normal) geo.computeVertexNormals()
    if (!geo.attributes.uv) {
      const n = geo.attributes.position.count
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    }
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    out.push({ geo, mat })
  })
  return out
}

/** Perfil de grosor a lo largo de un eje: devuelve el grosor medio por tercio (inicio/centro/fin) */
function axisThicknessProfile(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z'): [number, number, number] {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const step = Math.max(1, Math.floor(n / 4000))
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const bi = axis === 'x' ? 1 : 0
  const ci = axis === 'z' ? 1 : 2
  let min = Infinity, max = -Infinity
  for (let i = 0; i < n; i += step) {
    const v = pos.array as Float32Array
    const a = v[i * 3 + ai]
    if (a < min) min = a
    if (a > max) max = a
  }
  const span = Math.max(0.001, max - min)
  const third: number[][] = [[], [], []]
  for (let i = 0; i < n; i += step) {
    const v = pos.array as Float32Array
    const a = v[i * 3 + ai]
    const b = v[i * 3 + bi]
    const c = v[i * 3 + ci]
    const t = Math.min(0.999, Math.max(0, (a - min) / span))
    third[Math.floor(t * 3)].push(Math.hypot(b, c))
  }
  return third.map(arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)) as [number, number, number]
}

/**
 * Normaliza un arma GLB: fusiona mallas, orienta el cañón hacia -Z y
 * devuelve la geometría + material. La escala/traslación final se aplica
 * al construir cada instancia (por arma).
 */
function buildWeaponCacheEntry(scene: THREE.Object3D): WeaponCacheEntry | null {
  const meshes = collectMeshes(scene)
  if (!meshes.length) return null

  // fusionar todo en una geometría (los GLB de armas comparten material o son pocos)
  const firstMat = meshes[0].mat
  const geo = mergeGeometries(meshes.map(m => m.geo), false)!

  // bbox completa
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const size = new THREE.Vector3()
  bb.getSize(size)
  // eje largo
  const axis: 'x' | 'y' | 'z' = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z'
  const rawLen = Math.max(size.x, size.y, size.z)

  // perfil de grosor para localizar la boca (extremo estrecho)
  const prof = axisThicknessProfile(geo, axis)

  // rotación que alinea el eje largo con Z
  let rotY = 0
  if (axis === 'x') rotY = Math.PI / 2   // +X → +Z
  else if (axis === 'y') rotY = 0        // (no esperado; se endereza con rotX abajo)

  // aplicar rotación Y provisional y volver a medir
  if (rotY !== 0) {
    geo.rotateY(rotY)
    geo.computeBoundingBox()
  }

  // ¿dónde quedó la boca? muestrear de nuevo sobre Z
  const profZ = axisThicknessProfile(geo, 'z')
  const muzzleAtMinusZ = profZ[0] < profZ[2]
  if (!muzzleAtMinusZ) {
    geo.rotateY(Math.PI)   // boca → -Z (culata → +Z)
  }

  if (axis === 'y') {
    // arma tumbada: levantarla (rotX -π/2 lleva +Y→ -Z)
    geo.rotateX(-Math.PI / 2)
  }

  // material: asegurar PBR razonable (algunos vienen muy brillantes/opacos)
  let mat = firstMat
  const std = mat as THREE.MeshStandardMaterial
  if (std && (std as THREE.MeshStandardMaterial).isMeshStandardMaterial !== undefined) {
    if (std.metalness > 0.9) std.metalness = 0.85
    if (std.roughness < 0.15) std.roughness = 0.35
    // GLB sin textura (p.ej. KHR_materials_pbrSpecularGlossiness): acero
    // pistoleño con reflejos del entorno para que no parezca un bloque pálido
    if (!std.map) {
      std.color = new THREE.Color(0x3a3e45)
      std.metalness = 0.82
      std.roughness = 0.32
      std.envMapIntensity = 1.25
    }
  } else {
    // extensión no soportada → material metálico limpio
    mat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.32, metalness: 0.82, envMapIntensity: 1.25 })
  }

  geo.computeBoundingBox()
  return { geo, mat, rawLen }
}

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
  const mesh = new THREE.Mesh(entry.geo, entry.mat)
  // escala: del tamaño bruto al objetivo en metros
  const s = spec.length / entry.rawLen
  mesh.scale.setScalar(s)

  // alinear: la geometría ya tiene la boca en -Z. Recolocar para que la
  // EMPUÑADURA quede en el origen del grupo (culata hacia +Z).
  const bb = entry.geo.boundingBox!.clone()
  const zMin = bb.min.z * s, zMax = bb.max.z * s
  const yMin = bb.min.y * s, yMax = bb.max.y * s
  const xMin = bb.min.x * s, xMax = bb.max.x * s
  const len = zMax - zMin
  const gripZ = zMax - spec.gripFrac * len
  mesh.position.set(-(xMin + xMax) / 2, -(yMin + yMax) / 2, -gripZ)

  mesh.castShadow = true
  mesh.frustumCulled = false
  group.add(mesh)

  // boca del cañón (punta) en el espacio del grupo
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, (yMax - yMin) * 0.12, zMin - gripZ)
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
    g.geos.push(m.geo)
  }
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  for (const g of byMat.values()) {
    const merged = mergeGeometries(g.geos, false)
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
      parts.push({ geo: merged, mat: g.mat })
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
