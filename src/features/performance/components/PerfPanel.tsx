import { useState } from 'react'
import type { Aircraft, FlightPlan } from '../../../types'
import { computePerf } from '../../../lib/aviation/perfCalc'
import { pressureAltitude } from '../../../lib/aviation/isa'
import { computeWB } from '../../../lib/aviation/wbCalc'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'

interface PerfCondState {
  altFt: number
  qnh: number
  oat: number
  windKt: number
  slopePercent: number
  surfaceGrass: boolean
}

interface Props { aircraft: Aircraft; plan: FlightPlan }

export function PerfPanel({ aircraft, plan }: Props) {
  const wbResult = computeWB(aircraft, plan.loading)
  const weight = wbResult.totalWeight || aircraft.emptyWeight

  const [dep, setDep] = useState<PerfCondState>({
    altFt: plan.waypoints[0]?.alt_ft ?? 0,
    qnh: plan.qnh,
    oat: 15,
    windKt: 0,
    slopePercent: 0,
    surfaceGrass: false,
  })
  const [arr, setArr] = useState<PerfCondState>({
    altFt: plan.waypoints[plan.waypoints.length - 1]?.alt_ft ?? 0,
    qnh: plan.qnh,
    oat: 15,
    windKt: 0,
    slopePercent: 0,
    surfaceGrass: false,
  })

  function perfResult(cond: PerfCondState, table: typeof aircraft.toTable) {
    const pa = pressureAltitude(cond.altFt, cond.qnh)
    return computePerf(table, { weight, pa, oat: cond.oat, ...cond })
  }

  const toRoll = perfResult(dep, aircraft.toTable)
  const ldgRoll = perfResult(arr, aircraft.ldgTable)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CondCard title="Décollage" cond={dep} onChange={setDep} result={toRoll} label="Distance de roulement TO" />
      <CondCard title="Atterrissage" cond={arr} onChange={setArr} result={ldgRoll} label="Distance de roulement LDG" />
      <Card title="Masse prise en compte" className="sm:col-span-2">
        <p className="text-sm text-muted">
          Masse totale chargée : <span className="text-text font-semibold">{weight.toFixed(1)} kg</span>
          {' '}(depuis la fiche Masse & Centrage)
        </p>
      </Card>
    </div>
  )
}

function CondCard({
  title, cond, onChange, result, label
}: {
  title: string
  cond: PerfCondState
  onChange: (c: PerfCondState) => void
  result: number
  label: string
}) {
  const pa = pressureAltitude(cond.altFt, cond.qnh)
  const set = (key: keyof PerfCondState, val: number | boolean) =>
    onChange({ ...cond, [key]: val })

  return (
    <Card title={title}>
      <div className="flex flex-col gap-3">
        <Input label="Altitude terrain" unit="ft MSL" type="number" value={cond.altFt}
          onChange={e => set('altFt', +e.target.value)} />
        <Input label="QNH" unit="hPa" type="number" value={cond.qnh}
          onChange={e => set('qnh', +e.target.value)} />
        <Input label="OAT" unit="°C" type="number" value={cond.oat}
          onChange={e => set('oat', +e.target.value)} />
        <Input label="Vent (+ = face, - = arrière)" unit="kt" type="number" value={cond.windKt}
          onChange={e => set('windKt', +e.target.value)} />
        <Input label="Pente piste (+ = montante)" unit="%" type="number" step="0.5" value={cond.slopePercent}
          onChange={e => set('slopePercent', +e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={cond.surfaceGrass} onChange={e => set('surfaceGrass', e.target.checked)}
            className="accent-brand" />
          Surface en herbe (×1.15)
        </label>

        <div className="border-t border-border pt-3 flex flex-col gap-1">
          <p className="text-xs text-muted">PA calculée : <span className="text-text">{Math.round(pa)} ft</span></p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{label}</span>
            <Badge variant={result > 800 ? 'error' : result > 600 ? 'warning' : 'success'}>
              {result} m
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}
