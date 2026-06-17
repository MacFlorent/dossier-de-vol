import type { StoredAerodrome } from '../../types'
import { distanceNm } from '../aviation/coordinates'
import SEED from '../../../resources/aerodromes.json'

const KEY = 'dossier-de-vol:aerodromes'

function load(): StoredAerodrome[] {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as StoredAerodrome[]) : []
}

function save(db: StoredAerodrome[]): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function initAerodromeDb(): void {
  if (localStorage.getItem(KEY) !== null) return
  save(SEED as StoredAerodrome[])
}

export function getAerodromeDb(): StoredAerodrome[] {
  return load()
}

export function getAerodrome(icao: string): StoredAerodrome | undefined {
  return load().find(a => a.icao === icao)
}

export function upsertAerodrome(aerodrome: StoredAerodrome): void {
  const db = load()
  const idx = db.findIndex(a => a.icao === aerodrome.icao)
  if (idx >= 0) db[idx] = aerodrome
  else db.push(aerodrome)
  save(db)
}

export function deleteAerodromeFromDb(icao: string): void {
  save(load().filter(a => a.icao !== icao))
}

export function exportAerodromeDb(): void {
  const payload = JSON.stringify({ version: 1, aerodromes: load() }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aerodromes-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function findIcaoByCoords(
  lat: number,
  lng: number,
  thresholdNm = 2,
): string | null {
  const db = load()
  let bestIcao: string | null = null
  let bestDist = thresholdNm

  for (const a of db) {
    const d = distanceNm(lat, lng, a.lat, a.lng)
    if (d < bestDist) {
      bestDist = d
      bestIcao = a.icao
    }
  }
  return bestIcao
}

export function importAerodromeDb(
  incoming: StoredAerodrome[]
): { added: number; updated: number } {
  const db = load()
  let added = 0, updated = 0
  for (const a of incoming) {
    const idx = db.findIndex(x => x.icao === a.icao)
    if (idx >= 0) { db[idx] = a; updated++ }
    else { db.push(a); added++ }
  }
  save(db)
  return { added, updated }
}
