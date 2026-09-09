// ============================================================
// FRONTERA CERO — Configuración compartida cliente/servidor
// Mapa 140×140 (v4: ciudad ordenada), modos de juego,
// pociones de escudo (estilo Fortnite), armas y controles
// ============================================================

/**
 * Prefijo de ruta para los assets estáticos (public/).
 * Vacío en desarrollo; en el despliegue de GitHub Pages el sitio
 * se sirve bajo /Googlecom/, así que el build de Pages define
 * NEXT_PUBLIC_BASE_PATH=/Googlecom y aquí se usa como prefijo.
 */
export const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const GAME = {
  TICK: 33,              // ms por tick de simulación (30 Hz)
  SNAPSHOT_EVERY: 2,     // snapshot cada 2 ticks (15 Hz)
  INPUT_RATE: 50,        // cliente envía input cada 50 ms (20 Hz)
  INTERP_DELAY: 120,     // ms de interpolación de jugadores remotos
  ROUND_TIME: 240,       // segundos por ronda (combate de equipos)
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
  // capturar la bandera
  FLAG_RETURN_TIME: 6,   // segundos hasta que la bandera caída vuelva a su base
  FLAG_CAPTURES: 3,      // capturas para ganar la ronda
  // dominación
  DOM_ZONE_RADIUS: 6,    // radio de captura de una zona
  DOM_CAP_TIME: 7,       // segundos para capturar una zona
  DOM_TICK_POINTS: 5,    // puntos por zona cada 5 s
  DOM_TARGET: 150,       // puntos para ganar la ronda
  // todos contra todos
  FFA_KILLS: 15,         // bajas individuales para ganar la ronda
} as const

// ------------------------------------------------------------
// MODOS DE JUEGO
// ------------------------------------------------------------
export type GameMode = 'escaramuza' | 'ffa' | 'bandera' | 'dominacion'

export interface ModeInfo {
  id: GameMode
  name: string
  short: string
  desc: string
  target: number
  time: number
  teams: boolean
}

export const MODES: Record<GameMode, ModeInfo> = {
  escaramuza: {
    id: 'escaramuza', name: 'COMBATE DE EQUIPOS', short: 'EQUIPOS',
    desc: '4 vs 4 · la primera escuadra en llegar al objetivo gana la ronda',
    target: GAME.ROUND_KILLS, time: GAME.ROUND_TIME, teams: true,
  },
  ffa: {
    id: 'ffa', name: 'TODOS CONTRA TODOS', short: 'LIBRE',
    desc: 'Operador contra operador · la primera racha individual gana',
    target: GAME.FFA_KILLS, time: GAME.ROUND_TIME, teams: false,
  },
  bandera: {
    id: 'bandera', name: 'CAPTURAR LA BANDERA', short: 'BANDERA',
    desc: 'Roba la bandera rival y llévala a tu base · primero a 3 capturas',
    target: GAME.FLAG_CAPTURES, time: 300, teams: true,
  },
  dominacion: {
    id: 'dominacion', name: 'DOMINACIÓN', short: 'DOMINACIÓN',
    desc: 'Toma y conserva las 3 zonas del mapa · primero a 150 puntos',
    target: GAME.DOM_TARGET, time: 300, teams: true,
  },
}

export const MODE_LIST: GameMode[] = ['escaramuza', 'ffa', 'bandera', 'dominacion']

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

// NOTA de rebalanceo (v4): retroceso y dispersión REDUCIDOS ~40-45 % —
// la mira ya no "se va mucho" al disparar y la retícula apenas se abre.
export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  knife: {
    id: 'knife', name: 'Cuchillo Táctico', slot: 'melee', price: 0,
    damage: 55, headMult: 2.0, legMult: 1.0,
    rpm: 120, auto: false, pellets: 1, mag: 0, reserve: 0, reloadTime: 0,
    spreadBase: 0, spreadMove: 0, spreadAir: 0,
    recoilV: 0.5, recoilH: 0.15, recoilRecover: 0.92, sprayInacc: 0,
    zoomFov: 0, sniper: false, moveMult: 1.08,
    falloffStart: 100, falloffEnd: 100, falloffMin: 1, sound: 'pistol',
  },
  p9: {
    id: 'p9', name: 'P9 Compacto', slot: 'secondary', price: 0,
    damage: 33, headMult: 4.0, legMult: 0.75,
    rpm: 400, auto: false, pellets: 1, mag: 15, reserve: 90, reloadTime: 2.2,
    spreadBase: 0.3, spreadMove: 1.0, spreadAir: 2.6,
    recoilV: 0.62, recoilH: 0.22, recoilRecover: 0.9, sprayInacc: 0.05,
    zoomFov: 62, sniper: false, moveMult: 1.02,
    falloffStart: 18, falloffEnd: 55, falloffMin: 0.68, sound: 'pistol',
  },
  aguila: {
    id: 'aguila', name: 'Águila .50', slot: 'secondary', price: 700,
    damage: 58, headMult: 4.0, legMult: 0.80,
    rpm: 267, auto: false, pellets: 1, mag: 7, reserve: 35, reloadTime: 2.2,
    spreadBase: 0.45, spreadMove: 1.5, spreadAir: 3.6,
    recoilV: 1.8, recoilH: 0.4, recoilRecover: 0.82, sprayInacc: 0.12,
    zoomFov: 60, sniper: false, moveMult: 1.0,
    falloffStart: 20, falloffEnd: 60, falloffMin: 0.7, sound: 'deagle',
  },
  mp9: {
    id: 'mp9', name: 'MP-9 Vecto', slot: 'primary', price: 1250,
    damage: 26, headMult: 3.0, legMult: 0.75,
    rpm: 750, auto: true, pellets: 1, mag: 30, reserve: 120, reloadTime: 2.3,
    spreadBase: 0.4, spreadMove: 0.6, spreadAir: 3.2,
    recoilV: 0.4, recoilH: 0.26, recoilRecover: 0.92, sprayInacc: 0.04,
    zoomFov: 60, sniper: false, moveMult: 1.04,
    falloffStart: 14, falloffEnd: 45, falloffMin: 0.6, sound: 'smg',
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', slot: 'primary', price: 1800,
    damage: 12, headMult: 2.0, legMult: 0.9,
    rpm: 68, auto: false, pellets: 8, mag: 6, reserve: 32, reloadTime: 3.0,
    spreadBase: 2.6, spreadMove: 1.0, spreadAir: 3.4,
    recoilV: 2.6, recoilH: 0.55, recoilRecover: 0.78, sprayInacc: 0.1,
    zoomFov: 66, sniper: false, moveMult: 0.97,
    falloffStart: 8, falloffEnd: 22, falloffMin: 0.28, sound: 'shotgun',
  },
  ar47: {
    id: 'ar47', name: "AR-47 «Cóndor»", slot: 'primary', price: 2700,
    damage: 36, headMult: 4.0, legMult: 0.75,
    rpm: 600, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 2.5,
    spreadBase: 0.28, spreadMove: 1.7, spreadAir: 4.4,
    recoilV: 0.78, recoilH: 0.38, recoilRecover: 0.85, sprayInacc: 0.07,
    zoomFov: 55, sniper: false, moveMult: 0.94,
    falloffStart: 25, falloffEnd: 70, falloffMin: 0.75, sound: 'rifle',
  },
  cr4: {
    id: 'cr4', name: 'Carabina CR-4', slot: 'primary', price: 2900,
    damage: 33, headMult: 4.0, legMult: 0.75,
    rpm: 666, auto: true, pellets: 1, mag: 30, reserve: 90, reloadTime: 3.1,
    spreadBase: 0.24, spreadMove: 1.4, spreadAir: 3.8,
    recoilV: 0.6, recoilH: 0.26, recoilRecover: 0.88, sprayInacc: 0.05,
    zoomFov: 55, sniper: false, moveMult: 0.95,
    falloffStart: 28, falloffEnd: 75, falloffMin: 0.78, sound: 'rifle',
  },
  awp338: {
    id: 'awp338', name: 'FR-338 Tirador', slot: 'primary', price: 4750,
    damage: 115, headMult: 2.5, legMult: 0.85,
    rpm: 41, auto: false, pellets: 1, mag: 5, reserve: 30, reloadTime: 3.7,
    spreadBase: 0.15, spreadMove: 3.4, spreadAir: 6,
    recoilV: 2.8, recoilH: 0.6, recoilRecover: 0.75, sprayInacc: 0,
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
// CONTROLES CONFIGURABLES (teclado + RATÓN + mando)
// ------------------------------------------------------------
export type ActionId =
  | 'fwd' | 'back' | 'left' | 'right'
  | 'sprint' | 'crouch' | 'jump'
  | 'reload' | 'grenadeFrag' | 'grenadeSmoke'
  | 'buy' | 'lastWeapon' | 'zipline'
  | 'slot1' | 'slot2' | 'slot3'
  | 'shoot' | 'aim'

/** Los binds de DISPARAR y APUNTAR aceptan botones del ratón (Mouse0..4)
 *  o cualquier tecla — por fin se pueden reasignar. */
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
  shoot: 'Mouse0',
  aim: 'Mouse2',
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
  shoot: 'Disparar',
  aim: 'Apuntar (ADS)',
}

