import type { Aircraft, StationLoading } from '../../types'

export interface WBResult {
  totalWeight: number   // kg
  totalMoment: number   // kg·mm
  cg: number            // mm depuis datum
  inEnvelope: boolean
}

export function computeWB(aircraft: Aircraft, loading: StationLoading): WBResult {
  let totalWeight = aircraft.emptyWeight
  let totalMoment = aircraft.emptyWeight * aircraft.emptyArm

  for (const station of aircraft.stations) {
    const w = loading[station.name] ?? 0
    totalWeight += w
    totalMoment += w * station.arm
  }

  const cg = totalWeight > 0 ? totalMoment / totalWeight : 0
  const inEnvelope = pointInPolygon(totalWeight, cg, aircraft.envelopePoints)

  return { totalWeight, totalMoment, cg, inEnvelope }
}

/** Ray-casting algorithm : point [w, cg] dans le polygone de l'enveloppe */
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
