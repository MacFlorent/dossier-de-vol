import type { FlightDossier } from '../../types'
import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
import { Badge } from '../../components/ui/Badge'

interface Props { dossier: FlightDossier }

export function DossierPrintSheet({ dossier }: Props) {
  const { aircraft, branches, loading, fuelInputs } = dossier

  const wbDep = computeWB(aircraft.massBalance, loading)

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const regime = aircraft.characteristics.regimes[0]

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── SHEET 1: Header + Branches summary ──────────────────────────── */}
      <div className="print-sheet px-6 pb-8">
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
              <p>{regime.speed} kt · {regime.fuelBurn} L/h</p>
            </div>
          </div>
        </header>

        {branches.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Branches de vol</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-dim)]">
                  <th className="text-left py-1 pr-2">Branche</th>
                  <th className="text-left py-1 pr-2">Points</th>
                  <th className="text-right py-1 px-1">Dist (nm)</th>
                  <th className="text-right py-1 px-1">Carbu min</th>
                  <th className="text-left py-1 pl-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(branch => {
                  const fi = fuelInputs[branch.id]
                  const fuelResult = fi ? computeBranchFuel(branch, fi, regime) : null
                  const fuelMinL = fuelResult?.requiredFuelL ?? null
                  const distNm = branch.segments.filter(seg => seg.role === 'ENROUTE').reduce((s, seg) => s + seg.distanceNm, 0)
                  const aeroStr = branch.aerodromes
                    .filter(a => a.role === 'DEP' || a.role === 'ARR')
                    .map(a => a.identifier).join(' → ')
                  return (
                    <tr key={branch.id} className="border-b border-[var(--border)]/50">
                      <td className="py-1 pr-2 font-medium text-[var(--text-1)]">{branch.label}</td>
                      <td className="py-1 pr-2 font-mono text-[var(--text-2)]">{aeroStr || '—'}</td>
                      <td className="text-right py-1 px-1 font-mono">{distNm.toFixed(0)}</td>
                      <td className="text-right py-1 px-1 font-mono">
                        {fuelMinL !== null ? `${fuelMinL.toFixed(1)} L` : '—'}
                      </td>
                      <td className="text-left py-1 pl-2 text-[var(--text-dim)]">{branch.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Aucune branche définie.</p>
        )}
      </div>

      {/* ── SHEET 2: W&B ────────────────────────────────────────────────── */}
      <div className="print-sheet px-6 pb-8 mt-8 no-print-break">
        <header className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Masse & Centrage</h2>
            <p className="text-xs font-mono text-[var(--text-muted)]">{dossier.name} · {dossier.date}</p>
          </div>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
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
                    <td className="text-right py-1 font-mono">
                      {st.kind === 'fuel'
                        ? ((loading[st.name] ?? 0) * FUEL_DENSITY_KGL).toFixed(1)
                        : (loading[st.name] ?? 0).toFixed(1)}
                    </td>
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

          <section>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Carburant par branche</h3>
            {branches.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">Aucune branche.</p>
            ) : (
              <dl className="space-y-2 text-xs">
                {branches.map(branch => {
                  const fi = fuelInputs[branch.id]
                  if (!fi) return (
                    <div key={branch.id} className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">{branch.label}</dt>
                      <dd className="font-mono text-[var(--text-dim)]">—</dd>
                    </div>
                  )
                  const { requiredFuelL, requiredFuelKg, reserveMin } = computeBranchFuel(branch, fi, regime)
                  return (
                    <div key={branch.id} className="border-b border-[var(--border)]/30 pb-1">
                      <div className="flex justify-between font-medium">
                        <dt className="text-[var(--text-1)]">{branch.label}</dt>
                        <dd className="font-mono">{requiredFuelL.toFixed(1)} L</dd>
                      </div>
                      <div className="flex justify-between text-[var(--text-dim)]">
                        <dt>Réserve {fmtTime(reserveMin)} · {fi.reserveMode === 'day' ? 'Jour' : 'Nuit'}</dt>
                        <dd className="font-mono">{requiredFuelKg.toFixed(1)} kg</dd>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between text-[var(--text-dim)]">
                  <dt>Capacité avion</dt>
                  <dd className="font-mono">{totalFuelCapacity(aircraft.massBalance)} L</dd>
                </div>
              </dl>
            )}
          </section>
        </div>

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
