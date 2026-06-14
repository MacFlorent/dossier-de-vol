import { describe, it, expect } from 'vitest'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import type { NavlogAircraftParams } from '../../lib/aviation/navlogGen'
import type { ImportedRoute, WeatherInputs } from '../../types'

const ac: NavlogAircraftParams = { ias: 100, fuelBurn: 20 }

const calmsRoute: ImportedRoute = {
  waypoints: [
    { id: '1', name: 'DEP', type: 'Aerodrome', lat: 48.0, lng: 2.0, alt_ft: 0, notes: '' },
    { id: '2', name: 'WP1', type: 'ReportingPoint', lat: 49.0, lng: 2.0, alt_ft: 3000, notes: '' },
    { id: '3', name: 'ARR', type: 'Aerodrome', lat: 49.0, lng: 3.0, alt_ft: 0, notes: '' },
  ],
  sourceFile: 'test.flightplan',
}

const noWind: WeatherInputs = { fields: {}, winds: [], notes: '' }

describe('generateNavlog', () => {
  it('empty route returns []', () => {
    const result = generateNavlog({ waypoints: [], sourceFile: '' }, noWind, ac)
    expect(result).toEqual([])
  })

  it('single waypoint returns []', () => {
    const result = generateNavlog(
      { waypoints: [calmsRoute.waypoints[0]], sourceFile: '' },
      noWind,
      ac,
    )
    expect(result).toEqual([])
  })

  it('calm winds, two legs: generates 2 NavlogEntry objects', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    expect(result).toHaveLength(2)
    expect(result[0].legIndex).toBe(0)
    expect(result[1].legIndex).toBe(1)
  })

  it('first leg properties are correct for calm wind', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    const leg0 = result[0]

    expect(leg0.fromName).toBe('DEP')
    expect(leg0.toName).toBe('WP1')
    expect(leg0.dist_nm).toBeGreaterThan(0)
    // calm wind: GS = IAS = 100
    expect(leg0.gs).toBe(100)
    // ETE = dist/gs*60
    expect(leg0.ete_min).toBeCloseTo(leg0.dist_nm / 100 * 60, 1)
    expect(leg0.fuel_l).toBeGreaterThan(0)
    expect(leg0.gsOverridden).toBe(false)
    expect(leg0.eteOverridden).toBe(false)
  })

  it('GS override: gs=80, gsOverridden=true, ete recalculated', () => {
    const result = generateNavlog(calmsRoute, noWind, ac, { 0: { gs: 80 } })
    const leg0 = result[0]

    expect(leg0.gs).toBe(80)
    expect(leg0.gsOverridden).toBe(true)
    expect(leg0.eteOverridden).toBe(false)
    expect(leg0.ete_min).toBeCloseTo(leg0.dist_nm / 80 * 60, 1)
  })

  it('ETE override: ete_min=30, eteOverridden=true', () => {
    const result = generateNavlog(calmsRoute, noWind, ac, { 0: { ete: 30 } })
    const leg0 = result[0]

    expect(leg0.ete_min).toBe(30)
    expect(leg0.eteOverridden).toBe(true)
    expect(leg0.gsOverridden).toBe(false)
  })

  it('cumulative values: cumul_fuel_l = leg0.fuel_l + leg1.fuel_l', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    const [leg0, leg1] = result

    expect(leg1.cumul_fuel_l).toBeCloseTo(leg0.fuel_l + leg1.fuel_l, 2)
    expect(leg1.cumul_time_min).toBeCloseTo(leg0.ete_min + leg1.ete_min, 1)
  })

  it('mh equals rounded th (no magnetic variation)', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    const leg0 = result[0]
    // mh = normAngle(th), no variation applied
    const expected = ((leg0.th % 360) + 360) % 360
    expect(leg0.mh).toBe(Math.round(expected))
  })

  it('headwind reduces GS below IAS', () => {
    // First leg is northbound (tc ≈ 0°), wind from north = headwind
    const headwind: WeatherInputs = {
      fields: {},
      winds: [{ altitude_ft: 3000, direction_deg: 0, speed_kt: 20 }],
      notes: '',
    }
    const result = generateNavlog(calmsRoute, headwind, ac)
    // Leg 0 goes north to WP1 at alt 3000 ft — headwind from 0° should reduce GS
    expect(result[0].gs).toBeLessThan(100)
  })
})
