// ============================================================
// FRONTERA CERO — Configuración compartida cliente/servidor
// Mapa 140×140, pociones de escudo (estilo Fortnite), armas
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
  MAP_HALF: 70,
  // sistema de vida estilo Fortnite
  PICKUP_RADIUS: 1.7,    // metros para recoger un objeto
  PICKUP_RESPAWN: 32,    // segundos hasta reaparecer una poción
  REGEN_DELAY: 8,        // segundos sin recibir daño para regenerar vida
  REGEN_HP: 1.2,         // HP por segundo regenerado
} as const

// Dificultad de los bots (escala reacción, puntería y daño)
export type BotDifficulty = 'facil' | 'normal' | 'dificil' | 'experto'
export const BOT_SKILL: Record<BotDifficulty, {
  react: [number, number]
  aimSpeed: number
  hitBase: number
  aimErr: number
  burstPause: [number, number]
  seeDist: number
  dmg: number             // multiplicador de daño que infligen los bots
  settle: number           // ms que tarda en "asentar" la puntería tras reaccionar
}> = {
  // Rebalanceo: en FÁCIL los bots fallan mucho (hitBase bajo, error de apuntado
  // grande, reacción lenta y tardan ~2.6 s en asentar la mira)
  facil:   { react: [900, 1600], aimSpeed: 3.2, hitBase: 0.24, aimErr: 0.40, burstPause: [750, 1400], seeDist: 38, dmg: 0.38, settle: 2600 },
  normal:  { react: [550, 950],  aimSpeed: 6.0, hitBase: 0.42, aimErr: 0.24, burstPause: [420, 850],  seeDist: 50, dmg: 0.48, settle: 1500 },
  dificil: { react: [300, 520],  aimSpeed: 9.0, hitBase: 0.58, aimErr: 0.12, burstPause: [240, 450],  seeDist: 62, dmg: 0.56, settle: 850 },
  experto: { react: [190, 330],  aimSpeed: 12.0, hitBase: 0.72, aimErr: 0.06, burstPause: [160, 310],  seeDist: 70, dmg: 0.64, settle: 500 },
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
  damage: number          // daño base por bala (cuerpo, sin escudo, cerca)
  headMult: number
  legMult: number
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
    damage: 55, headMult: 2.0, legMult: 1.0,
    rpm: 120, auto: false, pellets: 1, mag: 0, reserve: 0, reloadTime: 0,
    spreadBase: 0, spreadMove: 0, spreadAir: 0,
    recoilV: 0.6, recoilH: 0.2, recoilRecover: 0.9, sprayInacc: 0,
    zoomFov: 0, sniper: false, moveMult: 1.08,
    falloffStart: 100, falloffEnd: 100, falloffMin: 1, sound: 'pistol',
  },
  p9: {
    id: 'p9', name: 'P9 Compacto', slot: 'secondary', price: 0,
    damage: 33, headMult: 4.0, legMult: 0.75,
    rpm: 400, auto: false, pellets: 1, mag: 15, reserve: 90, reloadTime: 2.2,
    spreadBase: 0.35, spreadMove: 1.6, spreadAir: 3.5,
    recoilV: 1.1, recoilH: 0.45, recoilRecover: 0.85, sprayInacc: 0.10,
    zoomFov: 62, sniper: false, moveMult: 1.02,
    falloffStart: 18, falloffEnd: 55, falloffMin: 0.68, sound: 'pistol',
  },
  aguila: {
    id: 'aguila', name: 'Águila .50', slot: 'secondary', price: 700,
    damage: 58, headMult: 4.0, legMult: 0.80,
    rpm: 267, auto: false, pellets: 1, mag: 7, reserve: 35, reloadTime: 2.2,
    spreadBase: 0.55, spreadMove: 2.4, spreadAir: 5,
    recoilV: 3.2, recoilH: 0.8, recoilRecover: 0.75, sprayInacc: 0.25,
    zoomFov: 60, sniper: false, moveMult: 1.0,
    falloffStart: 20, falloffEnd: 60, falloffMin: 0.7, sound: 'deagle',
  },
  mp9: {
    id: 'mp9', name: 'MP-9 Vecto', slot: 'primary', price: 1250,
    damage: 26, headMult: 3.0, legMult: 0.75,
    rpm: 750, auto: true, pellets: 1, mag: 30, reserve: 120, reloadTime: 2.3,
    spreadBase: 0.5, spreadMove: 0.9, spreadAir: 4.5,
    recoilV: 0.65, recoilH: 0.5, recoilRecover: 0.9, sprayInacc: 0.07,
    zoomFov: 60, sniper: false, moveMult: 1.04,
    falloffStart: 14, falloffEnd: 45, falloffMin: 0.6, sound: 'smg',
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', slot: 'primary', price: 1800,
    damage: 12, headMult: 2.0, legMult: 0.9,
    rpm: 68, auto: false, pellets: 8, mag: 6, reserve: 32, reloadTime: 3.0,
    spreadBase: 3.2, spreadMove: 1.2, spreadAir: 4,
    recoilV: 4.5, recoilH: 1.0, recoilRecover: 0.7, sprayInacc: 0.2,
    zoomFov: 66, sniper: false, moveMult: 0.97,
    falloffStart: 8, falloffEnd: 22, falloffMin: 0.28, sound: 'shotgun',
  },
  ar47: {
    id: 'ar47', name: "AR-47 «Cóndor»", slot: 'primary', price: 2700,
    damage: 36, headMult: 4.0, legMult: 0.75,
    rpm: 600, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 2.5,
    spreadBase: 0.35, spreadMove: 2.6, spreadAir: 6,
    recoilV: 1.35, recoilH: 0.75, recoilRecover: 0.8, sprayInacc: 0.12,
    zoomFov: 55, sniper: false, moveMult: 0.94,
    falloffStart: 25, falloffEnd: 70, falloffMin: 0.75, sound: 'rifle',
  },
  cr4: {
    id: 'cr4', name: 'Carabina CR-4', slot: 'primary', price: 2900,
    damage: 33, headMult: 4.0, legMult: 0.75,
    rpm: 666, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 3.1,
    spreadBase: 0.3, spreadMove: 2.2, spreadAir: 5,
    recoilV: 1.0, recoilH: 0.5, recoilRecover: 0.85, sprayInacc: 0.09,
    zoomFov: 55, sniper: false, moveMult: 0.95,
    falloffStart: 28, falloffEnd: 75, falloffMin: 0.78, sound: 'rifle',
  },
  awp338: {
    id: 'awp338', name: 'FR-338 Tirador', slot: 'primary', price: 4750,
    damage: 115, headMult: 2.5, legMult: 0.85,
    rpm: 41, auto: false, pellets: 1, mag: 5, reserve: 30, reloadTime: 3.7,
    spreadBase: 0.2, spreadMove: 5.0, spreadAir: 8,
    recoilV: 5.0, recoilH: 1.2, recoilRecover: 0.65, sprayInacc: 0,
    zoomFov: 9, sniper: true, moveMult: 0.85,
    falloffStart: 200, falloffEnd: 300, falloffMin: 1, sound: 'sniper',
  },
}

