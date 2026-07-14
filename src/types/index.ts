// ── Avion ─────────────────────────────────────────────────────────────────────

export interface WeightStation {
  name: string
  arm: number   // mm depuis le datum
  kind: 'dry' | 'fuel'
  capacityL: number   // capacité utilisable, pertinent seulement si kind === 'fuel'
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

export interface FrequencyInfo {
  type: string             // ex : "TWR", "AFIS", "ATIS", "APP"
  description: string
  frequencyMhz: number
}

export interface StoredAerodrome {
  icao: string
  name: string
  lat: number
  lng: number
  elevationFt: number
  runways: RunwayInfo[]
  frequencies?: FrequencyInfo[]
  updatedAt: string        // ISO 8601
}

// ── Branches de vol ───────────────────────────────────────────────────────────

export interface FlightAerodrome {
  id: string
  identifier: string             // code OACI
  role: 'DEP' | 'ARR' | 'ALTERNATE' | 'OVERFLY'
}

export type FlightSegmentRole = 'ENROUTE' | 'ALTERNATE'

export interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number             // Cap magnétique (°M)
  wind: { directionDeg: number; speedKt: number } | null  // Direction °M
}

export interface FlightBranch {
  id: string
  label: string                  // obligatoire, non vide
  aerodromes: FlightAerodrome[]
  segments: FlightSegment[]      // min 1 ENROUTE
  notes: string
}

// ── Carburant ─────────────────────────────────────────────────────────────────

export interface FuelExtra {
  id: string
  label: string
  durationMin: number
}

export interface FuelInputs {
  pilotFactor: number           // pilot adjustment %, default 0
  taxiMin: number               // taxi + takeoff, default 10
  landingMin: number            // integration + landing, default 15
  alternateLandingMin: number   // alternate integration + landing, default 15
  extras: FuelExtra[]           // named extra phases (unchanged)
  reserveMode: 'day' | 'night'  // regulatory reserve: 30 or 45 min
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
  windDirDeg?: number      // vent réel saisi — direction magnétique
  windSpeedKt?: number     // vent réel saisi — vitesse en kt
  selectedRunway?: string  // piste active choisie (auto ou manuelle)
  elevation?: number       // élévation terrain saisie (survit au changement d'onglet)
  qnh?: number             // QNH saisi
  temp?: number            // température saisie
}

// ── Dossier de vol ────────────────────────────────────────────────────────────

export interface FlightDossier {
  id: string
  name: string
  date: string
  departureTime: string

  aircraft: AircraftSnapshot

  branches: FlightBranch[]
  fuelInputs: Record<string, FuelInputs>  // key = branch id

  loading: StationLoading
  perfRegulatory: number
  perfInputs: Record<string, TerrainPerfInputs>
  perfExtraAerodromes: string[]   // ICAO ajoutés manuellement sur Performances (hors DEP/ARR/DVRT)

  notes: string

  createdAt: string
  updatedAt: string
}

// ── UI ────────────────────────────────────────────────────────────────────────

export type DossierTab = 'branches' | 'fuel' | 'wb' | 'perf' | 'dossier'
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
