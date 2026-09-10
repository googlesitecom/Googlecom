// ============================================================
// FRONTERA CERO — Mapa del MODO HISTORIA «ISLA GALLO»
// Base militar costera. Progresión lineal de sur a norte:
// playa de desembarco → muelle de contenedores → depósito de
// combustible (oeste) / patio de comunicaciones (este) →
// búnker de mando → helipuerto de extracción.
// Totalmente distinto al mapa PvP: tema industrial/portuario.
// ============================================================
import type { MatKey, MapBox, AABB, PickupSpot, NeonSpec, PuddleSpec, ExplosiveBarrel, ZiplineSpec, JumpPadSpec, DomZoneSpec, StoryTargetSpec } from './shared'
import { boxToAABB, segmentBlocked } from './shared'
import type { MapData } from './map-types'

const MAP: MapBox[] = []
function B(x: number, y: number, z: number, w: number, h: number, d: number, mat: MatKey): void {
  MAP.push({ x, y, z, w, h, d, mat })
}

const ROT = { N: 0, E: Math.PI / 2, S: Math.PI, W: Math.PI * 1.5 } as const
type Facing = keyof typeof ROT

function BR(cx: number, cz: number, f: Facing, lx: number, ly: number, lz: number, w: number, h: number, d: number, mat: MatKey): void {
  const ang = ROT[f]
  const c = Math.cos(ang), s = Math.sin(ang)
  const rx = lx * c - lz * s
  const rz = lx * s + lz * c
  const swap = Math.abs(s) > 0.5
  B(cx + rx, ly, cz + rz, swap ? d : w, h, swap ? w : d, mat)
}

interface WallOpts {
  H?: number; T?: number; y0?: number
  door?: number; doorHalf?: number; doorH?: number
  wins?: number[]; winW?: number; bandLo?: number; bandHi?: number
}

function wallL(cx: number, cz: number, f: Facing, axis: 'x' | 'z', at: number, from: number, to: number, mat: MatKey, opts: WallOpts): void {
  const H = opts.H ?? 3.3
  const T = opts.T ?? 0.35
  const y0 = opts.y0 ?? 0
  const bandLo = y0 + (opts.bandLo ?? 1.45)
  const bandHi = y0 + (opts.bandHi ?? 2.25)
  const winW = opts.winW ?? 1.3
  const lo = Math.min(from, to), hi = Math.max(from, to)
  const put = (c: number, len: number, ya: number, yb: number) => {
    if (len <= 0.06 || yb - ya <= 0.06) return
    const cy = (ya + yb) / 2
    if (axis === 'z') BR(cx, cz, f, c, cy, at, len, yb - ya, T, mat)
    else BR(cx, cz, f, at, cy, c, T, yb - ya, len, mat)
  }
  let solids: [number, number][] = [[lo, hi]]
  if (opts.door !== undefined) {
    const dh = opts.doorHalf ?? 1.05
    const doorH = y0 + (opts.doorH ?? 2.15)
    const dLo = opts.door - dh, dHi = opts.door + dh
    solids = []
    if (dLo - lo > 0.05) solids.push([lo, dLo])
    if (hi - dHi > 0.05) solids.push([dHi, hi])
    put(opts.door, dh * 2, doorH, y0 + H)
  }
  for (const [a, b] of solids) {
    put((a + b) / 2, b - a, y0, bandLo)
    put((a + b) / 2, b - a, bandHi, y0 + H)
    const gaps: [number, number][] = []
    for (const w of opts.wins ?? []) {
      const g0 = w - winW / 2, g1 = w + winW / 2
      if (g0 > a + 0.3 && g1 < b - 0.3) gaps.push([g0, g1])
    }
    gaps.sort((p, q) => p[0] - q[0])
    let cur = a
    for (const [g0, g1] of gaps) { put((cur + g0) / 2, g0 - cur, bandLo, bandHi); cur = g1 }
    put((cur + b) / 2, b - cur, bandLo, bandHi)
  }
}

const WP_EXTRA: [number, number][] = []
function wpTransform(cx: number, cz: number, f: Facing, lx: number, lz: number): [number, number] {
  const ang = ROT[f], c = Math.cos(ang), s = Math.sin(ang)
  return [cx + lx * c - lz * s, cz + lx * s + lz * c]
}

