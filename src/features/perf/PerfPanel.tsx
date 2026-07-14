import { useState, useMemo } from 'react'
import type { FlightDossier, TerrainPerfInputs, PerfConditions } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { pressureAltitude, densityAltitude } from '../../lib/aviation/isa'
import { getAerodrome } from '../../lib/icao/aerodromeDb'
import { ROLE_LABELS, ROLE_COLORS, type AeroRole } from '../../lib/aviation/aerodromeRoles'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
import { AerodromeConditionsCard } from './AerodromeConditionsCard'
import { PerfResultCard } from './PerfResultCard'
import { AddPerfAerodromeModal } from './AddPerfAerodromeModal'
import { AerodromeQuickEditModal } from './AerodromeQuickEditModal'

const DEFAULT_PERF: TerrainPerfInputs = { surface: 'hard', windKt: 0, toda: undefined, lda: undefined }
const ROLE_ORDER: AeroRole[] = ['DEP', 'ALTERNATE', 'ARR']

interface AerodromeTab {
  icao: string
  roles: AeroRole[]
  closable: boolean
}

interface Props {
  dossier: FlightDossier
  onUpdate: (perfInputs: Record<string, TerrainPerfInputs>) => void
  onUpdateRegulatory: (regulatory: number) => void
  onUpdateExtraAerodromes: (icaos: string[]) => void
}

export function PerfPanel({ dossier, onUpdate, onUpdateRegulatory, onUpdateExtraAerodromes }: Props) {
  const { aircraft, loading, perfInputs, branches, perfRegulatory, perfExtraAerodromes } = dossier
  const [activeIcao, setActiveIcao] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingIcao, setEditingIcao] = useState<string | null>(null)

  const maxWeight = Math.max(...aircraft.massBalance.envelopePoints.map(([kg]) => kg))
  const depWeight = useMemo(() => {
    const wb = computeWB(aircraft.massBalance, loading)
    return Math.min(wb.totalWeight, maxWeight)
  }, [aircraft, loading, maxWeight])

  const aerodromeTabs = useMemo<AerodromeTab[]>(() => {
    const byIcao = new Map<string, Set<AeroRole>>()
    branches.forEach(b => b.aerodromes.forEach(a => {
      if (a.role === 'OVERFLY') return
      if (!byIcao.has(a.identifier)) byIcao.set(a.identifier, new Set())
      byIcao.get(a.identifier)!.add(a.role)
    }))

    const rank = (roles: AeroRole[]) => Math.min(...roles.map(r => ROLE_ORDER.indexOf(r)))
    const auto = [...byIcao.entries()]
      .map(([icao, roles]) => ({ icao, roles: [...roles], closable: false }))
      .sort((a, b) => rank(a.roles) - rank(b.roles))

    const extra = perfExtraAerodromes
      .filter(icao => !byIcao.has(icao))
      .map(icao => ({ icao, roles: [] as AeroRole[], closable: true }))

    return [...auto, ...extra]
  }, [branches, perfExtraAerodromes])

  const activeTab = aerodromeTabs.find(t => t.icao === activeIcao) ?? aerodromeTabs[0]

  const handleUpdate = (icao: string, changes: Partial<TerrainPerfInputs>) =>
    onUpdate({ ...perfInputs, [icao]: { ...DEFAULT_PERF, ...perfInputs[icao], ...changes } })

  const addAerodrome = (icao: string) => {
    if (!perfExtraAerodromes.includes(icao)) onUpdateExtraAerodromes([...perfExtraAerodromes, icao])
    setActiveIcao(icao)
    setShowAdd(false)
  }

  const closeAerodrome = (icao: string) =>
    onUpdateExtraAerodromes(perfExtraAerodromes.filter(i => i !== icao))

  return (
    <div className="flex flex-col h-full">
      <FlightTabStrip
        branches={aerodromeTabs.map(t => ({ id: t.icao, label: t.icao, closable: t.closable }))}
        activeId={activeTab?.icao ?? ''}
        onSelect={setActiveIcao}
        onAdd={() => setShowAdd(true)}
        onClose={closeAerodrome}
        renderBadge={icao => {
          const roles = aerodromeTabs.find(t => t.icao === icao)?.roles ?? []
          return (
            <>
              {roles.map(r => (
                <Badge key={r} style={{ backgroundColor: ROLE_COLORS[r], color: 'white' }}>{ROLE_LABELS[r]}</Badge>
              ))}
            </>
          )
        }}
      />

      <div className="flex-1 overflow-auto p-4 space-y-5">
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

        {aerodromeTabs.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-8">
            Ajoutez des aérodromes (DEP/ARR/DVRT) dans l'onglet Branches pour voir les fiches de performance.
          </p>
        )}

        {activeTab && (() => {
          const icao = activeTab.icao
          const aero = getAerodrome(icao)
          const inputs = { ...DEFAULT_PERF, ...perfInputs[icao] }
          const elevation = inputs.elevation ?? aero?.elevationFt ?? 0
          const qnh = inputs.qnh ?? 1013
          const temp = inputs.temp ?? 15
          const pa = pressureAltitude(elevation, qnh)
          const da = densityAltitude(pa, temp)
          const cond: PerfConditions = { weight: depWeight, pa, oat: temp, surfaceGrass: inputs.surface === 'grass', windKt: inputs.windKt }

          return (
            <div className="space-y-4">
              <AerodromeConditionsCard
                icao={icao}
                runways={aero?.runways ?? []}
                inputs={inputs}
                elevation={elevation}
                qnh={qnh}
                temp={temp}
                pa={pa}
                da={da}
                onUpdate={changes => handleUpdate(icao, changes)}
                onEditReferential={() => setEditingIcao(icao)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.toda} availableLabel="TODA" perfRegulatory={perfRegulatory ?? 1.0} />
                <PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.lda} availableLabel="LDA" perfRegulatory={perfRegulatory ?? 1.0} />
              </div>
            </div>
          )
        })()}
      </div>

      {showAdd && (
        <AddPerfAerodromeModal
          excluded={aerodromeTabs.map(t => t.icao)}
          onAdd={addAerodrome}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editingIcao && (
        <AerodromeQuickEditModal icao={editingIcao} onClose={() => setEditingIcao(null)} />
      )}
    </div>
  )
}