/** ¿El código corresponde a un botón del ratón? */
export function isMouseButton(code: string): boolean {
  return code.startsWith('Mouse')
}

/** Índice del botón del ratón (Mouse2 → 2), o null */
export function mouseButtonIndex(code: string): number | null {
  if (!code.startsWith('Mouse')) return null
  const n = Number(code.slice(5))
  return Number.isFinite(n) ? n : null
}

/** Convierte un KeyboardEvent.code o botón a etiqueta legible */
export function keyLabel(code: string): string {
  if (!code) return '—'
  if (code.startsWith('Mouse')) {
    const names = ['CLIC IZQ', 'CLIC MED', 'CLIC DER', 'CLIC 4', 'CLIC 5', 'CLIC 6']
    const n = Number(code.slice(5))
    return names[n] ?? `CLIC ${n + 1}`
  }
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

// ------------------------------------------------------------
// MANDO — botones reasignables
// ------------------------------------------------------------
export type PadAction =
  | 'shoot' | 'aim' | 'sprint' | 'jump' | 'crouch' | 'reload'
  | 'weaponNext' | 'grenadeFrag' | 'grenadeSmoke' | 'buy' | 'scoreboard' | 'pause'

export const DEFAULT_PAD_BINDS: Record<PadAction, number> = {
  shoot: 7,          // RT
  aim: 6,            // LT
  sprint: 10,        // L3 (pulsar stick izquierdo)
  jump: 0,           // A / Cruz
  crouch: 1,         // B / Círculo
  reload: 2,         // X / Cuadrado
  weaponNext: 3,     // Y / Triángulo
  grenadeFrag: 4,    // LB
  grenadeSmoke: 13,  // cruceta abajo
  buy: 5,            // RB
  scoreboard: 8,     // Back / View
  pause: 9,          // Start
}

export const PAD_ACTION_LABELS: Record<PadAction, string> = {
  shoot: 'Disparar',
  aim: 'Apuntar (ADS)',
  sprint: 'Esprintar (L3)',
  jump: 'Saltar',
  crouch: 'Agacharse',
  reload: 'Recargar',
  weaponNext: 'Cambiar arma',
  grenadeFrag: 'Granada MOLO',
  grenadeSmoke: 'Granada de humo',
  buy: 'Tienda',
  scoreboard: 'Marcador (mantener)',
  pause: 'Pausa',
}

/** Etiqueta de botón estándar Xbox (PS: A=Cruz, B=Círculo…) */
export function padButtonLabel(i: number): string {
  const names: Record<number, string> = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'VIEW', 9: 'MENU', 10: 'L3', 11: 'R3',
    12: '↑', 13: '↓', 14: '←', 15: '→',
    16: 'CENTRO', 17: 'GUIA',
  }
  return names[i] ?? `B${i}`
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

// ------------------------------------------------------------
// MAPA v4 — "SECTOR MERIDIANO": ciudad ordenada tipo Warzone
// Mismo tamaño (140×140), cuadrícula de calles, distritos variados
// y edificios grandes con interior: hotel de 3 plantas, torre de
// oficinas de 4, mercado, almacenes, tiendas, casas y gasolinera.
// ------------------------------------------------------------

/** Posiciones de pociones/botiquines (dentro de edificios y zonas clave) */
export const PICKUP_SPOTS: PickupSpot[] = [
  // pociones del hotel y almacén reposicionadas (fuera de columnas/estanterías)
  { kind: 'bandage', x: 18, z: -21 },
  { kind: 'shieldSmall', x: 17, z: -17 },
  // torre de oficinas
  { kind: 'shieldBig', x: 50, z: -22 },
  { kind: 'medkit', x: 50, z: -17 },
  // mercado central
  { kind: 'bandage', x: 15, z: -52 },
  { kind: 'shieldSmall', x: 24, z: -52 },
  // almacén norte / nave oeste
  { kind: 'shieldBig', x: -22, z: -16 },
  { kind: 'medkit', x: -19.5, z: -23 },
  { kind: 'bandage', x: -51, z: -21 },
  // colonia residencial SE
  { kind: 'bandage', x: 16, z: 18 },
  { kind: 'shieldSmall', x: 44.8, z: 16 },
  { kind: 'shieldBig', x: 16, z: 52 },
  // barracón del radar
  { kind: 'medkit', x: -50, z: 56 },
  // parque SE
  { kind: 'shieldSmall', x: 46, z: 58 },
]

export interface NetPickup { id: string; kind: PickupKind; x: number; z: number; active: boolean }

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

// --- Muros con puerta central ---
function gatedWall(ax: 'x' | 'z', at: number, from: number, to: number, H: number, T: number, mat: MatKey, gateHalf = 1.6, doorH = 0): void {
  const lo = Math.min(from, to), hi = Math.max(from, to)
  const mid = (lo + hi) / 2
  const mk = (c: number, len: number) => {
    if (len <= 0.05) return
    if (ax === 'x') B(c, H / 2, at, len, H, T, mat)
    else B(at, H / 2, c, T, H, len, mat)
  }
  mk((lo + (mid - gateHalf)) / 2, (mid - gateHalf) - lo)
  mk((hi + (mid + gateHalf)) / 2, hi - (mid + gateHalf))
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

/** Escalera recta de peldaños crecientes con altura inicial y0.
 *  (xAt, zAt) = posición local del PRIMER peldaño; (dx, dz) = dirección de subida. */
function stairsBR(cx: number, cz: number, f: Facing, xAt: number, zAt: number, dx: number, dz: number, steps: number, riseStep: number, runStep: number, wStair: number, y0 = 0, mat: MatKey = 'concrete'): void {
  for (let i = 0; i < steps; i++) {
    const rise = riseStep * (i + 1)
    const sx = xAt + dx * runStep * i
    const sz = zAt + dz * runStep * i
    // si sube a lo largo de x, el largo del peldaño va en x
    BR(cx, cz, f, sx, y0 + rise / 2, sz, dx !== 0 ? runStep + 0.04 : wStair, rise, dz !== 0 ? runStep + 0.04 : wStair, mat)
  }
}

// ------------------------------------------------------------
// HOTEL MERIDIANO — 18×14, 3 plantas + azotea (escaleras interiores
// de dos tramos apilados + escalera exterior de incendios)
// ------------------------------------------------------------
function hotel(cx: number, cz: number, f: Facing): void {
  const HW = 9, HD = 7, H1 = 3.0, H2 = 2.8, T = 0.4
  const F2 = 3.3, F3 = 6.6, ROOF = 9.55
  // ---- planta baja: lobby ----
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H1, T, door: 0, doorHalf: 1.7, doorH: 2.4, wins: [-6, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H1, T, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H1, T, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H1, T, wins: [-3.5, 0, 3.5] })
  // columnas del lobby
  BR(cx, cz, f, 0, 1.5, -3, 0.7, 3.0, 0.7, 'concrete')
  BR(cx, cz, f, 0, 1.5, 2, 0.7, 3.0, 0.7, 'concrete')
  // recepción + mobiliario
  BR(cx, cz, f, -4.5, 0.55, -4.5, 3.4, 1.1, 0.9, 'wood')        // mostrador
  BR(cx, cz, f, -6, 0.4, 1.5, 2.0, 0.8, 0.9, 'sandbag')          // sofá
  BR(cx, cz, f, -3.2, 0.45, 1.5, 1.2, 0.9, 0.9, 'wood')         // mesa baja
  BR(cx, cz, f, -7.6, 0.9, -1, 0.7, 1.8, 1.6, 'wood')           // estante
  // ---- escalera interior: 2 tramos apilados (lado este, suben hacia -z) ----
  stairsBR(cx, cz, f, 6.9, 6.4, 0, -1, 10, 0.3, 0.55, 2.8, 0)      // tramo A: planta baja → P1
  stairsBR(cx, cz, f, 6.9, 6.4, 0, -1, 10, 0.3, 0.55, 2.8, F2)    // tramo B: P1 → P2 (apilado)
  // ---- forjado P1 con hueco sobre la escalera (x 5..9, z 0.4..7) ----
  BR(cx, cz, f, -2.1, 3.15, 0, 14.2, 0.3, 14, 'concrete')       // franja oeste
  BR(cx, cz, f, 7, 3.15, -3.85, 4, 0.3, 6.3, 'concrete')        // rincón este-sur
  BR(cx, cz, f, 6.9, 3.15, -0.15, 2.8, 0.3, 1.1, 'concrete')    // rellano del tramo A
  // ---- muros P1 ----
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H2, T, y0: F2, wins: [-6, 0, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H2, T, y0: F2, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H2, T, y0: F2, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H2, T, y0: F2, wins: [-3.5, 0, 3.5] })
  // tabique de habitaciones en P1
  wallL(cx, cz, f, 'z', 1.5, -HW + T, 4.7, 'sand', { H: H2, T: 0.3, y0: F2, door: -2, doorHalf: 0.8, doorH: 2.05 })
  BR(cx, cz, f, -6, F2 + 0.4, -4, 1.8, 0.8, 0.9, 'sandbag')     // cama (hab.)
  BR(cx, cz, f, -6, F2 + 0.45, 0, 1.2, 0.9, 0.9, 'wood')
  // ---- forjado P2 + muros P2 ----
  BR(cx, cz, f, -2.1, F3 + 0.15 - 0.3, 0, 14.2, 0.3, 14, 'concrete')
  BR(cx, cz, f, 7, F3 - 0.15, -3.85, 4, 0.3, 6.3, 'concrete')
  BR(cx, cz, f, 6.9, F3 - 0.15, -0.15, 2.8, 0.3, 1.1, 'concrete')
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-6, 0, 6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-5, 0, 5] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-3.5, 0, 3.5] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: H2, T, y0: F3 + 0.3, wins: [-3.5, 0, 3.5] })
  BR(cx, cz, f, -6, F3 + 0.7, 4, 1.2, 1.2, 1.2, 'crate')
  // ---- azotea: forjado + pretil (hueco al este donde llega la escalera) ----
  BR(cx, cz, f, 0, ROOF, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  const py = ROOF + 0.475
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, -6.5, 0.22, 0.35, 1.1, 'concrete')   // pretil este, tramo norte
  BR(cx, cz, f, +HW + 0.12, py, 4.5, 0.22, 0.35, 5.1, 'concrete')     // pretil este, tramo sur
  BR(cx, cz, f, -HW - 0.12, py, 0, 0.22, 0.35, HD * 2 + 0.8, 'concrete')
  BR(cx, cz, f, -4, ROOF + 0.75, -4, 1.6, 1.1, 1.3, 'metalGrey')  // climatizador
  BR(cx, cz, f, -6.5, ROOF + 0.6, 3, 1.1, 0.8, 1.1, 'metalGrey')
  // ---- escalera exterior de incendios (fachada este, sube hacia -z) ----
  stairsBR(cx, cz, f, 10.1, 7.2, 0, -1, 19, 0.5, 0.62, 1.4)
  // waypoints: entrada, lobby, pasillo P1 (solo planta baja para bots)
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -8.6),
    wpTransform(cx, cz, f, 0, -1),
    wpTransform(cx, cz, f, -4, 3),
    wpTransform(cx, cz, f, 3, -2),
  )
}