function stairsBR(cx: number, cz: number, f: Facing, xAt: number, zAt: number, dx: number, dz: number, steps: number, riseStep: number, runStep: number, wStair: number, y0 = 0, mat: MatKey = 'concrete'): void {
  for (let i = 0; i < steps; i++) {
    const rise = riseStep * (i + 1)
    const sx = xAt + dx * runStep * i
    const sz = zAt + dz * runStep * i
    BR(cx, cz, f, sx, y0 + rise / 2, sz, dx !== 0 ? runStep + 0.04 : wStair, rise, dz !== 0 ? runStep + 0.04 : wStair, mat)
  }
}

// ------------------------------------------------------------
// NAVE PORTUARIA (almacén del muelle)
// ------------------------------------------------------------
function navePortuaria(cx: number, cz: number, f: Facing): void {
  const XW = 8, ZW = 6, H = 5
  const T = 0.6, G = 2.6
  wallL(cx, cz, f, 'z', -ZW, -XW, XW, 'metalBlue', { H, T, door: 0, doorHalf: G, doorH: 3.6 })
  wallL(cx, cz, f, 'z', +ZW, -XW, XW, 'metalBlue', { H, T, wins: [-XW * 0.55, 0, XW * 0.55], bandLo: 1.6, bandHi: 3.0 })
  for (const sx of [-1, 1]) {
    wallL(cx, cz, f, 'x', sx * XW, -ZW, ZW, 'metalBlue', { H, T, door: 0, doorHalf: 1.2, doorH: 3.2, wins: [-ZW * 0.5, ZW * 0.5], bandLo: 1.6, bandHi: 3.0 })
  }
  BR(cx, cz, f, 0, H + 0.15, 0, XW * 2 + 1.2, 0.3, ZW * 2 + 1.2, 'roof')
  BR(cx, cz, f, -XW * 0.45, 1.3, -ZW * 0.3, 2.2, 2.4, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, XW * 0.45, 1.3, -ZW * 0.3, 2.2, 2.4, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, 0, 0.45, ZW * 0.5, 0.7, 0.9, 0.7, 'barrel')
  BR(cx, cz, f, 0, 0.225, -ZW - 1.4, 6, 0.45, 2, 'concrete')
  stairsBR(cx, cz, f, -XW - 1.0, ZW + 1.2, 0, -1, 10, 0.5, 0.62, 1.3, 0)
  BR(cx, cz, f, 0, H + 0.45, -ZW - 0.15, XW * 2 + 1.2, 0.4, 0.28, 'concrete')
  BR(cx, cz, f, 0, H + 0.45, +ZW + 0.15, XW * 2 + 1.2, 0.4, 0.28, 'concrete')
  BR(cx, cz, f, +XW + 0.15, H + 0.45, 0, 0.28, 0.4, ZW * 2 + 1.2, 'concrete')
  BR(cx, cz, f, -XW - 0.15, H + 0.45, 2.5, 0.28, 0.4, 5, 'concrete')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -ZW - 3.4),
    wpTransform(cx, cz, f, 0, 0),
    wpTransform(cx, cz, f, 0, 4),
  )
}

