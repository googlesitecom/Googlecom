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
  MAP_HALF: 55,
} as const

// Dificultad de los bots (escala reacción, puntería y agilidad)
export type BotDifficulty = 'facil' | 'normal' | 'dificil' | 'experto'
export const BOT_SKILL: Record<BotDifficulty, {
  react: [number, number]
  aimSpeed: number
  hitBase: number
  aimErr: number
  burstPause: [number, number]
  seeDist: number
}> = {
  facil:   { react: [650, 1050], aimSpeed: 5.0, hitBase: 0.55, aimErr: 0.22, burstPause: [450, 850], seeDist: 44 },
  normal:  { react: [420, 720],  aimSpeed: 7.5, hitBase: 0.68, aimErr: 0.14, burstPause: [300, 600], seeDist: 50 },
  dificil: { react: [280, 480],  aimSpeed: 9.5, hitBase: 0.78, aimErr: 0.09, burstPause: [220, 420], seeDist: 56 },
  experto: { react: [180, 320],  aimSpeed: 12.0, hitBase: 0.86, aimErr: 0.055, burstPause: [150, 300], seeDist: 60 },
}

export const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL', experto: 'EXPERTO',
}

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

// --- Perímetro 110×110 (muros de 6 m) ---
B(0, 3, -55.5, 112, 6, 1.5, 'sand')
B(0, 3, 55.5, 112, 6, 1.5, 'sand')
B(-55.5, 3, 0, 1.5, 6, 112, 'sand')
B(55.5, 3, 0, 1.5, 6, 112, 'sand')
for (const v of [-48, -32, -16, 0, 16, 32, 48]) {
  B(v, 3.4, -55.5, 2.4, 6.8, 2.4, 'concrete')
  B(v, 3.4, 55.5, 2.4, 6.8, 2.4, 'concrete')
  B(-55.5, 3.4, v, 2.4, 6.8, 2.4, 'concrete')
  B(55.5, 3.4, v, 2.4, 6.8, 2.4, 'concrete')
}