// ------------------------------------------------------------
// TORRE ÁMBAR (oficinas) — 14×14, 4 plantas + azotea con mirador.
// Escalera interior de 4 tramos apilados (núcleo este); el último
// tramo desemboca en la azotea a través de un hueco.
// ------------------------------------------------------------
function torreOficina(cx: number, cz: number, f: Facing): void {
  const HW = 7, HD = 7, HF = 2.8, T = 0.4
  const F = [0, 3.1, 6.2, 9.3]
  const ROOF = 12.25
  for (let p = 0; p < 4; p++) {
    const y0 = F[p]
    // fachada sur: con puerta en planta baja
    if (p === 0) {
      wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: HF, T, y0, door: 0, doorHalf: 1.3, doorH: 2.3, wins: [-4.5, 4.5] })
    } else {
      wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H: HF, T, y0, wins: [-4.5, 0, 4.5] })
    }
    wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H: HF, T, y0, wins: [-4.5, 0, 4.5] })
    wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H: HF, T, y0, wins: [-4, 0, 4] })
    wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H: HF, T, y0, wins: [-4, 0, 4] })
  }
  // tabiques de oficinas (plantas 1..3)
  for (let p = 1; p < 4; p++) {
    wallL(cx, cz, f, 'z', 1.5, -HW + T, 4.2, 'sand', { H: HF, T: 0.25, y0: F[p], door: -1, doorHalf: 0.8, doorH: 2.05 })
  }
  // escritorios
  BR(cx, cz, f, -4.5, 0.45, -4.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.5, 3.55, 3.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.5, 6.65, -3.5, 1.6, 0.9, 0.9, 'wood')
  BR(cx, cz, f, 3, 0.45, 5, 1.3, 0.9, 0.9, 'wood')
  // ---- escalera interior: 4 tramos apilados (núcleo este) ----
  for (let p = 0; p < 4; p++) {
    stairsBR(cx, cz, f, 5.6, 6.4, 0, -1, 10, 0.28, 0.55, 2.4, F[p])
  }
  // ---- forjados (hueco del núcleo x 4.2..7, z 0.4..7 + rellano) ----
  for (let p = 1; p < 4; p++) {
    BR(cx, cz, f, -1.6, F[p] - 0.15, 0, 11.2, 0.3, 14, 'concrete')   // franja oeste
    BR(cx, cz, f, 6.2, F[p] - 0.15, -3.85, 2.6, 0.3, 6.3, 'concrete')
    BR(cx, cz, f, 5.6, F[p] - 0.15, -0.15, 2.4, 0.3, 1.1, 'concrete')
  }
  // ---- azotea con mirador (pretil alto) + hueco de la escalera ----
  BR(cx, cz, f, -1.6, ROOF, 0, 11.2, 0.3, 14, 'roof')
  BR(cx, cz, f, 6.2, ROOF, -3.85, 2.6, 0.3, 6.3, 'concrete')
  BR(cx, cz, f, 5.6, ROOF, -0.15, 2.4, 0.3, 1.1, 'concrete')
  const py = ROOF + 0.55
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.7, 0.7, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.7, 0.7, 0.22, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 0, 0.22, 0.7, HD * 2 + 0.7, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, -3.5, 0.22, 0.7, 7, 'concrete')       // pretil este, tramo norte
  BR(cx, cz, f, +HW + 0.12, py, 4, 0.22, 0.7, 6, 'concrete')          // tramo sur (hueco en medio)
  BR(cx, cz, f, -3.5, ROOF + 0.6, -4, 1.5, 1.0, 1.2, 'metalGrey')     // maquinaria
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -8.5),
    wpTransform(cx, cz, f, 0, -3),
    wpTransform(cx, cz, f, -4, 0),
    wpTransform(cx, cz, f, 3, -4),
  )
}

