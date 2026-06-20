import { solveWindTriangle, computeSegmentWind } from '../../lib/aviation/windTriangle'

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
  })

  it('direct tailwind: gs ≈ tas + windSpeed', () => {
    const r = solveWindTriangle(0, 100, 180, 20)
    expect(r.gs).toBeCloseTo(120, 0)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('crosswind from right: wca > 0', () => {
    const r = solveWindTriangle(0, 100, 90, 20)
    expect(r.wca).toBeGreaterThan(0)
  })

  it('wca is negative for wind from left', () => {
    const r = solveWindTriangle(0, 100, 270, 20)
    expect(r.wca).toBeLessThan(0)
  })
})

describe('computeSegmentWind', () => {
  it('no wind (speed=0): gs=TAS, wca=0', () => {
    const r = computeSegmentWind(270, 120, 0, 0)
    expect(r.gs).toBe(120)
    expect(r.wca).toBe(0)
  })

  it('direct headwind reduces GS', () => {
    // cap 270, vent du 270 = plein face
    const r = computeSegmentWind(270, 120, 270, 20)
    expect(r.gs).toBeCloseTo(100, 1)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('direct tailwind increases GS', () => {
    // cap 270, vent du 090 = plein dos
    const r = computeSegmentWind(270, 120, 90, 20)
    expect(r.gs).toBeCloseTo(140, 1)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('crosswind from right gives positive WCA', () => {
    // cap 270, vent du 000 (nord) = de droite quand on vole vers l'ouest
    const r = computeSegmentWind(270, 120, 0, 20)
    expect(r.wca).toBeGreaterThan(0)
  })

  it('crosswind from left gives negative WCA', () => {
    // cap 270, vent du 180 (sud) = de gauche
    const r = computeSegmentWind(270, 120, 180, 20)
    expect(r.wca).toBeLessThan(0)
  })

  it('GS can be negative with extreme headwind', () => {
    const r = computeSegmentWind(270, 20, 270, 30)
    expect(r.gs).toBeLessThan(0)
  })

  it('pure crosswind: no headwind component', () => {
    // vent exactement perpendiculaire → GS ≈ TAS (légèrement réduite par le crabe)
    const r = computeSegmentWind(0, 100, 90, 10)
    // headwindComponent = 10*cos(90°) = 0 → GS = TAS
    expect(r.gs).toBeCloseTo(100, 1)
    expect(r.wca).not.toBe(0)
  })
})