export const BUY_ITEMS: { id: string; weapon?: WeaponId; equip?: 'shield' | 'frag' | 'smoke'; name: string; price: number; desc: string; cat: string }[] = [
  { id: 'w:aguila', weapon: 'aguila', name: 'Águila .50', price: 700, desc: 'Pistola de alto calibre', cat: 'Pistolas' },
  { id: 'w:mp9', weapon: 'mp9', name: 'MP-9 Vecto', price: 1250, desc: 'SMG rápida y ágil', cat: 'SMG' },
  { id: 'w:breacher', weapon: 'breacher', name: 'Breacher-12', price: 1800, desc: 'Escopeta de caño corto', cat: 'Escopetas' },
  { id: 'w:ar47', weapon: 'ar47', name: 'AR-47 «Cóndor»', price: 2700, desc: 'Rifle de asalto 7.62', cat: 'Rifles' },
  { id: 'w:cr4', weapon: 'cr4', name: 'Carabina CR-4', price: 2900, desc: 'Rifle de asalto 5.56', cat: 'Rifles' },
  { id: 'w:awp338', weapon: 'awp338', name: 'FR-338 Tirador', price: 4750, desc: 'Francotirador letal', cat: 'Francotirador' },
  { id: 'e:shield', equip: 'shield', name: 'Escudo Completo', price: 1000, desc: 'Sube el escudo a 100', cat: 'Equipamiento' },
  { id: 'e:frag', equip: 'frag', name: 'Granada MOLO', price: 300, desc: 'Máx. 2 unidades', cat: 'Equipamiento' },
  { id: 'e:smoke', equip: 'smoke', name: 'Granada de Humo', price: 200, desc: 'Cortina de humo 12 s · máx. 2', cat: 'Equipamiento' },
]

// ------------------------------------------------------------
// TECLAS CONFIGURABLES (rebindable en el menú)
// ------------------------------------------------------------
export type ActionId =
  | 'fwd' | 'back' | 'left' | 'right'
  | 'sprint' | 'crouch' | 'jump'
  | 'reload' | 'grenadeFrag' | 'grenadeSmoke'
  | 'buy' | 'lastWeapon' | 'zipline'
  | 'slot1' | 'slot2' | 'slot3'

export const DEFAULT_KEYBINDS: Record<ActionId, string> = {
  fwd: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  jump: 'Space',
  reload: 'KeyR',
  grenadeFrag: 'KeyG',
  grenadeSmoke: 'KeyH',
  buy: 'KeyB',
  lastWeapon: 'KeyQ',
  zipline: 'KeyE',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
}

export const ACTION_LABELS: Record<ActionId, string> = {
  fwd: 'Avanzar',
  back: 'Retroceder',
  left: 'Izquierda',
  right: 'Derecha',
  sprint: 'Esprintar',
  crouch: 'Agacharse',
  jump: 'Saltar',
  reload: 'Recargar',
  grenadeFrag: 'Granada MOLO',
  grenadeSmoke: 'Granada de humo',
  buy: 'Tienda',
  lastWeapon: 'Arma anterior',
  zipline: 'Interactuar / Tirolina',
  slot1: 'Arma principal',
  slot2: 'Arma secundaria',
  slot3: 'Cuchillo',
}

/** Convierte un KeyboardEvent.code a etiqueta legible (KeyW → W, Digit1 → 1…) */
export function keyLabel(code: string): string {
  if (!code) return '—'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6)
  if (code.startsWith('Arrow')) {
    const names: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' }
    return names[code.slice(5)] ?? code
  }
  const names: Record<string, string> = {
    Space: 'ESPACIO', ShiftLeft: 'MAYÚS IZQ', ShiftRight: 'MAYÚS DER',
    ControlLeft: 'CTRL IZQ', ControlRight: 'CTRL DER',
    AltLeft: 'ALT', AltRight: 'ALT GR', Enter: 'ENTER', Tab: 'TAB',
    CapsLock: 'BLOQ MAYÚS', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  }
  return names[code] ?? code.toUpperCase()
}

export const WEAPON_LIST = Object.values(WEAPONS)

export function weaponIndex(id: WeaponId): number {
  return WEAPON_LIST.findIndex(w => w.id === id)
}
export function weaponByIndex(i: number): WeaponId {
  return WEAPON_LIST[i]?.id ?? 'p9'
}