// ------------------------------------------------------------
// MERCADO CENTRAL — 20×20 con 4 puertas, puestos interiores y
// tejado accesible por escaleras exteriores N y S
// ------------------------------------------------------------
function mercado(cx: number, cz: number, f: Facing): void {
  const MW = 10, MH = 4.6, MT = 0.6, MG = 1.7
  // fachadas N y S (z = ∓MW) con puerta central
  {
    const segW = MW - MG
    for (const sz of [-1, 1]) {
      BR(cx, cz, f, -(MG + segW / 2), MH / 2, sz * MW, segW, MH, MT, 'sand')
      BR(cx, cz, f, MG + segW / 2, MH / 2, sz * MW, segW, MH, MT, 'sand')
      BR(cx, cz, f, 0, MH - 0.5, sz * MW, MG * 2, 1, MT, 'sand')
    }
    // fachadas E y O (x = ±MW) con puerta central
    for (const sx of [-1, 1]) {
      BR(cx, cz, f, sx * MW, MH / 2, -(MG + segW / 2), MT, MH, segW, 'sand')
      BR(cx, cz, f, sx * MW, MH / 2, (MG + segW / 2), MT, MH, segW, 'sand')
      BR(cx, cz, f, sx * MW, MH - 0.5, 0, MT, 1, MG * 2, 'sand')
    }
  }
  // pilares de esquina e interiores
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    BR(cx, cz, f, sx * 9.6, MH / 2, sz * 9.6, 1, MH, 1, 'concrete')
    BR(cx, cz, f, sx * 6, MH / 2, sz * 6, 0.7, MH, 0.7, 'concrete')
  }
  // puestos interiores
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    BR(cx, cz, f, sx * 4.2, 0.6, sz * 2, 1.2, 1.2, 1.2, 'crate')
    BR(cx, cz, f, sx * 4.2, 1.8, sz * 2, 1.2, 1.2, 1.2, 'crate')
    BR(cx, cz, f, sx * 2, 0.45, sz * 5, 0.7, 0.9, 0.7, 'barrel')
  }
  // techo con parapeto (hueco N/S donde llegan las escaleras)
  BR(cx, cz, f, 0, MH + 0.15, 0, MW * 2 + 1.4, 0.3, MW * 2 + 1.4, 'roof')
  BR(cx, cz, f, 4.4, MH + 0.45, -10.3, 11.9, 0.4, 0.3, 'concrete')    // parapeto N (hueco a la izq.)
  BR(cx, cz, f, -4.4, MH + 0.45, 10.3, 11.9, 0.4, 0.3, 'concrete')   // parapeto S (hueco a la der.)
  BR(cx, cz, f, 10.3, MH + 0.45, 0, 0.3, 0.4, MW * 2 + 1.4, 'concrete')
  BR(cx, cz, f, -10.3, MH + 0.45, 0, 0.3, 0.4, MW * 2 + 1.4, 'concrete')
  // escaleras exteriores N y S (junto a la fachada, suben a lo largo de x)
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
// CASAS (colonia residencial) — probadas en v3
// ------------------------------------------------------------
/** Casa pequeña 9×8 con interior: salón + dormitorio, ventanas, tejado plano */
function smallHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 4.5, HD = 4.0, H = 3.3, T = 0.35
  const o: WallOpts = { H, T }
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { ...o, door: 0, doorHalf: 1.05, doorH: 2.15, wins: [-2.85, 2.85] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { ...o, wins: [-2.2, 2.2] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { ...o, wins: [-1.4, 1.4] })
  wallL(cx, cz, f, 'z', 1.2, -HW + T, HW - T, mat, { ...o, door: 1.9, doorHalf: 0.8, doorH: 2.05 })
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
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, -6.2),
    wpTransform(cx, cz, f, 1.9, -1.5),
    wpTransform(cx, cz, f, 1.9, 3.3),
  )
}

