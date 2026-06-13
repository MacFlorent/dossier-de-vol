import { parseFlightplan } from '../../lib/flightplan/parser'

const EXAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<DivelementsFlightPlanner>
  <AircraftReference Name="DR48-FGLKG" Registration="FGLKG" />
  <PrimaryRoute CourseType="GreatCircle" Start="N484459.10 E0020640.25" StartType="Aerodrome" Level="5500" CruiseProfile="75%" Rules="Vfr" PlannedFuel="110.000000">
    <RhumbLineRoute To="N484214.00 E0015922.00" ToType="UserWaypoint" Level="1500" LevelChange="B" />
    <RhumbLineRoute To="N483351.00 E0015817.00" ToType="ReportingPoint" Level="2500" LevelChange="B" />
    <RhumbLineRoute To="N481047.60 E0021659.05" ToType="Unknown" Level="2500" LevelChange="B" />
    <RhumbLineRoute To="N473525.60 E0024510.60" ToType="Town" Level="MSL" LevelChange="B" />
    <RhumbLineRoute To="N472137.00 E0025506.00" ToType="Aerodrome" Level="MSL" LevelChange="B" />
    <WeightBalance>
      <LoadingPoint Name="Pilot" Weight="73.00" />
      <LoadingPoint Name="Copilot" Weight="0.00" />
      <LoadingPoint Name="Passenger" Weight="0.00" />
      <LoadingPoint Name="Cargo" Weight="0.00" />
      <LoadingPoint Name="Main fuel" Weight="110.00" />
    </WeightBalance>
    <ReferencedAirfields />
  </PrimaryRoute>
</DivelementsFlightPlanner>`

describe('parseFlightplan', () => {
  const result = parseFlightplan(EXAMPLE_XML, 'test.flightplan')

  // 1. Parses 1 route
  it('parses 1 route', () => {
    expect(result.routes.length).toBe(1)
  })

  // 2. Route has 6 waypoints (1 start + 5 legs)
  it('route has 6 waypoints', () => {
    expect(result.routes[0].waypoints.length).toBe(6)
  })

  // 3. First waypoint coords ≈ LFPN Toussus-le-Noble
  // N484459.10 → 48 + 44/60 + 59.10/3600 = 48.74975
  // E0020640.25 → 2 + 06/60 + 40.25/3600 = 2.11118
  it('first waypoint lat ≈ 48.7497', () => {
    expect(result.routes[0].waypoints[0].lat).toBeCloseTo(48.74975, 3)
  })

  it('first waypoint lng ≈ 2.1119', () => {
    expect(result.routes[0].waypoints[0].lng).toBeCloseTo(2.11118, 3)
  })

  // 4. First waypoint type
  it('first waypoint type is Aerodrome', () => {
    expect(result.routes[0].waypoints[0].type).toBe('Aerodrome')
  })

  // 5. Last waypoint coords — N472137.00 E0025506.00
  // 47 + 21/60 + 37/3600 = 47.3603°N, 2 + 55/60 + 6/3600 = 2.9183°E
  it('last waypoint lat ≈ 47.3603', () => {
    const last = result.routes[0].waypoints[5]
    expect(last.lat).toBeCloseTo(47.3603, 4)
  })

  it('last waypoint lng ≈ 2.9183', () => {
    const last = result.routes[0].waypoints[5]
    expect(last.lng).toBeCloseTo(2.9183, 4)
  })

  // 6. WeightBalance — Pilot
  it('weightBalance Pilot === 73', () => {
    expect(result.weightBalance['Pilot']).toBe(73)
  })

  // 7. WeightBalance — Main fuel
  it('weightBalance Main fuel === 110', () => {
    expect(result.weightBalance['Main fuel']).toBe(110)
  })

  // 8. AircraftReference
  it('aircraftReference === DR48-FGLKG', () => {
    expect(result.aircraftReference).toBe('DR48-FGLKG')
  })

  // 9. Level parsing — first RhumbLine Level="1500"
  it('waypoints[1].alt_ft === 1500', () => {
    expect(result.routes[0].waypoints[1].alt_ft).toBe(1500)
  })

  // 10. MSL level — last waypoint Level="MSL" → 0
  it('last waypoint alt_ft === 0 (MSL)', () => {
    const last = result.routes[0].waypoints[5]
    expect(last.alt_ft).toBe(0)
  })

  // 11. Empty XML
  it('empty XML returns empty result', () => {
    const empty = parseFlightplan('<DivelementsFlightPlanner/>')
    expect(empty.routes).toEqual([])
    expect(empty.weightBalance).toEqual({})
    expect(empty.aircraftReference).toBeUndefined()
  })
})
