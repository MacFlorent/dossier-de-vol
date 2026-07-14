import { useMemo } from 'react'
import type { AircraftSnapshot, PerfConditions } from '../../types'
import { computePerf } from '../../lib/aviation/perfCalc'
import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

interface Props {
  label: string
  tableKey: 'to' | 'ldg'
  aircraft: AircraftSnapshot
  cond: PerfConditions
  availableDistance?: number
  availableLabel: 'TODA' | 'LDA'
  perfRegulatory: number
}

export function PerfResultCard({ label, tableKey, aircraft, cond, availableDistance, availableLabel, perfRegulatory }: Props) {
  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable
  const validation = useMemo(() => validatePerformanceTable(table), [table])
  const canCompute = validation.errors.length === 0

  const distBase = canCompute ? computePerf(table, cond) : 0
  const distRegulatory = canCompute ? Math.round(distBase * perfRegulatory) : 0
  const distanceOk = availableDistance === undefined || distRegulatory <= availableDistance

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</h3>
        <div className="flex gap-2 flex-wrap justify-end">
          {validation.errors.length > 0 && <Badge variant="error">Config invalide</Badge>}
          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <Badge variant="warning">⚠ config partielle</Badge>
          )}
          {availableDistance !== undefined && canCompute && (
            <Badge variant={distanceOk ? 'success' : 'error'}>
              {distanceOk ? `${availableLabel} OK` : `${availableLabel} INSUFFISANT`}
            </Badge>
          )}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="mb-3 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-1">
          {validation.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {canCompute ? (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Distance calculée</dt>
            <dd className="font-mono text-[var(--text-1)]">{distBase} m</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt className="text-[var(--text-muted)]">Dist. régl. (×{perfRegulatory.toFixed(2)})</dt>
            <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
          </div>
          {availableDistance !== undefined && (
            <div className="flex justify-between text-xs">
              <dt className="text-[var(--text-dim)]">{availableLabel} disponible</dt>
              <dd className={`font-mono ${distanceOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{availableDistance} m</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-[var(--text-dim)] italic">Calcul indisponible — corriger la configuration.</p>
      )}
    </Card>
  )
}