// --- Mercado Central (0,0) 14x14, muros h4, puertas de 3 m en cada lado ---
const MW = 7, MH = 4, T = 0.5, GAP = 1.5 // semiancho, altura, grosor, semiancho puerta
for (const side of [-1, 1]) {
  // Norte (z = -MW) y Sur (z = +MW): segmentos X con puerta central de 2×GAP
  const segW = MW - GAP
  B(-(GAP + segW / 2), MH / 2, -MW, segW, MH, T, 'sand')
  B(GAP + segW / 2, MH / 2, -MW, segW, MH, T, 'sand')
  B(-(GAP + segW / 2), MH / 2, MW, segW, MH, T, 'sand')
  B(GAP + segW / 2, MH / 2, MW, segW, MH, T, 'sand')
  // Dinteles sobre puertas N/S
  B(0, MH - 0.5, -MW, GAP * 2, 1, T, 'sand')
  B(0, MH - 0.5, MW, GAP * 2, 1, T, 'sand')
  // Este (x = MW) y Oeste (x = -MW): segmentos Z con puerta central
  B(MW, MH / 2, -(GAP + segW / 2), T, MH, segW, 'sand')
  B(MW, MH / 2, GAP + segW / 2, T, MH, segW, 'sand')
  B(-MW, MH / 2, -(GAP + segW / 2), T, MH, segW, 'sand')
  B(-MW, MH / 2, GAP + segW / 2, T, MH, segW, 'sand')
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

// --- Cabañas (8x8, h3) en las cuatro diagonales medias ---
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
hut(26, 26, 'w')
hut(-26, -26, 'e')
hut(26, -26, 'w')
hut(-26, 26, 'e')

// --- Torres de vigilancia (0,±20), escaleras hacia el centro ---
function tower(cz: number, stairsFrom: number): void {
  B(0, 1.6, cz, 2.0, 3.2, 2.0, 'concrete')            // base/columna
  B(0, 3.5, cz, 4.4, 0.3, 4.4, 'concrete')            // plataforma
  B(0, 3.9, cz - 2.1, 4.4, 0.55, 0.3, 'metalOrange')  // baranda norte
  B(0, 3.9, cz + 2.1, 4.4, 0.55, 0.3, 'metalOrange')  // baranda sur
  B(-2.1, 3.9, cz, 0.3, 0.55, 4.4, 'metalOrange')     // baranda oeste
  B(2.1, 3.9, cz, 0.3, 0.55, 4.4, 'metalOrange')      // baranda este
  // escalera: sube hacia la plataforma (escalones de 0.5 m)
  for (let i = 0; i < 7; i++) {
    const h = 0.5 * (i + 1)
    const z = cz + stairsFrom * (6.0 - i * 0.62)
    B(0, h / 2 - 0.02, z, 1.6, h, 0.62, 'concrete')
  }
}
tower(-20, 1)   // torre norte, escaleras al sur

tower(20, -1)   // torre sur, escaleras al norte

// --- Almacenes (0,±36) 22×15 con puertas frontal y laterales ---
function warehouse(cz: number, faceTo: number): void {
  const XW = 11, ZW = 7.5, H = 5, TW = 0.55, G = 2.2
  // pared trasera
  B(0, H / 2, cz - faceTo * ZW, XW * 2, H, TW, 'metalBlue')
  // pared frontal con puerta central
  const fz = cz + faceTo * ZW
  const seg = XW - G
  B(-(G + seg / 2), H / 2, fz, seg, H, TW, 'metalBlue')
  B(G + seg / 2, H / 2, fz, seg, H, TW, 'metalBlue')
  B(0, H - 0.5, fz, G * 2, 1, TW, 'metalBlue')
  // laterales con puertas
  for (const sx of [-1, 1]) {
    const segZ = ZW - G
    B(sx * XW, H / 2, cz - (G + segZ / 2), TW, H, segZ, 'metalBlue')
    B(sx * XW, H / 2, cz + (G + segZ / 2), TW, H, segZ, 'metalBlue')
    B(sx * XW, H - 0.5, cz, TW, 1, G * 2, 'metalBlue')
  }
  // techo
  B(0, H + 0.15, cz, XW * 2 + 0.8, 0.3, ZW * 2 + 0.8, 'roof')
  // columnas y carga interior
  B(-6, 0.75, cz - faceTo * 3, 0.7, 1.5, 0.7, 'concrete')
  B(6, 0.75, cz + faceTo * 3, 0.7, 1.5, 0.7, 'concrete')
  B(4 * faceTo, 0.6, cz, 1.4, 1.2, 1.4, 'crate')
  B(-4 * faceTo, 0.6, cz + faceTo * 2, 1.4, 1.2, 1.4, 'crate')
  B(-4 * faceTo, 1.8, cz + faceTo * 2, 1.4, 1.2, 1.4, 'crate')
  B(0, 0.45, cz - faceTo * 3, 0.7, 0.9, 0.7, 'barrel')
}
warehouse(-36, 1)   // almacén norte, puerta al sur
warehouse(36, -1)   // almacén sur, puerta al norte

// --- Gasolinera Oeste (-33,-2): quiosco + marquesina con bombas ---
hut(-41, 6, 'e')
B(-33, 4.35, -2, 10, 0.5, 12, 'roof')
B(-37.5, 2.1, -7, 0.5, 4.2, 0.5, 'concrete')
B(-37.5, 2.1, 3, 0.5, 4.2, 0.5, 'concrete')
B(-28.5, 2.1, -7, 0.5, 4.2, 0.5, 'concrete')
B(-28.5, 2.1, 3, 0.5, 4.2, 0.5, 'concrete')
B(-33, 0.6, -4.5, 1.2, 1.2, 1.2, 'metalRed')
B(-33, 0.6, 2.6, 1.2, 1.2, 1.2, 'metalRed')
B(-33, 1.8, 2.6, 1.2, 1.2, 1.2, 'metalRed')

// --- Estación de Radar Este (36,0): compuesto amurallado ---
B(36, 1.25, -7, 18, 2.5, 0.5, 'concrete')                       // muro norte
B(30.5, 1.25, 7, 7, 2.5, 0.5, 'concrete')                       // muro sur (segmento)
B(41.5, 1.25, 7, 7, 2.5, 0.5, 'concrete')
B(36, 2.2, 7, 4, 0.6, 0.5, 'concrete')                          // dintel puerta sur
B(45, 1.25, 0, 0.5, 2.5, 14, 'concrete')                        // muro este
B(27, 1.25, -5.5, 0.5, 2.5, 5, 'concrete')                      // muro oeste (segmentos)
B(27, 1.25, 5.5, 0.5, 2.5, 5, 'concrete')
B(27, 2.2, 0, 0.5, 0.6, 4, 'concrete')                          // dintel puerta oeste
B(38, 1.5, -2, 3, 3, 3, 'concrete')                             // base del radar
B(38, 3.2, -2, 4, 0.4, 4, 'metalOrange')                        // plataforma radar
B(32, 0.7, 3, 1.4, 1.4, 1.4, 'crate')                           // generadores
B(41, 0.7, 4, 1.4, 1.4, 1.4, 'crate')

// --- Contenedores (carriles y esquinas) ---
B(-16, 1.2, 3, 2.5, 2.4, 6, 'metalRed')
B(16, 1.2, -3, 2.5, 2.4, 6, 'metalBlue')
B(3, 1.2, -16, 6, 2.4, 2.5, 'metalGreen')
B(-3, 1.2, 16, 6, 2.4, 2.5, 'metalOrange')
B(3, 3.6, -16, 6, 2.4, 2.5, 'metalGreen')
B(20, 1.2, 20, 6, 2.4, 2.5, 'metalRed')
B(20, 3.6, 20, 6, 2.4, 2.5, 'metalRed')
B(-20, 1.2, -20, 6, 2.4, 2.5, 'metalBlue')
B(-20, 1.2, 20, 2.5, 2.4, 6, 'metalGreen')
B(20, 1.2, -20, 2.5, 2.4, 6, 'metalOrange')
B(-40, 1.2, 24, 6, 2.4, 2.5, 'metalRed')
B(40, 1.2, -24, 6, 2.4, 2.5, 'metalBlue')
B(24, 1.2, 40, 6, 2.4, 2.5, 'metalGreen')
B(-24, 1.2, -40, 6, 2.4, 2.5, 'metalOrange')
B(44, 1.2, 30, 2.5, 2.4, 6, 'metalRed')
B(-44, 1.2, -30, 2.5, 2.4, 6, 'metalBlue')

// --- Barreras de hormigón (simetría diagonal) ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 30, 0.55, sz * 20, 3, 1.1, 0.5, 'concrete')
  B(sx * 20, 0.55, sz * 30, 3, 1.1, 0.5, 'concrete')
  B(sx * 44, 0.55, sz * 12, 3, 1.1, 0.5, 'concrete')
  B(sx * 12, 0.55, sz * 44, 3, 1.1, 0.5, 'concrete')
  B(sx * 6, 0.55, sz * 18, 3, 1.1, 0.5, 'concrete')
  B(sx * 20, 0.55, sz * 6, 3, 1.1, 0.5, 'concrete')
}

