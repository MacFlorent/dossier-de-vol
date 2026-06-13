import { useMemo } from 'react'
import type { FlightDossier, FuelInputs, FuelExtra } from '../../types'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (fuelInputs: FuelInputs) => void
}

export function FuelPanel({ dossier, onUpdate }: Props) {
  const { fuelInputs, aircraft } = dossier
  const { fuelBurn, fuelCapacity, fuelDensity } = aircraft

  // Compute navlog flight time
  const flightMin = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const ac = { tas: aircraft.tas, fuelBurn: aircraft.fuelBurn, magneticVariation: aircraft.magneticVariation }
    const entries = generateNavlog(dossier.route, dossier.weatherInputs, ac, dossier.navOverrides)
    return entries.at(-1)?.cumul_time_min ?? 0
  }, [dossier.route, dossier.weatherInputs, dossier.navOverrides, aircraft])

  // Compute fuel results
  const results = useMemo(() => {
    const extrasMin = fuelInputs.extras.reduce((s, e) => s + e.durationMin, 0)
    const totalMin = flightMin + fuelInputs.roulage + extrasMin + fuelInputs.reserveMin + fuelInputs.derouteMin
    const totalWithMargin = totalMin * (1 + fuelInputs.marge / 100)
    const fuelMinL = (totalWithMargin / 60) * fuelBurn
    const fuelMinKg = fuelMinL * fuelDensity
    const autonomyMin = (fuelCapacity / fuelBurn) * 60
    const insufficient = fuelMinL > fuelCapacity
    const tight = !insufficient && fuelMinL > fuelCapacity * 0.9
    return { totalMin, totalWithMargin, fuelMinL, fuelMinKg, autonomyMin, insufficient, tight }
  }, [fuelInputs, flightMin, fuelBurn, fuelDensity, fuelCapacity])

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const update = (partial: Partial<FuelInputs>) => onUpdate({ ...fuelInputs, ...partial })

  const addExtra = () => update({
    extras: [...fuelInputs.extras, { id: crypto.randomUUID(), label: '', durationMin: 15 }]
  })

  const removeExtra = (id: string) => update({ extras: fuelInputs.extras.filter(e => e.id !== id) })

  const updateExtra = (id: string, changes: Partial<FuelExtra>) => update({
    extras: fuelInputs.extras.map(e => e.id === id ? { ...e, ...changes } : e)
  })

  const statusVariant = results.insufficient ? 'error' : results.tight ? 'warning' : 'success'
  const statusLabel = results.insufficient ? 'INSUFFISANT' : results.tight ? 'ATTENTION' : 'OK'

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Inputs */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Paramètres</h2>

          <div className="grid grid-cols-2 gap-3">
            <Input label="GS de base (kt)" type="number" value={fuelInputs.gsBase}
              onChange={(e) => update({ gsBase: Number(e.target.value) })} />
            <Input label="Ajust vent (kt)" type="number" value={fuelInputs.windAdjust}
              onChange={(e) => update({ windAdjust: Number(e.target.value) })} />
            <Input label="Roulage (min)" type="number" value={fuelInputs.roulage}
              onChange={(e) => update({ roulage: Number(e.target.value) })} />
            <Input label="Marge (%)" type="number" value={fuelInputs.marge}
              onChange={(e) => update({ marge: Number(e.target.value) })} />
            <Input label="Réserve (min)" type="number" value={fuelInputs.reserveMin}
              onChange={(e) => update({ reserveMin: Number(e.target.value) })} />
            <Input label="Déroutement (min)" type="number" value={fuelInputs.derouteMin}
              onChange={(e) => update({ derouteMin: Number(e.target.value) })} />
          </div>

          {/* Extras */}
          <div>
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Phases supplémentaires</p>
            {fuelInputs.extras.map(extra => (
              <div key={extra.id} className="flex gap-2 items-center mb-2">
                <input
                  type="text"
                  value={extra.label}
                  placeholder="Évolutions, attente..."
                  onChange={(e) => updateExtra(extra.id, { label: e.target.value })}
                  className="flex-1 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
                />
                <input
                  type="number"
                  value={extra.durationMin}
                  onChange={(e) => updateExtra(extra.id, { durationMin: Number(e.target.value) })}
                  className="w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
                />
                <span className="text-xs text-[var(--text-dim)]">min</span>
                <button onClick={() => removeExtra(extra.id)}
                  className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm">✕</button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addExtra}>+ Ajouter phase</Button>
          </div>

          {/* Plein */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fuelInputs.plein}
              onChange={(e) => update({ plein: e.target.checked })}
              className="accent-[var(--amber)] w-4 h-4" />
            <span className="text-sm text-[var(--text-2)]">Plein complet prévu ({fuelCapacity} L)</span>
          </label>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Résultats</h2>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>

          <Card padding="md" inset>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Temps vol (navlog)</dt>
                <dd className="font-mono text-[var(--text-1)]">{fmtTime(flightMin)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Total avec marge {fuelInputs.marge}%</dt>
                <dd className="font-mono text-[var(--text-1)]">{fmtTime(results.totalWithMargin)}</dd>
              </div>
              <hr className="border-[var(--border)]" />
              <div className="flex justify-between font-semibold">
                <dt className="text-[var(--text-muted)]">Carbu min</dt>
                <dd className="font-mono text-[var(--text-1)]">
                  {results.fuelMinL.toFixed(1)} L
                  <span className="text-[var(--text-dim)] ml-2">/ {results.fuelMinKg.toFixed(1)} kg</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Capacité</dt>
                <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Autonomie (plein)</dt>
                <dd className="font-mono text-[var(--text-2)]">{fmtTime(results.autonomyMin)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Conso</dt>
                <dd className="font-mono text-[var(--text-dim)]">{fuelBurn} L/h</dd>
              </div>
            </dl>
          </Card>

          {results.insufficient && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Carburant insuffisant — prévoir {(results.fuelMinL - fuelCapacity).toFixed(1)} L supplémentaires ou réduire les marges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
