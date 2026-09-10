// ============================================================
// FRONTERA CERO — Mapa PvP v5 «CIUDADELA MERIDIANO»
// Rediseño ordenado: plaza central + NÚCLEO (fortaleza de 2
// plantas con torre-faro), 4 distritos temáticos, red de
// tirolinas desde el centro y cobertura regular en avenidas.
// Usa las texturas del usuario (Pared/Piso/Cielo.jpg) y las
// procedurales propias.
// ============================================================
import type { MatKey, MapBox, AABB, PickupSpot, NeonSpec, PuddleSpec, ExplosiveBarrel, ZiplineSpec, JumpPadSpec, DomZoneSpec } from './shared'
import { boxToAABB, segmentBlocked } from './shared'
import type { MapData } from './map-types'

// ------------------------------------------------------------
// Constructores base (cajas con UVs uniformes)
// ------------------------------------------------------------
const MAP: MapBox[] = []
function B(x: number, y: number, z: number, w: number, h: number, d: number, mat: MatKey): void {
  MAP.push({ x, y, z, w, h, d, mat })
}

const ROT = { N: 0, E: Math.PI / 2, S: Math.PI, W: Math.PI * 1.5 } as const
type Facing = keyof typeof ROT

/** Caja en coordenadas locales del edificio, girada según `f` */
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

/**
 * Muro de edificio en coords. locales. `axis 'z'`: corre a lo largo de x en z=at;
 * `axis 'x'`: corre a lo largo de z en x=at. Puerta = hueco a toda altura con dintel;
 * ventanas = banda practiable (se puede disparar a través) entre zócalo y franja superior.
 */
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

/** Escalera recta de peldaños crecientes con altura inicial y0. */
function stairsBR(cx: number, cz: number, f: Facing, xAt: number, zAt: number, dx: number, dz: number, steps: number, riseStep: number, runStep: number, wStair: number, y0 = 0, mat: MatKey = 'concrete'): void {
  for (let i = 0; i < steps; i++) {
    const rise = riseStep * (i + 1)
    const sx = xAt + dx * runStep * i
    const sz = zAt + dz * runStep * i
    BR(cx, cz, f, sx, y0 + rise / 2, sz, dx !== 0 ? runStep + 0.04 : wStair, rise, dz !== 0 ? runStep + 0.04 : wStair, mat)
  }
}