// --- Sacos de arena ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 11, 0.4, sz * 11, 3, 0.8, 0.6, 'sandbag')
  B(sx * 22, 0.4, sz * 4, 3, 0.8, 0.6, 'sandbag')
  B(sx * 4, 0.4, sz * 22, 3, 0.8, 0.6, 'sandbag')
  B(sx * 38, 0.4, sz * 38, 3, 0.8, 0.6, 'sandbag')
  B(sx * 52, 0.4, sz * 20, 3, 0.8, 0.6, 'sandbag')
  B(sx * 20, 0.4, sz * 52, 3, 0.8, 0.6, 'sandbag')
}

// --- Cajas de madera (posiciones simétricas) ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 13, 0.6, sz * 13, 1.2, 1.2, 1.2, 'crate')
  B(sx * 14.4, 0.6, sz * 13.4, 1.2, 1.2, 1.2, 'crate')
  B(sx * 13.7, 1.8, sz * 13.2, 1.2, 1.2, 1.2, 'crate')
  B(sx * 21, 0.6, sz * 9, 1.2, 1.2, 1.2, 'crate')
  B(sx * 9, 0.6, sz * 21, 1.2, 1.2, 1.2, 'crate')
  B(sx * 31, 0.6, sz * 31, 1.2, 1.2, 1.2, 'crate')
}

