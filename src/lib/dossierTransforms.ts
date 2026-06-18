import type { Aircraft, AircraftSnapshot, FlightDossier } from '../types'

export function applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier {
  const snapshot: AircraftSnapshot = { ...newAircraft, snapshotAt: new Date().toISOString() }
  return {
    ...dossier,
    aircraft: snapshot,
    fuelInputs: Object.fromEntries(
      dossier.branches.map(b => [b.id, {
        ...dossier.fuelInputs[b.id],
        gsBase: newAircraft.characteristics.regimes[0].speed,
        windAdjust: 0,
      }])
    ),
    loading: Object.fromEntries(
      newAircraft.massBalance.stations.map(s => [s.name, 0])
    ),
    perfInputs: {},
    updatedAt: new Date().toISOString(),
  }
}
