import { useMemo } from 'react'
import type { FlightDossier, StationLoading, WBResult } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
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

  // Add some margin so boundary points aren't clipped
  const cgRange = maxCg - minCg || 1
  const wRange = maxW - minW || 1

  const scaleX = (cg: number) =>
    pad + ((cg - minCg) / cgRange) * (width - 2 * pad)
  // Y axis inverted: higher weight = higher on screen
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
      {/* Envelope polygon */}
      <path
        d={pathD}
        fill="rgba(240,169,59,0.12)"
        stroke="var(--amber)"
        strokeWidth="1.5"
      />
      {/* Departure point (blue) */}
      {departure && (
        <circle
          cx={scaleX(departure.cg).toFixed(1)}
          cy={scaleY(departure.weight).toFixed(1)}
          r="5"
          fill="var(--blue)"
          opacity="0.9"
        />
      )}
      {/* Arrival point (green) */}
      {arrival && (
        <circle
          cx={scaleX(arrival.cg).toFixed(1)}
          cy={scaleY(arrival.weight).toFixed(1)}
          r="5"
          fill="var(--green)"
          opacity="0.9"
        />
      )}
      {/* Legend */}
      <circle cx={pad} cy={height - 10} r="4" fill="var(--blue)" />
      <text
        x={pad + 8}
        y={height - 7}
        fontSize="9"
        fill="var(--text-dim)"
      >
        Départ
      </text>
      <circle cx={pad + 55} cy={height - 10} r="4" fill="var(--green)" />
      <text
        x={pad + 63}
        y={height - 7}
        fontSize="9"
        fill="var(--text-dim)"
      >
        Arrivée
      </text>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKg(v: number) {
  return v.toFixed(1) + ' kg'
}

function fmtCg(v: number) {
  return v.toFixed(0) + ' mm'
}

function wbStatus(dep: WBResult, arr: WBResult) {
  if (!dep.inEnvelope || !arr.inEnvelope)
    return { variant: 'error' as const, label: 'HORS LIMITE' }
  // "Close to boundary" heuristic: weight > 95% max or CG near edge (not computed here,
  // keep it simple — just OK vs HORS LIMITE unless we want ATTENTION for overweight)
  return { variant: 'success' as const, label: 'OK' }
}

// ── Main component ────────────────────────────────────────────────────────────