// --- Barriles ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 6.5, 0.45, sz * 13, 0.7, 0.9, 0.7, 'barrel')
  B(sx * 25, 0.45, sz * 12, 0.7, 0.9, 0.7, 'barrel')
  B(sx * 12, 0.45, sz * 25, 0.7, 0.9, 0.7, 'barrel')
  B(sx * 38, 0.45, sz * 10, 0.7, 0.9, 0.7, 'barrel')
  B(sx * 46, 0.45, sz * 44, 0.7, 0.9, 0.7, 'barrel')
  B(sx * 8, 0.45, sz * 3, 0.7, 0.9, 0.7, 'barrel')
}

// --- Muros en ruinas ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 42, 1.25, sz * 22, 4.5, 2.5, 0.45, 'sand')
  B(sx * 22, 1.25, sz * 42, 0.45, 2.5, 4.5, 'sand')
  B(sx * 50, 1.0, sz * 10, 0.45, 2.0, 3.5, 'sand')
  B(sx * 10, 1.0, sz * 50, 3.5, 2.0, 0.45, 'sand')
  B(sx * 34, 1.0, sz * 34, 3.5, 2.0, 0.45, 'sand')
}

// --- Cajas cerca de spawns (cobertura inicial) ---
B(-52.5, 0.6, -45.5, 1.2, 1.2, 1.2, 'crate')
B(-45.5, 0.6, -52.5, 1.2, 1.2, 1.2, 'crate')
B(52.5, 0.6, 45.5, 1.2, 1.2, 1.2, 'crate')
B(45.5, 0.6, 52.5, 1.2, 1.2, 1.2, 'crate')

export const MAP_BOXES: MapBox[] = MAP

// --- Spawns ---
export const SPAWN_A: [number, number, number] = [-48, 0, -48]
export const SPAWN_B: [number, number, number] = [48, 0, 48]
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
// WAYPOINTS para bots (62 nodos, grafo con LOS a 0.5 m)
// ------------------------------------------------------------
export const WAYPOINTS: [number, number][] = [
  // perímetro
  [-48, -48], [-34, -48], [-17, -48], [0, -48], [17, -48], [34, -48], [48, -48],
  [48, -34], [48, -17], [48, 0], [48, 17], [48, 34], [48, 48],
  [34, 48], [17, 48], [0, 48], [-17, 48], [-34, 48], [-48, 48],
  [-48, 34], [-48, 17], [-48, 0], [-48, -17], [-48, -34],
  // centro (mercado)
  [0, 0], [0, -12], [8.5, -8.5], [12, 0], [8.5, 8.5], [0, 12], [-8.5, 8.5], [-12, 0], [-8.5, -8.5],
  // anillo medio
  [0, -24], [10, -24], [-10, -24], [17, -17], [24, 0], [17, 17], [0, 24], [10, 24], [-10, 24], [-17, 17], [-24, 0], [-17, -17],
  // interiores y laterales de edificios
  [0, -36], [14, -36], [-14, -36], [0, 36], [14, 36], [-14, 36],
  [33, -33], [33, 33], [-33, 33], [-33, -33],
  [46, 46], [46, -46], [-46, -46], [-46, 46],
  [-30, 0], [30, -10], [30, 10], [-30, -10], [-30, 10],
]

/** Aristas del grafo de waypoints (calculadas con LOS a altura de rodilla 0.5 m) */
export const WAYPOINT_EDGES: number[][] = WAYPOINTS.map(() => [])
{
  const MAXD = 20
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

export const BOT_NAMES = ['Cóndor', 'Víbora', 'Lobo', 'Halcón', 'Zorro', 'Puma', 'Oso', 'Jaguar', 'Serpiente', 'Tigre', 'Águila', 'Coyote', 'León', 'Pantera', 'Búho', 'Araña']

// ------------------------------------------------------------
// SALAS P2P (PeerJS)
// ------------------------------------------------------------
export const PEER_APP_PREFIX = 'fzcero2'
export function peerIdForRoom(code: string): string {
  return `${PEER_APP_PREFIX}-${code.toLowerCase()}`
}
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateRoomCode(): string {
  let s = ''
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}