// ------------------------------------------------------------
// BÚNKER DE MANDO — 22×16, hormigón macizo, techo accesible
// ------------------------------------------------------------
function bunker(cx: number, cz: number): void {
  const HW = 11, HD = 8, H = 4.2, T = 0.8
  // fachada sur (hacia el jugador): puerta doble — cara NORTE del mundo
  wallL(cx, cz, 'N', 'z', +HD, -HW, HW, 'concrete', { H, T, door: 0, doorHalf: 1.6, doorH: 2.8, wins: [-7, 7], winW: 1.0 })
  // fachada norte (fondo): ventanas de tronera
  wallL(cx, cz, 'N', 'z', -HD, -HW, HW, 'concrete', { H, T, wins: [-7, -3.5, 0, 3.5, 7], winW: 0.9, bandLo: 1.7, bandHi: 2.4 })
  // laterales: puerta este + ventanas
  wallL(cx, cz, 'N', 'x', +HW, -HD, HD, 'concrete', { H, T, door: 3, doorHalf: 1.2, doorH: 2.6, wins: [-4, 0, 4], winW: 0.9 })
  wallL(cx, cz, 'N', 'x', -HW, -HD, HD, 'concrete', { H, T, wins: [-4, 0, 4], winW: 0.9 })
  // pilares interiores
  for (const [px, pz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]] as [number, number][]) {
    B(cx + px, H / 2, cz + pz, 0.8, H, 0.8, 'concrete')
  }
  // armerías y cajas del interior
  B(cx - 8, 1.0, cz + 5.5, 3.6, 2.0, 0.9, 'metalGreen')
  B(cx + 8, 1.0, cz - 5.5, 3.6, 2.0, 0.9, 'metalGreen')
  B(cx + 2, 0.6, cz - 4, 1.4, 1.2, 1.4, 'crate')
  B(cx + 2, 1.8, cz - 4, 1.4, 1.2, 1.4, 'crate')
  B(cx - 3, 0.6, cz + 2, 1.4, 1.2, 1.4, 'crate')
  B(cx + 7.5, 0.45, cz, 1.0, 0.9, 2.6, 'wood')
  // mesa de mando (desplazada para no pisar el waypoint central)
  B(cx - 3.5, 0.55, cz, 4.4, 1.1, 1.6, 'wood')
  // techo + pretil
  B(cx, H + 0.2, cz, HW * 2 + 1.6, 0.4, HD * 2 + 1.6, 'roof')
  const py = H + 0.65
  B(cx, py, cz - HD - 0.2, HW * 2 + 1.6, 0.5, 0.3, 'concrete')
  B(cx, py, cz + HD + 0.2, HW * 2 + 1.6, 0.5, 0.3, 'concrete')
  B(cx + HW + 0.2, py, cz - 4.5, 0.3, 0.5, 6.6, 'concrete')
  B(cx + HW + 0.2, py, cz + 4.5, 0.3, 0.5, 6.6, 'concrete')
  B(cx - HW - 0.2, py, cz, 0.3, 0.5, HD * 2 + 1.6, 'concrete')
  // escalera exterior al techo (fachada oeste, sube hacia +z)
  stairsBR(cx, cz, 'N', -HW - 1.6, -HD - 2.5, 0, 1, 9, 0.48, 0.85, 1.4, 0)
  // torreta antiaérea decorativa en el techo
  B(cx - 3, H + 0.9, cz - 2, 1.6, 1.0, 1.6, 'metalGrey')
  B(cx - 3, H + 1.7, cz - 2, 0.4, 0.8, 0.4, 'metalGrey')
  B(cx - 3.9, H + 1.7, cz - 2, 1.9, 0.22, 0.22, 'metalOrange')
  B(cx - 2.1, H + 1.7, cz - 2, 1.9, 0.22, 0.22, 'metalOrange')
  WP_EXTRA.push(
    [cx, cz + HD + 3.5],
    [cx, cz],
    [cx - 7.5, cz],
    [cx + 6, cz],
    [cx + HW + 3, cz],
  )
}

/** Torre de vigilancia */
function watchTower(cx: number, cz: number, stairsFrom: number): void {
  B(cx, 1.6, cz, 2.0, 3.2, 2.0, 'concrete')
  B(cx, 3.5, cz, 4.4, 0.3, 4.4, 'concrete')
  B(cx, 3.9, cz - 2.1, 4.4, 0.55, 0.3, 'metalOrange')
  B(cx, 3.9, cz + 2.1, 4.4, 0.55, 0.3, 'metalOrange')
  B(cx - 2.1, 3.9, cz, 0.3, 0.55, 4.4, 'metalOrange')
  B(cx + 2.1, 3.9, cz, 0.3, 0.55, 4.4, 'metalOrange')
  for (let i = 0; i < 7; i++) {
    const h = 0.5 * (i + 1)
    const z = cz + stairsFrom * (6.0 - i * 0.62)
    B(cx, h / 2 - 0.02, z, 1.6, h, 0.62, 'concrete')
  }
}

/** Barracón militar */
function barracks(cx: number, cz: number, f: Facing): void {
  const HW = 4.0, HD = 2.7, H = 2.9, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'metalGreen', { ...o, door: 0, doorHalf: 1.0, doorH: 2.05, wins: [-2.5, 2.5] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'metalGreen', { ...o, wins: [-1.8, 1.8] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'metalGreen', { ...o, wins: [0] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'metalGreen', { ...o, wins: [0] })
  BR(cx, cz, f, 2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, -2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.7, 0.3, HD * 2 + 0.7, 'roof')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -4.3),
    wpTransform(cx, cz, f, 0, 0),
  )
}