/** Daño efectivo de un arma (sin escudo: la absorción la aplica la simulación) */
export function computeDamage(w: WeaponConfig, part: BodyPart, distance: number): number {
  let dmg = w.damage
  if (part === 'head') dmg *= w.headMult
  else if (part === 'legs') dmg *= w.legMult
  if (distance > w.falloffStart) {
    const t = Math.min(1, (distance - w.falloffStart) / Math.max(1, w.falloffEnd - w.falloffStart))
    dmg *= 1 - (1 - w.falloffMin) * t
  }
  return Math.round(dmg)
}

// ------------------------------------------------------------
// OBJETOS DE CURACIÓN (estilo Fortnite)
// ------------------------------------------------------------
export type PickupKind = 'medkit' | 'bandage' | 'shieldSmall' | 'shieldBig'

export const PICKUP_INFO: Record<PickupKind, { name: string; hp: number; shield: number; color: number }> = {
  medkit:      { name: 'Botiquín',            hp: 50, shield: 0,  color: 0xef4444 },
  bandage:     { name: 'Vendaje',             hp: 15, shield: 0,  color: 0xfca5a5 },
  shieldSmall: { name: 'Poción de Escudo S',  hp: 0,  shield: 25, color: 0x38bdf8 },
  shieldBig:   { name: 'Poción de Escudo G',  hp: 0,  shield: 50, color: 0x0ea5e9 },
}

export interface PickupSpot { kind: PickupKind; x: number; z: number }

/** Posiciones de pociones/botiquines por el mapa (se recogen al acercarse) */
export const PICKUP_SPOTS: PickupSpot[] = [
  // mercado central
  { kind: 'bandage', x: 0, z: 5 },
  { kind: 'shieldSmall', x: 0, z: -5 },
  // almacenes
  { kind: 'shieldBig', x: 0, z: -44 },
  { kind: 'medkit', x: 0, z: 44 },
  // gasolinera / barracón del radar
  { kind: 'shieldSmall', x: -49.5, z: 0 },
  { kind: 'shieldBig', x: 44, z: 3.8 },
  // colonia NE / SW (dentro de las casas)
  { kind: 'bandage', x: 40, z: -34.5 },
  { kind: 'bandage', x: -40, z: 34.5 },
  { kind: 'shieldSmall', x: 36, z: -50 },
  { kind: 'shieldSmall', x: -36, z: 50 },
  // depósitos NW / SE
  { kind: 'medkit', x: 34, z: 43 },
  { kind: 'medkit', x: -34, z: -43 },
]

export interface NetPickup { id: string; kind: PickupKind; x: number; z: number; active: boolean }

// ------------------------------------------------------------
// MAPA — cajas AABB (y = centro). Unidad: metros. 140×140
// ------------------------------------------------------------
export type MatKey = 'sand' | 'concrete' | 'wood' | 'metalRed' | 'metalBlue' | 'metalGreen' | 'metalOrange' | 'metalGrey' | 'sandbag' | 'crate' | 'barrel' | 'roof' | 'explosive'

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

// --- Perímetro 140×140 (muros de 6.5 m) ---
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

// --- Muros con puerta central (edificios genéricos) ---
/** Muro a lo largo del eje `ax`, en la coordenada fija `at`, desde `from` hasta `to`, con puerta centrada de ancho 2·gateHalf */
function gatedWall(ax: 'x' | 'z', at: number, from: number, to: number, H: number, T: number, mat: MatKey, gateHalf = 1.6, doorH = 0) {
  const lo = Math.min(from, to), hi = Math.max(from, to)
  const mid = (lo + hi) / 2
  const mk = (c: number, len: number) => {
    if (len <= 0.05) return
    if (ax === 'x') B(c, H / 2, at, len, H, T, mat)
    else B(at, H / 2, c, T, H, len, mat)
  }
  mk((lo + (mid - gateHalf)) / 2, (mid - gateHalf) - lo)
  mk((hi + (mid + gateHalf)) / 2, hi - (mid + gateHalf))
  // dintel sobre la puerta (doorH = altura libre de la puerta)
  if (gateHalf > 0 && H > doorH + 0.6) {
    const lintelH = H - Math.max(doorH, 0.01)
    if (lintelH > 0.15) {
      if (ax === 'x') B(mid, H - lintelH / 2, at, gateHalf * 2, lintelH, T, mat)
      else B(at, H - lintelH / 2, mid, T, lintelH, gateHalf * 2, mat)
    }
  }
}

