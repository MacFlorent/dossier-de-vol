import type { ImportedRoute, RouteWaypoint } from '../../types/index'

export interface ParsedFlightplan {
  routes: ImportedRoute[]
  weightBalance: Record<string, number>
  aircraftReference?: string
}

// ── DMS coordinate helpers ────────────────────────────────────────────────────

function parseDms(part: string): number {
  const hem = part[0]  // N, S, E, W
  const digits = part.slice(1)
  const isLng = hem === 'E' || hem === 'W'
  const degLen = isLng ? 3 : 2
  const deg = parseInt(digits.slice(0, degLen), 10)
  const minSec = digits.slice(degLen)
  const min = parseInt(minSec.slice(0, 2), 10)
  const sec = parseFloat(minSec.slice(2))
  const decimal = deg + min / 60 + sec / 3600
  return (hem === 'S' || hem === 'W') ? -decimal : decimal
}

function parseCoordinate(str: string): { lat: number; lng: number } {
  // str = "N484459.10 E0020640.25"
  const [latPart, lngPart] = str.trim().split(/\s+/)
  return {
    lat: parseDms(latPart),
    lng: parseDms(lngPart),
  }
}

// ── Level parsing ─────────────────────────────────────────────────────────────

function parseLevel(level: string | null): number {
  if (!level || level === 'MSL') return 0
  const n = parseInt(level, 10)
  return isNaN(n) ? 0 : n
}

// ── Waypoint name from type ───────────────────────────────────────────────────

function nameFromType(type: string): string {
  if (type === 'UserWaypoint') return '(Waypoint)'
  if (type) return `(${type})`
  return '(Unknown)'
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseFlightplan(xmlString: string, sourceFile = ''): ParsedFlightplan {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  // Aircraft reference
  const acRef = doc.querySelector('AircraftReference')
  const aircraftReference = acRef?.getAttribute('Name') ?? undefined

  // Weight & balance (from PrimaryRoute)
  const weightBalance: Record<string, number> = {}
  doc.querySelectorAll('PrimaryRoute > WeightBalance > LoadingPoint').forEach(lp => {
    const name = lp.getAttribute('Name')
    const weight = lp.getAttribute('Weight')
    if (name && weight !== null) {
      weightBalance[name] = parseFloat(weight)
    }
  })

  // Routes: PrimaryRoute and Route elements
  const routeElements = Array.from(
    doc.querySelectorAll('PrimaryRoute, Route')
  )

  const routes: ImportedRoute[] = routeElements.map((routeEl, routeIndex) => {
    const waypoints: RouteWaypoint[] = []

    // Start waypoint
    const startCoord = routeEl.getAttribute('Start')
    const startType = routeEl.getAttribute('StartType') ?? 'Unknown'
    if (startCoord) {
      const { lat, lng } = parseCoordinate(startCoord)
      waypoints.push({
        id: `wp-${routeIndex}-0`,
        name: nameFromType(startType),
        type: startType,
        lat,
        lng,
        alt_ft: parseLevel(routeEl.getAttribute('Level')),
        notes: '',
      })
    }

    // Leg waypoints from RhumbLineRoute children
    const legs = Array.from(routeEl.children).filter(
      el => el.tagName === 'RhumbLineRoute'
    )

    legs.forEach((leg, legIndex) => {
      const toCoord = leg.getAttribute('To')
      const toType = leg.getAttribute('ToType') ?? 'Unknown'
      const level = leg.getAttribute('Level')
      if (toCoord) {
        const { lat, lng } = parseCoordinate(toCoord)
        waypoints.push({
          id: `wp-${routeIndex}-${legIndex + 1}`,
          name: nameFromType(toType),
          type: toType,
          lat,
          lng,
          alt_ft: parseLevel(level),
          notes: '',
        })
      }
    })

    return { waypoints, sourceFile }
  })

  return { routes, weightBalance, aircraftReference }
}
