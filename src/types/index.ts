// ── Avion ─────────────────────────────────────────────────────────────────────

export interface WeightStation {
  name: string
  arm: number        // mm depuis le datum
  maxWeight: number  // kg max pour cette station
}

export interface PerformanceTable {
  weights: number[]           // kg, triés croissant
  pressureAltitudes: number[] // ft, triés croissant
  oats: number[]              // °C, triés croissant
  values: number[][][]        // [weight_idx][pa_idx][oat_idx] = distance en mètres
  grassFactor?: number
  headwindFactor?: number
  tailwindFactor?: number
  slopeFactor?: number
}

export interface CruiseRegime {
  label: string    // ex: "75% puissance"
  ias: number      // kt — utilisé directement comme vitesse de croisière
  fuelBurn: number // L/h
}

export interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = régime par défaut du navlog
  fuelCapacity: number     // L utilisables
}

export interface AircraftMassBalance {
  emptyWeight: number
  emptyArm: number                    // mm depuis le datum
  maxWeight: number                   // kg MTOW
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [kg, mm][]
}

export interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
  factors: {
    regulatory: number
    grass: number
    headwindPerKt: number
    tailwindPerKt: number
  }
}

export interface Aircraft {
  id: string
  name: string
  registration: string
  sdReference?: string
  characteristics: AircraftCharacteristics
  massBalance: AircraftMassBalance
  performance: AircraftPerformance
}

export type AircraftSnapshot = Aircraft & { snapshotAt: string }

// ── Route ─────────────────────────────────────────────────────────────────────

export interface RouteWaypoint {
  id: string
  name: string      // ICAO ou nom libre
  type: string      // "Aerodrome" | "ReportingPoint" | "UserWaypoint" | "Town" | ...
  lat: number       // decimal degrees
  lng: number       // decimal degrees
  alt_ft: number    // altitude cible MSL en ft
  notes: string     // fréquences, espaces aériens, remarques
}

export interface ImportedRoute {
  waypoints: RouteWaypoint[]
  sourceFile: string
}

// ── Navlog ────────────────────────────────────────────────────────────────────

export interface NavlogEntry {
  legIndex: number        // 0 = premier tronçon (wp[0]→wp[1])
  fromName: string
  toName: string
  tc: number              // cap vrai de la route (°V)
  wca: number             // wind correction angle (°)
  th: number              // cap vrai corrigé vent (°V)
  mh: number              // cap magnétique (°M)
  dist_nm: number
  gs: number              // kt (calculé ou overridé)
  ete_min: number         // minutes
  fuel_l: number          // L pour ce tronçon
  cumul_fuel_l: number    // L cumulé depuis départ
  cumul_time_min: number  // min cumulé depuis départ
  gsOverridden: boolean
  eteOverridden: boolean
}

// ── Météo ─────────────────────────────────────────────────────────────────────

export interface WindLayer {
  altitude_ft: number
  direction_deg: number   // vent vrai (°V)
  speed_kt: number
}

export interface FieldWeather {
  qnh: number   // hPa
  temp: number  // °C
}

export interface WeatherInputs {
  fields: Record<string, FieldWeather>  // clé = ICAO
  winds: WindLayer[]
  notes: string  // NOTAM collés, SUPAIP, etc.
}

// ── Carburant ─────────────────────────────────────────────────────────────────

export interface FuelExtra {
  id: string
  label: string
  durationMin: number
}

export interface FuelInputs {
  gsBase: number          // kt GS de base (depuis navlog ou manuel)
  windAdjust: number      // kt d'ajustement vent (positif = vent de face)
  roulage: number         // min de roulage
  marge: number           // % de marge (ex: 10)
  extras: FuelExtra[]     // lignes libres (évolutions, etc.)
  reserveMin: number      // min de réserve (30 jour / 45 nuit)
  derouteMin: number      // min pour déroutement
  plein: boolean          // true = plein prévu
}

// ── Masse & centrage ──────────────────────────────────────────────────────────

export type StationLoading = Record<string, number>  // stationName → kg

// ── Performances ─────────────────────────────────────────────────────────────

export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  slope: number      // % positif = montée (pour TO) / descente (pour LDG)
  windKt: number     // kt positif = vent de face
  toda?: number      // m TODA disponible (optionnel, pour validation)
  lda?: number       // m LDA disponible (optionnel, pour validation)
}

// ── Dossier de vol ────────────────────────────────────────────────────────────

export interface FlightDossier {
  id: string
  name: string                    // ex: "VEA2026 LFPN→LFGH"
  date: string                    // YYYY-MM-DD
  departureTime: string           // HHMM UTC

  aircraft: AircraftSnapshot      // snapshot complet au moment de la création

  route: ImportedRoute | null
  weatherInputs: WeatherInputs
  navOverrides: Record<number, { gs?: number; ete?: number }>  // clé = legIndex
  navNotes: Record<number, string>  // clé = legIndex

  fuelInputs: FuelInputs
  loading: StationLoading         // masses par station
  perfInputs: Record<string, TerrainPerfInputs>  // clé = ICAO terrain

  notes: string                   // NOTAM, SUPAIP, remarques libres

  createdAt: string               // ISO
  updatedAt: string               // ISO
}

// ── UI ────────────────────────────────────────────────────────────────────────

export type DossierTab = 'route' | 'weather' | 'navlog' | 'fuel' | 'wb' | 'perf' | 'dossier'
export type Screen = 'home' | 'aircraft-editor' | 'dossier'

// ── Résultats de calcul (non stockés) ────────────────────────────────────────

export interface WBResult {
  totalWeight: number
  totalMoment: number
  cg: number          // mm depuis datum
  inEnvelope: boolean
}

export interface PerfConditions {
  weight: number       // kg
  pa: number           // ft
  oat: number          // °C
  surfaceGrass: boolean
  windKt: number       // positif = face, négatif = arrière
  slopePercent: number // positif = montante (TO) ou descendante (LDG)
}