// ------------------------------------------------------------
// Edificios con interior: muros con puerta + banda de ventanas
// ------------------------------------------------------------
/** Rotaciones: la fachada (puerta) del edificio local mira a -z; `f` gira el edificio */
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
 * ventanas = banda practicable (se puede disparar a través) entre zócalo y franja superior.
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
    put(opts.door, dh * 2, doorH, y0 + H) // dintel sobre la puerta
  }
  for (const [a, b] of solids) {
    put((a + b) / 2, b - a, y0, bandLo)               // zócalo
    put((a + b) / 2, b - a, bandHi, y0 + H)           // franza superior
    const gaps: [number, number][] = []               // huecos de ventana
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

/** Waypoints interiores de una casa (puerta → salón → dormitorio) */
const WP_EXTRA: [number, number][] = []
function wpTransform(cx: number, cz: number, f: Facing, lx: number, lz: number): [number, number] {
  const ang = ROT[f], c = Math.cos(ang), s = Math.sin(ang)
  return [cx + lx * c - lz * s, cz + lx * s + lz * c]
}

/** Casa pequeña 9×8 con interior: salón + dormitorio, ventanas, tejado plano */
function smallHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 4.5, HD = 4.0, H = 3.3, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { ...o, door: 0, doorHalf: 1.05, doorH: 2.15, wins: [-2.85, 2.85] }) // fachada
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { ...o, wins: [-2.2, 2.2] })                                            // trasera
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'z', 1.2, -HW + T, HW - T, mat, { ...o, door: 1.9, doorHalf: 0.8, doorH: 2.05 })                // tabique
  // mobiliario (salón z<1.2 · dormitorio z>1.2)
  BR(cx, cz, f, -2.7, 0.4, -3.1, 1.9, 0.8, 0.85, 'sandbag')   // sofá
  BR(cx, cz, f, -0.6, 0.45, -2.5, 1.3, 0.9, 0.9, 'wood')      // mesa
  BR(cx, cz, f, 3.9, 0.9, -1.5, 0.7, 1.8, 1.6, 'wood')        // estante
  BR(cx, cz, f, -2.6, 0.3, 2.7, 1.7, 0.6, 1.9, 'wood')        // cama
  BR(cx, cz, f, -1.1, 0.3, 3.3, 0.7, 0.6, 0.7, 'crate')       // mesita
  BR(cx, cz, f, 3.6, 0.45, 3.2, 0.7, 0.9, 0.7, 'barrel')      // bidón
  // tejado plano con pretiles
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.7, 0.3, HD * 2 + 0.7, 'roof')
  BR(cx, cz, f, 0, H + 0.475, -HD - 0.11, HW * 2 + 0.7, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, H + 0.475, +HD + 0.11, HW * 2 + 0.7, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, -HW - 0.11, H + 0.475, 0, 0.22, 0.35, HD * 2 + 0.7, 'concrete')
  BR(cx, cz, f, +HW + 0.11, H + 0.475, 0, 0.22, 0.35, HD * 2 + 0.7, 'concrete')
  // waypoints: frente de puerta, salón y dormitorio (alineados con las puertas)
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -6.2),
    wpTransform(cx, cz, f, 1.9, -1.5),
    wpTransform(cx, cz, f, 1.9, 3.3),
  )
}

/** Casa grande de dos plantas: escalera interior, ventanas en ambas plantas y tejado accesible */
function bigHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 5.5, HD = 4.5, H1 = 3.2, H2 = 2.8, T = 0.4
  // ---- planta baja ----
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H1, T, door: 0, doorHalf: 1.15, doorH: 2.25, wins: [-3.6, 3.6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H1, T, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  // escalera interior junto a la pared este (sube hacia el norte)
  for (let i = 0; i < 8; i++) {
    const rise = 0.4 * (i + 1)
    BR(cx, cz, f, 3.55, rise / 2, 2.7 - 0.8 * i, 1.4, rise, 0.85, 'concrete')
  }
  // mobiliario planta baja
  BR(cx, cz, f, -3.4, 0.4, -3.3, 2.1, 0.8, 0.85, 'sandbag')   // sofá
  BR(cx, cz, f, -1.2, 0.45, -2.7, 1.3, 0.9, 0.9, 'wood')      // mesa
  BR(cx, cz, f, -4.85, 0.9, -0.5, 0.7, 1.8, 1.7, 'wood')      // estante
  BR(cx, cz, f, -4.3, 0.6, 3.4, 1.2, 1.2, 1.2, 'crate')       // cajas apiladas
  BR(cx, cz, f, -4.3, 1.8, 3.4, 1.2, 1.2, 1.2, 'crate')
  // ---- forjado 2.ª planta (hueco sobre la escalera) ----
  BR(cx, cz, f, -1.5, H1 + 0.15, 0, 8.0, 0.3, HD * 2, 'concrete')       // franja oeste
  BR(cx, cz, f, 4.0, H1 + 0.15, 3.25, 3.0, 0.3, 2.5, 'concrete')        // rincón este-sur
  // ---- muros 2.ª planta (ventanas amplias) ----
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  // mobiliario 2.ª planta
  BR(cx, cz, f, -4.5, H1 + 0.9, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -4.5, H1 + 2.1, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -2.0, H1 + 0.75, -3.0, 1.3, 0.9, 0.9, 'wood')
  // ---- tejado accesible + pretil (hueco oeste donde llega la escalera exterior) ----
  BR(cx, cz, f, 0, H1 + 0.3 + H2 + 0.15, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  const py = H1 + 0.3 + H2 + 0.475
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, 0, 0.22, 0.35, HD * 2 + 0.8, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 1.9, 0.22, 0.35, 5.2, 'concrete')      // pretil oeste, tramo sur
  BR(cx, cz, f, -HW - 0.12, py, -3.5, 0.22, 0.35, 2.0, 'concrete')     // tramo norte (hueco entre ambos)
  // escalera exterior al tejado (pared oeste, sube hacia el norte)
  for (let i = 0; i < 14; i++) {
    const rise = 0.5 * (i + 1)
    BR(cx, cz, f, -6.3, rise / 2, 4.0 - 0.62 * i, 1.3, rise, 0.68, 'concrete')
  }
  // waypoints: puerta, interior y fondo
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -6.5),
    wpTransform(cx, cz, f, 0, -1),
    wpTransform(cx, cz, f, 0, 2.5),
  )
}

/** Barracón militar pequeño (8×5.4) con interior: literas y taquillas */
function barracks(cx: number, cz: number, f: Facing, mat: MatKey = 'metalGreen'): void {
  const HW = 4.0, HD = 2.7, H = 2.9, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { ...o, door: 0, doorHalf: 1.0, doorH: 2.05, wins: [-2.5, 2.5] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { ...o, wins: [-1.8, 1.8] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { ...o, wins: [0] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { ...o, wins: [0] })
  // literas y taquillas
  BR(cx, cz, f, 2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, -2.6, 0.35, 1.3, 1.7, 0.7, 1.9, 'wood')
  BR(cx, cz, f, -3.3, 0.9, -1.6, 0.6, 1.8, 1.0, 'metalGrey')
  BR(cx, cz, f, 2.2, 0.6, -1.5, 1.2, 1.2, 1.2, 'crate')
  // tejado
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.7, 0.3, HD * 2 + 0.7, 'roof')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -4.3),
    wpTransform(cx, cz, f, 0, 0),
  )
}