/** Casa grande de dos plantas: escalera interior y tejado accesible */
function bigHouse(cx: number, cz: number, f: Facing, mat: MatKey = 'sand'): void {
  const HW = 5.5, HD = 4.5, H1 = 3.2, H2 = 2.8, T = 0.4
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H1, T, door: 0, doorHalf: 1.15, doorH: 2.25, wins: [-3.6, 3.6] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H1, T, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H1, T, wins: [-2, 2] })
  // escalera interior junto a la pared este
  stairsBR(cx, cz, f, 3.55, 2.7, 0, -1, 8, 0.4, 0.8, 1.4, 0)
  // mobiliario planta baja
  BR(cx, cz, f, -3.4, 0.4, -3.3, 2.1, 0.8, 0.85, 'sandbag')
  BR(cx, cz, f, -1.2, 0.45, -2.7, 1.3, 0.9, 0.9, 'wood')
  BR(cx, cz, f, -4.85, 0.9, -0.5, 0.7, 1.8, 1.7, 'wood')
  BR(cx, cz, f, -4.3, 0.6, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -4.3, 1.8, 3.4, 1.2, 1.2, 1.2, 'crate')
  // forjado 2.ª planta (hueco sobre la escalera)
  BR(cx, cz, f, -1.5, H1 + 0.15, 0, 8.0, 0.3, HD * 2, 'concrete')
  BR(cx, cz, f, 4.0, H1 + 0.15, 3.25, 3.0, 0.3, 2.5, 'concrete')
  // muros 2.ª planta
  wallL(cx, cz, f, 'z', -HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, mat, { H: H2, T, y0: H1 + 0.3, wins: [-3.3, 0, 3.3] })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, mat, { H: H2, T, y0: H1 + 0.3, wins: [-2.2, 2.2] })
  BR(cx, cz, f, -4.5, H1 + 0.9, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -4.5, H1 + 2.1, 3.4, 1.2, 1.2, 1.2, 'crate')
  BR(cx, cz, f, -2.0, H1 + 0.75, -3.0, 1.3, 0.9, 0.9, 'wood')
  // tejado accesible + pretil (hueco oeste para la escalera exterior)
  BR(cx, cz, f, 0, H1 + 0.3 + H2 + 0.15, 0, HW * 2 + 0.8, 0.3, HD * 2 + 0.8, 'roof')
  const py = H1 + 0.3 + H2 + 0.475
  BR(cx, cz, f, 0, py, -HD - 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, 0, py, +HD + 0.12, HW * 2 + 0.8, 0.35, 0.22, 'concrete')
  BR(cx, cz, f, +HW + 0.12, py, 0, 0.22, 0.35, HD * 2 + 0.8, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, 1.9, 0.22, 0.35, 5.2, 'concrete')
  BR(cx, cz, f, -HW - 0.12, py, -3.5, 0.22, 0.35, 2.0, 'concrete')
  // escalera exterior al tejado (pared oeste)
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
// ALMACÉN — grande, con puerta amplia, estanterías y tejado
// accesible por escalera exterior. XW/ZW = semiejes.
// ------------------------------------------------------------
function almacen(cx: number, cz: number, f: Facing, XW = 11, ZW = 8, H = 6): void {
  const T = 0.6, G = 2.6
  // pared trasera y frontal con puerta grande
  wallL(cx, cz, f, 'z', -ZW, -XW, XW, 'metalBlue', { H, T, door: 0, doorHalf: G, doorH: 3.6 })
  wallL(cx, cz, f, 'z', +ZW, -XW, XW, 'metalBlue', { H, T, wins: [-XW * 0.55, 0, XW * 0.55], bandLo: 1.6, bandHi: 3.0 })
  // laterales con puertas
  for (const sx of [-1, 1]) {
    wallL(cx, cz, f, 'x', sx * XW, -ZW, ZW, 'metalBlue', { H, T, door: 0, doorHalf: 1.3, doorH: 3.2, wins: [-ZW * 0.5, ZW * 0.5], bandLo: 1.6, bandHi: 3.0 })
  }
  // techo
  BR(cx, cz, f, 0, H + 0.15, 0, XW * 2 + 1.2, 0.3, ZW * 2 + 1.2, 'roof')
  // estanterías interiores (dos hileras)
  BR(cx, cz, f, -XW * 0.45, 1.3, -ZW * 0.3, 2.4, 2.6, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, XW * 0.45, 1.3, -ZW * 0.3, 2.4, 2.6, ZW * 1.2, 'metalGreen')
  BR(cx, cz, f, -XW * 0.45, 1.3, 0, 1.4, 1.2, 1.4, 'crate')
  BR(cx, cz, f, -XW * 0.45, 2.6, 0, 1.4, 1.2, 1.4, 'crate')
  BR(cx, cz, f, XW * 0.3, 0.45, ZW * 0.5, 0.7, 0.9, 0.7, 'barrel')
  // muelle de carga frente a la puerta
  BR(cx, cz, f, 0, 0.225, -ZW - 1.4, 7, 0.45, 2, 'concrete')
  // escalera exterior al tejado (lado oeste, sube hacia -z)
  stairsBR(cx, cz, f, -XW - 1.0, ZW + 1.2, 0, -1, Math.ceil(H / 0.5), 0.5, 0.62, 1.3, 0)
  // pretiles del tejado (hueco donde llega la escalera, lado oeste)
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

/** Tienda pequeña 7×6 con mostrador y escaparate */
function shop(cx: number, cz: number, f: Facing): void {
  const HW = 3.5, HD = 3, H = 3.6, T = 0.35
  wallL(cx, cz, f, 'z', -HD, -HW, HW, 'sand', { H, T, door: 1.8, doorHalf: 0.9, doorH: 2.2, wins: [-1.6, 0.6], winW: 2.0 })
  wallL(cx, cz, f, 'z', +HD, -HW, HW, 'sand', { H, T })
  wallL(cx, cz, f, 'x', +HW, -HD, HD, 'sand', { H, T, wins: [0] })
  wallL(cx, cz, f, 'x', -HW, -HD, HD, 'sand', { H, T, wins: [0] })
  BR(cx, cz, f, 0, 0.55, 0.8, 2.6, 1.1, 0.8, 'wood')       // mostrador
  BR(cx, cz, f, -2.6, 0.9, 0, 0.6, 1.8, 1.5, 'wood')       // estante
  BR(cx, cz, f, 2.4, 0.45, -1.8, 1.2, 0.9, 0.9, 'crate')
  BR(cx, cz, f, 0, H + 0.15, 0, HW * 2 + 0.5, 0.3, HD * 2 + 0.5, 'roof')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 1.8, -4.6),
    wpTransform(cx, cz, f, 0, 0),
  )
}