// ------------------------------------------------------------
// NÚCLEO CENTRAL — fortaleza de 2 plantas con torre-faro.
// 4 puertas, paseo interior en la 2.ª planta, 2 escaleras
// interiores al paseo y 2 escaleras exteriores a la azotea.
// ------------------------------------------------------------
function nucleo(): void {
  const HW = 8, HD = 8, T = 0.55
  const H1 = 3.4, F2 = 3.7, H2 = 2.8, ROOF = 7.0
  const G = 1.15
  // ---- planta baja: 4 fachadas con puerta ----
  wallL(0, 0, 'N', 'z', -HD, -HW, HW, 'concrete', { H: H1, T, door: 0, doorHalf: G, doorH: 2.6, wins: [-5, -2.5, 2.5, 5], winW: 1.1 })
  wallL(0, 0, 'N', 'z', +HD, -HW, HW, 'concrete', { H: H1, T, door: 0, doorHalf: G, doorH: 2.6, wins: [-5, -2.5, 2.5, 5], winW: 1.1 })
  wallL(0, 0, 'N', 'x', +HW, -HD, HD, 'concrete', { H: H1, T, door: 0, doorHalf: G, doorH: 2.6, wins: [-5, -2.5, 2.5, 5], winW: 1.1 })
  wallL(0, 0, 'N', 'x', -HW, -HD, HD, 'concrete', { H: H1, T, door: 0, doorHalf: G, doorH: 2.6, wins: [-5, -2.5, 2.5, 5], winW: 1.1 })
  // ---- 2.ª planta: muros con ventanas ----
  wallL(0, 0, 'N', 'z', -HD, -HW, HW, 'concrete', { H: H2, T, y0: F2 + 0.3, wins: [-5, -2.5, 0, 2.5, 5], winW: 1.2, bandLo: 1.2, bandHi: 2.0 })
  wallL(0, 0, 'N', 'z', +HD, -HW, HW, 'concrete', { H: H2, T, y0: F2 + 0.3, wins: [-5, -2.5, 0, 2.5, 5], winW: 1.2, bandLo: 1.2, bandHi: 2.0 })
  wallL(0, 0, 'N', 'x', +HW, -HD, HD, 'concrete', { H: H2, T, y0: F2 + 0.3, wins: [-5, -2.5, 0, 2.5, 5], winW: 1.2, bandLo: 1.2, bandHi: 2.0 })
  wallL(0, 0, 'N', 'x', -HW, -HD, HD, 'concrete', { H: H2, T, y0: F2 + 0.3, wins: [-5, -2.5, 0, 2.5, 5], winW: 1.2, bandLo: 1.2, bandHi: 2.0 })
  // ---- forjado del paseo (anillo 5 m, hueco central 6×6) ----
  BR(0, 0, 'N', 0, F2 + 0.15, -5.5, HW * 2 + 0.4, 0.3, 5, 'concrete')     // N
  BR(0, 0, 'N', 0, F2 + 0.15, 5.5, HW * 2 + 0.4, 0.3, 5, 'concrete')      // S
  BR(0, 0, 'N', -5.5, F2 + 0.15, 0, 5, 0.3, 6, 'concrete')                // O
  BR(0, 0, 'N', 5.5, F2 + 0.15, 0, 5, 0.3, 6, 'concrete')                 // E
  // barandillas del paseo (huecos donde desembarcan las escaleras)
  BR(0, 0, 'N', -4.9, F2 + 0.55, -3.02, 7.4, 0.7, 0.2, 'metalGrey')       // N oeste
  BR(0, 0, 'N', 4.7, F2 + 0.55, -3.02, 7.8, 0.7, 0.2, 'metalGrey')        // N este
  BR(0, 0, 'N', 4.9, F2 + 0.55, 3.02, 7.4, 0.7, 0.2, 'metalGrey')         // S este
  BR(0, 0, 'N', -4.7, F2 + 0.55, 3.02, 7.8, 0.7, 0.2, 'metalGrey')        // S oeste
  BR(0, 0, 'N', -3.02, F2 + 0.55, 0, 0.2, 0.7, 6, 'metalGrey')            // O
  BR(0, 0, 'N', 3.02, F2 + 0.55, 0, 0.2, 0.7, 6, 'metalGrey')             // E
  // ---- escaleras interiores del patio al paseo (N y S) ----
  stairsBR(0, 0, 'N', 2.0, -2.0, 0, -1, 8, 0.5, 0.5, 1.4, 0)
  stairsBR(0, 0, 'N', -2.0, 2.0, 0, 1, 8, 0.5, 0.5, 1.4, 0)
  // ---- escaleras exteriores a la azotea (fachadas E y O) ----
  stairsBR(0, 0, 'N', 9.3, 6.2, 0, -1, 14, 0.5, 0.62, 1.3, 0)
  stairsBR(0, 0, 'N', -9.3, -6.2, 0, 1, 14, 0.5, 0.62, 1.3, 0)
  // ---- azotea + pretil (huecos donde llegan las escaleras) ----
  BR(0, 0, 'N', 0, ROOF, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  BR(0, 0, 'N', 0, ROOF + 0.4, -8.3, HW * 2 + 0.8, 0.5, 0.26, 'concrete')
  BR(0, 0, 'N', 0, ROOF + 0.4, 8.3, HW * 2 + 0.8, 0.5, 0.26, 'concrete')
  BR(0, 0, 'N', -8.3, ROOF + 0.4, 3.6, 0.26, 0.5, 9.2, 'concrete')        // O sur
  BR(0, 0, 'N', -8.3, ROOF + 0.4, -5.5, 0.26, 0.5, 5.4, 'concrete')       // O norte (hueco z −2.8…−1.4)
  BR(0, 0, 'N', 8.3, ROOF + 0.4, 3.6, 0.26, 0.5, 9.2, 'concrete')         // E sur
  BR(0, 0, 'N', 8.3, ROOF + 0.4, -5.5, 0.26, 0.5, 5.4, 'concrete')        // E norte
  // ---- torre-faro central (atraviesa el hueco del paseo) ----
  B(0, 4.5, 0, 3.0, 9, 3.0, 'concrete')
  B(0, 9.6, 0, 1.8, 1.2, 1.8, 'metalOrange')
  B(0, 10.6, 0, 0.9, 0.8, 0.9, 'metalGrey')
  // ---- patio: pilares, cajas y sacos ----
  B(0, 1.7, -5, 0.7, 3.4, 0.7, 'concrete')
  B(0, 1.7, 5, 0.7, 3.4, 0.7, 'concrete')
  B(3.2, 0.6, -3.2, 1.2, 1.2, 1.2, 'crate')
  B(-3.2, 0.6, 3.2, 1.2, 1.2, 1.2, 'crate')
  B(-3.2, 1.8, 3.2, 1.2, 1.2, 1.2, 'crate')
  B(4.5, 0.4, 4.5, 2.2, 0.8, 0.6, 'sandbag')
  B(-4.5, 0.4, -4.5, 2.2, 0.8, 0.6, 'sandbag')
  WP_EXTRA.push(
    [2.3, 0], [-2.3, 0], [0, 2.3], [0, -2.3],
    [0, -11], [0, 11], [11, 0], [-11, 0],
  )
}

// ------------------------------------------------------------
// HOTEL — 18×14, 3 plantas + azotea
// ------------------------------------------------------------
function hotel(cx: number, cz: number, f: Facing): void {
  const HW = 9, HD = 7, H1 = 3.0, H2 = 2.8, T = 0.4
  const F2 = 3.3, F3 = 6.6, ROOF = 9.55
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H1, T, door: 0, doorHalf: 1.7, doorH: 2.4, wins: [-6, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H1, T, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H1, T, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H1, T, wins: [-3.5, 0, 3.5] })
  BR(cx, cz, f, 0, 1.5, -3, 0.7, 3.0, 0.7, 'concrete')
  BR(cx, cz, f, 0, 1.5, 2, 0.7, 3.0, 0.7, 'concrete')
  BR(cx, cz, f, -4.5, 0.55, -4.5, 3.4, 1.1, 0.9, 'wood')
  BR(cx, cz, f, -6, 0.4, 1.5, 2.0, 0.8, 0.9, 'sandbag')
  BR(cx, cz, f, -3.2, 0.45, 1.5, 1.2, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -7.6, 0.9, -1, 0.7, 1.8, 1.6, 'wood')
  stairsBR(cx, cz, f, 6.9, 6.4, 0, -1, 10, 0.3, 0.55, 2.8, 0)
  stairsBR(cx, cz, f, 6.9, 6.4, 0, -1, 10, 0.3, 0.55, 2.8, F2)
  BR(cx, cz, f, -2.1, 3.15, 0, 14.2, 0.3, 14, 'concrete')
  BR(cx, cz, f, 7, 3.15, -3.85, 4, 0.3, 6.3, 'concrete')
  BR(cx, cz, f, 6.9, 3.15, -0.15, 2.8, 0.3, 1.1, 'concrete')
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H2, T, y0: F2, wins: [-6, 0, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H2, T, y0: F2, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H2, T, y0: F2, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H2, T, y0: F2, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'z', 1.5, -HW + T, 4.7, 'sand', { H: H2, T: 0.3, y0: F2, door: -2, doorHalf: 0.8, doorH: 2.05 })
  BR(cx, cz, f, -6, F2 + 0.4, -4, 1.8, 0.8, 0.9, 'sandbag')
  BR(cx, cz, f, -6, F2 + 0.45, 0, 1.2, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -2.1, F3 + 0.15 - 0.3, 0, 14.2, 0.3, 14, 'concrete')
  BR(cx, cz, f, 7, F3 - 0.15, -3.85, 4, 0.3, 6.3, 'concrete')
  BR(cx, cz, f, 6.9, F3 - 0.15, -0.15, 2.8, 0.3, 1.1, 'concrete')
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-6, 0, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-3.5, 0, 3.5] })
  BR(cx, cz, f, -6, F3 + 0.7, 4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, 0, ROOF, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  const py = ROOF + 0.475
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, -6.5, 0.22, 0.35, 1.1, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, 4.5, 0.22, 0.35, 5.1, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 0, 0.22, 0.35, HD * 2 + 0.8, 'concrete')
  BR(cx, cz, f, -4, ROOF + 0.75, -4, 1.6, 1.1, 1.3, 'metalGrey')
  BR(cx, cz, f, -6.5, ROOF + 0.6, 3, 1.1, 0.8, 1.1, 'metalGrey')
  stairsBR(cx, cz, f, 10.1, 7.2, 0, -1, 19, 0.5, 0.62, 1.4)
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -8.6),
    wpTransform(cx, cz, f, 0, -1),
    wpTransform(cx, cz, f, -4, 3),
    wpTransform(cx, cz, f, 3, -2),
  )
}

