// ============================================================
// FRONTERA CERO — Configuración compartida cliente/servidor
// Mapa, armas, protocolo y utilidades geométricas
// ============================================================

export const GAME = {
  TICK: 33,              // ms por tick de simulación (30 Hz)
  SNAPSHOT_EVERY: 2,     // snapshot cada 2 ticks (15 Hz)
  INPUT_RATE: 50,        // cliente envía input cada 50 ms (20 Hz)
  INTERP_DELAY: 120,     // ms de interpolación de jugadores remotos
  ROUND_TIME: 240,       // segundos por ronda
  ROUND_KILLS: 30,       // kills de equipo para ganar la ronda
  ROUNDS_TO_WIN: 5,      // rondas para ganar la partida
  RESPAWN_TIME: 3.0,     // segundos hasta reaparecer
  SPAWN_PROTECT: 2.5,    // segundos de protección al aparecer
  BUY_RADIUS: 8,         // metros de la zona de compra
  START_MONEY: 1000,
  MAX_MONEY: 16000,
  KILL_REWARD: 300,
  HS_REWARD: 100,
  WIN_REWARD: 2500,
  LOSE_REWARD: 1900,
  BOT_COUNT: 8,
  GRAVITY: 14.0,
  MAP_HALF: 35,
} as const

export type Team = 'A' | 'B'
export type WeaponId =
  | 'knife' | 'p9' | 'aguila' | 'mp9' | 'breacher' | 'ar47' | 'cr4' | 'awp338'
export type BodyPart = 'head' | 'body' | 'legs'
export type HitPart = BodyPart

export const TEAM_INFO: Record<Team, { name: string; color: string; accent: string }> = {
  A: { name: 'ESCUADRÓN ÁMBAR', color: '#f59e0b', accent: '#fbbf24' },
  B: { name: 'ESCUADRÓN VERDE', color: '#22c55e', accent: '#4ade80' },
}

