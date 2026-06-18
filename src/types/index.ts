// ── Avion ─────────────────────────────────────────────────────────────────────

export interface WeightStation {
  name: string
  arm: number   // mm depuis le datum
  kind: 'dry' | 'fuel'
}

export interface PerformanceTable {
  weights: number[]           // kg, triés croissant
  pressureAltitudes: number[] // ft, triés croissant
  oats: number[]              // °C absolus ou écart ISA, triés croissant
  oatAxis?: 'absolute' | 'isa_delta'  // défaut 'absolute'
  values: number[][][]        // [weight_idx][pa_idx][oat_idx] = distance en mètres
  grassValues?: number[][][]  // table herbe (mêmes dimensions) — prioritaire sur grassFactor
  grassFactor?: number
  weightCorrection?: 'interpolate' | 'quadratic'  // défaut 'interpolate'
  referenceWeight?: number    // requis si quadratic
  weightCorrectionDivisor?: number  // défaut = referenceWeight
  windCorrections?: Array<{ speedKt: number; factor: number }>
  headwindFactor?: number
  tailwindFactor?: number
}

export interface CruiseRegime {
  label: string    // ex: "75% puissance"
  speed: number    // kt TAS — utilisé directement comme vitesse de croisière
  fuelBurn: number // L/h
}

export interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = régime par défaut du navlog
  fuelCapacity: number     // L utilisables
}

export interface AircraftMassBalance {
  emptyWeight: number
  emptyArm: number                    // mm depuis le datum
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [kg, mm][]
}

export interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
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

// ── Base aérodromes ────────────────────────────────────────────────────────────

export interface RunwayInfo {
  ident: string            // texte libre: "27", "09G", "27 herbe"
  headingMag: number       // QFU — orientation magnétique de la piste
  lengthFt: number
  toda?: number            // m, optionnel
  lda?: number             // m, optionnel
  surface: 'hard' | 'grass'
}

export interface StoredAerodrome {
  icao: string
  name: string
  lat: number
  lng: number
  elevationFt: number
  runways: RunwayInfo[]
  updatedAt: string        // ISO 8601
}

// ── Branches de vol ────────────────────────────────────────────────────────────

export type FlightPointType = 'AERODROME' | 'VOR' | 'NDB' | 'WAYPOINT' | 'USER'
export type FlightPointRole = 'DEP' | 'ARR' | 'DIVERT' | 'OVERFLY'

export interface FlightPoint {
  id: string
  type: FlightPointType
  identifier: string
  role: FlightPointRole
  notes?: string
}

export interface FlightBranch {
  id: string
  label: string
  points: FlightPoint[]
  distanceNm: number
  notes: string
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

// stationName → kg (dry stations) ou L (fuel stations, converti en kg par computeWB)
export type StationLoading = Record<string, number>

// ── Performances ─────────────────────────────────────────────────────────────

export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  windKt: number    // kt positif = face, négatif = arrière
  toda?: number     // m disponible (optionnel, pour validation)
  lda?: number      // m disponible (optionnel, pour validation)
}

// ── Dossier de vol ────────────────────────────────────────────────────────────

export interface FlightDossier {
  id: string
  name: string
  date: string
  departureTime: string

  aircraft: AircraftSnapshot

  branches: FlightBranch[]
  weatherInputs: WeatherInputs
  fuelInputs: Record<string, FuelInputs>  // key = branch id

  loading: StationLoading
  perfRegulatory: number
  perfInputs: Record<string, TerrainPerfInputs>

  notes: string

  createdAt: string
  updatedAt: string
}

// ── UI ────────────────────────────────────────────────────────────────────────

export type DossierTab = 'branches' | 'weather' | 'fuel' | 'wb' | 'perf' | 'dossier'
export type Screen = 'home' | 'aircraft-editor' | 'dossier' | 'aerodrome-db'

// ── Résultats de calcul (non stockés) ────────────────────────────────────────

export interface WBResult {
  totalWeight: number
  totalMoment: number
  cg: number          // mm depuis datum
  inEnvelope: boolean
}

export interface PerfConditions {
  weight: number    // kg
  pa: number        // ft pression
  oat: number       // °C
  surfaceGrass: boolean
  windKt: number    // positif = face, négatif = arrière
}