// ------------------------------------------------------------
// GASOLINERA — kiosco + marquesina con bombas (f: entrada hacia +x)
// ------------------------------------------------------------
function gasStation(cx: number, cz: number, f: Facing): void {
  const KW = 5, KD = 4, KH = 3.2, T = 0.4
  // kiosco (tienda) 10×8
  wallL(cx, cz, f, 'z', -KD, -KW, KW, 'sand', { H: KH, T, wins: [-2.5, 2.5] })
  wallL(cx, cz, f, 'z', +KD, -KW, KW, 'sand', { H: KH, T, wins: [-2.5, 0, 2.5] })
  wallL(cx, cz, f, 'x', +KW, -KD, KD, 'sand', { H: KH, T, door: 0, doorHalf: 0.95, doorH: 2.2, wins: [-1.5, 1.5] })
  wallL(cx, cz, f, 'x', -KW, -KD, KD, 'sand', { H: KH, T })
  BR(cx, cz, f, 0, 3.75, 0, KW * 2 + 0.8, 0.3, KD * 2 + 0.8, 'roof')
  BR(cx, cz, f, 2.2, 0.55, 0, 1.2, 1.1, 3, 'crate')        // mostrador
  BR(cx, cz, f, -3, 0.6, -2.5, 3, 1.2, 0.9, 'crate')       // estantería
  BR(cx, cz, f, -3, 0.6, 2.5, 3, 1.2, 0.9, 'crate')
  // marquesina (patio de bombas, al este)
  BR(cx, cz, f, 8.5, 0.225, 0, 8, 0.45, 10, 'concrete')    // explanada
  BR(cx, cz, f, 8.5, 4.4, 0, 12, 0.5, 12, 'roof')          // marquesina
  for (const [px, pz] of [[6.2, -2.5], [6.2, 2.5], [10.8, -2.5], [10.8, 2.5]] as [number, number][]) {
    BR(cx, cz, f, px, 2.1, pz, 0.5, 4.2, 0.5, 'concrete')
  }
  BR(cx, cz, f, 7.2, 0.6, 0, 1.2, 1.2, 1.2, 'metalRed')    // bombas
  BR(cx, cz, f, 9.8, 0.6, 0, 1.2, 1.2, 1.2, 'metalRed')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, 0, 6),
    wpTransform(cx, cz, f, 8.5, 6),
    wpTransform(cx, cz, f, 8.5, -6),
  )
}

// ------------------------------------------------------------
// ESTACIÓN DE RADAR — recinto amurallado con barracón
// ------------------------------------------------------------
function radarStation(cx: number, cz: number, f: Facing): void {
  const W = 12, D = 10, H = 2.6, T = 0.5
  wallL(cx, cz, f, 'z', -D, -W, W, 'concrete', { H, T })
  wallL(cx, cz, f, 'z', +D, -W, W, 'concrete', { H, T })
  wallL(cx, cz, f, 'x', -W, -D, D, 'concrete', { H, T })
  wallL(cx, cz, f, 'x', +W, -D, D, 'concrete', { H, T, door: 0, doorHalf: 1.3, doorH: 2.2 })
  // radar (base + plataforma + antena)
  BR(cx, cz, f, -5, 1.5, -4, 3, 3, 3, 'concrete')
  BR(cx, cz, f, -5, 3.2, -4, 4, 0.4, 4, 'metalOrange')
  BR(cx, cz, f, -5, 4.2, -4, 0.4, 1.6, 0.4, 'metalGrey')
  // barracón con literas (dentro)
  barracks(cx, cz, f)
  // el barracón se coloca en el centro local (0,0) del recinto
  BR(cx, cz, f, 4, 0.7, 4, 1.4, 1.4, 1.4, 'crate')     // generador
  BR(cx, cz, f, 4, 0.6, -4, 1.2, 1.2, 1.2, 'crate')
  // sacos de cobertura junto a la puerta (dentro del recinto)
  for (const z of [-7, 7]) BR(cx, cz, f, W - 3, 0.4, z, 3, 0.8, 0.6, 'sandbag')
  WP_EXTRA.push(
    wpTransform(cx, cz, f, W + 4, 0),
    wpTransform(cx, cz, f, W - 2, 0),
    wpTransform(cx, cz, f, 6, 6),
    wpTransform(cx, cz, f, -8, 6),
  )
}

/** Torre de vigilancia genérica (escaleras al lado `stairsFrom`: +1 sur · -1 norte) */
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

// ------------------------------------------------------------
// Mobiliario urbano: rotonda, quiosco, fuente, tanques, vehículos
// ------------------------------------------------------------
/** Rotonda central (0,0): fuente + jardineras */
function roundabout(): void {
  B(0, 0.45, 0, 5.6, 0.9, 5.6, 'concrete')            // basamento de la fuente
  B(0, 1.2, 0, 1.8, 2.4, 1.8, 'concrete')             // pilar central
  for (const [x, z] of [[8.5, 0], [-8.5, 0], [0, 8.5], [0, -8.5], [6.2, 6.2], [-6.2, 6.2], [6.2, -6.2], [-6.2, -6.2]] as [number, number][]) {
    B(x, 0.45, z, 2.4, 0.9, 0.8, 'concrete')          // jardineras
  }
}

/** Quiosco abierto 5×5 (4 postes + tejado) */
function kiosco(cx: number, cz: number): void {
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as [number, number][]) {
    B(cx + x, 1.5, cz + z, 0.3, 3.0, 0.3, 'wood')
  }
  B(cx, 3.2, cz, 5.4, 0.3, 5.4, 'roof')
  B(cx, 0.45, cz, 2.0, 0.9, 1.2, 'wood')               // mesa
}

/** Fuente de parque (más pequeña que la rotonda) */
function fountain(cx: number, cz: number): void {
  B(cx, 0.35, cz, 3.4, 0.7, 3.4, 'concrete')
  B(cx, 0.95, cz, 1.1, 1.5, 1.1, 'concrete')
}

/** Planta de tanques industriales (3 silos + tuberías) */
function tankPlant(cx: number, cz: number): void {
  B(cx - 6, 3, cz, 5, 6, 5, 'metalGrey')
  B(cx, 3, cz + 1, 5, 6, 5, 'metalGrey')
  B(cx - 3, 3, cz - 6, 5, 6, 5, 'metalGrey')
  B(cx - 3, 6.4, cz - 2, 9, 0.5, 0.5, 'metalOrange')   // tubería
  B(cx - 2, 6.4, cz + 3, 0.5, 0.5, 5, 'metalOrange')
  WP_EXTRA.push([cx, cz + 5])
}

/** Coche abandonado (cobertura en calles) */
function car(x: number, z: number, alongX: boolean, mat: MatKey = 'metalBlue'): void {
  if (alongX) {
    B(x, 0.55, z, 4.2, 1.1, 1.9, mat)
    B(x, 1.15, z, 2.1, 0.75, 1.7, 'metalGrey')
  } else {
    B(x, 0.55, z, 1.9, 1.1, 4.2, mat)
    B(x, 1.15, z, 1.7, 0.75, 2.1, 'metalGrey')
  }
}

/** Autobús abandonado */
function bus(x: number, z: number, alongX: boolean): void {
  if (alongX) {
    B(x, 1.3, z, 2.4, 2.6, 6.5, 'metalBlue')
    B(x, 1.05, z, 2.2, 2.1, 1.3, 'metalBlue')
  } else {
    B(x, 1.3, z, 6.5, 2.6, 2.4, 'metalBlue')
    B(x, 1.05, z, 1.3, 2.1, 2.2, 'metalBlue')
  }
}