// ------------------------------------------------------------
// ARMAS
// ------------------------------------------------------------
export interface WeaponConfig {
  id: WeaponId
  name: string
  slot: 'primary' | 'secondary' | 'melee' | 'grenade'
  price: number
  damage: number          // daño base por bala (cuerpo, sin armadura, cerca)
  headMult: number
  legMult: number
  armorAbsorb: number     // fracción absorbida por armadura (resto va a HP)
  rpm: number             // disparos por minuto
  auto: boolean
  pellets: number         // perdigones (escopeta = 8)
  mag: number
  reserve: number
  reloadTime: number      // segundos
  spreadBase: number      // grados de dispersión base
  spreadMove: number      // dispersión extra al moverse (grados a máx velocidad)
  spreadAir: number       // dispersión extra en el aire
  recoilV: number         // kick vertical por disparo (grados)
  recoilH: number         // deriva horizontal por disparo (grados)
  recoilRecover: number   // velocidad de recuperación (0..1)
  sprayInacc: number      // dispersión extra por bala sostenida (grados/bala)
  zoomFov: number         // FOV al apuntar (0 = sin ADS especial)
  sniper: boolean         // mira telescópica con overlay
  moveMult: number        // multiplicador de velocidad al portarla
  falloffStart: number    // inicio de caída de daño (m)
  falloffEnd: number      // fin de caída (m)
  falloffMin: number      // multiplicador mínimo de daño a distancia
  sound: 'pistol' | 'deagle' | 'smg' | 'shotgun' | 'rifle' | 'sniper'
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  knife: {
    id: 'knife', name: 'Cuchillo Táctico', slot: 'melee', price: 0,
    damage: 55, headMult: 2.0, legMult: 1.0, armorAbsorb: 0.2,
    rpm: 120, auto: false, pellets: 1, mag: 0, reserve: 0, reloadTime: 0,
    spreadBase: 0, spreadMove: 0, spreadAir: 0,
    recoilV: 0.6, recoilH: 0.2, recoilRecover: 0.9, sprayInacc: 0,
    zoomFov: 0, sniper: false, moveMult: 1.08,
    falloffStart: 100, falloffEnd: 100, falloffMin: 1, sound: 'pistol',
  },
  p9: {
    id: 'p9', name: 'P9 Compacto', slot: 'secondary', price: 0,
    damage: 33, headMult: 4.0, legMult: 0.75, armorAbsorb: 0.5,
    rpm: 400, auto: false, pellets: 1, mag: 15, reserve: 90, reloadTime: 2.2,
    spreadBase: 0.35, spreadMove: 1.6, spreadAir: 3.5,
    recoilV: 1.1, recoilH: 0.45, recoilRecover: 0.85, sprayInacc: 0.10,
    zoomFov: 62, sniper: false, moveMult: 1.02,
    falloffStart: 18, falloffEnd: 55, falloffMin: 0.68, sound: 'pistol',
  },
  aguila: {
    id: 'aguila', name: 'Águila .50', slot: 'secondary', price: 700,
    damage: 58, headMult: 4.0, legMult: 0.80, armorAbsorb: 0.35,
    rpm: 267, auto: false, pellets: 1, mag: 7, reserve: 35, reloadTime: 2.2,
    spreadBase: 0.55, spreadMove: 2.4, spreadAir: 5,
    recoilV: 3.2, recoilH: 0.8, recoilRecover: 0.75, sprayInacc: 0.25,
    zoomFov: 60, sniper: false, moveMult: 1.0,
    falloffStart: 20, falloffEnd: 60, falloffMin: 0.7, sound: 'deagle',
  },
  mp9: {
    id: 'mp9', name: 'MP-9 Vecto', slot: 'primary', price: 1250,
    damage: 26, headMult: 3.0, legMult: 0.75, armorAbsorb: 0.45,
    rpm: 750, auto: true, pellets: 1, mag: 30, reserve: 120, reloadTime: 2.3,
    spreadBase: 0.5, spreadMove: 0.9, spreadAir: 4.5,
    recoilV: 0.65, recoilH: 0.5, recoilRecover: 0.9, sprayInacc: 0.07,
    zoomFov: 60, sniper: false, moveMult: 1.04,
    falloffStart: 14, falloffEnd: 45, falloffMin: 0.6, sound: 'smg',
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', slot: 'primary', price: 1800,
    damage: 12, headMult: 2.0, legMult: 0.9, armorAbsorb: 0.25,
    rpm: 68, auto: false, pellets: 8, mag: 6, reserve: 32, reloadTime: 3.0,
    spreadBase: 3.2, spreadMove: 1.2, spreadAir: 4,
    recoilV: 4.5, recoilH: 1.0, recoilRecover: 0.7, sprayInacc: 0.2,
    zoomFov: 66, sniper: false, moveMult: 0.97,
    falloffStart: 8, falloffEnd: 22, falloffMin: 0.28, sound: 'shotgun',
  },
  ar47: {
    id: 'ar47', name: "AR-47 «Cóndor»", slot: 'primary', price: 2700,
    damage: 36, headMult: 4.0, legMult: 0.75, armorAbsorb: 0.5,
    rpm: 600, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 2.5,
    spreadBase: 0.35, spreadMove: 2.6, spreadAir: 6,
    recoilV: 1.35, recoilH: 0.75, recoilRecover: 0.8, sprayInacc: 0.12,
    zoomFov: 55, sniper: false, moveMult: 0.94,
    falloffStart: 25, falloffEnd: 70, falloffMin: 0.75, sound: 'rifle',
  },
  cr4: {
    id: 'cr4', name: 'Carabina CR-4', slot: 'primary', price: 2900,
    damage: 33, headMult: 4.0, legMult: 0.75, armorAbsorb: 0.55,
    rpm: 666, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 3.1,
    spreadBase: 0.3, spreadMove: 2.2, spreadAir: 5,
    recoilV: 1.0, recoilH: 0.5, recoilRecover: 0.85, sprayInacc: 0.09,
    zoomFov: 55, sniper: false, moveMult: 0.95,
    falloffStart: 28, falloffEnd: 75, falloffMin: 0.78, sound: 'rifle',
  },
  awp338: {
    id: 'awp338', name: 'FR-338 Tirador', slot: 'primary', price: 4750,
    damage: 115, headMult: 2.5, legMult: 0.85, armorAbsorb: 0.15,
    rpm: 41, auto: false, pellets: 1, mag: 5, reserve: 30, reloadTime: 3.7,
    spreadBase: 0.2, spreadMove: 5.0, spreadAir: 8,
    recoilV: 5.0, recoilH: 1.2, recoilRecover: 0.65, sprayInacc: 0,
    zoomFov: 9, sniper: true, moveMult: 0.85,
    falloffStart: 200, falloffEnd: 300, falloffMin: 1, sound: 'sniper',
  },
}