// ------------------------------------------------------------
// TORRE ÁMBAR — 14×14, 4 plantas + azotea con mirador
// ------------------------------------------------------------
function torreOficina(cx: number, cz: number, f: Facing): void {
  const HW = 7, HD = 7, HF = 2.8, T = 0.4
  const F = [0, 3.1, 6.2, 9.3]
  const ROOF = 12.25
  for (let p = 0; p < 4; p++) {
    const y0 = F[p]
    if (p === 0) {
      wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: HF, T, y0, door: 0, doorHalf: 1.3, doorH: 2.3, wins: [-4.5, 4.5] })
    } else {
      wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: HF, T, y0, wins: [-4.5, 0, 4.5] })
    }
    wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: HF, T, y0, wins: [-4.5, 0, 4.5] })
    wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: HF, T, y0, wins: [-4, 0, 4] })
    wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: HF, T, y0, wins: [-4, 0, 4] })
  }
  for (let p = 1; p < 4; p++) {
    wallL(cx, cz, f, 'z', 1.5, -HW + T, 4.2, 'sand', { H: HF, T: 0.25, y0: F[p], door: -1, doorHalf: 0.8, doorH: 2.05 })
  }
  BR(cx, cz, f, -4.5, 0.45, -4.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.5, 3.55, 3.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.5, 6.65, -3.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, 3, 0.45, 5, 1.3, 0.9, 0.9, 'wood')
  for (let p = 0; p < 4; p++) {
    stairsBR(cx, cz, f, 5.6, 6.4, 0, -1, 10, 0.28, 0.55, 2.4, F[p])
  }
  for (let p = 1; p < 4; p++) {
    BR(cx, cz, f, -1.6, F[p] - 0.15, 0, 11.2, 0.3, 14, 'concrete')
    BR(cx, cz, f, 6.2, F[p] - 0.15, -3.85, 2.6, 0.3, 6.3, 'concrete')
    BR(cx, cz, f, 5.6, F[p] - 0.15, -0.15, 2.4, 0.3, 1.1, 'concrete')
  }
  BR(cx, cz, f, -1.6, ROOF, 0, 11.2, 0.3, 14, 'roof')
  BR(cx, cz, f, 6.2, ROOF, -3.85, 2.6, 0.3, 6.3, 'concrete')
  BR(cx, cz, f, 5.6, ROOF, -0.15, 2.4, 0.3, 1.1, 'concrete')
  const py = ROOF + 0.55
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.7, 0.7, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.7, 0.7, 0.22, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 0, 0.22, 0.7, HD * 2 + 0.7, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, -3.5, 0.22, 0.7, 7, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, 4, 0.22, 0.7, 6, 'concrete')
  BR(cx, cz, f, -3.5, ROOF + 0.6, -4, 1.5, 1.0, 1.2, 'metalGrey')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -8.5),
    wpTransform(cx, cz, f, 0, -3),
    wpTransform(cx, cz, f, -4, 0),
    wpTransform(cx, cz, f, 3, -4),
  )
}

// ------------------------------------------------------------
// MERCADO CENTRAL — 20×20 con 4 puertas y tejado accesible
// ------------------------------------------------------------
function mercado(cx: number, cz: number, f: Facing): void {
  const MW = 10, MH = 4.6, MT = 0.6, MG = 1.7
  {
    const segW = MW - MG
    for (const sz of [-1, 1]) {
      BR(cx, cz, f, -(MG + segW / 2), MH / 2, sz * MW, segW, MH, MT, 'sand')
      BR(cx, cz, f, MG + segW / 2, MH / 2, sz * MW, segW, MH, MT, 'sand')
      BR(cx, cz, f, 0, MH - 0.5, sz * MW, MG * 2, 1, MT, 'sand')
    }
    for (const sx of [-1, 1]) {
      BR(cx, cz, f, sx * MW, MH / 2, -(MG + segW / 2), MT, MH, segW, 'sand')
      BR(cx, cz, f, sx * MW, MH / 2, (MG + segW / 2), MT, MH, segW, 'sand')
      BR(cx, cz, f, sx * MW, MH - 0.5, 0, MT, 1, MG * 2, 'sand')
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    BR(cx, cz, f, sx * 9.6, MH / 2, sz * 9.6, 1, MH, 1, 'concrete')
    BR(cx, cz, f, sx * 6, MH / 2, sz * 6, 0.7, MH, 0.7, 'concrete')
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    BR(cx, cz, f, sx * 4.2, 0.6, sz * 2, 1.2, 1.2, 1.2, 'crate')
    BR(cx, cz, f, sx * 4.2, 1.8, sz * 2, 1.2, 1.2, 1.2, 'crate')
    BR(cx, cz, f, sx * 2, 0.45, sz * 5, 0.7, 0.9, 0.7, 'barrel')
  }
  BR(cx, cz, f, 0, MH + 0.15, 0, MW * 2 + 1.4, 0.3, MW * 2 + 1.4, 'roof')
  BR(cx, cz, f, 4.4, MH + 0.45, -10.3, 11.9, 0.4, 0.3, 'concrete')
  BR(cx, cz, f, -4.4, MH + 0.45, 10.3, 11.9, 0.4, 0.3, 'concrete')
  BR(cx, cz, f, 10.3, MH + 0.45, 0, 0.3, 0.4, MW * 2 + 1.4, 'concrete')
  BR(cx, cz, f, -10.3, MH + 0.45, 0, 0.3, 0.4, MW * 2 + 1.4, 'concrete')
  stairsBR(cx, cz, f, -10.6, -12.6, 1, 0, 9, 0.5, 0.9, 1.0, 0)
  stairsBR(cx, cz, f, 10.6, 12.6, -1, 0, 9, 0.5, 0.9, 1.0, 0)
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -11),
    wpTransform(cx, cz, f, 0, 0),
    wpTransform(cx, cz, f, 0, 7),
    wpTransform(cx, cz, f, -6, 3),
    wpTransform(cx, cz, f, 6, -3),
  )
}

