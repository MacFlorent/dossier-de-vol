import { useMemo, useState } from 'react'
import type { FlightDossier, FuelInputs, FuelExtra, FlightBranch, FlightSegment } from '../../types'
import { computeBranchFuel, DEFAULT_FUEL_INPUTS } from '../../lib/aviation/fuelCalc'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
import { formatDuration } from '../../lib/format'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { SegmentCard } from '../../components/ui/SegmentCard'
import { SegmentsSection } from '../../components/ui/SegmentsSection'
import { ChangeAircraftModal } from '../../components/ui/ChangeAircraftModal'

interface Props {
  dossier: FlightDossier
  onUpdate: (fuelInputs: Record<string, FuelInputs>) => void
  onUpdateBranches: (branches: FlightBranch[]) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

export function FuelPanel({ dossier, onUpdate, onUpdateBranches, onChangeAircraft }: Props) {
  const { branches, fuelInputs, aircraft } = dossier
  const regime = aircraft.characteristics.regimes[0]
  const fuelCapacity = aircraft.characteristics.fuelCapacity

  const [activeBranchId, setActiveBranchId] = useState(() => branches[0]?.id ?? '')
  const [showChangeModal, setShowChangeModal] = useState(false)
  const validId = branches.some(b => b.id === activeBranchId) ? activeBranchId : (branches[0]?.id ?? '')
  const activeBranch = branches.find(b => b.id === validId)
  const fi: FuelInputs = fuelInputs[validId] ?? DEFAULT_FUEL_INPUTS

  const result = useMemo(
    () => activeBranch ? computeBranchFuel(activeBranch, fi, regime) : null,
    [activeBranch, fi, regime]
  )

  const update = (partial: Partial<FuelInputs>) =>
    onUpdate({ ...fuelInputs, [validId]: { ...fi, ...partial } })

  const updateSegment = (seg: FlightSegment) =>
    onUpdateBranches(branches.map(b => b.id === validId ? { ...b, segments: b.segments.map(s => s.id === seg.id ? seg : s) } : b))

  const addExtra = () => update({ extras: [...fi.extras, { id: crypto.randomUUID(), label: '', durationMin: 15 }] })
  const removeExtra = (id: string) => update({ extras: fi.extras.filter(e => e.id !== id) })
  const updateExtra = (id: string, changes: Partial<FuelExtra>) =>
    update({ extras: fi.extras.map(e => e.id === id ? { ...e, ...changes } : e) })

  const hasNegativeGs = result?.segmentDetails.some(d => d.gs <= 0) ?? false
  const insufficient = (result?.requiredFuelL ?? 0) > fuelCapacity
  const tight = !insufficient && (result?.requiredFuelL ?? 0) > fuelCapacity * 0.9
  const statusVariant = hasNegativeGs || insufficient ? 'error' : tight ? 'warning' : 'success'
  const statusLabel = hasNegativeGs ? 'INVALIDE' : insufficient ? 'INSUFFISANT' : tight ? 'ATTENTION' : 'OK'

  const sectionHeader = (label: string) => (
    <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{label}</h2>
  )

  const subtotalRow = (label: string, value: string) => (
    <div className="flex justify-between items-center py-1.5 border-t border-[var(--border)] mt-2">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <span className="font-mono text-sm font-semibold text-[var(--text-1)]">{value}</span>
    </div>
  )

  if (!activeBranch || !result) return null

  const alternateDetail = result.segmentDetails.find(d => d.role === 'ALTERNATE')
  const alternateSegment = activeBranch.segments.find(s => s.role === 'ALTERNATE')

  return (
    <div className="flex flex-col h-full">
      <FlightTabStrip branches={branches} activeId={validId} onSelect={setActiveBranchId} />
      <div className="flex-1 overflow-auto p-4 space-y-5">
      {/* Bloc 1 — Appareil */}
      <Card padding="md" inset>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Appareil</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-1)]">{aircraft.name}</span>
            {onChangeAircraft && (
              <Button variant="ghost" size="sm" onClick={() => setShowChangeModal(true)}>Changer</Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
          {([
            ['TAS', `${regime.speed} kt`],
            ['FB', (60 / regime.speed).toFixed(2)],
            ['Conso', `${regime.fuelBurn} L/h`],
            ['Capacité', `${fuelCapacity} L`],
            ['Autonomie max', formatDuration((fuelCapacity / regime.fuelBurn) * 60)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-[var(--text-muted)]">{label}</dt>
              <dd className="font-mono text-[var(--text-2)]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="max-w-xs">
          <Input label="Facteur pilote (%)" type="number" value={fi.pilotFactor}
            onChange={e => update({ pilotFactor: Number(e.target.value) })} />
        </div>
      </Card>

      {/* Bloc 2 — Segments */}
      <Card padding="md">
        <SegmentsSection
          branch={activeBranch}
          tas={regime.speed}
          onChange={updatedBranch => onUpdateBranches(branches.map(b => b.id === validId ? updatedBranch : b))}
        />
        {subtotalRow('Temps vol brut', formatDuration(result.rawFlightTimeMin))}
      </Card>

      {/* Bloc 3 — Temps complémentaires */}
      <Card padding="md">
        {sectionHeader('Temps complémentaires')}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Input label="Roulage déc. (min)" type="number" value={fi.taxiMin}
            onChange={e => update({ taxiMin: Number(e.target.value) })} />
          <Input label="Intégration att. (min)" type="number" value={fi.landingMin}
            onChange={e => update({ landingMin: Number(e.target.value) })} />
        </div>
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Phases supplémentaires</p>
        {fi.extras.map(extra => (
          <div key={extra.id} className="flex gap-2 items-center mb-2">
            <input type="text" value={extra.label} placeholder="Évolutions, attente..."
              onChange={e => updateExtra(extra.id, { label: e.target.value })}
              className="flex-1 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none" />
            <input type="number" value={extra.durationMin}
              onChange={e => updateExtra(extra.id, { durationMin: Number(e.target.value) })}
              className="w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none" />
            <span className="text-xs text-[var(--text-dim)]">min</span>
            <button onClick={() => removeExtra(extra.id)}
              className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm">✕</button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addExtra}>+ Ajouter phase</Button>
        {subtotalRow('Temps de vol total', formatDuration(result.totalFlightTimeMin))}
        {subtotalRow('Essence vol', `${result.flightFuelL.toFixed(1)} L`)}
      </Card>

      {/* Bloc 4 — Déroutement planifié */}
      {alternateDetail && alternateSegment && (
        <Card padding="md">
          {sectionHeader('Déroutement planifié')}
          <div className="mb-4">
            <SegmentCard
              segment={alternateSegment} tas={regime.speed}
              isLastEnroute={false}
              onChange={updateSegment}
              canMoveUp={false} canMoveDown={false}
            />
          </div>
          <div className="max-w-xs mb-2">
            <Input label="Intégration alt. (min)" type="number" value={fi.alternateLandingMin}
              onChange={e => update({ alternateLandingMin: Number(e.target.value) })} />
          </div>
          {subtotalRow('Temps de déroutement', formatDuration(result.totalAlternateTimeMin))}
          {subtotalRow('Essence déroutement', `${result.alternateFuelL.toFixed(1)} L`)}
        </Card>
      )}

      {/* Bloc 5 — Réserve réglementaire */}
      <Card padding="md">
        {sectionHeader('Réserve réglementaire')}
        <div className="flex gap-2">
          {(['day', 'night'] as const).map(mode => (
            <button key={mode} onClick={() => update({ reserveMode: mode })}
              className={`flex-1 py-2 text-sm rounded border transition-colors ${
                fi.reserveMode === mode
                  ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-1)]'
              }`}>
              {mode === 'day' ? 'Jour (30 min)' : 'Nuit (45 min)'}
            </button>
          ))}
        </div>
      </Card>

      {/* Bloc 6 — Autonomie requise */}
      <Card padding="md">
        {sectionHeader('Autonomie requise')}
        <dl className="space-y-2">
          <div className="flex justify-between items-baseline">
            <dt className="text-[var(--text-2)]">Autonomie requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {formatDuration(result.requiredEnduranceMin)}
            </dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="text-[var(--text-2)]">Essence requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {result.requiredFuelL.toFixed(1)} L
              <span className="text-sm font-normal text-[var(--text-dim)] ml-2">
                / {result.requiredFuelKg.toFixed(1)} kg
              </span>
            </dd>
          </div>
          <div className="flex justify-between items-center border-t border-[var(--border)] pt-2 text-sm">
            <dt className="text-[var(--text-muted)]">Capacité</dt>
            <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </Card>
      </div>
      {showChangeModal && onChangeAircraft && (
        <ChangeAircraftModal
          currentAircraftId={aircraft.id}
          onConfirm={onChangeAircraft}
          onClose={() => setShowChangeModal(false)}
        />
      )}
    </div>
  )
}