// --- Mercado Central (0,0) 22×22, puertas de 3.2 m en cada lado ---
const MW = 11, MH = 4.6, MT = 0.6, MG = 1.6
for (const side of [-1, 1]) {
  // Norte (z = -MW) y Sur (z = +MW)
  const segW = MW - MG
  B(-(MG + segW / 2), MH / 2, -MW, segW, MH, MT, 'sand')
  B(MG + segW / 2, MH / 2, -MW, segW, MH, MT, 'sand')
  B(-(MG + segW / 2), MH / 2, MW, segW, MH, MT, 'sand')
  B(MG + segW / 2, MH / 2, MW, segW, MH, MT, 'sand')
  B(0, MH - 0.5, -MW, MG * 2, 1, MT, 'sand')
  B(0, MH - 0.5, MW, MG * 2, 1, MT, 'sand')
  // Este (x = MW) y Oeste (x = -MW)
  B(MW, MH / 2, -(MG + segW / 2), MT, MH, segW, 'sand')
  B(MW, MH / 2, MG + segW / 2, MT, MH, segW, 'sand')
  B(-MW, MH / 2, -(MG + segW / 2), MT, MH, segW, 'sand')
  B(-MW, MH / 2, MG + segW / 2, MT, MH, segW, 'sand')
  B(MW, MH - 0.5, 0, MT, 1, MG * 2, 'sand')
  B(-MW, MH - 0.5, 0, MT, 1, MG * 2, 'sand')
}
// pilares de esquina e interiores
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  B(sx * 10.6, MH / 2, sz * 10.6, 1, MH, 1, 'concrete')
  B(sx * 6.5, MH / 2, sz * 6.5, 0.7, MH, 0.7, 'concrete')
}
// puestos interiores (escondites)
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  B(sx * 4.5, 0.6, sz * 1.8, 1.2, 1.2, 1.2, 'crate')
  B(sx * 4.5, 1.8, sz * 1.8, 1.2, 1.2, 1.2, 'crate')
  B(sx * 2.0, 0.45, sz * 5.2, 0.7, 0.9, 0.7, 'barrel')
}
// techo con parapeto (hueco en N/S donde llegan las escaleras)
B(0, MH + 0.15, 0, 23, 0.3, 23, 'roof')
B(4.15, MH + 0.45, -11.35, 14.9, 0.4, 0.3, 'concrete')   // parapeto N (hueco a la izquierda)
B(-4.15, MH + 0.45, 11.35, 14.9, 0.4, 0.3, 'concrete')  // parapeto S (hueco a la derecha)
B(11.35, MH + 0.45, 0, 0.3, 0.4, 23, 'concrete')
B(-11.35, MH + 0.45, 0, 0.3, 0.4, 23, 'concrete')
// escaleras exteriores N y S (suben al techo, sin tapar las puertas)
for (let i = 0; i < 9; i++) {
  const h = 0.5 * (i + 1)
  B(-11 + 0.9 * i, h / 2, -12.9, 1.0, h, 1.6, 'concrete')
  B(11 - 0.9 * i, h / 2, 12.9, 1.0, h, 1.6, 'concrete')
}