// ------------------------------------------------------------
// CANCHAS — pista deportiva abierta con muros bajos (CQB)
// ------------------------------------------------------------
function canchas(cx: number, cz: number): void {
  const HW = 9, HD = 6, WH = 2.4, T = 0.45
  // muros bajos con huecos de acceso (N, S, E, O)
  wallL(cx, cz, 'N', 'z', -HD, -HW, -2, 'concrete', { H: WH, T, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  wallL(cx, cz, 'N', 'z', -HD, 2, HW, 'concrete', { H: WH, T, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  wallL(cx, cz, 'N', 'z', +HD, -HW, HW, 'concrete', { H: WH, T, door: 0, doorHalf: 1.6, doorH: WH + 0.1, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  wallL(cx, cz, 'N', 'x', +HW, -HD, -2.5, 'concrete', { H: WH, T, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  wallL(cx, cz, 'N', 'x', +HW, 2.5, HD, 'concrete', { H: WH, T, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  wallL(cx, cz, 'N', 'x', -HW, -HD, HD, 'concrete', { H: WH, T, door: 0, doorHalf: 1.6, doorH: WH + 0.1, bandLo: WH + 0.1, bandHi: WH + 0.2 })
  // gradas (bloques escalonados al este y oeste)
  for (let i = 0; i < 3; i++) {
    B(cx + HW + 1.6 + i * 1.1, 0.25 + i * 0.4, cz, 1.1, 0.5 + i * 0.8, HD * 2 - 2, 'concrete')
    B(cx - HW - 1.6 - i * 1.1, 0.25 + i * 0.4, cz, 1.1, 0.5 + i * 0.8, HD * 2 - 2, 'concrete')
  }
  // canastas (poste + aro decorativo)
  B(cx, 1.9, cz - HD + 0.6, 0.35, 3.8, 0.35, 'metalGrey')
  B(cx, 3.7, cz - HD + 1.4, 1.4, 0.14, 0.14, 'metalOrange')
  B(cx, 1.9, cz + HD - 0.6, 0.35, 3.8, 0.35, 'metalGrey')
  B(cx, 3.7, cz + HD - 1.4, 1.4, 0.14, 0.14, 'metalOrange')
  // marcador
  B(cx, 2.9, cz + HD + 1.2, 2.2, 1.2, 0.3, 'metalGrey')
  WP_EXTRA.push([cx, cz - HD - 2], [cx, cz + HD + 2.6], [cx, cz])
}

// ------------------------------------------------------------
// CASAS
// ------------------------------------------------------------
function smallHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 4.5, HD = 4.0, H = 3.3, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { ...o, door: 0, doorHalf: 1.05, doorH: 2.15, wins: [-2.85, 2.85] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { ...o, wins: [-2.2, 2.2] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'z', 1.2, -HW + T, HW - T, mat, { ...o, door: 1.9, doorHalf: 0.8, doorH: 2.05 })
  BR(cx, cz, f, -2.7, 0.4, -3.1, 1.9, 0.8, 0.85, 'sandbag')
  BR(cx, cz, f, -0.6, 0.45, -2.5, 1.3, 0.9, 0.9, 'wood')
  BR(cx, cz, f, 3.9, 0.9, -1.5, 0.7, 1.8, 1.6, 'wood')
  BR(cx, cz, f, -2.6, 0.3, 2.7, 1.7, 0.6, 1.9, 'wood')
  BR(cx, cz, f, -1.1, 0.3, 3.3, 0.7, 0.6, 0.7, 'crate')
  BR(cx, cz, f, 3.6, 0.45, 3.2, 0.7, 0.9, 0.7, 'barrel')
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.7, 0.3, HD * 2 + 0.7, 'roof')
  BR(cx, cz, f, 0, H + 0.475, -HD - 0.11, HW * 2 + 0.7, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, H + 0.475, +HD + 0.11, HW * 2 + 0.7, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, -HW - 0.11, H + 0.475, 0, 0.22, 0.35, HD * 2 + 0.7, 'concrete')
  BR(cx, cz, f, +HW + 0.11, H + 0.475, 0, 0.22, 0.35, HD * 2 + 0.7, 'concrete')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -6.2),
    wpTransform(cx, cz, f, 1.9, -1.5),
    wpTransform(cx, cz, f, 1.9, 3.3),
  )
}

function bigHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 5.5, HD = 4.5, H1 = 3.2, H2 = 2.8, T = 0.4
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H1, T, door: 0, doorHalf: 1.15, doorH: 2.25, wins: [-3.6, 3.6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H1, T, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  stairsBR(cx, cz, f, 3.55, 2.7, 0, -1, 8, 0.4, 0.8, 1.4, 0)
  BR(cx, cz, f, -3.4, 0.4, -3.3, 2.1, 0.8, 0.85, 'sandbag')
  BR(cx, cz, f, -1.2, 0.45, -2.7, 1.3, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.85, 0.9, -0.5, 0.7, 1.8, 1.7, 'wood')
  BR(cx, cz, f, -4.3, 0.6, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -4.3, 1.8, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -1.5, H1 + 0.15, 0, 8.0, 0.3, HD * 2, 'concrete')
  BR(cx, cz, f, 4.0, H1 + 0.15, 3.25, 3.0, 0.3, 2.5, 'concrete')
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  BR(cx, cz, f, -4.5, H1 + 0.9, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -4.5, H1 + 2.1, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -2.0, H1 + 0.75, -3.0, 1.3, 0.9, 0.9, 'wood')
  BR(cx, cz, f, 0, H1 + 0.3 + H2 + 0.15, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  const py = H1 + 0.3 + H2 + 0.475
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, 0, 0.22, 0.35, HD * 2 + 0.8, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 1.9, 0.22, 0.35, 5.2, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, -3.5, 0.22, 0.35, 2.0, 'concrete')
  stairsBR(cx, cz, f, -6.3, 4.0, 0, -1, 14, 0.5, 0.62, 1.3, 0)
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -6.5),
    wpTransform(cx, cz, f, 0, -1),
    wpTransform(cx, cz, f, 0, 2.5),
  )
}

/** Barracón militar 8×5.4 con literas */
function barracks(cx: number, cz: number, f: Facing, mat: MatKey = 'metalGreen'): void {
  const HW = 4.0, HD = 2.7, H = 2.9, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { ...o, door: 0, doorHalf: 1.0, doorH: 2.05, wins: [-2.5, 2.5] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { ...o, wins: [-1.8, 1.8] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { ...o, wins: [0] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { ...o, wins: [0] })
  BR(cx, cz, f, 2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, -2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, -3.3, 0.9, -1.6, 0.6, 1.8, 1.0, 'metalGrey')
  BR(cx, cz, f, 2.2, 0.6, -1.5, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.7, 0.3, HD * 2 + 0.7, 'roof')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -4.3),
    wpTransform(cx, cz, f, 0, 0),
  )
}

// ------------------------------------------------------------
// ALMACÉN — grande, con puerta amplia y tejado accesible
// ------------------------------------------------------------
function almacen(cx: number, cz: number, f: Facing, XW = 11, ZW = 8, H = 6): void {
  const T = 0.6, G = 2.6
  wallL(cx, cz, f, 'z', -ZW, -XW, XW, 'metalBlue', { H, T, door: 0, doorHalf: G, doorH: 3.6 })
  wallL(cx, cz, f, 'z', +ZW, -XW, XW, 'metalBlue', { H, T, wins: [-XW * 0.55, 0, XW * 0.55], bandLo: 1.6, bandHi: 3.0 })
  for (const sx of [-1, 1]) {
    wallL(cx, cz, f, 'x', sx * XW, -ZW, ZW, 'metalBlue', { H, T, door: 0, doorHalf: 1.3, doorH: 3.2, wins: [-ZW * 0.5, ZW * 0.5], bandLo: 1.6, bandHi: 3.0 })
  }
  BR(cx, cz, f, 0, H + 0.15, 0, XW * 2 + 1.2, 0.3, ZW * 2 + 1.2, 'roof')
  BR(cx, cz, f, -XW * 0.45, 1.3, -ZW * 0.3, 2.4, 2.6, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, XW * 0.45, 1.3, -ZW * 0.3, 2.4, 2.6, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, -XW * 0.45, 1.3, 0, 1.4, 1.2, 1.4, 'crate')
  BR(cx, cz, f, -XW * 0.45, 2.6, 0, 1.4, 1.2, 1.4, 'crate')
  BR(cx, cz, f, XW * 0.3, 0.45, ZW * 0.5, 0.7, 0.9, 0.7, 'barrel')
  BR(cx, cz, f, 0, 0.225, -ZW - 1.4, 7, 0.45, 2, 'concrete')
  stairsBR(cx, cz, f, -XW - 1.0, ZW + 1.2, 0, -1, Math.ceil(H / 0.5), 0.5, 0.62, 1.3, 0)
  BR(cx, cz, f, 0, H + 0.45, -ZW - 0.15, XW * 2 + 1.2, 0.4, 0.28, 'concrete')
  BR(cx, cz, f, 0, H + 0.45, +ZW + 0.15, XW * 2 + 1.2, 0.4, 0.28, 'concrete')
  BR(cx, cz, f, +XW + 0.15, H + 0.45, 0, 0.28, 0.4, ZW * 2 + 1.2, 'concrete')
  BR(cx, cz, f, -XW - 0.15, H + 0.45, 3, 0.28, 0.4, 5, 'concrete')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -ZW - 3.4),
    wpTransform(cx, cz, f, 0, -4),
    wpTransform(cx, cz, f, 0, 0),
    wpTransform(cx, cz, f, 0, 4),
    wpTransform(cx, cz, f, XW + 2.8, 0),
  )
}

/** Tienda pequeña 7×6 con mostrador */
function shop(cx: number, cz: number, f: Facing): void {
  const HW = 3.5, HD = 3, H = 3.6, T = 0.35
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H, T, door: 1.8, doorHalf: 0.9, doorH: 2.2, wins: [-1.6, 0.6], winW: 2.0 })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H, T })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H, T, wins: [0] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H, T, wins: [0] })
  BR(cx, cz, f, 0, 0.55, 0.8, 2.6, 1.1, 0.8, 'wood')
  BR(cx, cz, f, -2.6, 0.9, 0, 0.6, 1.8, 1.5, 'wood')
  BR(cx, cz, f, 2.4, 0.45, -1.8, 1.2, 0.9, 0.9, 'crate')
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.5, 0.3, HD * 2 + 0.5, 'roof')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 1.8, -4.6),
    wpTransform(cx, cz, f, 0, 0),
  )
}

