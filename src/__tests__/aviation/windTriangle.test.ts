import { solveWindTriangle, windAtAltitude } from '../../lib/aviation/windTriangle'

describe('solveWindTriangle', () => {
  it('no wind: wca=0, gs=tas, th=tc', () => {
    const r = solveWindTriangle(90, 100, 0, 0)
    expect(r.wca).toBeCloseTo(0, 5)
    expect(r.gs).toBe(100)
    expect(r.th).toBeCloseTo(90, 0)
  })

  it('direct headwind: gs ≈ tas - windSpeed', () => {
    const r = solveWindTriangle(0, 100, 0, 20)
    expect(r.gs).toBeCloseTo(80, 0)
    expect(r.wca).toBeCloseTo(0, 1)
    expect(r.th).toBeCloseTo(0, 0)
  })

  it('direct tailwind: gs ≈ tas + windSpeed', () => {
    const r = solveWindTriangle(0, 100, 180, 20)
    expect(r.gs).toBeCloseTo(120, 0)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('crosswind from right: wca > 0, th > tc', () => {
    // tc=0 (north), wind from 90° (east) = crosswind from right
    const r = solveWindTriangle(0, 100, 90, 20)
    expect(r.wca).toBeGreaterThan(0)
    expect(r.th).toBeGreaterThan(0)
  })

  it('wca is negative for wind from left', () => {
    // tc=0 (north), wind from 270° (west) = crosswind from left
    const r = solveWindTriangle(0, 100, 270, 20)
    expect(r.wca).toBeLessThan(0)
  })
})

describe('windAtAltitude', () => {
  it('returns zeros for empty layers', () => {
    const r = windAtAltitude(0, [])
    expect(r.direction_deg).toBe(0)
    expect(r.speed_kt).toBe(0)
  })

  it('clamps to single layer when altitude is above it', () => {
    const r = windAtAltitude(2500, [
      { altitude_ft: 2000, direction_deg: 180, speed_kt: 10 },
    ])
    expect(r.direction_deg).toBe(180)
    expect(r.speed_kt).toBe(10)
  })

  it('clamps to nearest layer when altitude is below lowest', () => {
    const r = windAtAltitude(500, [
      { altitude_ft: 1000, direction_deg: 180, speed_kt: 10 },
    ])
    expect(r.direction_deg).toBe(180)
    expect(r.speed_kt).toBe(10)
  })

  it('interpolates midpoint between two layers', () => {
    const r = windAtAltitude(1500, [
      { altitude_ft: 1000, direction_deg: 100, speed_kt: 10 },
      { altitude_ft: 2000, direction_deg: 200, speed_kt: 20 },
    ])
    expect(r.direction_deg).toBeCloseTo(150, 1)
    expect(r.speed_kt).toBeCloseTo(15, 1)
  })

  it('returns exact lower layer when at exact lower altitude', () => {
    const r = windAtAltitude(1000, [
      { altitude_ft: 1000, direction_deg: 100, speed_kt: 10 },
      { altitude_ft: 2000, direction_deg: 200, speed_kt: 20 },
    ])
    expect(r.direction_deg).toBe(100)
    expect(r.speed_kt).toBe(10)
  })
})
