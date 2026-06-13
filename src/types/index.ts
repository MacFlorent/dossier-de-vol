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
  grassFactor?: number        // multiplicateur herbe (défaut 1.20)
  headwindFactor?: number     // réduction par kt de vent de face (défaut 0.025)
  tailwindFactor?: number     // majoration par kt de vent arrière (défaut 0.02)
  slopeFactor?: number        // majoration par % de pente (défaut 0.07)
}

export interface Aircraft {
  id: string
  name: string              // ex: "DR221"
  registration: string      // ex: "F-BPCT"
  sdReference?: string      // pour auto-match à l'import .flightplan

  // Performances croisière
  ias: number               // kt IAS de croisière
  tas: number               // kt TAS de croisière
  fuelBurn: number          // L/h en croisière
  fuelCapacity: number      // L utilisables
  fuelDensity: number       // kg/L (0.72 Avgas)
  taxiFuel: number          // L de roulage

  // Masse & centrage
  emptyWeight: number       // kg
  emptyArm: number          // mm depuis le datum
  maxWeight: number         // kg MTOW
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [poids_kg, cg_mm][]

  // Tables de performances
  toTable: PerformanceTable
  ldgTable: PerformanceTable

  // Facteurs réglementaires (appliqués dans le PerfPanel, pas dans computePerf)
  factors: {
    regulatory: number      // ex: 1.15
    grass: number           // ex: 1.20 — mirrors PerformanceTable.grassFactor; PerfPanel applies this directly
    headwindPerKt: number   // réduction par kt de vent de face
    tailwindPerKt: number   // majoration par kt de vent arrière
  }

  magneticVariation: number // degrés, positif = Est
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