// ------------------------------------------------------------
// COLOCACIÓN DEL MAPA
// ------------------------------------------------------------
// === NE: distrito cívico ===
hotel(19.5, -19.5, 'S')
torreOficina(50, -20, 'S')
mercado(19.5, -52, 'S')
shop(44, -57, 'N')
shop(56, -57, 'N')
// aparcamiento NE (autos + cobertura ordenada)
car(48, -44, true, 'metalRed')
car(56, -44, true, 'metalGrey')
B(50, 0.55, -49, 3, 1.1, 0.5, 'concrete')              // barrera
B(44, 0.55, -49, 3, 1.1, 0.5, 'concrete')

// === NO: distrito industrial ===
almacen(-19.5, -19.5, 'N', 11, 8, 6)                    // almacén norte (puerta al sur→calle z=-35… fachada -z)
almacen(-51, -19.5, 'E', 9, 7, 5.5)                     // nave oeste (puerta al este→calle x=-35)
// depósito de contenedores
{
  const row1: MatKey[] = ['metalRed', 'metalBlue', 'metalGreen']
  const row2: MatKey[] = ['metalBlue', 'metalOrange', 'metalRed']
  const xs = [-25, -17.5, -10]
  for (let i = 0; i < 3; i++) {
    B(xs[i], 1.2, -45, 6, 2.4, 2.5, row1[i])
    B(xs[i], 1.2, -57, 6, 2.4, 2.5, row2[i])
  }
  B(-17.5, 3.6, -57, 6, 2.4, 2.5, 'metalGrey')          // apilado
  WP_EXTRA.push([-19, -51], [-11, -51], [-26, -51])
  // cobertura ordenada del pasillo
  B(-19, 0.4, -49.5, 3, 0.8, 0.6, 'sandbag')
  B(-19, 0.55, -62.5, 3, 1.1, 0.5, 'concrete')
}
watchTower(-11, -61, 1)
tankPlant(-51, -51)

// === SE: distrito residencial + parque ===
smallHouse(16, 16, 'W')
smallHouse(46, 13.5, 'N')
smallHouse(46, 27, 'E')
bigHouse(16, 50, 'W')
// parque SE: árboles + fuente + quiosco + bancos
fountain(51, 46)
kiosco(42, 58)
B(46, 0.45, 52, 1.8, 0.28, 0.6, 'wood')                // bancos
B(56, 0.45, 52, 1.8, 0.28, 0.6, 'wood')
B(48, 0.45, 62, 0.6, 0.28, 1.8, 'wood')
// zona DOM CHARLIE queda abierta en (46, 58)

// === SO: gasolinera + radar + residencial ===
gasStation(-51, 19.5, 'E')
radarStation(-51, 51, 'E')
smallHouse(-14, 45, 'N')
smallHouse(-14, 57.5, 'N')
// aparcamiento/patio SO (cobertura inicial)
car(-20, 15, true, 'metalRed')
car(-25, 24, true, 'metalGrey')
B(-14, 0.4, 20, 3, 0.8, 0.6, 'sandbag')

// === Rotonda central ===
roundabout()

// === Vehículos en las avenidas (cobertura ordenada) ===
bus(16, 2.5, true)
bus(-16, -2.5, true)
car(32, -2.2, true, 'metalRed')
car(48, 2.2, true, 'metalGrey')
car(-32, 2.2, true, 'metalRed')
car(-48, -2.2, true, 'metalGrey')
car(2.2, -16, false, 'metalRed')
car(-2.2, -32, false, 'metalGrey')
car(2.2, 16, false, 'metalRed')
car(-2.2, 32, false, 'metalGrey')
car(2.2, -48, false, 'metalRed')

// === Bases de banderas (CTF) en los extremos de la avenida E-O ===
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

// ------------------------------------------------------------
// ÁRBOLES (el tronco tiene colisión; el modelo GLB Arbol.glb se
// instancia en el motor si está disponible)
// ------------------------------------------------------------
export const TREES: [number, number][] = [
  // parque SE (denso)
  [43, 43], [58, 41], [40, 56], [58, 58], [50, 64], [62, 50], [44, 48],
  // calles residenciales SE
  [28, 12], [28, 30], [60, 25], [58, 9], [28, 45], [28, 56], [9, 10], [30, 26],
  // residencial SO
  [-28, 45], [-28, 58], [-27, 50], [-8, 39], [-28, 28],
  // industrial NO (puntos sueltos)
  [-30, -48], [-7, -33], [-30, -31], [-60, -31],
  // aparcamiento NE
  [40, -40], [60, -40], [38, -30],
  // perímetro
  [64, 20], [-64, -20], [20, -64], [-20, 64], [64, -30], [-64, 30],
]
for (const [tx, tz] of TREES) B(tx, 2.1, tz, 0.5, 4.2, 0.5, 'wood')

// --- Farolas (poste con colisión; luz y cabezal decorativos) ---
export const LAMPS: [number, number][] = [
  // rotonda
  [11, 11], [11, -11], [-11, 11], [-11, -11],
  // avenida E-O
  [24, 7], [-24, 7], [48, -7], [-48, -7],
  // avenida N-S
  [7, 24], [-7, 24], [7, -48], [-7, -48], [7, 48], [-7, 48],
  // cruces de calles secundarias
  [31, 31], [-31, 31], [31, -31], [-31, -31],
  // parque y aparcamientos
  [50, 40], [54, -42],
]
for (const [lx, lz] of LAMPS) B(lx, 2.6, lz, 0.35, 5.2, 0.35, 'metalGrey')

// --- Barriles explosivos ---
export interface ExplosiveBarrel { x: number; z: number }
export const EXPLODING_BARRELS: ExplosiveBarrel[] = [
  // gasolinera
  { x: -44.2, z: 14.5 }, { x: -45.8, z: 25 },
  // almacén norte
  { x: -24, z: -14 }, { x: -14, z: -24 },
  // mercado
  { x: 8.5, z: -44 }, { x: 30.5, z: -44 },
  // rotonda
  { x: 11, z: -11 }, { x: -11, z: 11 },
  // depósito de contenedores
  { x: -22, z: -51 }, { x: -13, z: -62.5 },
  // aparcamiento NE / parque
  { x: 54, z: -48 }, { x: 58, z: 44 },
  // planta de tanques / radar
  { x: -51, z: -43.5 }, { x: -37, z: 47 },
]
for (const eb of EXPLODING_BARRELS) B(eb.x, 0.5, eb.z, 0.74, 1.0, 0.74, 'explosive')

// --- Tirolinas (E para agarrarlas) ---
export interface ZiplineSpec { from: [number, number, number]; to: [number, number, number] }
export const ZIPLINES: ZiplineSpec[] = [
  { from: [19.5, 10.0, -19.5], to: [-7, 3.0, 5] },       // azotea del hotel → rotonda
  { from: [50, 12.7, -20], to: [19.5, 5.4, -52] },       // azotea de la torre → tejado del mercado
  { from: [16, 7.1, 50], to: [48, 3.0, 46] },            // tejado casa grande → fuente del parque
  { from: [-19.5, 6.3, -19.5], to: [-49, 4.5, -46] },    // tejado del almacén → planta de tanques
]

