import { useMemo } from 'react'
import type { FlightDossier, StationLoading, WBResult } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (loading: StationLoading) => void
}

// ── SVG Envelope ─────────────────────────────────────────────────────────────

function EnvelopeSVG({
  points,
  departure,
  arrival,
}: {
  points: [number, number][]
  departure: { weight: number; cg: number } | null
  arrival: { weight: number; cg: number } | null
}) {
  if (points.length < 3) {
    return (
      <p className="text-xs text-[var(--text-dim)]">Enveloppe non définie</p>
    )
  }

  const width = 300
  const height = 200
  const pad = 30

  const cgs = points.map(p => p[1])
  const weights = points.map(p => p[0])
  const minCg = Math.min(...cgs)
  const maxCg = Math.max(...cgs)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)

  const cgRange = maxCg - minCg || 1
  const wRange = maxW - minW || 1

  const scaleX = (cg: number) =>
    pad + ((cg - minCg) / cgRange) * (width - 2 * pad)
  const scaleY = (w: number) =>
    height - pad - ((w - minW) / wRange) * (height - 2 * pad)

  const pathD =
    points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${scaleX(p[1]).toFixed(1)} ${scaleY(p[0]).toFixed(1)}`
      )
      .join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xs">
      <path
        d={pathD}
        fill="color-mix(in srgb, var(--amber) 12%, transparent)"
        stroke="var(--amber)"
        strokeWidth="1.5"
      />
      {departure && (
        <circle
          cx={scaleX(departure.cg).toFixed(1)}
          cy={scaleY(departure.weight).toFixed(1)}
          r="5"
          fill="var(--blue)"
          opacity="0.9"
        />
      )}
      {arrival && (
        <circle
          cx={scaleX(arrival.cg).toFixed(1)}
          cy={scaleY(arrival.weight).toFixed(1)}
          r="5"
          fill="var(--green)"
          opacity="0.9"
        />
      )}
      <circle cx={pad} cy={height - 10} r="4" fill="var(--blue)" />
      <text x={pad + 8} y={height - 7} fontSize="9" fill="var(--text-dim)">Départ</text>
      <circle cx={pad + 55} cy={height - 10} r="4" fill="var(--green)" />
      <text x={pad + 63} y={height - 7} fontSize="9" fill="var(--text-dim)">Arrivée</text>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKg(v: number) { return v.toFixed(1) + ' kg' }
function fmtCg(v: number) { return v.toFixed(0) + ' mm' }

function wbStatus(dep: WBResult, arr: WBResult) {
  if (!dep.inEnvelope || !arr.inEnvelope)
    return { variant: 'error' as const, label: 'HORS LIMITE' }
  return { variant: 'success' as const, label: 'OK' }
}

// Distributes navlog fuel burn across fuel stations proportionally to departure load
function arrivalFuelLoading(
  fuelStationNames: string[],
  loading: StationLoading,
  navlogFuelL: number,
): StationLoading {
  const totalDepL = fuelStationNames.reduce((s, name) => s + (loading[name] ?? 0), 0)
  const totalArrL = Math.max(0, totalDepL - navlogFuelL)
  const ratio = totalDepL > 0 ? totalArrL / totalDepL : 0
  const result: StationLoading = {}
  for (const name of fuelStationNames) {
    result[name] = (loading[name] ?? 0) * ratio
  }
  return result
}

// ── Main component ────────────────────────────────────────────────────────────

export function WBPanel({ dossier, onUpdate }: Props) {
  const { aircraft, loading } = dossier
  const { massBalance, characteristics } = aircraft
  const { stations, emptyWeight, envelopePoints } = massBalance

  const fuelStations = stations.filter(s => s.kind === 'fuel')
  const dryStations = stations.filter(s => s.kind === 'dry')
  const fuelStationNames = fuelStations.map(s => s.name)

  const navlogFuelL = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const regime = aircraft.characteristics.regimes[0]
    const ac = { ias: regime.ias, fuelBurn: regime.fuelBurn }
    const entries = generateNavlog(dossier.route, dossier.weatherInputs, ac, dossier.navOverrides)
    return entries.at(-1)?.cumul_fuel_l ?? 0
  }, [dossier.route, dossier.weatherInputs, dossier.navOverrides, aircraft])

  const arrLoading = useMemo(
    () => arrivalFuelLoading(fuelStationNames, loading, navlogFuelL),
    [fuelStationNames, loading, navlogFuelL],
  )

  const depResult = useMemo(
    () => computeWB(massBalance, loading),
    [massBalance, loading],
  )

  const arrResult = useMemo(() => {
    const merged = { ...loading, ...arrLoading }
    return computeWB(massBalance, merged)
  }, [massBalance, loading, arrLoading])

  const status = wbStatus(depResult, arrResult)

  const handleChange = (name: string, value: string) => {
    const v = value === '' ? 0 : Math.max(0, Number(value))
    onUpdate({ ...loading, [name]: v })
  }

  const dryTotal = dryStations.reduce((s, st) => s + (loading[st.name] ?? 0), 0)

  const totalDepFuelL = fuelStationNames.reduce((s, n) => s + (loading[n] ?? 0), 0)
  const totalDepFuelKg = totalDepFuelL * FUEL_DENSITY_KGL
  const totalArrFuelL = fuelStationNames.reduce((s, n) => s + (arrLoading[n] ?? 0), 0)
  const totalArrFuelKg = totalArrFuelL * FUEL_DENSITY_KGL

  return (
    <div className="p-4 max-w-4xl mx-auto">
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
                  const depL = loading[st.name] ?? 0
                  const depKg = depL * FUEL_DENSITY_KGL
                  const arrL = arrLoading[st.name] ?? 0
                  const arrKg = arrL * FUEL_DENSITY_KGL
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5">
                        <div className="text-[var(--text-2)]">{st.name}</div>
                        <div className="text-xs text-[var(--text-dim)] mt-0.5">
                          Cap. {characteristics.fuelCapacity} L
                        </div>
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <input
                            type="number"
                            min={0}
                            max={characteristics.fuelCapacity}
                            value={depL === 0 ? '' : depL}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">L dep</span>
                        </div>
                        <div className="text-right text-xs text-[var(--text-dim)] font-mono">
                          {depKg.toFixed(1)} kg → {arrKg.toFixed(1)} kg arr
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

                {fuelStationNames.length > 0 && (
                  <tr className="font-medium">
                    <td className="pt-1 text-[var(--text-muted)]">Carburant départ / arrivée</td>
                    <td className="pt-1 text-right font-mono text-[var(--text-1)] text-xs">
                      {totalDepFuelKg.toFixed(1)} / {totalArrFuelKg.toFixed(1)} kg
                    </td>
                  </tr>
                )}

                {fuelStationNames.length === 0 && (
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs text-[var(--amber)]">
                      Aucune station carburant — centrage arrivée = centrage départ
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2" />
                  <th className="text-right pb-2">Masse</th>
                  <th className="text-right pb-2 pl-3">CG</th>
                  <th className="text-right pb-2 pl-3">Env.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr>
                  <td className="py-2 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--blue)' }} />
                    <span className="text-[var(--text-2)]">Départ</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(depResult.totalWeight)}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(depResult.cg)}</td>
                  <td className="py-2 text-right pl-3">
                    {depResult.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--green)' }} />
                    <span className="text-[var(--text-2)]">Arrivée</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(arrResult.totalWeight)}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(arrResult.cg)}</td>
                  <td className="py-2 text-right pl-3">
                    {arrResult.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-xs text-[var(--text-dim)]">
                    MTOW : {aircraft.massBalance.maxWeight} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card padding="sm">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
            <EnvelopeSVG
              points={envelopePoints}
              departure={{ weight: depResult.totalWeight, cg: depResult.cg }}
              arrival={{ weight: arrResult.totalWeight, cg: arrResult.cg }}
            />
          </Card>

          {depResult.totalWeight > aircraft.massBalance.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse départ ({fmtKg(depResult.totalWeight)}) dépasse le MTOW ({aircraft.massBalance.maxWeight} kg)
              </p>
            </Card>
          )}
          {arrResult.totalWeight > aircraft.massBalance.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse arrivée ({fmtKg(arrResult.totalWeight)}) dépasse le MTOW ({aircraft.massBalance.maxWeight} kg)
              </p>
            </Card>
          )}
          {(!depResult.inEnvelope || !arrResult.inEnvelope) && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Centrage hors de l&apos;enveloppe — revoir la répartition des charges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
