import type { FlightDossier } from '../../types'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { Card } from '../../components/ui/Card'

interface Props {
  dossier: FlightDossier
  onUpdate: (partial: Partial<FlightDossier>) => void
}

export function NavlogPanel({ dossier, onUpdate }: Props) {
  const { route, weatherInputs, navOverrides, navNotes, aircraft } = dossier

  if (!route || route.waypoints.length < 2) {
    return <Card padding="md">Importer une route d'abord (onglet Route)</Card>
  }

  const regime = aircraft.characteristics.regimes[0]
  const ac = { speed: regime.speed, fuelBurn: regime.fuelBurn }
  const entries = generateNavlog(route, weatherInputs, ac, navOverrides)

  const totalDist = entries.reduce((s, e) => s + e.dist_nm, 0)
  const totalFuel = entries.at(-1)?.cumul_fuel_l ?? 0
  const totalTime = entries.at(-1)?.cumul_time_min ?? 0

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
  }

  const handleGsOverride = (legIndex: number, value: string) => {
    const gs = value === '' ? undefined : Number(value)
    const next = { ...navOverrides }
    if (gs === undefined) {
      const inner = { ...navOverrides[legIndex] }
      delete inner.gs
      if (inner.ete !== undefined) next[legIndex] = inner
      else delete next[legIndex]
    } else {
      next[legIndex] = { ...navOverrides[legIndex], gs }
    }
    onUpdate({ navOverrides: next })
  }

  const handleEteOverride = (legIndex: number, value: string) => {
    const ete = value === '' ? undefined : Number(value)
    const next = { ...navOverrides }
    if (ete === undefined) {
      const inner = { ...navOverrides[legIndex] }
      delete inner.ete
      if (inner.gs !== undefined) next[legIndex] = inner
      else delete next[legIndex]
    } else {
      next[legIndex] = { ...navOverrides[legIndex], ete }
    }
    onUpdate({ navOverrides: next })
  }

  const handleNote = (legIndex: number, value: string) => {
    onUpdate({ navNotes: { ...navNotes, [legIndex]: value } })
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-center gap-4 mb-4 text-sm text-[var(--text-muted)]">
        <span>Régime : <span className="font-mono text-[var(--text-1)]">{regime.label}</span></span>
        <span>Vitesse : <span className="font-mono text-[var(--text-1)]">{regime.speed} kt</span></span>
        <span>Conso : <span className="font-mono text-[var(--text-1)]">{regime.fuelBurn} L/h</span></span>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[var(--text-dim)] uppercase tracking-wider border-b border-[var(--border)]">
            <th className="text-left py-2 pr-3 font-medium">Balise</th>
            <th className="text-right py-2 px-2 font-medium">Alt ft</th>
            <th className="text-right py-2 px-2 font-medium">Cap °M</th>
            <th className="text-right py-2 px-2 font-medium">Dist nm</th>
            <th className="text-right py-2 px-2 font-medium">GS kt</th>
            <th className="text-right py-2 px-2 font-medium">ETE</th>
            <th className="text-right py-2 px-2 font-medium">Carbu L</th>
            <th className="text-right py-2 px-2 font-medium w-20">Réel</th>
            <th className="text-left py-2 pl-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const gsOv = navOverrides[entry.legIndex]?.gs
            const eteOv = navOverrides[entry.legIndex]?.ete
            return (
              <tr key={entry.legIndex} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)]">
                <td className="py-2 pr-3">
                  <span className="font-mono text-[var(--text-1)]">{entry.fromName}</span>
                  <span className="text-[var(--text-dim)] mx-1">→</span>
                  <span className="font-mono text-[var(--amber)]">{entry.toName}</span>
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-2)]">
                  {route.waypoints[entry.legIndex + 1]?.alt_ft ?? 0}
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.mh}°</td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.dist_nm.toFixed(1)}</td>
                <td className="text-right py-2 px-2">
                  <input
                    type="number"
                    value={gsOv ?? ''}
                    placeholder={String(entry.gs)}
                    onChange={(e) => handleGsOverride(entry.legIndex, e.target.value)}
                    className={`w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border rounded px-1 py-0.5 focus:outline-none focus:border-[var(--amber)] ${gsOv !== undefined ? 'border-[var(--amber)] text-[var(--amber)]' : 'border-[var(--border)] text-[var(--text-1)]'}`}
                  />
                </td>
                <td className="text-right py-2 px-2">
                  <input
                    type="number"
                    value={eteOv ?? ''}
                    placeholder={fmtTime(entry.ete_min)}
                    onChange={(e) => handleEteOverride(entry.legIndex, e.target.value)}
                    className={`w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border rounded px-1 py-0.5 focus:outline-none focus:border-[var(--blue)] ${eteOv !== undefined ? 'border-[var(--blue)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-1)]'}`}
                  />
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.fuel_l.toFixed(1)}</td>
                <td className="text-right py-2 px-2 text-[var(--text-dim)] text-xs">____</td>
                <td className="py-2 pl-2">
                  <input
                    type="text"
                    value={navNotes[entry.legIndex] ?? ''}
                    onChange={(e) => handleNote(entry.legIndex, e.target.value)}
                    className="w-full text-xs bg-transparent border-b border-[var(--border)] text-[var(--text-2)] focus:outline-none focus:border-[var(--amber)] placeholder:text-[var(--text-dim)]"
                    placeholder="fréq, espace aérien..."
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] font-semibold text-[var(--text-1)]">
            <td className="py-2 pr-3 text-xs text-[var(--text-muted)] uppercase">Total</td>
            <td /><td />
            <td className="text-right py-2 px-2 font-mono">{totalDist.toFixed(1)}</td>
            <td />
            <td className="text-right py-2 px-2 font-mono">{fmtTime(totalTime)}</td>
            <td className="text-right py-2 px-2 font-mono">{totalFuel.toFixed(1)}</td>
            <td /><td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
