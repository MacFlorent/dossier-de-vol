import type { ImportedRoute, WeatherInputs, NavlogEntry } from '../../types'
import { distanceNm, trueCourse, normAngle } from './coordinates'
import { solveWindTriangle, windAtAltitude } from './windTriangle'

export interface NavlogAircraftParams {
  tas: number               // kt TAS
  fuelBurn: number          // L/h
  magneticVariation: number // degrees, positive = East
}

export interface NavlogOverride {
  gs?: number   // kt — if set, overrides computed GS, ETE recalculated
  ete?: number  // min — if set, overrides computed ETE, GS recalculated
}

export function generateNavlog(
  route: ImportedRoute,
  weather: WeatherInputs,
  ac: NavlogAircraftParams,
  overrides: Record<number, NavlogOverride> = {},
): NavlogEntry[] {
  const wps = route.waypoints
  if (wps.length < 2) return []

  const entries: NavlogEntry[] = []
  let cumul_fuel_l = 0
  let cumul_time_min = 0

  for (let i = 0; i < wps.length - 1; i++) {
    const from = wps[i]
    const to = wps[i + 1]

    // 1. Distance and true course
    const dist_nm = Math.round(distanceNm(from.lat, from.lng, to.lat, to.lng) * 10) / 10
    const tc = Math.round(normAngle(trueCourse(from.lat, from.lng, to.lat, to.lng)))

    // 2. Wind at destination altitude
    const wind = windAtAltitude(to.alt_ft, weather.winds)

    // 3. Wind triangle
    const { wca, gs: calcGs, th } = solveWindTriangle(tc, ac.tas, wind.direction_deg, wind.speed_kt)

    // 4. Magnetic heading
    const mh = Math.round(normAngle(th - ac.magneticVariation))

    // 5. Apply overrides
    let gs: number
    let ete_min: number
    let gsOverridden = false
    let eteOverridden = false

    const override = overrides[i]
    if (override?.gs !== undefined) {
      gs = override.gs
      ete_min = Math.round((dist_nm / gs * 60) * 10) / 10
      gsOverridden = true
    } else if (override?.ete !== undefined) {
      ete_min = override.ete
      gs = Math.round(dist_nm / ete_min * 60)
      eteOverridden = true
    } else {
      gs = calcGs
      ete_min = Math.round((dist_nm / gs * 60) * 10) / 10
    }

    // 6. Fuel
    const fuel_l = Math.round((ete_min / 60 * ac.fuelBurn) * 100) / 100

    // 7. Accumulate
    cumul_fuel_l = Math.round((cumul_fuel_l + fuel_l) * 100) / 100
    cumul_time_min = Math.round((cumul_time_min + ete_min) * 10) / 10

    entries.push({
      legIndex: i,
      fromName: from.name,
      toName: to.name,
      tc,
      wca: Math.round(wca * 10) / 10,
      th: Math.round(normAngle(th)),
      mh,
      dist_nm,
      gs,
      ete_min,
      fuel_l,
      cumul_fuel_l,
      cumul_time_min,
      gsOverridden,
      eteOverridden,
    })
  }

  return entries
}