// --- Torres de vigilancia (genéricas) ---
function tower(cx: number, cz: number, stairsFrom: number): void {
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
tower(0, -26, 1)    // torre norte (escaleras al sur)
tower(0, 26, -1)    // torre sur (escaleras al norte)

// --- Almacenes (0,±44) 26×17 con puertas frontal y laterales ---
function warehouse(cz: number, faceTo: number): void {
  const XW = 13, ZW = 8.5, H = 5.5, TW = 0.6, G = 2.4
  // pared trasera
  B(0, H / 2, cz - faceTo * ZW, XW * 2, H, TW, 'metalBlue')
  // pared frontal con puerta central
  const fz = cz + faceTo * ZW
  const seg = XW - G
  B(-(G + seg / 2), H / 2, fz, seg, H, TW, 'metalBlue')
  B(G + seg / 2, H / 2, fz, seg, H, TW, 'metalBlue')
  B(0, H - 0.55, fz, G * 2, 1.1, TW, 'metalBlue')
  // laterales con puertas
  for (const sx of [-1, 1]) {
    const segZ = ZW - G
    B(sx * XW, H / 2, cz - (G + segZ / 2), TW, H, segZ, 'metalBlue')
    B(sx * XW, H / 2, cz + (G + segZ / 2), TW, H, segZ, 'metalBlue')
    B(sx * XW, H - 0.55, cz, TW, 1.1, G * 2, 'metalBlue')
  }
  // techo
  B(0, H + 0.15, cz, XW * 2 + 1.6, 0.3, ZW * 2 + 1.6, 'roof')
  // carga interior
  B(5, 1.2, cz - faceTo * 2, 2.5, 2.4, 6, 'metalGreen')
  B(-6, 0.6, cz - faceTo * 4, 1.4, 1.2, 1.4, 'crate')
  B(-6, 1.8, cz - faceTo * 4, 1.4, 1.2, 1.4, 'crate')
  B(2.5, 0.45, cz + faceTo * 4, 0.7, 0.9, 0.7, 'barrel')
  B(9, 0.45, cz + faceTo * 5, 0.7, 0.9, 0.7, 'barrel')
  // muelle de carga frente a la puerta (bajo: se sube con un paso)
  B(0, 0.225, fz + faceTo * 1.4, 7, 0.45, 2, 'concrete')
}
warehouse(-44, 1)   // almacén norte (puerta al sur)
warehouse(44, -1)   // almacén sur (puerta al norte)

// --- Gasolinera Oeste (-44,0): tienda + marquesina con bombas ---
gatedWall('x', -4, -54.5, -44.5, 3.6, 0.5, 'sand', 0, 0)       // pared norte tienda (sin puerta)
gatedWall('x', 4, -54.5, -44.5, 3.6, 0.5, 'sand', 1.5, 2.6)    // pared sur tienda (puerta al sur)
gatedWall('z', -54.5, -4, 4, 3.6, 0.5, 'sand', 0, 0)           // pared oeste (sin puerta)
gatedWall('z', -44.5, -4, 4, 3.6, 0.5, 'sand', 1.5, 2.6)       // pared este (puerta a la marquesina)
B(-49.5, 3.75, 0, 10.8, 0.3, 8.8, 'roof')                      // techo tienda
B(-52.5, 0.55, 0, 1.2, 1.1, 3, 'crate')                        // mostrador
B(-49.5, 0.6, 3, 3, 1.2, 0.9, 'crate')                         // estantería
B(-49.5, 0.6, -3, 3, 1.2, 0.9, 'crate')                        // estantería
B(-39, 4.4, 0, 14, 0.5, 12, 'roof')                            // marquesina
for (const px of [-45.5, -32.5]) for (const pz of [-5, 5]) B(px, 2.1, pz, 0.5, 4.2, 0.5, 'concrete')
B(-39, 0.6, -2.2, 1.2, 1.2, 1.2, 'metalRed')                   // bomba
B(-39, 0.6, 2.2, 1.2, 1.2, 1.2, 'metalRed')                    // bomba
B(-39, 1.8, 2.2, 1.2, 1.2, 1.2, 'metalRed')                    // bomba apilada
B(-46, 0.45, -7, 0.7, 0.9, 0.7, 'barrel')                      // bidones
B(-47.6, 0.45, -7.4, 0.7, 0.9, 0.7, 'barrel')
B(-46.8, 0.45, -8.6, 0.7, 0.9, 0.7, 'barrel')

// --- Estación de Radar Este (44,0): compuesto amurallado ---
gatedWall('z', 33, -10, 10, 2.6, 0.5, 'concrete', 2.2, 2.1)    // muro oeste con puerta
gatedWall('z', 55, -10, 10, 2.6, 0.5, 'concrete', 0, 0)        // muro este
gatedWall('x', -10, 33, 55, 2.6, 0.5, 'concrete', 0, 0)        // muro norte
gatedWall('x', 10, 33, 55, 2.6, 0.5, 'concrete', 2.2, 2.1)     // muro sur con puerta
B(48, 1.5, -3, 3, 3, 3, 'concrete')                            // base del radar
B(48, 3.2, -3, 4, 0.4, 4, 'metalOrange')                       // plataforma radar
B(48, 4.2, -3, 0.4, 1.6, 0.4, 'metalGrey')                     // antena
barracks(44, 5.8, 'N')                                         // barracón con literas (interior)
B(37, 0.7, 4, 1.4, 1.4, 1.4, 'crate')                          // generador
B(52, 0.6, 3, 1.2, 1.2, 1.2, 'crate')
// trinchera exterior junto a la puerta oeste (con hueco central)
for (const z of [-4, -2.2, 2.2, 4]) B(28.5, 0.4, z, 3, 0.8, 0.6, 'sandbag')

// --- Colonia residencial NE / SW: casas con interior y calles limpias ---
// Calles: E-O en z=sz·26 (ancha y despejada) · N-S en x=sx·30
for (const [sx, sz] of [[1, -1], [-1, 1]] as [number, number][]) {
  // casas 1 y 2: fachada hacia la calle E-O
  smallHouse(sx * 19, sz * 36, sz < 0 ? 'S' : 'N')
  smallHouse(sx * 41, sz * 36, sz < 0 ? 'S' : 'N')
  // casa 3: fachada hacia la calle N-S
  smallHouse(sx * 19, sz * 50, sx > 0 ? 'E' : 'W')
  // casa grande de dos plantas (escalera interior + tejado accesible)
  bigHouse(sx * 41, sz * 50, sx > 0 ? 'W' : 'E')
  // mobiliario urbano ordenado: contenedor de residuos, muretes y bancos
  B(sx * 34, 1.2, sz * 21.5, 2.6, 2.4, 2.4, 'metalGreen')   // contenedor de residuos
  B(sx * 24, 0.55, sz * 24.5, 3, 1.1, 0.5, 'concrete')     // muro bajo de acera
  B(sx * 50, 0.55, sz * 27.5, 3, 1.1, 0.5, 'concrete')     // parada de bus
  B(sx * 52, 0.45, sz * 20, 1.8, 0.28, 0.6, 'wood')        // bancos del parque
  B(sx * 48, 0.45, sz * 18, 0.6, 0.28, 1.8, 'wood')
  B(sx * 54, 0.5, sz * 22, 2.0, 1.0, 2.0, 'concrete')      // fuente del parque
}

// --- Depósito de contenedores NW / SE: filas alineadas con pasillos amplios ---
for (const [sx, sz] of [[-1, -1], [1, 1]] as [number, number][]) {
  const row1: MatKey[] = ['metalRed', 'metalBlue', 'metalGreen', 'metalOrange']
  const row2: MatKey[] = ['metalBlue', 'metalOrange', 'metalRed', 'metalGreen']
  const xs = [17, 27, 37, 47]
  // fila 1 (z = sz·24) — 4 contenedores alineados con huecos regulares
  for (let i = 0; i < 4; i++) B(sx * xs[i], 1.2, sz * 24, 6, 2.4, 2.5, row1[i])
  // fila 2 (z = sz·36) + uno apilado (se sube con la plataforma de salto)
  for (let i = 0; i < 4; i++) B(sx * xs[i], 1.2, sz * 36, 6, 2.4, 2.5, row2[i])
  B(sx * 27, 3.6, sz * 36, 6, 2.4, 2.5, 'metalGrey')
  // torre de vigilancia del depósito
  tower(sx * 44, sz * 46, -sz)
  // cobertura intencional y ordenada en los pasillos
  B(sx * 32, 0.4, sz * 19.5, 3, 0.8, 0.6, 'sandbag')
  B(sx * 14, 0.55, sz * 42, 3, 1.1, 0.5, 'concrete')
  B(sx * 47, 0.45, sz * 19, 0.7, 0.9, 0.7, 'barrel')
}

// --- Carril central: autobuses abandonados ---
for (const sx of [-1, 1]) {
  B(sx * 16, 1.3, 0, 2.4, 2.6, 6.5, 'metalBlue')
  B(sx * 16, 1.05, sx * 3.9, 2.2, 2.1, 1.3, 'metalBlue')
  B(sx * 19.5, 0.6, 3.2, 1.2, 1.2, 1.2, 'crate')
}

// --- Plaza del mercado: jardineras alineadas (ordenado, sin amontonar) ---
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
  B(sx * 10, 0.7, sz * 10, 4.5, 1.4, 0.5, 'concrete')          // jardinera/banco
  B(sx * 10, 0.15, sz * 13.5, 4.5, 0.3, 0.5, 'concrete')       // borde de acera
}


