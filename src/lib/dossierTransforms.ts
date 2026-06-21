import type { Aircraft, AircraftSnapshot, FlightDossier } from '../types'
import { DEFAULT_FUEL_INPUTS } from './aviation/fuelCalc'

export function applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier {
  const snapshot: AircraftSnapshot = { ...newAircraft, snapshotAt: new Date().toISOString() }
  return {
    ...dossier,
    aircraft: snapshot,
    fuelInputs: Object.fromEntries(
      dossier.branches.map(b => [b.id, dossier.fuelInputs[b.id] ?? { ...DEFAULT_FUEL_INPUTS }])
    ),
    loading: Object.fromEntries(
      newAircraft.massBalance.stations.map(s => [s.name, 0])
    ),
    perfInputs: {},
    updatedAt: new Date().toISOString(),
  }
}
