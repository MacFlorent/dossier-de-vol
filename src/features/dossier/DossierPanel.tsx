import type { FlightDossier } from '../../types'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { computeWB } from '../../lib/aviation/wbCalc'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { downloadDossier } from '../../lib/storage'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'

interface Props { dossier: FlightDossier }

export function DossierPanel({ dossier }: Props) {
  const { aircraft, route, weatherInputs, navOverrides, loading, fuelInputs } = dossier

  // Compute navlog
  const regime = aircraft.characteristics.regimes[0]
  const navlog = route && route.waypoints.length >= 2
    ? generateNavlog(
        route, weatherInputs,
        { ias: regime.ias, fuelBurn: regime.fuelBurn },
        navOverrides
      )
    : []

  // Compute W&B departure
  const fuelMassKg = aircraft.characteristics.fuelCapacity * FUEL_DENSITY_KGL
  const depLoading = { ...loading }
  // Set fuel station weight for departure
  const fuelStation = aircraft.massBalance.stations.find(s => s.name.toLowerCase().includes('carburant'))
  if (fuelStation) depLoading[fuelStation.name] = fuelMassKg
  const wbDep = computeWB(aircraft.massBalance, depLoading)

  const totalDist = navlog.reduce((s, e) => s + e.dist_nm, 0)
  const totalTime = navlog.at(-1)?.cumul_time_min ?? 0
  const totalFuel = navlog.at(-1)?.cumul_fuel_l ?? 0

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  // Compute fuel min
  const extrasMin = fuelInputs.extras.reduce((s, e) => s + e.durationMin, 0)
  const totalFuelMin = (totalTime + fuelInputs.roulage + extrasMin + fuelInputs.reserveMin + fuelInputs.derouteMin)
    * (1 + fuelInputs.marge / 100)
  const fuelMinL = (totalFuelMin / 60) * regime.fuelBurn

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action buttons — hidden in print */}
      <div className="no-print flex items-center gap-3 p-4 border-b border-[var(--border)] mb-6">
        <Button variant="primary" onClick={() => window.print()}>
          Imprimer (A4)
        </Button>
        <Button variant="secondary" onClick={() => downloadDossier(dossier)}>
          Télécharger JSON
        </Button>
      </div>

      {/* ── SHEET 1: Header + Navlog ──────────────────────────────── */}
      <div className="print-sheet px-6 pb-8">
        {/* Header */}
        <header className="mb-6 pb-4 border-b-2 border-[var(--amber)]">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-1)]">{dossier.name}</h1>
              <p className="text-sm text-[var(--text-muted)]">
                {dossier.date} · {dossier.departureTime} UTC · {aircraft.registration}
              </p>
            </div>
            <div className="text-right text-sm font-mono text-[var(--text-muted)]">
              <p>{aircraft.name}</p>
              <p>IAS {regime.ias} kt · {regime.fuelBurn} L/h</p>
            </div>
          </div>
        </header>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-4 mb-6 text-center">
          {[
            { label: 'Distance', value: `${totalDist.toFixed(0)} nm` },
            { label: 'Durée', value: fmtTime(totalTime) },
            { label: 'Carbu navlog', value: `${totalFuel.toFixed(1)} L` },
            { label: 'Carbu min', value: `${fuelMinL.toFixed(1)} L` },
          ].map(({ label, value }) => (
            <Card key={label} padding="sm" inset>
              <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">{label}</p>
              <p className="font-mono font-semibold text-[var(--text-1)] mt-1">{value}</p>
            </Card>
          ))}
        </div>

        {/* Navlog table */}
        {navlog.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Journal de navigation</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-dim)]">
                  <th className="text-left py-1 pr-2">De → À</th>
                  <th className="text-right py-1 px-1">Cap °M</th>
                  <th className="text-right py-1 px-1">Dist</th>
                  <th className="text-right py-1 px-1">GS</th>
                  <th className="text-right py-1 px-1">ETE</th>
                  <th className="text-right py-1 px-1">L</th>
                  <th className="text-right py-1 px-1">∑ min</th>
                  <th className="text-right py-1 px-1">∑ L</th>
                  <th className="text-left py-1 pl-2">Réel</th>
                </tr>
              </thead>
              <tbody>
                {navlog.map(e => (
                  <tr key={e.legIndex} className="border-b border-[var(--border)]/50">
                    <td className="py-1 pr-2 font-mono">{e.fromName} → {e.toName}</td>
                    <td className="text-right py-1 px-1 font-mono">{e.mh}°</td>
                    <td className="text-right py-1 px-1 font-mono">{e.dist_nm.toFixed(1)}</td>
                    <td className="text-right py-1 px-1 font-mono">{e.gs}</td>
                    <td className="text-right py-1 px-1 font-mono">{Math.round(e.ete_min)}'</td>
                    <td className="text-right py-1 px-1 font-mono">{e.fuel_l.toFixed(1)}</td>
                    <td className="text-right py-1 px-1 font-mono">{Math.round(e.cumul_time_min)}</td>
                    <td className="text-right py-1 px-1 font-mono">{e.cumul_fuel_l.toFixed(1)}</td>
                    <td className="text-left py-1 pl-2 text-[var(--text-dim)]">______</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Aucune route importée.</p>
        )}

        {/* Weather summary */}
        {weatherInputs.notes && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notes / NOTAM</h2>
            <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap bg-[var(--bg-inset)] p-3 rounded">
              {weatherInputs.notes}
            </pre>
          </section>
        )}
      </div>

      {/* ── SHEET 2: W&B + Carbu summary ────────────────────────── */}
      <div className="print-sheet px-6 pb-8 mt-8 no-print-break">
        <header className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Masse & Centrage · Carburant</h2>
            <p className="text-xs font-mono text-[var(--text-muted)]">{dossier.name} · {dossier.date}</p>
          </div>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Station loading */}
          <section>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Chargement</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-dim)] border-b border-[var(--border)]">
                  <th className="text-left py-1">Station</th>
                  <th className="text-right py-1">Bras (mm)</th>
                  <th className="text-right py-1">Masse (kg)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border)]/30">
                  <td className="py-1 text-[var(--text-2)]">À vide</td>
                  <td className="text-right py-1 font-mono">{aircraft.massBalance.emptyArm}</td>
                  <td className="text-right py-1 font-mono">{aircraft.massBalance.emptyWeight}</td>
                </tr>
                {aircraft.massBalance.stations.map(st => (
                  <tr key={st.name} className="border-b border-[var(--border)]/30">
                    <td className="py-1 text-[var(--text-2)]">{st.name}</td>
                    <td className="text-right py-1 font-mono">{st.arm}</td>
                    <td className="text-right py-1 font-mono">{depLoading[st.name]?.toFixed(1) ?? '0'}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border)] font-semibold">
                  <td className="py-1">TOTAL départ</td>
                  <td className="text-right py-1 font-mono">{wbDep.cg.toFixed(0)}</td>
                  <td className="text-right py-1 font-mono">{wbDep.totalWeight.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2">
              <Badge variant={wbDep.inEnvelope ? 'success' : 'error'}>
                {wbDep.inEnvelope ? 'Dans l\'enveloppe' : 'HORS ENVELOPPE'}
              </Badge>
            </div>
          </section>

          {/* Fuel breakdown */}
          <section>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Carburant</h3>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Temps vol navlog</dt>
                <dd className="font-mono">{fmtTime(totalTime)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Roulage</dt>
                <dd className="font-mono">{fuelInputs.roulage} min</dd>
              </div>
              {fuelInputs.extras.map(e => (
                <div key={e.id} className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">{e.label || 'Extra'}</dt>
                  <dd className="font-mono">{e.durationMin} min</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Réserve</dt>
                <dd className="font-mono">{fuelInputs.reserveMin} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Déroutement</dt>
                <dd className="font-mono">{fuelInputs.derouteMin} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">Marge {fuelInputs.marge}%</dt>
                <dd className="font-mono">+{((totalFuelMin - (totalFuelMin / (1 + fuelInputs.marge / 100))) * regime.fuelBurn / 60).toFixed(1)} L</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
                <dt>Carbu min</dt>
                <dd className="font-mono">{fuelMinL.toFixed(1)} L · {(fuelMinL * FUEL_DENSITY_KGL).toFixed(1)} kg</dd>
              </div>
              <div className="flex justify-between text-[var(--text-dim)]">
                <dt>Capacité</dt>
                <dd className="font-mono">{aircraft.characteristics.fuelCapacity} L</dd>
              </div>
              <div className="mt-1">
                <Badge variant={fuelMinL <= aircraft.characteristics.fuelCapacity ? 'success' : 'error'}>
                  {fuelMinL <= aircraft.characteristics.fuelCapacity ? 'Carbu OK' : 'INSUFFISANT'}
                </Badge>
              </div>
            </dl>
          </section>
        </div>

        {/* Remarks */}
        <section className="mt-6">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Remarques</h3>
          <div className="border border-[var(--border)] rounded min-h-[80px] p-2 text-xs text-[var(--text-dim)]">
            {dossier.notes || <span className="italic">—</span>}
          </div>
        </section>
      </div>
    </div>
  )
}