function gasStation(cx: number, cz: number, f: Facing): void {
  const KW = 5, KD = 4, KH = 3.2, T = 0.4
  wallL(cx, cz, f, 'z', -KD, -KW, KW, 'sand', { H: KH, T, wins: [-2.5, 2.5] })
  wallL(cx, cz, f, 'z', +KD, -KW, KW, 'sand', { H: KH, T, wins: [-2.5, 0, 2.5] })
  wallL(cx, cz, f, 'x', +KW, -KD, KD, 'sand', { H: KH, T, door: 0, doorHalf: 0.95, doorH: 2.2, wins: [-1.5, 1.5] })
  wallL(cx, cz, f, 'x', -KW, -KD, KD, 'sand', { H: KH, T })
  BR(cx, cz, f, 0, 3.75, 0, KW * 2 + 0.8, 0.3, KD * 2 + 0.8, 'roof')
  BR(cx, cz, f, 2.2, 0.55, 0, 1.2, 1.1, 3, 'crate')
  BR(cx, cz, f, -3, 0.6, -2.5, 3, 1.2, 0.9, 'crate')
  BR(cx, cz, f, -3, 0.6, 2.5, 3, 1.2, 0.9, 'crate')
  BR(cx, cz, f, 8.5, 0.225, 0, 8, 0.45, 10, 'concrete')
  BR(cx, cz, f, 8.5, 4.4, 0, 12, 0.5, 12, 'roof')
  for (const [px, pz] of [[6.2, -2.5], [6.2, 2.5], [10.8, -2.5], [10.8, 2.5]] as [number, number][]) {
    BR(cx, cz, f, px, 2.1, pz, 0.5, 4.2, 0.5, 'concrete')
  }
  BR(cx, cz, f, 7.2, 0.6, 0, 1.2, 1.2, 1.2, 'metalRed')
  BR(cx, cz, f, 9.8, 0.6, 0, 1.2, 1.2, 1.2, 'metalRed')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, 6),
    wpTransform(cx, cz, f, 8.5, 6),
    wpTransform(cx, cz, f, 8.5, -6),
  )
}

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
  BR(cx, cz, f, 4, 0.6, -4, 1.2, 1.2, 1.2, 'crate')
  for (const z of [-7, 7]) BR(cx, cz, f, W - 3, 0.4, z, 3, 0.8, 0.6, 'sandbag')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, W + 4, 0),
    wpTransform(cx, cz, f, W - 2, 0),
    wpTransform(cx, cz, f, 6, 6),
    wpTransform(cx, cz, f, -8, 6),
  )
}

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

