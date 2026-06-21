#!/usr/bin/env node
// scripts/build-aerodromes.mjs
// Génère resources/aerodromes.json depuis les CSV OurAirports.
// Usage : node scripts/build-aerodromes.mjs

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const AIRPORTS_URL    = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const RUNWAYS_URL     = 'https://davidmegginson.github.io/ourairports-data/runways.csv'
const FREQUENCIES_URL = 'https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv'

const ALLOWED_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])

const HARD_KEYWORDS = [
  'ASPH', 'ASPHALT', 'CONC', 'CONCRETE', 'TARMAC',
  'PAVED', 'MACADAM', 'BRICK',
]

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]))
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifySurface(surface) {
  const up = (surface ?? '').toUpperCase()
  return HARD_KEYWORDS.some(k => up.includes(k)) ? 'hard' : 'grass'
}

function headingFromIdent(ident) {
  const num = parseInt(ident, 10)
  return isNaN(num) ? 0 : num * 10
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchCsv(url) {
  process.stdout.write(`  Fetching ${url} ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const text = await res.text()
  const rows = parseCsv(text)
  console.log(`${rows.length} lignes`)
  return rows
}

// ── Build index maps ──────────────────────────────────────────────────────────

function buildRunwayMap(runways) {
  /** @type {Map<string, Array>} */
  const map = new Map()
  for (const r of runways) {
    if (r.closed === '1') continue
    const icao = r.airport_ident
    if (!icao) continue
    if (!map.has(icao)) map.set(icao, [])
    const list = map.get(icao)
    const lengthFt = Number(r.length_ft) || 0
    const surface  = classifySurface(r.surface)
    if (r.le_ident) {
      list.push({ ident: r.le_ident, headingMag: headingFromIdent(r.le_ident), lengthFt, surface })
    }
    if (r.he_ident) {
      list.push({ ident: r.he_ident, headingMag: headingFromIdent(r.he_ident), lengthFt, surface })
    }
  }
  return map
}

function buildFrequencyMap(frequencies) {
  /** @type {Map<string, Array>} */
  const map = new Map()
  for (const f of frequencies) {
    const icao = f.airport_ident
    if (!icao) continue
    if (!map.has(icao)) map.set(icao, [])
    const mhz = Number(f.frequency_mhz)
    if (isNaN(mhz)) continue
    map.get(icao).push({
      type: f.type,
      description: f.description,
      frequencyMhz: mhz,
    })
  }
  return map
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('OurAirports aerodrome builder\n')

  const [airports, runways, frequencies] = await Promise.all([
    fetchCsv(AIRPORTS_URL),
    fetchCsv(RUNWAYS_URL),
    fetchCsv(FREQUENCIES_URL),
  ])

  console.log('\nConstruction des index...')
  const runwayMap = buildRunwayMap(runways)
  const freqMap   = buildFrequencyMap(frequencies)

  console.log('Transformation des aérodromes FR...')
  const now = new Date().toISOString()
  const result = []

  for (const a of airports) {
    if (a.iso_country !== 'FR') continue
    if (!ALLOWED_TYPES.has(a.type)) continue
    if (!a.ident) continue

    // airport_ident in runways/frequencies CSVs matches the `ident` field in airports.csv
    // Use icao_code when available, else gps_code, else fall back to ident (e.g. FR-XXXX)
    const icao = a.icao_code || a.gps_code || a.ident

    result.push({
      icao,
      name:        a.name,
      lat:         Number(a.latitude_deg),
      lng:         Number(a.longitude_deg),
      elevationFt: Number(a.elevation_ft) || 0,
      runways:     runwayMap.get(a.ident) ?? [],
      frequencies: freqMap.get(a.ident) ?? [],
      updatedAt:   now,
    })
  }

  const outPath = join(__dirname, '..', 'resources', 'aerodromes.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')

  const totalRunways = result.reduce((s, a) => s + a.runways.length, 0)
  const totalFreqs   = result.reduce((s, a) => s + a.frequencies.length, 0)
  console.log(`\n✓ ${result.length} aérodromes écrits`)
  console.log(`  ${totalRunways} pistes · ${totalFreqs} fréquences`)
  console.log(`  → ${outPath}`)
}

main().catch(err => {
  console.error('\nErreur :', err.message)
  process.exit(1)
})