// --- Árboles (tronco con colisión; copa es decorativa) ---
export const TREES: [number, number][] = [
  // perímetro
  [60, 8], [-60, -8], [-60, 8], [60, -8],
  [8, 60], [-8, -60], [-8, 60], [8, -60],
  [54, -40], [-54, 40],
  // parques de las colonias NE / SW
  [52, 16], [56, 21], [47, 20], [-52, -16], [-56, -21], [-47, -20],
  // depósitos NW / SE
  [52, 40], [-52, -40], [14, 44], [-14, -44],
  // avenidas y calles
  [9, 32], [-9, -32], [9, 46], [-9, -46], [58, 24], [-58, -24],
]
for (const [tx, tz] of TREES) B(tx, 2.1, tz, 0.5, 4.2, 0.5, 'wood')

// --- Farolas (poste con colisión; luz y cabezal decorativos) ---
export const LAMPS: [number, number][] = [
  [12, 12], [-12, -12], [12, -12], [-12, 12],
  [20, 4], [-20, -4], [20, -4], [-20, 4],
  [4, 26], [-4, -26], [4, -26], [-4, 26],
  [-39, 6.5], [39, -6.5],
  [14, -23], [-14, 23], [40, -23], [-40, 23],
]
for (const [lx, lz] of LAMPS) B(lx, 2.6, lz, 0.35, 5.2, 0.35, 'metalGrey')

// --- Cajas cerca de spawns (cobertura inicial) ---
B(-66, 0.6, -54, 1.2, 1.2, 1.2, 'crate')
B(-54, 0.6, -66, 1.2, 1.2, 1.2, 'crate')
B(-60, 0.4, -58, 3, 0.8, 0.6, 'sandbag')
B(66, 0.6, 54, 1.2, 1.2, 1.2, 'crate')
B(54, 0.6, 66, 1.2, 1.2, 1.2, 'crate')
B(60, 0.4, 58, 3, 0.8, 0.6, 'sandbag')

// --- Barriles explosivos (explotan al dispararles, con respawn) ---
export interface ExplosiveBarrel { x: number; z: number }
export const EXPLODING_BARRELS: ExplosiveBarrel[] = [
  { x: 4.2, z: 6.8 }, { x: -4.2, z: -6.8 },       // mercado central
  { x: -36.8, z: 0.8 }, { x: -41.2, z: -0.8 },    // gasolinera (junto a las bombas)
  { x: 3.4, z: -34.6 }, { x: -3.4, z: 34.6 },     // almacenes
  { x: 26, z: -23.5 }, { x: -26, z: 23.5 },       // calles de las colonias
  { x: 32, z: 33 }, { x: -32, z: -33 },           // pasillos de los depósitos
  { x: 14, z: -14 }, { x: -14, z: 14 },           // plaza
]
for (const eb of EXPLODING_BARRELS) B(eb.x, 0.5, eb.z, 0.74, 1.0, 0.74, 'explosive')

// --- Tirolinas (usar E junto al ancla para descender) ---
export interface ZiplineSpec { from: [number, number, number]; to: [number, number, number] }
export const ZIPLINES: ZiplineSpec[] = [
  { from: [0, 5.0, 11.4], to: [16, 3.55, 0] },      // techo mercado → autobús E
  { from: [0, 5.0, -11.4], to: [-16, 3.55, 0] },    // techo mercado → autobús O
  { from: [41, 7.0, -45.7], to: [52, 2.6, -2] },    // tejado casa grande NE → estación radar
  { from: [-41, 7.0, 45.7], to: [-46, 2.3, 6] },    // tejado casa grande SO → gasolinera
]

// --- Plataformas de salto (impulso vertical automático) ---
export interface JumpPadSpec { x: number; z: number }
export const JUMP_PADS: JumpPadSpec[] = [
  { x: -2.5, z: -20.5 },  // torre norte
  { x: 2.5, z: 20.5 },    // torre sur
  { x: 34, z: 4 },        // radar (junto a la puerta)
  { x: -34, z: -4 },      // gasolinera
  { x: 22, z: 31 },       // depósito SE (sube a los contenedores)
  { x: -22, z: -31 },     // depósito NW
]

export const MAP_BOXES: MapBox[] = MAP

