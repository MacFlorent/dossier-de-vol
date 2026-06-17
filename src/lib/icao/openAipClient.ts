import type { StoredAerodrome, RunwayInfo } from '../../types'

const BASE = 'https://api.core.openaip.net/api'
const M_TO_FT = 3.28084

function mapSurface(composite: number): 'hard' | 'grass' {
  // OpenAIP composite codes: 0=concrete, 1=asphalt, 2=bituminous → hard
  // 5=grass, 6=gravel, 7=sand, 8=water, 9=other → grass (fallback)
  return composite <= 2 ? 'hard' : 'grass'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRunway(rwy: any): RunwayInfo {
  return {
    ident: String(rwy.designator ?? ''),
    headingTrue: Number(rwy.trueHeading ?? 0),
    lengthFt: Number(rwy.dimension?.length?.value ?? 0),
    surface: mapSurface(rwy.surface?.mainComposite ?? 0),
  }
}

export async function fetchFromOpenAip(
  icao: string,
  apiKey: string,
): Promise<StoredAerodrome | null> {
  try {
    const url = `${BASE}/airports?icao_code=${encodeURIComponent(icao)}&limit=1`
    const res = await fetch(url, { headers: { 'x-openaip-api-key': apiKey } })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    const item = data?.items?.[0]
    if (!item) return null

    const elevRaw = Number(item.elevation?.value ?? 0)
    const elevUnit = item.elevation?.unit ?? 0  // 0=m, 1=ft
    const elevationFt = elevUnit === 1 ? elevRaw : elevRaw * M_TO_FT

    const [lng, lat] = item.geometry?.coordinates ?? [0, 0]

    return {
      icao: String(item.icaoCode ?? icao),
      name: String(item.name ?? ''),
      lat: Number(lat),
      lng: Number(lng),
      elevationFt: Math.round(elevationFt),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runways: Array.isArray(item.runways) ? item.runways.map((r: any) => parseRunway(r)) : [],
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
