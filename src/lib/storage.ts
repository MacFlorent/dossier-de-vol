import type { Aircraft, AircraftMassBalance, FlightDossier } from '../types'

const AIRCRAFT_KEY_PREFIX = 'dossier-de-vol:aircraft:'
const AIRCRAFT_INDEX_KEY = 'dossier-de-vol:aircraft:index'

// ── Aircraft (localStorage) ──────────────────────────────────────────────────

export function listAircraft(): Aircraft[] {
  const raw = localStorage.getItem(AIRCRAFT_INDEX_KEY)
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  return ids.flatMap(id => {
    const a = getAircraft(id)
    return a ? [a] : []
  })
}

export function getAircraft(id: string): Aircraft | null {
  const raw = localStorage.getItem(AIRCRAFT_KEY_PREFIX + id)
  if (!raw) return null
  const ac = JSON.parse(raw) as Aircraft
  if (ac.massBalance) {
    // Migrate pre-kind schema: stations had no kind field
    ac.massBalance.stations = ac.massBalance.stations.map(s => ({
      ...s,
      kind: s.kind ?? 'dry',
    }))
    // Migrate: maxWeight is now derived from envelopePoints, not stored
    const mb = ac.massBalance as AircraftMassBalance & { maxWeight?: unknown }
    delete mb.maxWeight
  }
  return ac
}

export function saveAircraft(aircraft: Aircraft): void {
  localStorage.setItem(AIRCRAFT_KEY_PREFIX + aircraft.id, JSON.stringify(aircraft))
  const raw = localStorage.getItem(AIRCRAFT_INDEX_KEY)
  const ids: string[] = raw ? JSON.parse(raw) : []
  if (!ids.includes(aircraft.id)) {
    ids.push(aircraft.id)
    localStorage.setItem(AIRCRAFT_INDEX_KEY, JSON.stringify(ids))
  }
}

export function deleteAircraft(id: string): void {
  localStorage.removeItem(AIRCRAFT_KEY_PREFIX + id)
  const raw = localStorage.getItem(AIRCRAFT_INDEX_KEY)
  if (!raw) return
  const ids: string[] = JSON.parse(raw)
  localStorage.setItem(AIRCRAFT_INDEX_KEY, JSON.stringify(ids.filter(i => i !== id)))
}

export function downloadFleet(): void {
  const fleet = listAircraft()
  const payload = JSON.stringify({ version: 1, aircraft: fleet }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `flotte-dossier-de-vol-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importFleet(selected: Aircraft[]): { added: number; updated: number } {
  // Deduplicate by registration — last entry wins for duplicate registrations in input
  const deduped = selected.filter(
    (ac, idx, arr) => arr.findLastIndex(a => a.registration === ac.registration) === idx
  )
  const existing = listAircraft()
  let added = 0
  let updated = 0
  for (const imported of deduped) {
    const match = existing.find(ac => ac.registration === imported.registration)
    if (match) {
      saveAircraft({ ...imported, id: match.id })
      updated++
    } else {
      saveAircraft({ ...imported, id: crypto.randomUUID() })
      added++
    }
  }
  return { added, updated }
}

export function duplicateAircraft(ac: Aircraft): Aircraft {
  return { ...ac, id: crypto.randomUUID(), registration: '', name: `${ac.name} (copie)` }
}

// ── Dossier (JSON file) ──────────────────────────────────────────────────────

export function downloadDossier(dossier: FlightDossier): void {
  const json = JSON.stringify(dossier, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dossier-de-vol-${dossier.name.replace(/[^a-zA-Z0-9-]/g, '_')}-${dossier.date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function loadDossierFromFile(file: File): Promise<FlightDossier> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const data = JSON.parse(text)
        if (!data.id || !data.name || !data.aircraft) {
          reject(new Error('Invalid dossier file: missing required fields (id, name, aircraft)'))
          return
        }
        resolve(data as FlightDossier)
      } catch {
        reject(new Error('Invalid dossier file: not valid JSON'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