function kiosco(cx: number, cz: number): void {
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as [number, number][]) {
    B(cx + x, 1.5, cz + z, 0.3, 3.0, 0.3, 'wood')
  }
  B(cx, 3.2, cz, 5.4, 0.3, 5.4, 'roof')
  B(cx, 0.45, cz, 2.0, 0.9, 1.2, 'wood')
}

function fountain(cx: number, cz: number): void {
  B(cx, 0.35, cz, 3.4, 0.7, 3.4, 'concrete')
  B(cx, 0.95, cz, 1.1, 1.5, 1.1, 'concrete')
}

function tankPlant(cx: number, cz: number): void {
  B(cx - 6, 3, cz, 5, 6, 5, 'metalGrey')
  B(cx, 3, cz + 1, 5, 6, 5, 'metalGrey')
  B(cx - 3, 3, cz - 6, 5, 6, 5, 'metalGrey')
  B(cx - 3, 6.4, cz - 2, 9, 0.5, 0.5, 'metalOrange')
  B(cx - 2, 6.4, cz + 3, 0.5, 0.5, 5, 'metalOrange')
  WP_EXTRA.push([cx, cz + 5])
}

function car(x: number, z: number, alongX: boolean, mat: MatKey = 'metalBlue'): void {
  if (alongX) {
    B(x, 0.55, z, 4.2, 1.1, 1.9, mat)
    B(x, 1.15, z, 2.1, 0.75, 1.7, 'metalGrey')
  } else {
    B(x, 0.55, z, 1.9, 1.1, 4.2, mat)
    B(x, 1.15, z, 1.7, 0.75, 2.1, 'metalGrey')
  }
}

function bus(x: number, z: number, alongX: boolean): void {
  if (alongX) {
    B(x, 1.3, z, 2.4, 2.6, 6.5, 'metalBlue')
    B(x, 1.05, z, 2.2, 2.1, 1.3, 'metalBlue')
  } else {
    B(x, 1.3, z, 6.5, 2.6, 2.4, 'metalBlue')
    B(x, 1.05, z, 1.3, 2.1, 2.2, 'metalBlue')
  }
}

