import { useState, useMemo } from 'react'
import type { FlightDossier, TerrainPerfInputs, PerfConditions, AircraftSnapshot } from '../../types'
import { computePerf } from '../../lib/aviation/perfCalc'
import { computeWB } from '../../lib/aviation/wbCalc'
import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'
import { headwindKt } from '../../lib/aviation/coordinates'
import { getAerodrome } from '../../lib/icao/aerodromeDb'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'

const DEFAULT_PERF: TerrainPerfInputs = { surface: 'hard', windKt: 0, toda: undefined, lda: undefined }

function pressureAlt(elevation: number, qnh: number): number {
  return elevation + (1013 - qnh) * 30
}

function densityAlt(pa: number, oat: number): number {
  const isa = 15 - 2 * (pa / 1000)
  return pa + (oat - isa) * 120
}

interface TerrainCardProps {
  terrainKey: string
  label: string
  tableKey: 'to' | 'ldg'
  aircraft: AircraftSnapshot
  weight: number
  defaultQnh: number
  defaultTemp: number
  defaultElevation: number
  perfInputs: TerrainPerfInputs
  perfRegulatory: number
  runways: Array<{ ident: string; headingMag: number; toda?: number; lda?: number; surface: 'hard' | 'grass' }>
  surfaceWindDir: number
  surfaceWindKt: number
  onUpdate: (inputs: TerrainPerfInputs) => void
}

