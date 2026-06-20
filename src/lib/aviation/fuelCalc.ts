import { computeSegmentWind } from './windTriangle'
import { FUEL_DENSITY_KGL } from './constants'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

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
  flightTimeMin: number
  derouteMin: number
  extrasMin: number
  totalTime: number
  totalWithMargin: number
  fuelL: number
  fuelKg: number
}

function computeSegmentDetail(segment: FlightSegment, tas: number): SegmentFuelDetail {
  let gs = tas
  let wca = 0
  if (segment.wind) {
    const r = computeSegmentWind(segment.headingMag, tas, segment.wind.directionDeg, segment.wind.speedKt)
    gs = r.gs
    wca = r.wca
  }
  const timeMin = gs !== 0 ? (segment.distanceNm / gs) * 60 : Infinity
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

  const flightTimeMin = enroute.reduce((s, d) => s + d.timeMin, 0)
  const derouteMin = alternate?.timeMin ?? 0
  const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)

  const totalTime = flightTimeMin + fi.roulage + extrasMin + fi.reserveMin + derouteMin
  const totalWithMargin = totalTime * (1 + fi.marge / 100)
  const fuelL = (totalWithMargin / 60) * regime.fuelBurn
  const fuelKg = fuelL * FUEL_DENSITY_KGL

  return { segmentDetails, flightTimeMin, derouteMin, extrasMin, totalTime, totalWithMargin, fuelL, fuelKg }
}