// ============================================================
// CONSTRUCCIÓN DEL MAPA v5
// ============================================================
export function buildPvpMap(): MapData {
  // reiniciar (idempotente: se puede reconstruir al volver al menú)
  MAP.length = 0
  WP_EXTRA.length = 0

  // --- Perímetro 140×140 ---
  B(0, 3.25, -70.5, 142, 6.5, 1.5, 'sand')
  B(0, 3.25, 70.5, 142, 6.5, 1.5, 'sand')
  B(-70.5, 3.25, 0, 1.5, 6.5, 142, 'sand')
  B(70.5, 3.25, 0, 1.5, 6.5, 142, 'sand')
  for (const v of [-64, -48, -32, -16, 0, 16, 32, 48, 64]) {
    B(v, 3.6, -70.5, 2.4, 7.2, 2.4, 'concrete')
    B(v, 3.6, 70.5, 2.4, 7.2, 2.4, 'concrete')
    B(-70.5, 3.6, v, 2.4, 7.2, 2.4, 'concrete')
    B(70.5, 3.6, v, 2.4, 7.2, 2.4, 'concrete')
  }

  // --- Centro: NÚCLEO ---
  nucleo()

  // === NE: distrito cívico ===
  hotel(20, -20, 'S')
  torreOficina(52, -22, 'S')
  shop(44, -57, 'N')
  shop(56, -57, 'N')
  car(48, -44, true, 'metalRed')
  car(56, -44, true, 'metalGrey')
  B(50, 0.55, -49, 3, 1.1, 0.5, 'concrete')
  B(44, 0.55, -49, 3, 1.1, 0.5, 'concrete')

  // canchas deportivas (donde estaba el mercado)
  canchas(20, -52)

  // === NO: distrito industrial ===
  almacen(-19.5, -19.5, 'N', 11, 8, 6)
  almacen(-51, -19.5, 'E', 9, 7, 5.5)
  {
    const row1: MatKey[] = ['metalRed', 'metalBlue', 'metalGreen']
    const row2: MatKey[] = ['metalBlue', 'metalOrange', 'metalRed']
    const xs = [-25, -17.5, -10]
    for (let i = 0; i < 3; i++) {
      B(xs[i], 1.2, -45, 6, 2.4, 2.5, row1[i])
      B(xs[i], 1.2, -57, 6, 2.4, 2.5, row2[i])
    }
    B(-17.5, 3.6, -57, 6, 2.4, 2.5, 'metalGrey')
    WP_EXTRA.push([-19, -51], [-11, -51], [-26, -51])
    B(-19, 0.4, -49.5, 3, 0.8, 0.6, 'sandbag')
    B(-19, 0.55, -62.5, 3, 1.1, 0.5, 'concrete')
  }
  watchTower(-11, -61, 1)
  tankPlant(-51, -51)

  // === SE: residencial + mercado + parque ===
  mercado(20, 20.5, 'N')
  smallHouse(46, 13.5, 'N')
  smallHouse(46, 26, 'E')
  bigHouse(16, 50, 'W')
  fountain(52, 46)
  kiosco(44, 58)
  B(46, 0.45, 52, 1.8, 0.28, 0.6, 'wood')
  B(56, 0.45, 52, 1.8, 0.28, 0.6, 'wood')
  B(48, 0.45, 62, 0.6, 0.28, 1.8, 'wood')

  // === SO: gasolinera + radar + residencial ===
  gasStation(-51, 19.5, 'E')
  radarStation(-51, 51, 'E')
  smallHouse(-14, 45, 'N')
  smallHouse(-14, 57.5, 'N')
  car(-20, 15, true, 'metalRed')
  car(-25, 24, true, 'metalGrey')
  B(-14, 0.4, 20, 3, 0.8, 0.6, 'sandbag')

  // === Vehículos en las avenidas (fuera de la plaza) ===
  bus(26, 2.5, true)
  bus(-26, -2.5, true)
  car(32, -2.2, true, 'metalRed')
  car(48, 2.2, true, 'metalGrey')
  car(-32, 2.2, true, 'metalRed')
  car(-48, -2.2, true, 'metalGrey')
  car(2.2, -26, false, 'metalRed')
  car(-2.2, -32, false, 'metalGrey')
  car(2.2, 26, false, 'metalRed')
  car(-2.2, 32, false, 'metalGrey')
  car(2.2, -48, false, 'metalRed')
  car(-2.2, 48, false, 'metalGrey')
  // barreras regulares de avenida
  for (const bx of [40, 54]) { B(bx, 0.55, 6.9, 3, 1.1, 0.5, 'concrete'); B(-bx, 0.55, -6.9, 3, 1.1, 0.5, 'concrete') }

  // === Bases de banderas (CTF) ===
  B(-58, 0.15, 0, 3.5, 0.3, 3.5, 'concrete')
  B(-58, 1.8, 0, 0.18, 3.6, 0.18, 'metalGrey')
  B(58, 0.15, 0, 3.5, 0.3, 3.5, 'concrete')
  B(58, 1.8, 0, 0.18, 3.6, 0.18, 'metalGrey')

  // === Cajas cerca de spawns ===
  B(-66, 0.6, -54, 1.2, 1.2, 1.2, 'crate')
  B(-54, 0.6, -66, 1.2, 1.2, 1.2, 'crate')
  B(-60, 0.4, -58, 3, 0.8, 0.6, 'sandbag')
  B(66, 0.6, 54, 1.2, 1.2, 1.2, 'crate')
  B(54, 0.6, 66, 1.2, 1.2, 1.2, 'crate')
  B(60, 0.4, 58, 3, 0.8, 0.6, 'sandbag')

  const trees: [number, number][] = [
    [43, 43], [58, 41], [40, 56], [58, 58], [50, 64], [62, 50], [44, 48],
    [28, 12], [28, 30], [60, 25], [58, 9], [28, 45], [28, 56], [6, 8], [30, 26],
    [-28, 45], [-28, 58], [-27, 50], [-8, 39], [-28, 28],
    [-30, -48], [-7, -33], [-30, -31], [-60, -31],
    [40, -40], [60, -40], [38, -30],
    [64, 20], [-64, -20], [20, -64], [-20, 64], [64, -30], [-64, 30],
  ]
  for (const [tx, tz] of trees) B(tx, 2.1, tz, 0.5, 4.2, 0.5, 'wood')

  const lamps: [number, number][] = [
    [16, 0], [-16, 0], [0, 16], [0, -16],
    [24, 7], [-24, 7], [48, -7], [-48, -7],
    [7, 24], [-7, 24], [7, -48], [-7, -48], [7, 48], [-7, 48],
    [31, 31], [-31, 31], [31, -31], [-31, -31],
    [50, 40], [54, -42],
  ]
  for (const [lx, lz] of lamps) B(lx, 2.6, lz, 0.35, 5.2, 0.35, 'metalGrey')

  const barrels: ExplosiveBarrel[] = [
    { x: 11, z: 11 }, { x: -11, z: 11 }, { x: 11, z: -11 }, { x: -11, z: -11 },
    { x: -44.2, z: 14.5 }, { x: -45.8, z: 25 },
    { x: -24, z: -14 }, { x: -14, z: -24 },
    { x: 8.5, z: 16 }, { x: 31.5, z: 16 },
    { x: -22, z: -51 }, { x: -13, z: -62.5 },
    { x: 54, z: -48 }, { x: 58, z: 44 },
    { x: -51, z: -43.5 }, { x: -37, z: 47 },
    { x: 28, z: -48 },
  ]
  for (const eb of barrels) B(eb.x, 0.5, eb.z, 0.74, 1.0, 0.74, 'explosive')

  const ziplines: ZiplineSpec[] = [
    { from: [18, 10.2, -14], to: [7, 7.5, 5] },        // tejado del hotel → azotea del Núcleo
    { from: [50, 12.7, -22], to: [8, 7.6, 6] },        // azotea de la torre → Núcleo
    { from: [-7, 7.3, 7], to: [16, 5.5, 21] },         // Núcleo → tejado del mercado
    { from: [-19.5, 6.3, -19.5], to: [-49, 4.5, -46] },// tejado del almacén → planta de tanques
    { from: [16, 7.1, 50], to: [48, 3.0, 46] },        // tejado casa grande → fuente del parque
    { from: [52, 12.7, -25], to: [22, 3.4, -50] },     // torre → canchas
  ]

  const jumpPads: JumpPadSpec[] = [
    { x: 14, z: 14 }, { x: -14, z: 14 }, { x: 14, z: -14 }, { x: -14, z: -14 },
    { x: -22, z: -39 },
    { x: 56, z: -49 },
    { x: 44, z: 44 },
  ]

  const neons: NeonSpec[] = [
    { text: 'NÚCLEO', x: 0, y: 4.6, z: -8.9, ry: 0, color: '#fbbf24', w: 4 },
    { text: 'HOTEL', x: 20, y: 4.2, z: -12.4, ry: 0, color: '#f472b6', w: 4.5 },
    { text: 'TORRE ÁMBAR', x: 52, y: 5.2, z: -14.8, ry: 0, color: '#fbbf24', w: 5.5 },
    { text: 'MERCADO', x: 20, y: 3.8, z: 10.1, ry: Math.PI, color: '#22d3ee', w: 5 },
    { text: 'TIENDAS', x: 50, y: 2.8, z: -53.9, ry: Math.PI, color: '#4ade80', w: 4 },
    { text: 'GAS', x: -42.2, y: 4.0, z: 19.5, ry: Math.PI / 2, color: '#f87171', w: 3 },
    { text: 'RADAR', x: -38.8, y: 2.1, z: 51, ry: Math.PI / 2, color: '#4ade80', w: 4.5 },
    { text: 'ALMACÉN', x: -19.5, y: 3.4, z: -27.6, ry: Math.PI, color: '#fbbf24', w: 4.5 },
    { text: 'DEPÓSITO', x: -19, y: 3.2, z: -38.6, ry: 0, color: '#fbbf24', w: 4.5 },
    { text: 'CANCHAS', x: 20, y: 3.6, z: -44.6, ry: 0, color: '#f472b6', w: 4 },
  ]

  const puddles: PuddleSpec[] = [
    { x: 14, z: 8, r: 1.6 }, { x: -14, z: -8, r: 1.4 },
    { x: 26, z: -9, r: 1.8 }, { x: -26, z: 9, r: 1.5 },
    { x: 9, z: -26, r: 1.4 }, { x: -9, z: 26, r: 1.6 },
    { x: 44, z: 3, r: 1.5 }, { x: -44, z: -3, r: 1.4 },
    { x: 40, z: -40, r: 1.6 }, { x: -40, z: 40, r: 1.4 },
  ]

  const pickupSpots: PickupSpot[] = [
    { kind: 'medkit', x: 12, z: 0 },
    { kind: 'shieldSmall', x: 0, z: -12 },
    { kind: 'shieldBig', x: 20, z: 20.5 },
    { kind: 'medkit', x: 20, z: -20 },
    { kind: 'bandage', x: 20, z: -52 },
    { kind: 'shieldSmall', x: 52, z: -22 },
    { kind: 'shieldBig', x: 49, z: 42 },
    { kind: 'medkit', x: 44, z: 54 },
    { kind: 'shieldSmall', x: -19.5, z: -19.5 },
    { kind: 'bandage', x: -17.5, z: -51 },
    { kind: 'medkit', x: -51, z: 19.5 },
    { kind: 'shieldSmall', x: -51, z: 51 },
    { kind: 'shieldBig', x: 16, z: 50 },
    { kind: 'bandage', x: -45, z: -47 },
    { kind: 'medkit', x: 48, z: 0 },
    { kind: 'medkit', x: -48, z: 0 },
  ]

  // --- waypoints ---
  const waypoints: [number, number][] = [
    // anillo de la plaza r=13.5
    [13.5, 0], [9.5, 9.5], [0, 13.5], [-9.5, 9.5], [-13.5, 0], [-9.5, -9.5], [0, -13.5], [9.5, -9.5],
    // esquinas de la plaza (plataformas de salto)
    [17, 17], [-17, 17], [17, -17], [-17, -17],
    // avenida E-O (z=±5)
    [22, 5], [31, 5], [40, 5], [49, 5], [58, 5], [-22, 5], [-31, 5], [-40, 5], [-49, 5], [-58, 5],
    [22, -5], [31, -5], [40, -5], [49, -5], [58, -5], [-22, -5], [-31, -5], [-40, -5], [-49, -5], [-58, -5],
    // avenida N-S (x=±5)
    [5, 22], [5, 31], [5, 40], [5, 49], [5, 58], [5, -22], [5, -31], [5, -40], [5, -49], [5, -58],
    [-5, 22], [-5, 31], [-5, 40], [-5, 49], [-5, 58], [-5, -22], [-5, -31], [-5, -40], [-5, -49], [-5, -58],
    // calles secundarias N-S (x=±35)
    [35, 12], [35, 24], [35, 42], [35, 54], [35, -12], [35, -24], [35, -42], [35, -54],
    [-35, 12], [-35, 24], [-35, 42], [-35, 54], [-35, -12], [-35, -24], [-35, -42], [-35, -54],
    // calles secundarias E-O (z=±35)
    [12, 35], [24, 35], [42, 35], [54, 35], [12, -35], [24, -35], [42, -35], [54, -35],
    [-12, 35], [-24, 35], [-42, 35], [-54, 35], [-12, -35], [-24, -35], [-42, -35], [-54, -35],
    // anillo perímetro r62
    [-62, -62], [-44, -62], [-22, -62], [22, -62], [44, -62], [62, -62],
    [62, -44], [62, -22], [62, 22], [62, 44], [62, 62],
    [44, 66], [22, 62], [-22, 62], [-44, 66], [-62, 62],
    [-62, 44], [-62, 22], [-62, -22], [-62, -44],
    // anillo intermedio r48
    [0, -48], [26, -38], [40, 21], [48, 0], [40, 28], [24, 42], [0, 48], [-24, 42], [-40, 24], [-48, 0], [-42, -24], [-24, -42],
    // extremos de banderas
    [-58, 2.6], [58, 2.6],
    // parque SE
    [44, 42], [58, 42], [46, 54], [58, 56], [50, 50], [46, 62],
    // aparcamientos / patio SO
    [48, -42], [51, -42], [44, -48], [-14, 14], [-24, 20], [-24, 14],
    // planta de tanques / radar exterior
    [-49, -46], [-38, 51], [-33, 63],
    // interiores de edificios (push automático de las funciones)
    ...WP_EXTRA,
  ]

  const aabbs: AABB[] = MAP.map(boxToAABB)

  const waypointEdges: number[][] = waypoints.map(() => [])
  {
    const MAXD = 22
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
    kind: 'pvp',
    name: 'CIUDADELA MERIDIANO',
    mapHalf: 70,
    boxes: MAP.slice(),
    aabbs,
    streets: {
      planes: [
        [0, 0, 140, 12], [0, 0, 12, 140],
        [35, 0, 140, 8], [-35, 0, 140, 8],
        [0, 35, 8, 140], [0, -35, 8, 140],
      ],
      walks: [
        [45.5, 7.1, 49, 1.4], [-45.5, 7.1, 49, 1.4], [45.5, -7.1, 49, 1.4], [-45.5, -7.1, 49, 1.4],
        [7.1, 45.5, 1.4, 49], [7.1, -45.5, 1.4, 49], [-7.1, 45.5, 1.4, 49], [-7.1, -45.5, 1.4, 49],
        [35, 4.6, 140, 1.2], [35, -4.6, 140, 1.2], [-35, 4.6, 140, 1.2], [-35, -4.6, 140, 1.2],
        [4.6, 35, 1.2, 140], [-4.6, 35, 1.2, 140], [4.6, -35, 1.2, 140], [-4.6, -35, 1.2, 140],
      ],
      plaza: { cx: 0, cz: 0, w: 40, d: 40 },
      dashXs: [...range(-66, -22, 4), ...range(22, 66, 4)],
      dashZs: [...range(-66, -22, 4), ...range(22, 66, 4)],
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
    flagA: [-58, 0],
    flagB: [58, 0],
    domZones: [
      { id: 'A', name: 'ALFA', x: 0, z: 0 },
      { id: 'B', name: 'BRAVO', x: -19.5, z: -19.5 },
      { id: 'C', name: 'CHARLIE', x: 20, z: 21 },
    ],
    pickupSpots,
    spawnA: [-62, 0, -62],
    spawnB: [62, 0, 62],
    mood: 'atardecer',
  }
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  return out
}