export const BUY_ITEMS: { id: string; weapon?: WeaponId; equip?: 'armor' | 'frag'; name: string; price: number; desc: string; cat: string }[] = [
  { id: 'w:aguila', weapon: 'aguila', name: 'Águila .50', price: 700, desc: 'Pistola de alto calibre', cat: 'Pistolas' },
  { id: 'w:mp9', weapon: 'mp9', name: 'MP-9 Vecto', price: 1250, desc: 'SMG rápida y ágil', cat: 'SMG' },
  { id: 'w:breacher', weapon: 'breacher', name: 'Breacher-12', price: 1800, desc: 'Escopeta de caño corto', cat: 'Escopetas' },
  { id: 'w:ar47', weapon: 'ar47', name: 'AR-47 «Cóndor»', price: 2700, desc: 'Rifle de asalto 7.62', cat: 'Rifles' },
  { id: 'w:cr4', weapon: 'cr4', name: 'Carabina CR-4', price: 2900, desc: 'Rifle de asalto 5.56', cat: 'Rifles' },
  { id: 'w:awp338', weapon: 'awp338', name: 'FR-338 Tirador', price: 4750, desc: 'Francotirador letal', cat: 'Francotirador' },
  { id: 'e:armor', equip: 'armor', name: 'Chaleco + Casco', price: 1000, desc: 'Reduce el daño recibido', cat: 'Equipamiento' },
  { id: 'e:frag', equip: 'frag', name: 'Granada MOLO', price: 300, desc: 'Máx. 2 unidades', cat: 'Equipamiento' },
]

export const WEAPON_LIST = Object.values(WEAPONS)

export function weaponIndex(id: WeaponId): number {
  return WEAPON_LIST.findIndex(w => w.id === id)
}
export function weaponByIndex(i: number): WeaponId {
  return WEAPON_LIST[i]?.id ?? 'p9'
}

// Daño efectivo (usado por el servidor)
export function computeDamage(w: WeaponConfig, part: BodyPart, distance: number, victimArmor: number): number {
  let dmg = w.damage
  if (part === 'head') dmg *= w.headMult
  else if (part === 'legs') dmg *= w.legMult
  // caída por distancia
  if (distance > w.falloffStart) {
    const t = Math.min(1, (distance - w.falloffStart) / Math.max(1, w.falloffEnd - w.falloffStart))
    dmg *= 1 - (1 - w.falloffMin) * t
  }
  // armadura (la cabeza sin casco ya multiplicó; simplificamos: armadura protege cuerpo y cabeza)
  if (victimArmor > 0 && part !== 'legs') {
    dmg *= 1 - w.armorAbsorb
  }
  return Math.round(dmg)
}

// ------------------------------------------------------------
// MAPA — cajas AABB (y = centro). Unidad: metros.
// ------------------------------------------------------------
export type MatKey = 'sand' | 'concrete' | 'wood' | 'metalRed' | 'metalBlue' | 'metalGreen' | 'metalOrange' | 'sandbag' | 'crate' | 'barrel' | 'roof'

export interface MapBox {
  x: number; y: number; z: number
  w: number; h: number; d: number
  mat: MatKey
}

function box(x: number, y: number, z: number, w: number, h: number, d: number, mat: MatKey): MapBox {
  return { x, y, z, w, h, d, mat }
}

const MAP: MapBox[] = []
function B(...a: Parameters<typeof box>) { MAP.push(box(...a)) }

// --- Perímetro (muros de 5 m) ---
B(0, 2.5, -35.5, 72, 5, 1.5, 'sand')
B(0, 2.5, 35.5, 72, 5, 1.5, 'sand')
B(-35.5, 2.5, 0, 1.5, 5, 72, 'sand')
B(35.5, 2.5, 0, 1.5, 5, 72, 'sand')
// Pilares decorativos en muros
for (const sx of [-24, -8, 8, 24]) {
  B(sx, 2.8, -35.5, 2.2, 5.6, 2.2, 'concrete')
  B(sx, 2.8, 35.5, 2.2, 5.6, 2.2, 'concrete')
  B(-35.5, 2.8, sx, 2.2, 5.6, 2.2, 'concrete')
  B(35.5, 2.8, sx, 2.2, 5.6, 2.2, 'concrete')
}

