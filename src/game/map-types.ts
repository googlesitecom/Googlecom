// ============================================================
// FRONTERA CERO — Datos de mapa por modo de juego
// Cada modo usa SU propio mapa: el motor y la simulación leen
// el mapa ACTIVO (se carga con import() dinámico al elegir el
// modo → nunca se cargan los mapas que no se usan).
// ============================================================
import type { MatKey, PickupSpot, NeonSpec, PuddleSpec, ExplosiveBarrel, ZiplineSpec, JumpPadSpec, DomZoneSpec, AABB, MapBox, StoryTargetSpec } from './shared'

export interface StreetPlane { cx: number; cz: number; w: number; d: number }

/** Especificación de calles (asfalto/aceras/plaza) para el motor */
export interface StreetSpec {
  /** planos de asfalto [cx, cz, w, d] */
  planes: [number, number, number, number][]
  /** aceras [cx, cz, w, d] */
  walks: [number, number, number, number][]
  /** plaza central de hormigón (opcional) */
  plaza?: { cx: number; cz: number; w: number; d: number }
  /** marcas discontinuas centrales: posiciones x (sobre z=0) */
  dashXs: number[]
  /** marcas discontinuas centrales: posiciones z (sobre x=0) */
  dashZs: number[]
}

/** Todos los datos que el motor y la simulación necesitan de un mapa */
export interface MapData {
  kind: 'pvp' | 'historia'
  name: string
  mapHalf: number
  boxes: MapBox[]
  aabbs: AABB[]
  /** callejero para el renderizado */
  streets: StreetSpec
  waypoints: [number, number][]
  waypointEdges: number[][]
  trees: [number, number][]
  lamps: [number, number][]
  neons: NeonSpec[]
  puddles: PuddleSpec[]
  barrels: ExplosiveBarrel[]
  ziplines: ZiplineSpec[]
  jumpPads: JumpPadSpec[]
  flagA?: [number, number]
  flagB?: [number, number]
  domZones?: DomZoneSpec[]
  pickupSpots: PickupSpot[]
  spawnA: [number, number, number]
  spawnB: [number, number, number]
  /** objetivos destructibles del modo historia (generadores) */
  storyTargets?: StoryTargetSpec[]
  /** ambiente visual distinto por mapa (cielo/niebla/luz) */
  mood: 'atardecer' | 'ocaso-norte'
}

// ------------------------------------------------------------
// Mapa activo (se fija ANTES de crear el motor o la simulación)
// ------------------------------------------------------------
let ACTIVE: MapData | null = null

export function setActiveMap(m: MapData): void {
  ACTIVE = m
}

/** Mapa activo; si no se fijó ninguno, se usa el PvP por defecto */
export function activeMap(): MapData {
  return ACTIVE!
}

export function hasActiveMap(): boolean {
  return ACTIVE !== null
}