/** Estación de radar del patio de comunicaciones */
function radarStation(cx: number, cz: number, f: Facing): void {
  const W = 12, D = 10, H = 2.6, T = 0.5
  wallL(cx, cz, f, 'z', -D, -W, W, 'concrete', { H, T })
  wallL(cx, cz, f, 'z', +D, -W, W, 'concrete', { H, T })
  wallL(cx, cz, f, 'x', -W, -D, D, 'concrete', { H, T })
  wallL(cx, cz, f, 'x', +W, -D, D, 'concrete', { H, T, door: 0, doorHalf: 1.3, doorH: 2.2 })
  BR(cx, cz, f, -5, 1.5, -4, 3, 3, 3, 'concrete')
  BR(cx, cz, f, -5, 3.2, -4, 4, 0.4, 4, 'metalOrange')
  BR(cx, cz, f, -5, 4.2, -4, 0.4, 1.6, 0.4, 'metalGrey')
  barracks(cx, cz, f)
  BR(cx, cz, f, 4, 0.7, 4, 1.4, 1.4, 1.4, 'crate')
  for (const z of [-7, 7]) BR(cx, cz, f, W - 3, 0.4, z, 3, 0.8, 0.6, 'sandbag')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, W + 4, 0),
    wpTransform(cx, cz, f, W - 2, 0),
    wpTransform(cx, cz, f, 6, 6),
  )
}