// --- Mercado Central (0,0) 14x14, muros h4, puertas de 3 m en cada lado ---
const MW = 7, MH = 4, T = 0.5, GAP = 1.5 // semiancho, altura, grosor, semiancho puerta
for (const side of [-1, 1]) {
  // Norte (z = -MW) y Sur (z = +MW): segmentos X
  B(-MW + (GAP + (MW - GAP) / 2) / 1, MH / 2, -MW, MW - GAP, MH, T, 'sand')
  B(MW - (GAP + (MW - GAP) / 2) / 1, MH / 2, -MW, MW - GAP, MH, T, 'sand')
  B(-MW + (GAP + (MW - GAP) / 2) / 1, MH / 2, MW, MW - GAP, MH, T, 'sand')
  B(MW - (GAP + (MW - GAP) / 2) / 1, MH / 2, MW, MW - GAP, MH, T, 'sand')
  // Dinteles sobre puertas N/S
  B(0, MH - 0.5, -MW, GAP * 2, 1, T, 'sand')
  B(0, MH - 0.5, MW, GAP * 2, 1, T, 'sand')
  // Este (x = MW) y Oeste (x = -MW): segmentos Z
  B(MW, MH / 2, -MW + (GAP + (MW - GAP) / 2), T, MH, MW - GAP, 'sand')
  B(MW, MH / 2, MW - (GAP + (MW - GAP) / 2), T, MH, MW - GAP, 'sand')
  B(-MW, MH / 2, -MW + (GAP + (MW - GAP) / 2), T, MH, MW - GAP, 'sand')
  B(-MW, MH / 2, MW - (GAP + (MW - GAP) / 2), T, MH, MW - GAP, 'sand')
  // Dinteles E/O
  B(MW, MH - 0.5, 0, T, 1, GAP * 2, 'sand')
  B(-MW, MH - 0.5, 0, T, 1, GAP * 2, 'sand')
}
// Columnas interiores
B(-3.5, MH / 2, -3.5, 0.6, MH, 0.6, 'concrete')
B(3.5, MH / 2, 3.5, 0.6, MH, 0.6, 'concrete')
// Techos y parapeto
B(0, MH + 0.15, 0, 15, 0.3, 15, 'roof')
B(0, MH + 0.45, -7.4, 15.2, 0.35, 0.4, 'concrete')
B(0, MH + 0.45, 7.4, 15.2, 0.35, 0.4, 'concrete')
B(-7.4, MH + 0.45, 0, 0.4, 0.35, 15.2, 'concrete')
B(7.4, MH + 0.45, 0, 0.4, 0.35, 15.2, 'concrete')
// Interior: cajas y barriles
B(2.2, 0.6, 2.2, 1.2, 1.2, 1.2, 'crate')
B(2.2, 1.8, 2.2, 1.2, 1.2, 1.2, 'crate')
B(-2.4, 0.6, 2.4, 1.2, 1.2, 1.2, 'crate')
B(3.4, 0.45, -2.4, 0.7, 0.9, 0.7, 'barrel')

