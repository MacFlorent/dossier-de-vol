import { useState, useMemo } from 'react'
import type { FlightDossier, TerrainPerfInputs, PerfConditions, AircraftSnapshot } from '../../types'
import { computePerf } from '../../lib/aviation/perfCalc'
import { computeWB } from '../../lib/aviation/wbCalc'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'

// ── Types ────────────────────────────────────────────────────────────────────

const TERRAINS = [
  { key: 'DEP', label: 'Départ', tableKey: 'to' as const },
  { key: 'ARR', label: 'Arrivée', tableKey: 'ldg' as const },
  { key: 'DEROUT', label: 'Déroutement', tableKey: 'ldg' as const },
]

const DEFAULT_PERF: TerrainPerfInputs = {
  surface: 'hard',
  slope: 0,
  windKt: 0,
  toda: undefined,
  lda: undefined,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pressureAlt(elevation: number, qnh: number): number {
  return elevation + (1013 - qnh) * 30
}

function densityAlt(pa: number, oat: number): number {
  const isa = 15 - 2 * (pa / 1000)
  return pa + (oat - isa) * 120
}

// ── TerrainCard sub-component ─────────────────────────────────────────────────

interface TerrainCardProps {
  terrainKey: string
  label: string
  tableKey: 'to' | 'ldg'
  aircraft: AircraftSnapshot
  weight: number
  defaultQnh: number
  defaultTemp: number
  perfInputs: TerrainPerfInputs
  onUpdate: (inputs: TerrainPerfInputs) => void
}

function TerrainCard({
  terrainKey,
  label,
  tableKey,
  aircraft,
  weight,
  defaultQnh,
  defaultTemp,
  perfInputs,
  onUpdate,
}: TerrainCardProps) {
  const [elevation, setElevation] = useState(0)
  const [qnh, setQnh] = useState(defaultQnh)
  const [temp, setTemp] = useState(defaultTemp)

  const inputs = { ...DEFAULT_PERF, ...perfInputs }

  const pa = pressureAlt(elevation, qnh)
  const da = densityAlt(pa, temp)

  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable

  const cond: PerfConditions = {
    weight,
    pa: da,
    oat: temp,
    surfaceGrass: inputs.surface === 'grass',
    windKt: inputs.windKt,
    slopePercent: inputs.slope,
  }

  const distBase = computePerf(table, cond)
  const distRegulatory = Math.round(distBase * aircraft.performance.factors.regulatory)

  const todaOk = inputs.toda === undefined || distRegulatory <= inputs.toda
  const ldaOk = inputs.lda === undefined || distRegulatory <= inputs.lda

  const update = (changes: Partial<TerrainPerfInputs>) => {
    onUpdate({ ...inputs, ...changes })
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </h2>
        <div className="flex gap-2">
          {inputs.toda !== undefined && (
            <Badge variant={todaOk ? 'success' : 'error'}>
              {todaOk ? 'TODA OK' : 'TODA INSUFFISANT'}
            </Badge>
          )}
          {inputs.lda !== undefined && (
            <Badge variant={ldaOk ? 'success' : 'error'}>
              {ldaOk ? 'LDA OK' : 'LDA INSUFFISANT'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Conditions</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Elév. (ft)"
              type="number"
              value={elevation === 0 ? '' : elevation}
              placeholder="0"
              onChange={(e) => setElevation(e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <Input
              label="QNH (hPa)"
              type="number"
              value={qnh}
              onChange={(e) => setQnh(Number(e.target.value))}
            />
            <Input
              label="Temp (°C)"
              type="number"
              value={temp}
              onChange={(e) => setTemp(Number(e.target.value))}
            />
            <Input
              label="Vent (kt)"
              type="number"
              value={inputs.windKt === 0 ? '' : inputs.windKt}
              placeholder="0"
              hint="+face / −arrière"
              onChange={(e) => update({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })}
            />
            <Input
              label="Pente (%)"
              type="number"
              value={inputs.slope === 0 ? '' : inputs.slope}
              placeholder="0"
              hint="+montée / −descente"
              onChange={(e) => update({ slope: e.target.value === '' ? 0 : Number(e.target.value) })}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Surface
              </label>
              <button
                type="button"
                onClick={() => update({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
                className={`
                  px-3 py-2 rounded text-xs font-medium border transition-colors
                  ${inputs.surface === 'hard'
                    ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                    : 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10'
                  }
                `}
              >
                {inputs.surface === 'hard' ? 'Dur' : 'Herbe'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="TODA (m)"
              type="number"
              value={inputs.toda ?? ''}
              placeholder="optionnel"
              onChange={(e) =>
                update({ toda: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <Input
              label="LDA (m)"
              type="number"
              value={inputs.lda ?? ''}
              placeholder="optionnel"
              onChange={(e) =>
                update({ lda: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        </div>

        {/* Results */}
        <div>
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-3">Résultats</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Altitude terrain</dt>
              <dd className="font-mono text-[var(--text-1)]">{elevation} ft</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Alt pression</dt>
              <dd className="font-mono text-[var(--text-1)]">{Math.round(pa)} ft</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Alt densité</dt>
              <dd className="font-mono text-[var(--text-1)]">{Math.round(da)} ft</dd>
            </div>
            <div className="border-t border-[var(--border)] pt-2" />
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Distance calculée</dt>
              <dd className="font-mono text-[var(--text-1)]">{distBase} m</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt className="text-[var(--text-muted)]">
                Dist. réglementaire (×{aircraft.performance.factors.regulatory})
              </dt>
              <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
            </div>
            {inputs.toda !== undefined && (
              <div className="flex justify-between text-xs">
                <dt className="text-[var(--text-dim)]">TODA disponible</dt>
                <dd className={`font-mono ${todaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {inputs.toda} m
                </dd>
              </div>
            )}
            {inputs.lda !== undefined && (
              <div className="flex justify-between text-xs">
                <dt className="text-[var(--text-dim)]">LDA disponible</dt>
                <dd className={`font-mono ${ldaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {inputs.lda} m
                </dd>
              </div>
            )}
            <div className="flex justify-between text-xs text-[var(--text-dim)] border-t border-[var(--border)] pt-2">
              <dt>Masse utilisée</dt>
              <dd className="font-mono">{Math.round(weight)} kg</dd>
            </div>
            <div className="flex justify-between text-xs text-[var(--text-dim)]">
              <dt>Type</dt>
              <dd className="font-mono">{tableKey === 'to' ? 'Décollage' : 'Atterrissage'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Inline key for terrain */}
      <div className="mt-3 pt-2 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-dim)]">Terrain : {terrainKey}</p>
      </div>
    </Card>
  )
}

// ── Main PerfPanel component ───────────────────────────────────────────────────

interface Props {
  dossier: FlightDossier
  onUpdate: (perfInputs: Record<string, TerrainPerfInputs>) => void
}

export function PerfPanel({ dossier, onUpdate }: Props) {
  const { aircraft, loading, weatherInputs, perfInputs, route } = dossier

  // Get dep/arr ICAO from route
  const depIcao = route?.waypoints[0]?.name ?? ''
  const arrIcao = route?.waypoints[route.waypoints.length - 1]?.name ?? ''

  // Compute departure weight (W&B with full fuel as in WBPanel)
  const depWeight = useMemo(() => {
    const fuelStationName = aircraft.massBalance.stations.find(s =>
      s.name.toLowerCase().includes('carburant')
    )?.name
    const fuelMassKg = aircraft.characteristics.fuelCapacity * FUEL_DENSITY_KGL
    const depLoading = { ...loading }
    if (fuelStationName) depLoading[fuelStationName] = fuelMassKg
    const wb = computeWB(aircraft.massBalance, depLoading)
    return Math.min(wb.totalWeight, aircraft.massBalance.maxWeight)
  }, [aircraft, loading])

  // Helper to get pre-filled qnh/temp for a terrain from weatherInputs
  const getWeatherFor = (terrainKey: string) => {
    const icao = terrainKey === 'DEP' ? depIcao : terrainKey === 'ARR' ? arrIcao : ''
    const field = weatherInputs.fields[icao]
    return { qnh: field?.qnh ?? 1013, temp: field?.temp ?? 15 }
  }

  const handleUpdate = (key: string, inputs: TerrainPerfInputs) => {
    onUpdate({ ...perfInputs, [key]: inputs })
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {TERRAINS.map(({ key, label, tableKey }) => {
        const weather = getWeatherFor(key)
        return (
          <TerrainCard
            key={key}
            terrainKey={key}
            label={label}
            tableKey={tableKey}
            aircraft={aircraft}
            weight={depWeight}
            defaultQnh={weather.qnh}
            defaultTemp={weather.temp}
            perfInputs={perfInputs[key] ?? DEFAULT_PERF}
            onUpdate={(inputs) => handleUpdate(key, inputs)}
          />
        )
      })}
    </div>
  )
}
