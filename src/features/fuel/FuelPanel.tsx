import { useMemo, useState } from 'react'
import type { FlightDossier, FuelInputs, FuelExtra } from '../../types'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (fuelInputs: Record<string, FuelInputs>) => void
}

export function FuelPanel({ dossier, onUpdate }: Props) {
  const { branches, fuelInputs, aircraft } = dossier
  const regime = aircraft.characteristics.regimes[0]
  const fuelBurn = regime.fuelBurn
  const fuelCapacity = aircraft.characteristics.fuelCapacity
  const lastBranchId = branches.at(-1)?.id ?? ''

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const totalFuelL = useMemo(() => {
    return branches.reduce((sum, branch) => {
      const fi = fuelInputs[branch.id]
      if (!fi) return sum
      const gs = Math.max(fi.gsBase - fi.windAdjust, 1)
      const flightMin = branch.distanceNm > 0 ? (branch.distanceNm / gs) * 60 : 0
      const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)
      const isLast = branch.id === lastBranchId
      const reserveMin = isLast ? fi.reserveMin : 0
      const derouteMin = isLast ? fi.derouteMin : 0
      const totalMin = flightMin + fi.roulage + extrasMin + reserveMin + derouteMin
      const totalWithMargin = totalMin * (1 + fi.marge / 100)
      return sum + (totalWithMargin / 60) * fuelBurn
    }, 0)
  }, [branches, fuelInputs, fuelBurn, lastBranchId])

  // Per-branch tab state
  const [activeBranchId, setActiveBranchId] = useState(() => branches[0]?.id ?? '')
  const validId = branches.some(b => b.id === activeBranchId) ? activeBranchId : (branches[0]?.id ?? '')
  const activeBranch = branches.find(b => b.id === validId)
  const fi: FuelInputs = fuelInputs[validId] ?? {
    gsBase: regime.speed, windAdjust: 0, roulage: 10, marge: 10,
    extras: [], reserveMin: 30, derouteMin: 30, plein: false,
  }

  const gs = Math.max(fi.gsBase - fi.windAdjust, 1)
  const flightMin = activeBranch && activeBranch.distanceNm > 0
    ? (activeBranch.distanceNm / gs) * 60 : 0
  const isLast = validId === lastBranchId
  const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)
  const totalMin = flightMin + fi.roulage + extrasMin +
    (isLast ? fi.reserveMin : 0) + (isLast ? fi.derouteMin : 0)
  const totalWithMargin = totalMin * (1 + fi.marge / 100)
  const fuelMinL = (totalWithMargin / 60) * fuelBurn
  const fuelMinKg = fuelMinL * FUEL_DENSITY_KGL
  const autonomyMin = (fuelCapacity / fuelBurn) * 60
  const insufficient = totalFuelL > fuelCapacity
  const tight = !insufficient && totalFuelL > fuelCapacity * 0.9
  const statusVariant = insufficient ? 'error' : tight ? 'warning' : 'success'
  const statusLabel = insufficient ? 'INSUFFISANT' : tight ? 'ATTENTION' : 'OK'

  const update = (partial: Partial<FuelInputs>) =>
    onUpdate({ ...fuelInputs, [validId]: { ...fi, ...partial } })

  const addExtra = () => update({ extras: [...fi.extras, { id: crypto.randomUUID(), label: '', durationMin: 15 }] })
  const removeExtra = (id: string) => update({ extras: fi.extras.filter(e => e.id !== id) })
  const updateExtra = (id: string, changes: Partial<FuelExtra>) =>
    update({ extras: fi.extras.map(e => e.id === id ? { ...e, ...changes } : e) })

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {branches.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-(--border)">
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveBranchId(b.id)}
              className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                b.id === validId
                  ? 'border-(--amber) text-(--text-1)'
                  : 'border-transparent text-(--text-muted) hover:text-(--text-1)'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Paramètres — {activeBranch?.label ?? ''}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Input label="GS de base (kt)" type="number" value={fi.gsBase}
              onChange={e => update({ gsBase: Number(e.target.value) })} />
            <Input label="Ajust vent (kt)" type="number" value={fi.windAdjust}
              onChange={e => update({ windAdjust: Number(e.target.value) })} />
            <Input label="Roulage (min)" type="number" value={fi.roulage}
              onChange={e => update({ roulage: Number(e.target.value) })} />
            <Input label="Marge (%)" type="number" value={fi.marge}
              onChange={e => update({ marge: Number(e.target.value) })} />
            {isLast && <>
              <Input label="Réserve (min)" type="number" value={fi.reserveMin}
                onChange={e => update({ reserveMin: Number(e.target.value) })} />
              <Input label="Déroutement (min)" type="number" value={fi.derouteMin}
                onChange={e => update({ derouteMin: Number(e.target.value) })} />
            </>}
          </div>
          <div>
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
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fi.plein}
              onChange={e => update({ plein: e.target.checked })}
              className="accent-[var(--amber)] w-4 h-4" />
            <span className="text-sm text-[var(--text-2)]">Plein complet prévu ({fuelCapacity} L)</span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Résultats</h2>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <Card padding="md" inset>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Dist. branche ({activeBranch?.label})</dt>
                <dd className="font-mono text-[var(--text-1)]">{activeBranch?.distanceNm ?? 0} nm</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Temps vol branche</dt>
                <dd className="font-mono text-[var(--text-1)]">{fmtTime(flightMin)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Total avec marge {fi.marge}%</dt>
                <dd className="font-mono text-[var(--text-1)]">{fmtTime(totalWithMargin)}</dd>
              </div>
              <hr className="border-[var(--border)]" />
              <div className="flex justify-between font-semibold">
                <dt className="text-[var(--text-muted)]">Carbu min (cette branche)</dt>
                <dd className="font-mono text-[var(--text-1)]">
                  {fuelMinL.toFixed(1)} L <span className="text-[var(--text-dim)] ml-2">/ {fuelMinKg.toFixed(1)} kg</span>
                </dd>
              </div>
              {branches.length > 1 && (
                <div className="flex justify-between font-semibold border-t border-[var(--border)] pt-2">
                  <dt className="text-[var(--text-muted)]">Total toutes branches</dt>
                  <dd className="font-mono text-[var(--text-1)]">{totalFuelL.toFixed(1)} L</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Capacité</dt>
                <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Autonomie (plein)</dt>
                <dd className="font-mono text-[var(--text-2)]">{fmtTime(autonomyMin)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Conso</dt>
                <dd className="font-mono text-[var(--text-dim)]">{fuelBurn} L/h</dd>
              </div>
            </dl>
          </Card>
          {insufficient && (
            <Card padding="sm">
              <p className="text-(--red) text-sm font-medium">
                Carburant insuffisant — prévoir {(totalFuelL - fuelCapacity).toFixed(1)} L supplémentaires ou réduire les marges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
