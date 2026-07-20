import { computeSegmentTiming } from './windTriangle'
import type { FlightDossier } from '../../types'

export interface DossierTotals {
  branchCount: number
  totalDistanceNm: number
  totalRawTimeMin: number
}

export function computeDossierTotals(dossier: FlightDossier): DossierTotals {
  const regime = dossier.aircraft.characteristics.regimes[0]
  let totalDistanceNm = 0
  let totalRawTimeMin = 0

  for (const branch of dossier.branches) {
    for (const segment of branch.segments) {
      if (segment.role !== 'ENROUTE') continue
      totalDistanceNm += segment.distanceNm
      totalRawTimeMin += computeSegmentTiming(segment, regime.speed).timeMin
    }
  }

  return { branchCount: dossier.branches.length, totalDistanceNm, totalRawTimeMin }
}
