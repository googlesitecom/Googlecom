// ============================================================
// FRONTERA CERO — Configuración compartida cliente/servidor
// Modos de juego (PvP con bots + campaña), pociones de escudo
// (estilo Fortnite), armas y controles. Los MAPAS viven en
// map-pvp.ts y map-story.ts (carga perezosa por modo).
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
export type GameMode = 'escaramuza' | 'ffa' | 'bandera' | 'dominacion' | 'historia'

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
  historia: {
    id: 'historia', name: 'OPERACIÓN ISLA GALLO', short: 'HISTORIA',
    desc: 'Campaña de 5 fases · 15-20 min · mapa exclusivo',
    target: 1, time: 1800, teams: true,
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

export interface NetPickup { id: string; kind: PickupKind; x: number; z: number; active: boolean }

// ------------------------------------------------------------
// TIPOS DE MAPA — los DATOS los aporta cada mapa
// (map-pvp.ts para los modos PvP · map-story.ts para la campaña)
// ------------------------------------------------------------
export type MatKey = 'sand' | 'concrete' | 'wood' | 'metalRed' | 'metalBlue' | 'metalGreen' | 'metalOrange' | 'metalGrey' | 'sandbag' | 'crate' | 'barrel' | 'roof' | 'explosive'

export interface MapBox {
  x: number; y: number; z: number
  w: number; h: number; d: number
  mat: MatKey
}

export interface AABB { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

export function boxToAABB(b: MapBox): AABB {
  return {
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minY: b.y - b.h / 2, maxY: b.y + b.h / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  }
}

/** ¿Choca el segmento p→q con alguna caja? (para línea de visión) */
export function segmentBlocked(px: number, py: number, pz: number, qx: number, qy: number, qz: number, boxes: AABB[]): boolean {
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

export interface NeonSpec { text: string; x: number; y: number; z: number; ry: number; color: string; w: number }
export interface PuddleSpec { x: number; z: number; r: number }
export interface ExplosiveBarrel { x: number; z: number }
export interface ZiplineSpec { from: [number, number, number]; to: [number, number, number] }
export interface JumpPadSpec { x: number; z: number }
export interface DomZoneSpec { id: 'A' | 'B' | 'C'; name: string; x: number; z: number }

/** Objetivo destructible del modo historia (generador) */
export interface StoryTargetSpec { id: string; x: number; z: number }

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

export const BOT_NAMES = ['Cóndor', 'Víbora', 'Lobo', 'Halcón', 'Zorro', 'Puma', 'Oso', 'Jaguar', 'Serpiente', 'Tigre', 'Águila', 'Coyote', 'León', 'Pantera', 'Búho', 'Araña', 'Merluza', 'Dorado', 'Atún', 'Pargo', 'Barracuda', 'Tiburón']