export function WBPanel({ dossier, onUpdate }: Props) {
  const { aircraft, loading } = dossier
  const {
    stations,
    emptyWeight,
    fuelCapacity,
    fuelDensity,
    envelopePoints,
  } = aircraft

  // Identify fuel station name (matches "Carburant" in DR221)
  const fuelStationName = stations.find(s =>
    s.name.toLowerCase().includes('carburant')
  )?.name ?? null

  // Non-fuel stations = the ones users can edit
  const editableStations = stations.filter(s => s.name !== fuelStationName)

  // Full fuel mass (departure)
  const fuelMassKg = fuelCapacity * fuelDensity

  // Navlog fuel burn (for arrival estimate)
  const navlogFuelL = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const ac = {
      tas: aircraft.tas,
      fuelBurn: aircraft.fuelBurn,
      magneticVariation: aircraft.magneticVariation,
    }
    const entries = generateNavlog(
      dossier.route,
      dossier.weatherInputs,
      ac,
      dossier.navOverrides
    )
    return entries.at(-1)?.cumul_fuel_l ?? 0
  }, [
    dossier.route,
    dossier.weatherInputs,
    dossier.navOverrides,
    aircraft,
  ])

  // Arrival fuel: max(0, full - burned)
  const arrivalFuelKg = Math.max(
    0,
    fuelMassKg - navlogFuelL * fuelDensity
  )

  // Departure W&B: loading + full fuel
  const depResult = useMemo(() => {
    const depLoading: StationLoading = { ...loading }
    if (fuelStationName !== null) depLoading[fuelStationName] = fuelMassKg
    return computeWB(aircraft, depLoading)
  }, [aircraft, loading, fuelStationName, fuelMassKg])

  // Arrival W&B: loading + arrival fuel (or 0 if no fuel station)
  const arrResult = useMemo(() => {
    const arrLoading: StationLoading = { ...loading }
    if (fuelStationName !== null) arrLoading[fuelStationName] = arrivalFuelKg
    else {
      // No explicit fuel station — arrival = same loading (fuel not modelled)
    }
    return computeWB(aircraft, arrLoading)
  }, [aircraft, loading, fuelStationName, arrivalFuelKg])

  const status = wbStatus(depResult, arrResult)

  const handleStationChange = (name: string, value: string) => {
    const kg = value === '' ? 0 : Math.max(0, Number(value))
    onUpdate({ ...loading, [name]: kg })
  }

  // Total pax + baggage shown at bottom of table
  const stationTotal = editableStations.reduce(
    (s, st) => s + (loading[st.name] ?? 0),
    0
  )

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: station inputs */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Chargement
          </h2>

          {/* Editable stations */}
          <Card padding="sm" inset>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2">Station</th>
                  <th className="text-right pb-2">Masse (kg)</th>
                  <th className="text-right pb-2 pl-2">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {/* Empty aircraft row */}
                <tr>
                  <td className="py-2 text-[var(--text-muted)]">
                    Avion vide
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-dim)]">
                    {emptyWeight}
                  </td>
                  <td />
                </tr>

                {/* Editable stations */}
                {editableStations.map(st => {
                  const val = loading[st.name] ?? 0
                  const overMax = val > st.maxWeight
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5 text-[var(--text-2)]">
                        {st.name}
                      </td>
                      <td className="py-1.5 pl-2">
                        <input
                          type="number"
                          min={0}
                          max={st.maxWeight}
                          value={val === 0 ? '' : val}
                          placeholder="0"
                          onChange={e =>
                            handleStationChange(st.name, e.target.value)
                          }
                          className={`
                            w-20 text-right font-mono text-sm
                            bg-[var(--bg-card)] border rounded px-2 py-1
                            text-[var(--text-1)]
                            focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]
                            ${overMax ? 'border-[var(--red)]' : 'border-[var(--border)]'}
                          `}
                        />
                      </td>
                      <td className="py-1.5 pl-2 text-right text-xs text-[var(--text-dim)] font-mono">
                        {st.maxWeight}
                      </td>
                    </tr>
                  )
                })}

                {/* Fuel rows (read-only) */}
                {fuelStationName && (
                  <>
                    <tr>
                      <td
                        className="py-1.5 text-[var(--text-muted)] italic"
                        colSpan={3}
                      >
                        <span className="text-xs">
                          {fuelStationName} départ
                        </span>
                        <span className="ml-2 font-mono text-[var(--text-2)]">
                          {fuelMassKg.toFixed(1)} kg
                        </span>
                        <span className="ml-1 text-[var(--text-dim)] text-xs">
                          ({fuelCapacity} L plein)
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="py-1.5 text-[var(--text-muted)] italic"
                        colSpan={3}
                      >
                        <span className="text-xs">
                          {fuelStationName} arrivée
                        </span>
                        <span className="ml-2 font-mono text-[var(--text-2)]">
                          {arrivalFuelKg.toFixed(1)} kg
                        </span>
                        {navlogFuelL > 0 && (
                          <span className="ml-1 text-[var(--text-dim)] text-xs">
                            (−{(navlogFuelL * fuelDensity).toFixed(1)} kg navlog)
                          </span>
                        )}
                        {navlogFuelL === 0 && (
                          <span className="ml-1 text-[var(--text-dim)] text-xs">
                            (route non calculée)
                          </span>
                        )}
                      </td>
                    </tr>
                  </>
                )}

                {/* Total pax+baggage */}
                <tr className="font-medium">
                  <td className="pt-2 text-[var(--text-muted)]">
                    Sous-total charges
                  </td>
                  <td className="pt-2 text-right font-mono text-[var(--text-1)]">
                    {stationTotal.toFixed(1)}
                  </td>
                  <td />
                </tr>
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

          {/* Results table */}
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
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: 'var(--blue)' }}
                    />
                    <span className="text-[var(--text-2)]">Départ</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">
                    {fmtKg(depResult.totalWeight)}
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">
                    {fmtCg(depResult.cg)}
                  </td>
                  <td className="py-2 text-right pl-3">
                    {depResult.inEnvelope ? (
                      <Badge variant="success">OK</Badge>
                    ) : (
                      <Badge variant="error">HORS</Badge>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: 'var(--green)' }}
                    />
                    <span className="text-[var(--text-2)]">Arrivée</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">
                    {fmtKg(arrResult.totalWeight)}
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">
                    {fmtCg(arrResult.cg)}
                  </td>
                  <td className="py-2 text-right pl-3">
                    {arrResult.inEnvelope ? (
                      <Badge variant="success">OK</Badge>
                    ) : (
                      <Badge variant="error">HORS</Badge>
                    )}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={4}
                    className="pt-3 text-xs text-[var(--text-dim)]"
                  >
                    MTOW : {aircraft.maxWeight} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* SVG envelope */}
          <Card padding="sm">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">
              Enveloppe de centrage
            </p>
            <EnvelopeSVG
              points={envelopePoints}
              departure={{ weight: depResult.totalWeight, cg: depResult.cg }}
              arrival={{ weight: arrResult.totalWeight, cg: arrResult.cg }}
            />
          </Card>

          {/* Warnings */}
          {depResult.totalWeight > aircraft.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse départ ({fmtKg(depResult.totalWeight)}) dépasse le MTOW
                ({aircraft.maxWeight} kg)
              </p>
            </Card>
          )}
          {arrResult.totalWeight > aircraft.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse arrivée ({fmtKg(arrResult.totalWeight)}) dépasse le MTOW
                ({aircraft.maxWeight} kg)
              </p>
            </Card>
          )}
          {(!depResult.inEnvelope || !arrResult.inEnvelope) && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Centrage hors de l&apos;enveloppe — revoir la répartition des
                charges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