// ============================================================
// CONSTRUCCIÓN DEL MAPA DE HISTORIA
// ============================================================
export function buildStoryMap(): MapData {
  MAP.length = 0
  WP_EXTRA.length = 0

  // --- Perímetro 120×120 ---
  B(0, 2.5, -60.5, 122, 5, 1.5, 'concrete')
  B(0, 2.5, 60.5, 122, 5, 1.5, 'concrete')
  B(-60.5, 2.5, 0, 1.5, 5, 122, 'concrete')
  B(60.5, 2.5, 0, 1.5, 5, 122, 'concrete')
  for (const v of [-52, -36, -20, -4, 4, 20, 36, 52]) {
    B(v, 2.8, -60.5, 2.2, 5.6, 2.2, 'metalGrey')
    B(v, 2.8, 60.5, 2.2, 5.6, 2.2, 'metalGrey')
  }

  // ===== SUR: PLAYA DE DESEMBARCO (z 40..58) =====
  // barcaza varada
  B(5, 0.9, 53, 3.4, 1.8, 7.5, 'wood')
  B(5, 1.85, 54.5, 2.4, 0.7, 4, 'wood')
  B(3.2, 1.4, 49.5, 1.2, 1.2, 1.2, 'crate')
  B(7.4, 0.5, 48.5, 2.2, 0.8, 0.6, 'sandbag')
  // rocas de la orilla
  B(-12, 1.0, 54, 3.4, 2.0, 2.6, 'concrete')
  B(12, 1.2, 56, 3.0, 2.4, 3.0, 'concrete')
  B(-20, 0.7, 57, 2.4, 1.4, 2.0, 'concrete')
  B(20, 0.8, 56.5, 2.2, 1.6, 2.2, 'concrete')
  // cajas y sacos del punto de partida
  B(-5, 0.6, 49, 1.2, 1.2, 1.2, 'crate')
  B(-6.4, 0.6, 49.4, 1.2, 1.2, 1.2, 'crate')
  B(-8, 0.5, 46, 2.6, 0.8, 0.6, 'sandbag')

  // ===== ZONA MEDIA-SUR: MUELLE DE CONTENEDORES (z 12..38) =====
  {
    const rows: [number, number, MatKey][] = [
      [-14, 30, 'metalRed'], [-6.5, 30, 'metalBlue'], [1, 30, 'metalGreen'],
      [-14, 22, 'metalBlue'], [-6.5, 22, 'metalOrange'],
    ]
    for (const [x, z, m] of rows) {
      B(x, 1.2, z, 6, 2.4, 2.5, m)
    }
    B(-6.5, 3.6, 30, 6, 2.4, 2.5, 'metalGrey')   // apilado
    B(-14, 3.6, 22, 6, 2.4, 2.5, 'metalGreen')   // apilado
    WP_EXTRA.push([-10, 26], [-3, 26], [-20, 30])
  }
  // grúa portuaria
  B(-24, 9, 28, 2.2, 18, 2.2, 'metalGrey')
  B(-24, 17.6, 28, 12, 0.8, 0.8, 'metalOrange')
  B(-24, 17.6, 22, 0.8, 0.8, 0.8, 'metalOrange')
  B(-24, 16.4, 24.5, 0.25, 2.5, 0.25, 'metalGrey')
  B(-27, 0.5, 33, 2.2, 0.8, 0.6, 'sandbag')
  B(-21, 0.5, 33, 2.2, 0.8, 0.6, 'sandbag')
  // nave portuaria (almacén del muelle)
  navePortuaria(22, 28, 'W')
  // montacargas y cajas sueltas
  B(10, 0.8, 20, 1.4, 1.6, 2.2, 'metalOrange')
  B(-2, 0.6, 36, 1.4, 1.2, 1.4, 'crate')
  B(12, 0.6, 35, 1.4, 1.2, 1.4, 'crate')
  B(12, 1.8, 35, 1.4, 1.2, 1.4, 'crate')
  B(4, 0.5, 14, 2.6, 0.8, 0.6, 'sandbag')

  // ===== OESTE: DEPÓSITO DE COMBUSTIBLE (x -52..-12, z -12..6) =====
  B(-34, 3, -4, 5, 6, 5, 'metalGrey')
  B(-28, 3, -2, 5, 6, 5, 'metalGrey')
  B(-40, 3, -7, 5, 6, 5, 'metalGrey')
  B(-34, 6.4, -4.5, 10, 0.5, 0.5, 'metalOrange')
  B(-31, 6.4, -1.5, 0.5, 0.5, 5, 'metalOrange')
  B(-37, 1.0, 4, 24, 0.5, 0.5, 'metalOrange')
  WP_EXTRA.push([-34, 3], [-44, 6], [-48, -4])
  // vallas del depósito (con hueco de acceso en z −3…3)
  B(-16, 0.9, -7.5, 0.3, 1.8, 9, 'metalGrey')
  B(-16, 0.9, 4.5, 0.3, 1.8, 3, 'metalGrey')
  // generadores (objetivos de la fase 2) — colisión + visual en el motor
  B(-48, 0.8, -8, 1.4, 1.6, 1.4, 'metalGrey')
  B(-42, 0.8, 2, 1.4, 1.6, 1.4, 'metalGrey')
  B(-26, 0.8, -10, 1.4, 1.6, 1.4, 'metalGrey')

  // ===== ESTE: PATIO DE COMUNICACIONES (x 14..52, z -20..6) =====
  radarStation(32, -8, 'W')
  // mástiles de antena
  B(46, 4.5, -12, 0.5, 9, 0.5, 'metalGrey')
  B(46, 4.5, -4, 0.5, 9, 0.5, 'metalGrey')
  B(46, 8.2, -8, 3.2, 0.35, 0.35, 'metalOrange')
  B(46, 6.6, -8, 2.2, 0.35, 0.35, 'metalOrange')
  B(42.5, 0.5, -5.5, 2.6, 0.8, 0.6, 'sandbag')
  B(49.5, 0.5, -8, 2.6, 0.8, 0.6, 'sandbag')
  // barracón de guardia
  barracks(22, 12, 'S')
  B(16, 0.5, -2, 2.6, 0.8, 0.6, 'sandbag')
  B(28, 0.5, 4, 2.6, 0.8, 0.6, 'sandbag')
  // patio de defensa (fase 3): sacos alrededor de (30, -16)
  B(26, 0.45, -14, 2.0, 0.8, 0.55, 'sandbag')
  B(34, 0.45, -14, 2.0, 0.8, 0.55, 'sandbag')
  B(25, 0.45, -18, 2.0, 0.8, 0.55, 'sandbag')
  B(35, 0.45, -18, 2.0, 0.8, 0.55, 'sandbag')
  B(30, 0.45, -13.2, 2.0, 0.8, 0.55, 'sandbag')
  B(30, 0.45, -21.5, 2.0, 0.8, 0.55, 'sandbag')

  // ===== NORTE-CENTRO: BÚNKER DE MANDO (z -22..-44) =====
  bunker(0, -32)
  watchTower(-14, -42, 1)
  watchTower(14, -42, -1)
  // acceso con sacos y cajas a la entrada (cara norte, hacia el jugador)
  B(-6, 0.5, -20, 2.6, 0.8, 0.6, 'sandbag')
  B(6, 0.5, -20, 2.6, 0.8, 0.6, 'sandbag')
  B(-9, 0.6, -28, 1.4, 1.2, 1.4, 'crate')
  B(9, 0.6, -28, 1.4, 1.2, 1.4, 'crate')

  // ===== NORTE: HELIPUERTO DE EXTRACCIÓN (z -46..-58) =====
  B(0, 0.12, -52, 16, 0.24, 16, 'concrete')
  // marca H
  B(-3.5, 0.28, -52, 1.0, 0.12, 7, 'metalOrange')
  B(3.5, 0.28, -52, 1.0, 0.12, 7, 'metalOrange')
  B(0, 0.28, -52, 6, 0.12, 1.0, 'metalOrange')
  // balizas luminosas
  for (const [x, z] of [[-7, -46], [7, -46], [-7, -58], [7, -58]] as [number, number][]) {
    B(x, 0.75, z, 0.4, 1.5, 0.4, 'metalOrange')
  }
  // anillo de sacos del helipuerto (laterales; N y S abiertos para el camino)
  for (const [bx, bz] of [
    [10.5, -52], [7.4, -46.9], [-7.4, -46.9], [-10.5, -52], [-7.4, -57.15], [7.4, -57.15],
  ] as [number, number][]) {
    B(bx, 0.45, bz, 2.2, 0.8, 0.55, 'sandbag')
  }

  // --- árboles (palmeras del modelo del usuario) ---
  const trees: [number, number][] = [
    [-8, 44], [10, 46], [-16, 40], [16, 42], [-24, 36], [26, 40],
    [-52, 20], [52, 16], [-52, -20], [52, -24], [24, -50], [-24, -52],
    [-46, 34], [46, 40],
  ]
  for (const [tx, tz] of trees) B(tx, 2.1, tz, 0.5, 4.2, 0.5, 'wood')

  // --- farolas ---
  const lamps: [number, number][] = [
    [6, 40], [-6, 32], [6, 16], [-6, 4], [6, -12], [-6, -22], [6, -30], [-6, -38],
    [-20, 28], [24, 32], [30, -8], [-34, -6], [3, -46],
  ]
  for (const [lx, lz] of lamps) B(lx, 2.6, lz, 0.35, 5.2, 0.35, 'metalGrey')

  // --- barriles explosivos ---
  const barrels: ExplosiveBarrel[] = [
    { x: -31, z: -1 }, { x: -37, z: -6.5 }, { x: -28.5, z: -6 },
    { x: -9, z: 27 }, { x: -2.5, z: 31.5 },
    { x: 30, z: -12 }, { x: 36, z: -3 },
    { x: -8, z: -28 }, { x: 8, z: -36 },
    { x: -11, z: 34 }, { x: 11, z: 34.8 },
  ]
  for (const eb of barrels) B(eb.x, 0.5, eb.z, 0.74, 1.0, 0.74, 'explosive')

  // --- tirolinas ---
  const ziplines: ZiplineSpec[] = [
    { from: [-24, 17.0, 28], to: [-4, 2.5, 36] },      // grúa → muelle
    { from: [36, 4.4, -8], to: [8, 2.5, -24] },        // radar → acceso al búnker
  ]

  // --- plataformas de salto ---
  const jumpPads: JumpPadSpec[] = [
    { x: -13, z: -32 },   // costado del búnker (salto al techo)
    { x: 14, z: 26 },     // muelle → contenedores apilados
  ]

  const neons: NeonSpec[] = [
    { text: 'MUELLE 7', x: 22, y: 3.2, z: 35.5, ry: Math.PI, color: '#22d3ee', w: 4 },
    { text: 'COMBUSTIBLE', x: -16.4, y: 2.6, z: -3, ry: Math.PI / 2, color: '#f87171', w: 5 },
    { text: 'COMUNICACIONES', x: 20.4, y: 2.2, z: -8, ry: -Math.PI / 2, color: '#4ade80', w: 6 },
    { text: 'MANDO', x: 0, y: 3.4, z: -23.6, ry: 0, color: '#fbbf24', w: 4 },
    { text: 'EXTRACCIÓN', x: 0, y: 2.2, z: -44.4, ry: 0, color: '#f472b6', w: 5 },
  ]

  const puddles: PuddleSpec[] = [
    { x: 8, z: 24, r: 1.6 }, { x: -8, z: 18, r: 1.4 },
    { x: -20, z: 8, r: 1.8 }, { x: 20, z: 2, r: 1.5 },
    { x: -12, z: -18, r: 1.4 }, { x: 10, z: -26, r: 1.6 },
    { x: -22, z: -36, r: 1.5 }, { x: 22, z: -40, r: 1.4 },
  ]

  const pickupSpots: PickupSpot[] = [
    { kind: 'bandage', x: 0, z: 44 },
    { kind: 'medkit', x: -12, z: 26 },
    { kind: 'medkit', x: 22, z: 28 },
    { kind: 'shieldSmall', x: -24, z: 30 },
    { kind: 'shieldSmall', x: -34, z: 3 },
    { kind: 'medkit', x: 30, z: -18 },
    { kind: 'shieldSmall', x: 46, z: -6 },
    { kind: 'medkit', x: 0, z: -14 },
    { kind: 'shieldBig', x: 4, z: -30 },
    { kind: 'medkit', x: 0, z: -52 },
    { kind: 'bandage', x: -10, z: -34 },
    { kind: 'shieldSmall', x: 10, z: -18 },
  ]

  // --- waypoints (columna vertebral + ramas) ---
  const waypoints: [number, number][] = [
    // columna vertebral de la carretera (x=±3)
    [0, 50], [3, 42], [-3, 34], [3, 26], [-3, 18], [0, 10], [3, 2], [-3, -6],
    [0, -14], [3, -21], [0, -28], [-3, -36], [0, -42], [0, -48],
    // muelle
    [-20, 26], [-10, 26], [-3, 26], [10, 24], [16, 30], [-20, 36], [30, 26],
    // depósito (rodeando los tanques)
    [-14, -2], [-20, -2], [-24, -7], [-25, -4], [-33, -12], [-36, 0], [-44, 6], [-48, -4], [-50, -10],
    // comunicaciones
    [12, -2], [22, 6], [24, -2], [12, 16], [16, -20], [30, -16], [32, -18], [32, -23], [44, -24], [28, -8], [38, -8], [46, -8], [46, -6], [43, -14],
    // búnker
    [0, -21], [-9, -22], [9, -22], [-14, -34], [14, -34],
    // helipuerto
    [0, -46], [8, -50], [-8, -50], [0, -56],
    // playa
    [-12, 48], [12, 50], [-14, 50], [14, 52],
    ...WP_EXTRA,
  ]

  const aabbs: AABB[] = MAP.map(boxToAABB)

  const waypointEdges: number[][] = waypoints.map(() => [])
  {
    const MAXD = 20
    for (let i = 0; i < waypoints.length; i++) {
      for (let j = i + 1; j < waypoints.length; j++) {
        const dx = waypoints[i][0] - waypoints[j][0]
        const dz = waypoints[i][1] - waypoints[j][1]
        const dist = Math.hypot(dx, dz)
        if (dist > MAXD) continue
        if (!segmentBlocked(waypoints[i][0], 0.5, waypoints[i][1], waypoints[j][0], 0.5, waypoints[j][1], aabbs)) {
          waypointEdges[i].push(j)
          waypointEdges[j].push(i)
        }
      }
    }
  }

  return {
    kind: 'historia',
    name: 'ISLA GALLO',
    mapHalf: 60,
    boxes: MAP.slice(),
    aabbs,
    streets: {
      planes: [
        [0, 0, 8, 108],          // carretera principal N-S
        [0, 10, 104, 8],         // carretera del muelle
        [0, -16, 104, 6],        // carretera del búnker
        [-30, 28, 24, 6],        // ramal a la grúa
        [32, -4, 6, 30],         // ramal a comunicaciones
      ],
      walks: [
        [5.6, 0, 1.2, 100], [-5.6, 0, 1.2, 100],
        [0, 14.8, 96, 1.2], [0, 5.2, 96, 1.2],
      ],
      plaza: { cx: 0, cz: -52, w: 18, d: 18 },
      dashXs: [],
      dashZs: [...(function* () { for (let v = -48; v <= 48; v += 5) yield v })()],
    },
    waypoints,
    waypointEdges,
    trees,
    lamps,
    neons,
    puddles,
    barrels,
    ziplines,
    jumpPads,
    flagA: undefined,
    flagB: undefined,
    domZones: undefined,
    pickupSpots,
    spawnA: [-1, 0, 49],
    spawnB: [3, 0, 6],
    mood: 'ocaso-norte',
    storyTargets: [
      { id: 'gen1', x: -48, z: -8 },
      { id: 'gen2', x: -42, z: 2 },
      { id: 'gen3', x: -26, z: -10 },
    ],
  }
}
