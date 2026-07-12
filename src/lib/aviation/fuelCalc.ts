import { computeSegmentTiming } from './windTriangle'
import { FUEL_DENSITY_KGL } from './constants'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

export const DEFAULT_FUEL_INPUTS: FuelInputs = {
  pilotFactor: 0,
  taxiMin: 10,
  landingMin: 15,
  alternateLandingMin: 15,
  extras: [],
  reserveMode: 'day',
}

export interface SegmentFuelDetail {
  segmentId: string
  name: string
  role: 'ENROUTE' | 'ALTERNATE'
  distanceNm: number
  gs: number
  wca: number
  timeMin: number
}

export interface BranchFuelResult {
  segmentDetails: SegmentFuelDetail[]
  totalDistanceNm: number
  rawFlightTimeMin: number
  alternateTimeMin: number
  extrasMin: number
  totalFlightTimeMin: number
  flightFuelL: number
  totalAlternateTimeMin: number
  alternateFuelL: number
  reserveMin: number
  requiredEnduranceMin: number
  requiredFuelL: number
  requiredFuelKg: number
}

function computeSegmentDetail(segment: FlightSegment, tas: number): SegmentFuelDetail {
  const { gs, wca, timeMin } = computeSegmentTiming(segment, tas)
  return { segmentId: segment.id, name: segment.name, role: segment.role, distanceNm: segment.distanceNm, gs, wca, timeMin }
}

export function computeBranchFuel(
  branch: FlightBranch,
  fi: FuelInputs,
  regime: CruiseRegime,
): BranchFuelResult {
  const segmentDetails = branch.segments.map(seg => computeSegmentDetail(seg, regime.speed))
  const enroute = segmentDetails.filter(s => s.role === 'ENROUTE')
  const alternate = segmentDetails.find(s => s.role === 'ALTERNATE')

  const rawFlightTimeMin = enroute.reduce((s, d) => s + d.timeMin, 0)
  const totalDistanceNm = enroute.reduce((s, d) => s + d.distanceNm, 0)
  const alternateTimeMin = alternate?.timeMin ?? 0
  const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)

  const factor = 1 + fi.pilotFactor / 100
  const totalFlightTimeMin = (rawFlightTimeMin + fi.taxiMin + fi.landingMin) * factor + extrasMin
  const flightFuelL = (totalFlightTimeMin / 60) * regime.fuelBurn

  const totalAlternateTimeMin = alternate
    ? (alternateTimeMin + fi.alternateLandingMin) * factor
    : 0
  const alternateFuelL = (totalAlternateTimeMin / 60) * regime.fuelBurn

  const reserveMin = fi.reserveMode === 'day' ? 30 : 45

  const requiredEnduranceMin = totalFlightTimeMin + totalAlternateTimeMin + reserveMin
  const requiredFuelL = (requiredEnduranceMin / 60) * regime.fuelBurn
  const requiredFuelKg = requiredFuelL * FUEL_DENSITY_KGL

  return {
    segmentDetails, totalDistanceNm, rawFlightTimeMin, alternateTimeMin, extrasMin,
    totalFlightTimeMin, flightFuelL,
    totalAlternateTimeMin, alternateFuelL,
    reserveMin, requiredEnduranceMin, requiredFuelL, requiredFuelKg,
  }
}
