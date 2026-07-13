import { useMemo } from 'react'
import type { FlightDossier, StationLoading, WBResult, WeightStation } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { niceTicks } from '../../lib/format/axisTicks'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (loading: StationLoading) => void
}

// ── SVG Envelope ─────────────────────────────────────────────────────────────

function EnvelopeSVG({
  points,
  zeroFuel,
  current,
  full,
}: {
  points: [number, number][]
  zeroFuel: { weight: number; cg: number } | null
  current: { weight: number; cg: number } | null
  full: { weight: number; cg: number } | null
}) {
  if (points.length < 3) {
    return (
      <p className="text-xs text-[var(--text-dim)]">Enveloppe non définie</p>
    )
  }

  const width = 640
  const height = 400
  const pad = 56

  const allWeights = [points.map(p => p[0]), [zeroFuel?.weight, current?.weight, full?.weight]]
    .flat()
    .filter((w): w is number => w !== undefined && w !== null)
  const allCgs = [points.map(p => p[1]), [zeroFuel?.cg, current?.cg, full?.cg]]
    .flat()
    .filter((c): c is number => c !== undefined && c !== null)

  const minW = Math.min(...allWeights)
  const maxW = Math.max(...allWeights)
  const minCg = Math.min(...allCgs)
  const maxCg = Math.max(...allCgs)

  const wTicks = niceTicks(minW, maxW, 5)
  const cgTicks = niceTicks(minCg, maxCg, 5)
  const scaleMinW = Math.min(minW, wTicks[0])
  const scaleMaxW = Math.max(maxW, wTicks[wTicks.length - 1])
  const scaleMinCg = Math.min(minCg, cgTicks[0])
  const scaleMaxCg = Math.max(maxCg, cgTicks[cgTicks.length - 1])

  const wRange = scaleMaxW - scaleMinW || 1
  const cgRange = scaleMaxCg - scaleMinCg || 1

  const scaleX = (cg: number) => pad + ((cg - scaleMinCg) / cgRange) * (width - pad - 16)
  const scaleY = (w: number) => height - pad - ((w - scaleMinW) / wRange) * (height - pad - 16)

  const pathD =
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p[1]).toFixed(1)} ${scaleY(p[0]).toFixed(1)}`)
      .join(' ') + ' Z'

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-3xl mx-auto" role="img" aria-label="Enveloppe de centrage">
        {wTicks.map(w => (
          <line key={`gw-${w}`} x1={pad} y1={scaleY(w)} x2={width - 16} y2={scaleY(w)} stroke="var(--border)" strokeWidth="1" />
        ))}
        {cgTicks.map(cg => (
          <line key={`gc-${cg}`} x1={scaleX(cg)} y1={16} x2={scaleX(cg)} y2={height - pad} stroke="var(--border)" strokeWidth="1" />
        ))}

        <line x1={pad} y1={16} x2={pad} y2={height - pad} stroke="var(--text-dim)" strokeWidth="1.5" />
        <line x1={pad} y1={height - pad} x2={width - 16} y2={height - pad} stroke="var(--text-dim)" strokeWidth="1.5" />

        {wTicks.map(w => (
          <text key={`tw-${w}`} x={pad - 8} y={scaleY(w) + 3} textAnchor="end" fontSize="11" fill="var(--text-dim)">{w}</text>
        ))}
        {cgTicks.map(cg => (
          <text key={`tc-${cg}`} x={scaleX(cg)} y={height - pad + 16} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{cg}</text>
        ))}

        <text x={12} y={12} fontSize="11" fill="var(--text-muted)">Masse (kg)</text>
        <text x={width - 16} y={height - 8} textAnchor="end" fontSize="11" fill="var(--text-muted)">CG (mm)</text>

        <path
          d={pathD}
          fill="color-mix(in srgb, var(--amber) 12%, transparent)"
          stroke="var(--amber)"
          strokeWidth="1.5"
        />

        {zeroFuel && full && (
          <line
            x1={scaleX(zeroFuel.cg)} y1={scaleY(zeroFuel.weight)}
            x2={scaleX(full.cg)} y2={scaleY(full.weight)}
            stroke="var(--text-dim)" strokeWidth="1.5" strokeDasharray="4,3"
          />
        )}

        {zeroFuel && (
          <circle cx={scaleX(zeroFuel.cg)} cy={scaleY(zeroFuel.weight)} r="6" fill="none" stroke="var(--blue)" strokeWidth="2" />
        )}
        {full && (
          <circle cx={scaleX(full.cg)} cy={scaleY(full.weight)} r="6" fill="none" stroke="var(--green)" strokeWidth="2" />
        )}
        {current && (
          <circle cx={scaleX(current.cg)} cy={scaleY(current.weight)} r="8" fill="var(--text-1)" stroke="var(--bg-card)" strokeWidth="2" />
        )}
      </svg>

      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs text-[var(--text-dim)]" data-testid="wb-graph-legend">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--blue)' }} />
          Sans carburant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--text-1)' }} />
          Actuel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--green)' }} />
          Plein carburant
        </span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKg(v: number) { return v.toFixed(1) + ' kg' }
function fmtCg(v: number) { return v.toFixed(0) + ' mm' }

function wbStatus(results: WBResult[]) {
  if (results.some(r => !r.inEnvelope))
    return { variant: 'error' as const, label: 'HORS LIMITE' }
  return { variant: 'success' as const, label: 'OK' }
}

function zeroFuelLoading(fuelStationNames: string[]): StationLoading {
  return Object.fromEntries(fuelStationNames.map(n => [n, 0]))
}

function fullFuelLoading(fuelStations: WeightStation[]): StationLoading {
  return Object.fromEntries(fuelStations.map(s => [s.name, s.capacityL]))
}

// ── Main component ────────────────────────────────────────────────────────────

export function WBPanel({ dossier, onUpdate }: Props) {
  const { aircraft, loading } = dossier
  const { massBalance } = aircraft
  const { stations, emptyWeight, envelopePoints } = massBalance

  // Derive MTOW from envelope points (max weight in envelope)
  const maxWeight = envelopePoints.length > 0
    ? Math.max(...envelopePoints.map(([kg]) => kg))
    : Infinity

  const fuelStations = stations.filter(s => s.kind === 'fuel')
  const dryStations = stations.filter(s => s.kind === 'dry')
  const fuelStationNames = fuelStations.map(s => s.name)

  const curResult = useMemo(
    () => computeWB(massBalance, loading),
    [massBalance, loading],
  )

  const zfwResult = useMemo(
    () => computeWB(massBalance, { ...loading, ...zeroFuelLoading(fuelStationNames) }),
    [massBalance, loading, fuelStationNames],
  )

  const fullResult = useMemo(
    () => computeWB(massBalance, { ...loading, ...fullFuelLoading(fuelStations) }),
    [massBalance, loading, fuelStations],
  )

  const status = wbStatus([zfwResult, curResult, fullResult])

  const handleChange = (name: string, value: string) => {
    const v = value === '' ? 0 : Math.max(0, Number(value))
    onUpdate({ ...loading, [name]: v })
  }

  const dryTotal = dryStations.reduce((s, st) => s + (loading[st.name] ?? 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-5">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: station inputs */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Chargement
          </h2>

          <Card padding="sm" inset>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2">Station</th>
                  <th className="text-right pb-2">Masse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr>
                  <td className="py-2 text-[var(--text-muted)]">Avion vide</td>
                  <td className="py-2 text-right font-mono text-[var(--text-dim)]">{emptyWeight} kg</td>
                </tr>

                {/* Dry stations */}
                {dryStations.map(st => {
                  const val = loading[st.name] ?? 0
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5 text-[var(--text-2)]">{st.name}</td>
                      <td className="py-1.5 pl-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            value={val === 0 ? '' : val}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">kg</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Fuel stations */}
                {fuelStations.map(st => {
                  const val = loading[st.name] ?? 0
                  const valKg = val * FUEL_DENSITY_KGL
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5">
                        <div className="text-[var(--text-2)]">{st.name}</div>
                        <div className="text-xs text-[var(--text-dim)] mt-0.5">
                          Cap. {st.capacityL} L
                        </div>
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <input
                            type="number"
                            aria-label={`${st.name} (L)`}
                            min={0}
                            max={st.capacityL}
                            value={val === 0 ? '' : val}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">L</span>
                        </div>
                        <div className="text-right text-xs text-[var(--text-dim)] font-mono">
                          {valKg.toFixed(1)} kg
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Dry total */}
                <tr className="font-medium">
                  <td className="pt-2 text-[var(--text-muted)]">Sous-total charges sèches</td>
                  <td className="pt-2 text-right font-mono text-[var(--text-1)]">{dryTotal.toFixed(1)} kg</td>
                </tr>

                {fuelStationNames.length === 0 && (
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs text-[var(--amber)]">
                      Aucune station carburant — le centrage ne varie pas avec le carburant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Right: results + SVG */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Résultats M&amp;C
            </h2>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          <Card padding="sm" inset>
            <table className="w-full text-sm" data-testid="wb-results-table">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2" />
                  <th className="text-right pb-2">Masse</th>
                  <th className="text-right pb-2 pl-3">CG</th>
                  <th className="text-right pb-2 pl-3">Env.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {([
                  { label: 'Sans carburant', color: 'var(--blue)', result: zfwResult },
                  { label: 'Actuel', color: 'var(--text-1)', result: curResult },
                  { label: 'Plein carburant', color: 'var(--green)', result: fullResult },
                ] as const).map(row => (
                  <tr key={row.label}>
                    <td className="py-2 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: row.color }} />
                      <span className="text-[var(--text-2)]">{row.label}</span>
                    </td>
                    <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(row.result.totalWeight)}</td>
                    <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(row.result.cg)}</td>
                    <td className="py-2 text-right pl-3">
                      {row.result.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-xs text-[var(--text-dim)]">
                    MTOW : {maxWeight} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {([
            { label: 'sans carburant', result: zfwResult },
            { label: 'actuel', result: curResult },
            { label: 'plein carburant', result: fullResult },
          ] as const).map(({ label, result }) => (
            result.totalWeight > maxWeight ? (
              <Card key={`mtow-${label}`} padding="sm">
                <p className="text-[var(--red)] text-sm font-medium">
                  Masse {label} ({fmtKg(result.totalWeight)}) dépasse le MTOW ({maxWeight} kg)
                </p>
              </Card>
            ) : null
          ))}
          {(!zfwResult.inEnvelope || !curResult.inEnvelope || !fullResult.inEnvelope) && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Centrage hors de l&apos;enveloppe — revoir la répartition des charges.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Card padding="sm">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
        <EnvelopeSVG
          points={envelopePoints}
          zeroFuel={{ weight: zfwResult.totalWeight, cg: zfwResult.cg }}
          current={{ weight: curResult.totalWeight, cg: curResult.cg }}
          full={{ weight: fullResult.totalWeight, cg: fullResult.cg }}
        />
      </Card>
      </div>
    </div>
  )
}