function TerrainCard({
  terrainKey, label, tableKey, aircraft, weight,
  defaultQnh, defaultTemp, defaultElevation,
  perfInputs, perfRegulatory, runways,
  surfaceWindDir, surfaceWindKt,
  onUpdate,
}: TerrainCardProps) {
  const [elevation, setElevation] = useState(defaultElevation)
  const [qnh, setQnh] = useState(defaultQnh)
  const [temp, setTemp] = useState(defaultTemp)
  const [selectedRunway, setSelectedRunway] = useState<string>('')

  const inputs = { ...DEFAULT_PERF, ...perfInputs }
  const pa = pressureAlt(elevation, qnh)
  const da = densityAlt(pa, temp)
  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable
  const tableValidation = useMemo(() => validatePerformanceTable(table), [table])
  const canCompute = tableValidation.errors.length === 0

  const cond: PerfConditions = {
    weight, pa, oat: temp,
    surfaceGrass: inputs.surface === 'grass',
    windKt: inputs.windKt,
  }
  const distBase = canCompute ? computePerf(table, cond) : 0
  const distRegulatory = canCompute ? Math.round(distBase * perfRegulatory) : 0
  const todaOk = inputs.toda === undefined || distRegulatory <= inputs.toda
  const ldaOk = inputs.lda === undefined || distRegulatory <= inputs.lda

  const update = (changes: Partial<TerrainPerfInputs>) => onUpdate({ ...inputs, ...changes })

  const handleRunwaySelect = (ident: string) => {
    setSelectedRunway(ident)
    const rwy = runways.find(r => r.ident === ident)
    if (!rwy) return
    const wkt = headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingMag)
    update({
      windKt: wkt,
      surface: rwy.surface,
      toda: rwy.toda,
      lda: rwy.lda,
    })
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </h2>
        <div className="flex gap-2 flex-wrap justify-end">
          {tableValidation.errors.length > 0 && <Badge variant="error">Config invalide</Badge>}
          {tableValidation.errors.length === 0 && tableValidation.warnings.length > 0 && (
            <Badge variant="warning">⚠ config partielle</Badge>
          )}
          {inputs.toda !== undefined && canCompute && (
            <Badge variant={todaOk ? 'success' : 'error'}>{todaOk ? 'TODA OK' : 'TODA INSUFFISANT'}</Badge>
          )}
          {inputs.lda !== undefined && canCompute && (
            <Badge variant={ldaOk ? 'success' : 'error'}>{ldaOk ? 'LDA OK' : 'LDA INSUFFISANT'}</Badge>
          )}
        </div>
      </div>

      {tableValidation.errors.length > 0 && (
        <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-1">
          {tableValidation.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* Runway selector */}
      {runways.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Piste active
          </label>
          <div className="flex gap-2 flex-wrap">
            {runways.map(rwy => (
              <button
                key={rwy.ident}
                type="button"
                onClick={() => handleRunwaySelect(rwy.ident)}
                className={`px-3 py-1 rounded text-xs border transition-colors ${
                  selectedRunway === rwy.ident
                    ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                }`}
              >
                {rwy.ident} ({rwy.headingMag}° — {headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingMag) >= 0 ? '+' : ''}{headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingMag)}kt)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Conditions</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Elév. (ft)" type="number"
              value={elevation === 0 ? '' : elevation} placeholder="0"
              onChange={e => setElevation(e.target.value === '' ? 0 : Number(e.target.value))} />
            <Input label="QNH (hPa)" type="number" value={qnh}
              onChange={e => setQnh(Number(e.target.value))} />
            <Input label="Temp (°C)" type="number" value={temp}
              onChange={e => setTemp(Number(e.target.value))} />
            <Input label="Vent (kt)" type="number"
              value={inputs.windKt === 0 ? '' : inputs.windKt} placeholder="0"
              hint="+face / −arrière"
              onChange={e => update({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Surface</label>
              <button type="button"
                onClick={() => update({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
                className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
                  inputs.surface === 'hard'
                    ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                    : 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10'
                }`}>
                {inputs.surface === 'hard' ? 'Dur' : 'Herbe'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="TODA (m)" type="number" value={inputs.toda ?? ''} placeholder="optionnel"
              onChange={e => update({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
              onChange={e => update({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        </div>

        <div>
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-3">Résultats</p>
          {canCompute ? (
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
                <dt className="text-[var(--text-muted)]">Dist. régl. (×{perfRegulatory.toFixed(2)})</dt>
                <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
              </div>
              {inputs.toda !== undefined && (
                <div className="flex justify-between text-xs">
                  <dt className="text-[var(--text-dim)]">TODA disponible</dt>
                  <dd className={`font-mono ${todaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{inputs.toda} m</dd>
                </div>
              )}
              {inputs.lda !== undefined && (
                <div className="flex justify-between text-xs">
                  <dt className="text-[var(--text-dim)]">LDA disponible</dt>
                  <dd className={`font-mono ${ldaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{inputs.lda} m</dd>
                </div>
              )}
              <div className="flex justify-between text-xs text-[var(--text-dim)] border-t border-[var(--border)] pt-2">
                <dt>Terrain</dt>
                <dd className="font-mono">{terrainKey}</dd>
              </div>
              <div className="flex justify-between text-xs text-[var(--text-dim)]">
                <dt>Type</dt>
                <dd className="font-mono">{tableKey === 'to' ? 'Décollage' : 'Atterrissage'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-[var(--text-dim)] italic">Calcul indisponible — corriger la configuration.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

interface Props {
  dossier: FlightDossier
  onUpdate: (perfInputs: Record<string, TerrainPerfInputs>) => void
  onUpdateRegulatory: (regulatory: number) => void
}

export function PerfPanel({ dossier, onUpdate, onUpdateRegulatory }: Props) {
  const { aircraft, loading, perfInputs, branches, perfRegulatory } = dossier

  const maxWeight = Math.max(...aircraft.massBalance.envelopePoints.map(([kg]) => kg))
  const depWeight = useMemo(() => {
    const wb = computeWB(aircraft.massBalance, loading)
    return Math.min(wb.totalWeight, maxWeight)
  }, [aircraft, loading, maxWeight])

  // Aggregate unique terrain cards from all branches (OVERFLY excluded)
  const terrainCards = useMemo(() => {
    const seen = new Set<string>()
    const cards: { key: string; label: string; tableKey: 'to' | 'ldg' }[] = []
    branches.forEach(branch => {
      branch.aerodromes.forEach(ad => {
        if (ad.role === 'OVERFLY') return
        if (seen.has(ad.identifier)) return
        seen.add(ad.identifier)
        cards.push({
          key: ad.identifier,
          label: ad.identifier,
          tableKey: ad.role === 'DEP' ? 'to' : 'ldg',
        })
      })
    })
    return cards
  }, [branches])

  // Surface wind: calm (no wind layers)
  const surfaceWind = { direction_deg: 0, speed_kt: 0 }

  const handleUpdate = (key: string, inputs: TerrainPerfInputs) =>
    onUpdate({ ...perfInputs, [key]: inputs })

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <Card padding="sm">
        <div className="flex items-center gap-4">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">
            Marge réglementaire (×)
          </label>
          <input
            type="number" min={1} step={0.01}
            value={perfRegulatory ?? 1.0}
            onChange={e => onUpdateRegulatory(Number(e.target.value) || 1.0)}
            className="w-24 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
          />
          <span className="text-xs text-[var(--text-dim)]">1.15 pour clubs Alcyons</span>
        </div>
      </Card>

      {terrainCards.length === 0 && (
        <p className="text-[var(--text-muted)] text-sm text-center py-8">
          Ajoutez des aérodromes (DEP/ARR/DVRT) dans l'onglet Branches pour voir les fiches de performance.
        </p>
      )}

      {terrainCards.map(({ key, label, tableKey }) => {
        const aero = getAerodrome(key)
        return (
          <TerrainCard
            key={key}
            terrainKey={key}
            label={label}
            tableKey={tableKey}
            aircraft={aircraft}
            weight={depWeight}
            defaultQnh={1013}
            defaultTemp={15}
            defaultElevation={aero?.elevationFt ?? 0}
            runways={aero?.runways ?? []}
            surfaceWindDir={surfaceWind.direction_deg}
            surfaceWindKt={surfaceWind.speed_kt}
            perfInputs={perfInputs[key] ?? DEFAULT_PERF}
            perfRegulatory={perfRegulatory ?? 1.0}
            onUpdate={inputs => handleUpdate(key, inputs)}
          />
        )
      })}
    </div>
  )
}