// --- Cabañas (8x8, h3) NE (18,-18) y SO (-18,18), puerta hacia el centro ---
function hut(cx: number, cz: number, doorSide: 'n' | 's' | 'e' | 'w', door2?: 'n' | 's' | 'e' | 'w') {
  const S = 4, H = 3, T2 = 0.4, G = 1.5
  const sides: ('n' | 's' | 'e' | 'w')[] = ['n', 's', 'e', 'w']
  for (const s of sides) {
    const hasDoor = s === doorSide || s === door2
    const segLen = hasDoor ? (S - G) : (2 * S)
    if (s === 'n') {
      if (hasDoor) {
        B(cx - (G + segLen / 2), H / 2, cz - S, segLen, H, T2, 'sand')
        B(cx + (G + segLen / 2), H / 2, cz - S, segLen, H, T2, 'sand')
        B(cx, H - 0.4, cz - S, G * 2, 0.8, T2, 'sand')
      } else B(cx, H / 2, cz - S, 2 * S, H, T2, 'sand')
    }
    if (s === 's') {
      if (hasDoor) {
        B(cx - (G + segLen / 2), H / 2, cz + S, segLen, H, T2, 'sand')
        B(cx + (G + segLen / 2), H / 2, cz + S, segLen, H, T2, 'sand')
        B(cx, H - 0.4, cz + S, G * 2, 0.8, T2, 'sand')
      } else B(cx, H / 2, cz + S, 2 * S, H, T2, 'sand')
    }
    if (s === 'e') {
      if (hasDoor) {
        B(cx + S, H / 2, cz - (G + segLen / 2), T2, H, segLen, 'sand')
        B(cx + S, H / 2, cz + (G + segLen / 2), T2, H, segLen, 'sand')
        B(cx + S, H - 0.4, cz, T2, 0.8, G * 2, 'sand')
      } else B(cx + S, H / 2, cz, T2, H, 2 * S, 'sand')
    }
    if (s === 'w') {
      if (hasDoor) {
        B(cx - S, H / 2, cz - (G + segLen / 2), T2, H, segLen, 'sand')
        B(cx - S, H / 2, cz + (G + segLen / 2), T2, H, segLen, 'sand')
        B(cx - S, H - 0.4, cz, T2, 0.8, G * 2, 'sand')
      } else B(cx - S, H / 2, cz, T2, H, 2 * S, 'sand')
    }
  }
  B(cx, H + 0.15, cz, 9, 0.3, 9, 'roof')
  B(cx + 1.2, 0.6, cz - 1.2, 1.2, 1.2, 1.2, 'crate')
  B(cx - 1.5, 0.45, cz + 1.5, 0.7, 0.9, 0.7, 'barrel')
}
hut(18, -18, 'w', 's')
hut(-18, 18, 'e', 'n')

// --- Torre central-norte (0,-20) con escalera desde el sur ---
B(0, 1.6, -20, 2.0, 3.2, 2.0, 'concrete')            // base/columna
B(0, 3.5, -20, 4.4, 0.3, 4.4, 'concrete')            // plataforma
B(0, 3.9, -22.1, 4.4, 0.55, 0.3, 'metalOrange')      // baranda norte
B(-2.1, 3.9, -20, 0.3, 0.55, 4.4, 'metalOrange')     // baranda oeste
B(2.1, 3.9, -20, 0.3, 0.55, 4.4, 'metalOrange')      // baranda este
for (let i = 0; i < 7; i++) {
  // escalones desde el suelo (z=-17.8) subiendo hacia la plataforma
  const stepH = 0.5 * (i + 1)
  B(0, stepH / 2 - 0.05, -17.6 + i * 0.62, 1.6, stepH, 0.62, 'concrete')
}

// --- Contenedores ---
B(-14, 1.2, 2, 2.5, 2.4, 6, 'metalRed')
B(14, 1.2, -2, 2.5, 2.4, 6, 'metalBlue')
B(0, 1.2, 14, 6, 2.4, 2.5, 'metalGreen')
B(0, 3.6, 14, 6, 2.4, 2.5, 'metalGreen')  // apilado
B(-2, 1.2, -14, 6, 2.4, 2.5, 'metalOrange')
B(24, 1.2, 24, 6, 2.4, 2.5, 'metalRed')
B(-24, 1.2, -24, 6, 2.4, 2.5, 'metalBlue')

// --- Barreras de hormigón ---
B(-6, 0.55, 10, 3, 1.1, 0.5, 'concrete')
B(6, 0.55, -10, 3, 1.1, 0.5, 'concrete')
B(10, 0.55, 6, 3, 1.1, 0.5, 'concrete')
B(-10, 0.55, -6, 3, 1.1, 0.5, 'concrete')
B(0, 0.55, 20, 3, 1.1, 0.5, 'concrete')
B(0, 0.55, -28, 3, 1.1, 0.5, 'concrete')
B(-20, 0.55, 0, 3, 1.1, 0.5, 'concrete')
B(20, 0.55, 0, 3, 1.1, 0.5, 'concrete')

// --- Sacos de arena ---
B(-8.5, 0.4, -8.5, 3, 0.8, 0.6, 'sandbag')
B(8.5, 0.4, 8.5, 3, 0.8, 0.6, 'sandbag')
B(-24, 0.4, 12, 3, 0.8, 0.6, 'sandbag')
B(24, 0.4, -12, 3, 0.8, 0.6, 'sandbag')
B(12, 0.4, 24, 3, 0.8, 0.6, 'sandbag')
B(-12, 0.4, -24, 3, 0.8, 0.6, 'sandbag')
B(-6, 0.4, 22, 3, 0.8, 0.6, 'sandbag')
B(6, 0.4, -22, 3, 0.8, 0.6, 'sandbag')

