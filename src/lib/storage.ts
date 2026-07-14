import type { Aircraft, AircraftMassBalance, FlightDossier, WeightStation } from '../types'

const AIRCRAFT_KEY_PREFIX = 'dossier-de-vol:aircraft:'
const AIRCRAFT_INDEX_KEY = 'dossier-de-vol:aircraft:index'

function migrateAircraftFuelCapacity(ac: Aircraft): void {
  const legacyCapacity = (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
  if (legacyCapacity === undefined) return
  const fuelStations = ac.massBalance.stations.filter(s => s.kind === 'fuel')
  const each = fuelStations.length > 0 ? legacyCapacity / fuelStations.length : 0
  ac.massBalance.stations = ac.massBalance.stations.map(s =>
    s.kind === 'fuel' && (s as WeightStation & { capacityL?: number }).capacityL === undefined
      ? { ...s, capacityL: each }
      : s
  )
  delete (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
}

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
    // Migrate: ias → speed in cruise regimes
    ac.characteristics.regimes = ac.characteristics.regimes.map(r => {
      const legacy = r as typeof r & { ias?: number }
      if (legacy.ias !== undefined && (r as { speed?: number }).speed === undefined) {
        const { ias: _ias, ...rest } = legacy
        return { ...rest, speed: _ias }
      }
      return r
    })
    // Migrate: fuelCapacity (global) → capacityL per fuel station
    migrateAircraftFuelCapacity(ac)
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

export function migrateDossier(d: unknown): FlightDossier {
  const data = d as Record<string, unknown>
  // Migrate pre-branches dossiers
  if (!Array.isArray(data.branches)) {
    const branchId = crypto.randomUUID()
    data.branches = [{
      id: branchId,
      label: 'Aller',
      aerodromes: [],
      segments: [{ id: crypto.randomUUID(), role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null }],
      notes: '',
    }]
    // Migrate fuelInputs: FuelInputs → Record<branchId, FuelInputs>
    if (data.fuelInputs && typeof (data.fuelInputs as Record<string, unknown>).gsBase === 'number') {
      const legacy = data.fuelInputs as Record<string, unknown>
      const { gsBase: _gsBase, windAdjust: _windAdjust, derouteMin: _derouteMin, ...rest } = legacy
      data.fuelInputs = { [branchId]: rest }
    }
  }
  // Migrate legacy embedded aircraft snapshot: fuelCapacity (global) → capacityL per fuel station
  if (data.aircraft) {
    migrateAircraftFuelCapacity(data.aircraft as Aircraft)
  }

  if (!Array.isArray(data.perfExtraAerodromes)) data.perfExtraAerodromes = []

  // Remove legacy fields
  delete data.route
  delete data.navOverrides
  delete data.navNotes
  return data as unknown as FlightDossier
}

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
        resolve(migrateDossier(data))
      } catch {
        reject(new Error('Invalid dossier file: not valid JSON'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