// --- Plataformas de salto ---
export interface JumpPadSpec { x: number; z: number }
export const JUMP_PADS: JumpPadSpec[] = [
  { x: -22, z: -39 },    // depósito NO (sube a los contenedores)
  { x: 56, z: -49 },     // aparcamiento NE (sube a los tejados de las tiendas)
  { x: -36, z: 51 },     // exterior del radar (salta la muralla al interior)
  { x: 44, z: 44 },      // parque SE
  { x: 11, z: -11 },     // rotonda NE (sube al autobús/edificio bajo)
]

// --- Banderas (capturar la bandera) ---
export const FLAG_A: [number, number] = [-58, 0]
export const FLAG_B: [number, number] = [58, 0]

// --- Zonas de dominación ---
export interface DomZoneSpec { id: 'A' | 'B' | 'C'; name: string; x: number; z: number }
export const DOM_ZONES: DomZoneSpec[] = [
  { id: 'A', name: 'ALFA', x: 0, z: 0 },         // rotonda central
  { id: 'B', name: 'BRAVO', x: -19.5, z: -19.5 },// interior del almacén norte
  { id: 'C', name: 'CHARLIE', x: 46, z: 58 },    // parque SE
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
// WAYPOINTS para bots (calles + interiores)
// ------------------------------------------------------------
export const WAYPOINTS: [number, number][] = [
  // anillo rotonda (r=12, fuera de las jardineras)
  [12, 0], [8.5, 8.5], [0, 12], [-8.5, 8.5], [-12, 0], [-8.5, -8.5], [0, -12], [8.5, -8.5],
  // avenida E-O (z=±5)
  [18, 5], [27, 5], [36, 5], [45, 5], [54, 5], [-18, 5], [-27, 5], [-36, 5], [-45, 5], [-54, 5],
  [18, -5], [27, -5], [36, -5], [45, -5], [54, -5], [-18, -5], [-27, -5], [-36, -5], [-45, -5], [-54, -5],
  // avenida N-S (x=±5)
  [5, 18], [5, 27], [5, 36], [5, 45], [5, 54], [5, -18], [5, -27], [5, -36], [5, -45], [5, -54],
  [-5, 18], [-5, 27], [-5, 36], [-5, 45], [-5, 54], [-5, -18], [-5, -27], [-5, -36], [-5, -45], [-5, -54],
  // calles secundarias N-S (x=±35)
  [35, 42], [35, 30], [35, 18], [35, 6], [35, -6], [35, -18], [35, -30], [35, -42], [35, -54],
  [-35, 42], [-35, 30], [-35, 18], [-35, 6], [-35, -6], [-35, -18], [-35, -30], [-35, -42], [-35, -54],
  // calles secundarias E-O (z=±35)
  [42, 35], [30, 35], [18, 35], [6, 35], [-6, 35], [-18, 35], [-30, 35], [-42, 35], [-54, 35],
  [42, -35], [30, -35], [18, -35], [6, -35], [-6, -35], [-18, -35], [-30, -35], [-42, -35], [-54, -35],
  // anillo perímetro r62 (esquivando el mercado y el radar)
  [-62, -62], [-44, -62], [-22, -62], [22, -59], [44, -62], [62, -62],
  [62, -44], [62, -22], [62, 22], [62, 44], [62, 62],
  [44, 66], [22, 62], [-22, 62], [-44, 66], [-62, 62],
  [-62, 44], [-62, 22], [-62, -22], [-62, -44],
  // anillo intermedio r48 (esquivando fachadas)
  [0, -48], [26, -38], [40, 21], [48, 0], [40, 28], [24, 42], [0, 48], [-24, 42], [-40, 24], [-48, 0], [-42, -24], [-24, -42],
  // extremos de banderas (junto a las bases, sin pisarlas)
  [-58, 2.6], [58, 2.6],
  // parque SE
  [44, 42], [58, 42], [46, 54], [58, 56], [50, 50], [46, 62],
  // aparcamientos
  [48, -42], [51, -42], [44, -48], [-14, 14], [-24, 20], [-24, 14],
  // planta de tanques / radar exterior
  [-49, -46], [-38, 51], [-33, 63],
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
  { text: 'HOTEL', x: 19.5, y: 4.2, z: -12.2, ry: 0, color: '#f472b6', w: 4.5 },
  { text: 'TORRE ÁMBAR', x: 50, y: 5.2, z: -12.8, ry: 0, color: '#fbbf24', w: 5.5 },
  { text: 'MERCADO', x: 19.5, y: 3.8, z: -41.9, ry: 0, color: '#22d3ee', w: 5 },
  { text: 'TIENDAS', x: 50, y: 2.8, z: -53.9, ry: Math.PI, color: '#4ade80', w: 4 },
  { text: 'GAS', x: -42.2, y: 4.0, z: 19.5, ry: Math.PI / 2, color: '#f87171', w: 3 },
  { text: 'RADAR', x: -38.8, y: 2.1, z: 51, ry: Math.PI / 2, color: '#4ade80', w: 4.5 },
  { text: 'ALMACÉN', x: -19.5, y: 3.4, z: -27.6, ry: Math.PI, color: '#fbbf24', w: 4.5 },
  { text: 'DEPÓSITO', x: -19, y: 3.2, z: -38.6, ry: 0, color: '#fbbf24', w: 4.5 },
]

export interface PuddleSpec { x: number; z: number; r: number }
export const PUDDLES: PuddleSpec[] = [
  { x: 14, z: 8, r: 1.6 }, { x: -14, z: -8, r: 1.4 },
  { x: 26, z: -9, r: 1.8 }, { x: -26, z: 9, r: 1.5 },
  { x: 9, z: -26, r: 1.4 }, { x: -9, z: 26, r: 1.6 },
  { x: 44, z: 3, r: 1.5 }, { x: -44, z: -3, r: 1.4 },
  { x: 40, z: -40, r: 1.6 }, { x: -40, z: 40, r: 1.4 },
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
  flag: 'A' | 'B' | null // lleva la bandera contraria (CTF)
}

export type GrenadeKind = 'frag' | 'smoke'
export interface NetGrenade { id: string; x: number; y: number; z: number; team: Team; kind: GrenadeKind }

export interface NetFlagState {
  status: 'home' | 'carried' | 'drop'
  x: number; z: number
  carrier?: string
}

export interface NetZoneState {
  id: 'A' | 'B' | 'C'
  owner: Team | null
  prog: number           // 0..1 progreso de captura
  by: Team | null        // equipo que está capturando
}

export interface NetRoundState {
  phase: 'live' | 'ended' | 'matchend'
  timeLeft: number
  roundNumber: number
  scoresA: number        // puntuación del equipo A (kills · capturas · puntos)
  scoresB: number
  roundWinsA: number
  roundWinsB: number
  mode: GameMode
  scoreTarget: number
  /** solo en CTF */
  flags?: { a: NetFlagState; b: NetFlagState }
  /** solo en dominación */
  zones?: NetZoneState[]
  /** solo en FFA: líder actual */
  leader?: { name: string; kills: number; team: Team } | null
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