// --- Cajas de madera ---
B(-10, 0.6, 10, 1.2, 1.2, 1.2, 'crate')
B(-11.4, 0.6, 10.4, 1.2, 1.2, 1.2, 'crate')
B(-10.7, 1.8, 10.2, 1.2, 1.2, 1.2, 'crate')
B(10, 0.6, -10, 1.2, 1.2, 1.2, 'crate')
B(11.4, 0.6, -10.4, 1.2, 1.2, 1.2, 'crate')
B(10.7, 1.8, -10.2, 1.2, 1.2, 1.2, 'crate')
B(16, 0.6, 8, 1.2, 1.2, 1.2, 'crate')
B(-16, 0.6, -8, 1.2, 1.2, 1.2, 'crate')
B(22, 0.6, 6, 1.2, 1.2, 1.2, 'crate')
B(-22, 0.6, -6, 1.2, 1.2, 1.2, 'crate')
B(6, 0.6, 22, 1.2, 1.2, 1.2, 'crate')
B(-6, 0.6, -22, 1.2, 1.2, 1.2, 'crate')
B(28, 0.6, -14, 1.2, 1.2, 1.2, 'crate')
B(-28, 0.6, 14, 1.2, 1.2, 1.2, 'crate')

// --- Barriles ---
B(-4, 0.45, -16, 0.7, 0.9, 0.7, 'barrel')
B(-5, 0.45, -16.4, 0.7, 0.9, 0.7, 'barrel')
B(8, 0.45, 8.6, 0.7, 0.9, 0.7, 'barrel')
B(26, 0.45, -6, 0.7, 0.9, 0.7, 'barrel')
B(-26, 0.45, 6, 0.7, 0.9, 0.7, 'barrel')
B(14, 0.45, 16, 0.7, 0.9, 0.7, 'barrel')
B(-14, 0.45, -16, 0.7, 0.9, 0.7, 'barrel')
B(-16, 0.45, 20, 0.7, 0.9, 0.7, 'barrel')
B(16, 0.45, -20, 0.7, 0.9, 0.7, 'barrel')

// --- Muros en ruinas ---
B(20, 1.25, 20, 4.5, 2.5, 0.45, 'sand')
B(-20, 1.25, -20, 4.5, 2.5, 0.45, 'sand')
B(28, 1.0, 6, 0.45, 2.0, 3.5, 'sand')
B(-28, 1.0, -6, 0.45, 2.0, 3.5, 'sand')
B(6, 1.0, 28, 3.5, 2.0, 0.45, 'sand')
B(-6, 1.0, -28, 3.5, 2.0, 0.45, 'sand')

// --- Cajas cerca de spawns (cobertura inicial) ---
B(-24, 0.6, -30, 1.2, 1.2, 1.2, 'crate')
B(-30, 0.6, -24, 1.2, 1.2, 1.2, 'crate')
B(24, 0.6, 30, 1.2, 1.2, 1.2, 'crate')
B(30, 0.6, 24, 1.2, 1.2, 1.2, 'crate')

export const MAP_BOXES: MapBox[] = MAP

// --- Spawns ---
export const SPAWN_A: [number, number, number] = [-28, 0, -28]
export const SPAWN_B: [number, number, number] = [28, 0, 28]
export function spawnPoint(team: Team, i: number): [number, number, number] {
  const base = team === 'A' ? SPAWN_A : SPAWN_B
  const a = (i * 2.399) % (Math.PI * 2)
  const r = 1.5 + (i % 3) * 1.2
  return [base[0] + Math.cos(a) * r, 0, base[2] + Math.sin(a) * r]
}

