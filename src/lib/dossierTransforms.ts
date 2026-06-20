import type { Aircraft, AircraftSnapshot, FlightDossier, FuelInputs } from '../types'

const DEFAULT_FUEL: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }

export function applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier {
  const snapshot: AircraftSnapshot = { ...newAircraft, snapshotAt: new Date().toISOString() }
  return {
    ...dossier,
    aircraft: snapshot,
    fuelInputs: Object.fromEntries(
      dossier.branches.map(b => [b.id, dossier.fuelInputs[b.id] ?? { ...DEFAULT_FUEL }])
    ),
    loading: Object.fromEntries(
      newAircraft.massBalance.stations.map(s => [s.name, 0])
    ),
    perfInputs: {},
    updatedAt: new Date().toISOString(),
  }
}