// --- Spawns ---
export const SPAWN_A: [number, number, number] = [-62, 0, -62]
export const SPAWN_B: [number, number, number] = [62, 0, 62]
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
// WAYPOINTS para bots (grafo con LOS a 0.5 m)
// ------------------------------------------------------------
export const WAYPOINTS: [number, number][] = [
  // perímetro r62
  [-62, -62], [-44, -62], [-22, -62], [0, -62], [22, -62], [44, -62], [62, -62],
  [62, -44], [62, -22], [62, 0], [62, 22], [62, 44], [62, 62],
  [44, 62], [22, 62], [0, 62], [-22, 62], [-44, 62], [-62, 62],
  [-62, 44], [-62, 22], [-62, 0], [-62, -22], [-62, -44],
  // anillo 46
  [0, -46], [18, -42], [34, -46], [47, -29], [46, -18], [44, 0], [46, 18], [47, 29], [34, 46], [18, 42],
  [0, 46], [-18, 42], [-34, 46], [-47, 29], [-46, 18], [-42, 0], [-46, -18], [-47, -29], [-34, -46], [-18, -42],
  // anillo 30
  [0, -30], [11, -30], [22, -30], [26, -26], [30, -11], [30, 0], [30, 11], [26, 26], [22, 30], [11, 30],
  [0, 30], [-11, 30], [-22, 30], [-26, 26], [-30, 11], [-30, 0], [-30, -11], [-26, -26], [-22, -30], [-11, -30],
  // ejes
  [22, 0], [-22, 0],
  // mercado central (interior y puertas)
  [0, 0], [0, -9], [0, 9], [9, 0], [-9, 0], [0, -16], [0, 16], [14, 0], [-14, 0],
  // flancos de torres + conectores de plaza
  [4, -21], [-4, 21], [4, 21], [-4, -21], [6, -13], [-6, 13],
  // almacén norte / sur
  [0, -31.5], [0, -44], [9, -40], [-9, -40], [17, -44], [-17, -44],
  [0, 31.5], [0, 44], [9, 40], [-9, 40], [17, 44], [-17, 44],
  // gasolinera oeste
  [-49.5, 0], [-39, 0], [-39, 8.5], [-39, -6], [-28, 0],
  // estación de radar + barracón
  [28, 0], [38, 0], [44, 1.5], [44, 5.8], [44, 13],
  // colonia NE (calles y parque)
  [12, -26], [24, -26], [36, -26], [48, -26], [56, -26],
  [30, -12], [30, -40], [30, -54], [52, 18],
  // colonia SW (calles y parque)
  [-12, 26], [-24, 26], [-36, 26], [-48, 26], [-56, 26],
  [-30, 12], [-30, 40], [-30, 54], [-52, -18],
  // depósito SE (calle, pasillo y fondo)
  [12, 16], [24, 16], [36, 16], [48, 16],
  [12, 30], [22, 30], [32, 30], [42, 30],
  [14, 41], [26, 41], [38, 41], [52, 41], [44, 38.5],
  // depósito NW
  [-12, -16], [-24, -16], [-36, -16], [-48, -16],
  [-12, -30], [-22, -30], [-32, -30], [-42, -30],
  [-14, -41], [-26, -41], [-38, -41], [-52, -41], [-44, -38.5],
  // carril central (autobuses)
  [13, 0], [-13, 0], [21, 4], [-21, -4],
  // interiores de edificios (generados por las funciones de construcción)
  ...WP_EXTRA,
]

/** Aristas del grafo de waypoints (calculadas con LOS a altura de rodilla 0.5 m) */
export const WAYPOINT_EDGES: number[][] = WAYPOINTS.map(() => [])
{
  const MAXD = 22
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
// DECORACIÓN (sin colisión — la dibuja el motor)
// ------------------------------------------------------------
export interface NeonSpec { text: string; x: number; y: number; z: number; ry: number; color: string; w: number }
export const NEONS: NeonSpec[] = [
  { text: 'MERCADO', x: 11.6, y: 3.6, z: 0, ry: Math.PI / 2, color: '#22d3ee', w: 6 },
  { text: 'MERCADO', x: -11.6, y: 3.6, z: 0, ry: -Math.PI / 2, color: '#22d3ee', w: 6 },
  { text: 'GAS', x: -53.8, y: 3.9, z: -4, ry: Math.PI / 2, color: '#f87171', w: 3 },
  { text: '24H', x: -44.2, y: 2.9, z: 2.2, ry: Math.PI / 2, color: '#fbbf24', w: 2.2 },
  { text: 'RADAR', x: 44, y: 2.1, z: 10.6, ry: Math.PI, color: '#4ade80', w: 4.5 },
  { text: 'COLONIA', x: 35.15, y: 2.4, z: -50, ry: -Math.PI / 2, color: '#f472b6', w: 4.2 },
  { text: 'COLONIA', x: -35.15, y: 2.4, z: 50, ry: Math.PI / 2, color: '#f472b6', w: 4.2 },
  { text: 'DEPÓSITO', x: 32, y: 3.4, z: 34.8, ry: 0, color: '#fbbf24', w: 4.5 },
  { text: 'DEPÓSITO', x: -32, y: 3.4, z: -34.8, ry: Math.PI, color: '#fbbf24', w: 4.5 },
]

export interface PuddleSpec { x: number; z: number; r: number }
export const PUDDLES: PuddleSpec[] = [
  { x: 8, z: 14, r: 1.6 }, { x: -8, z: -14, r: 1.4 },
  { x: 18, z: -3, r: 1.8 }, { x: -18, z: 3, r: 1.5 },
  { x: 36, z: -26, r: 1.6 }, { x: -36, z: 26, r: 1.4 },
  { x: 24, z: 32, r: 1.2 }, { x: -24, z: -32, r: 1.2 },
  { x: -42, z: 5, r: 1.6 }, { x: 42, z: -5, r: 1.4 },
]

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
  armor: number          // escudo (0..100) — nombre de campo heredado del protocolo
  weapon: WeaponId
  dead: boolean
  crouch: boolean
  speed: number
  kills: number
  deaths: number
  money: number
  streak: number
  aiming: boolean        // apuntando/disparando (pose de tiro)
  sprint: boolean        // esprintando (animación de correr estilo Fortnite)
}

export type GrenadeKind = 'frag' | 'smoke'
export interface NetGrenade { id: string; x: number; y: number; z: number; team: Team; kind: GrenadeKind }

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
  pickups: NetPickup[]
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