// ------------------------------------------------------------
// GEOMETRÍA — rayo vs AABB (método slab)
// ------------------------------------------------------------
export interface AABB { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

export function boxToAABB(b: MapBox): AABB {
  return {
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minY: b.y - b.h / 2, maxY: b.y + b.h / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  }
}

export const MAP_AABBS: AABB[] = MAP_BOXES.map(boxToAABB)

/** ¿Choca el segmento p→q con alguna caja? (para línea de visión) */
export function segmentBlocked(px: number, py: number, pz: number, qx: number, qy: number, qz: number, boxes: AABB[] = MAP_AABBS): boolean {
  const dx = qx - px, dy = qy - py, dz = qz - pz
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    let tmin = 0, tmax = 1
    // X
    if (Math.abs(dx) < 1e-9) {
      if (px < b.minX || px > b.maxX) continue
    } else {
      let t1 = (b.minX - px) / dx, t2 = (b.maxX - px) / dx
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) continue
    }
    // Y
    if (Math.abs(dy) < 1e-9) {
      if (py < b.minY || py > b.maxY) continue
    } else {
      let t1 = (b.minY - py) / dy, t2 = (b.maxY - py) / dy
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) continue
    }
    // Z
    if (Math.abs(dz) < 1e-9) {
      if (pz < b.minZ || pz > b.maxZ) continue
    } else {
      let t1 = (b.minZ - pz) / dz, t2 = (b.maxZ - pz) / dz
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) continue
    }
    return true
  }
  return false
}

// ------------------------------------------------------------
// WAYPOINTS para bots
// ------------------------------------------------------------
export const WAYPOINTS: [number, number][] = [
  [-27, -27],  // 0 spawn A
  [-14, -25],  // 1
  [0, -25],    // 2
  [15, -25],   // 3
  [27, -27],   // 4 NE
  [25, -14],   // 5
  [25, 0],     // 6
  [25, 14],    // 7
  [27, 27],    // 8 spawn B
  [14, 25],    // 9
  [0, 25],     // 10
  [-14, 25],   // 11
  [-27, 27],   // 12 SW
  [-25, 14],   // 13
  [-25, 0],    // 14
  [-25, -14],  // 15
  [10, 10],    // 16
  [10, -10],   // 17
  [-10, -10],  // 18
  [-10, 10],   // 19
  [4, -12],    // 20
  [-4, 12],    // 21
  [12, 12],    // 22
  [-12, -12],  // 23
]

/** Aristas del grafo de waypoints (calculadas con LOS a altura de rodilla 0.5 m) */
export const WAYPOINT_EDGES: number[][] = WAYPOINTS.map(() => [])
{
  const MAXD = 15
  for (let i = 0; i < WAYPOINTS.length; i++) {
    for (let j = i + 1; j < WAYPOINTS.length; j++) {
      const dx = WAYPOINTS[i][0] - WAYPOINTS[j][0]
      const dz = WAYPOINTS[i][1] - WAYPOINTS[j][1]
      const dist = Math.hypot(dx, dz)
      if (dist > MAXD) continue
      if (!segmentBlocked(WAYPOINTS[i][0], 0.5, WAYPOINTS[i][1], WAYPOINTS[j][0], 0.5, WAYPOINTS[j][1])) {
        WAYPOINT_EDGES[i].push(j)
        WAYPOINT_EDGES[j].push(i)
      }
    }
  }
}

// ------------------------------------------------------------
// PROTOCOLO DE RED
// ------------------------------------------------------------
export interface NetPlayerState {
  id: string
  name: string
  team: Team
  bot: boolean
  x: number; y: number; z: number
  yaw: number
  pitch: number
  hp: number
  armor: number
  weapon: WeaponId
  dead: boolean
  crouch: boolean
  speed: number
  kills: number
  deaths: number
  money: number
  streak: number
}

export interface NetGrenade { id: string; x: number; y: number; z: number; team: Team }

export interface NetRoundState {
  phase: 'live' | 'ended' | 'matchend'
  timeLeft: number
  roundNumber: number
  scoresA: number   // kills ronda actual equipo A
  scoresB: number
  roundWinsA: number
  roundWinsB: number
}

export interface NetSnapshot {
  t: number
  players: NetPlayerState[]
  grenades: NetGrenade[]
  round: NetRoundState
}

export interface NetKillEvent {
  killer: string; killerName: string; killerTeam: Team
  victim: string; victimName: string; victimTeam: Team
  weapon: WeaponId; headshot: boolean
  killerStreak: number
  multi?: number
}

export const BOT_NAMES = ['Cóndor', 'Víbora', 'Lobo', 'Halcón', 'Zorro', 'Puma', 'Oso', 'Jaguar', 'Serpiente', 'Tigre']
