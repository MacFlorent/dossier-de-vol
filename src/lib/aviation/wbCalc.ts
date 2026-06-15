import type { AircraftMassBalance, StationLoading, WBResult } from '../../types'
import { FUEL_DENSITY_KGL } from './constants'

export function computeWB(
  massBalance: AircraftMassBalance,
  loading: StationLoading,
  fuelDensity = FUEL_DENSITY_KGL,
): WBResult {
  let totalWeight = massBalance.emptyWeight
  let totalMoment = massBalance.emptyWeight * massBalance.emptyArm

  for (const station of massBalance.stations) {
    const raw = loading[station.name] ?? 0
    const w = station.kind === 'fuel' ? raw * fuelDensity : raw
    totalWeight += w
    totalMoment += w * station.arm
  }

  const cg = totalWeight > 0 ? totalMoment / totalWeight : 0
  const inEnvelope = pointInPolygon(totalWeight, cg, massBalance.envelopePoints)

  return { totalWeight, totalMoment, cg, inEnvelope }
}

function pointInPolygon(w: number, cg: number, polygon: [number, number][]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [wi, cgi] = polygon[i]
    const [wj, cgj] = polygon[j]
    const intersect =
      cgi > cg !== cgj > cg && w < ((wj - wi) * (cg - cgi)) / (cgj - cgi) + wi
    if (intersect) inside = !inside
  }
  return inside
}
