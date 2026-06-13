import type { Aircraft, FlightPlan, NavlogEntry } from '../../../types'
import { computeFuelPlan } from '../utils/fuelCalc'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'

interface Props {
  aircraft: Aircraft
  plan: FlightPlan
  navlog: NavlogEntry[]
}

export function FuelPanel({ aircraft, plan, navlog }: Props) {
  if (navlog.length === 0) {
    return <p className="text-sm text-muted">Générez d'abord un navlog depuis l'onglet Route.</p>
  }

  const fuel = computeFuelPlan(plan, aircraft, navlog)
  const available = aircraft.fuelCapacity
  const margin = available - fuel.total
  const marginOk = margin >= 0

  function FuelRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
    return (
      <div className={`flex justify-between py-1.5 border-b border-border/50 text-sm ${bold ? 'font-semibold' : ''}`}>
        <span className={bold ? 'text-text' : 'text-muted'}>{label}</span>
        <span className={bold ? 'text-text' : 'text-muted'}>{value.toFixed(1)} L</span>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title="Bilan carburant">
        <FuelRow label="Roulage" value={fuel.taxi} />
        <FuelRow label="Montée" value={fuel.climbFuel} />
        <FuelRow label="En route" value={fuel.enRouteFuel} />
        <FuelRow label="Descente" value={fuel.descentFuel} />
        <FuelRow label="Réserve VFR (45 min)" value={fuel.reserveVfr} />
        <FuelRow label="TOTAL REQUIS" value={fuel.total} bold />
      </Card>

      <Card title="Disponibilité">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Capacité avion</span>
            <span className="text-text font-medium">{available} L</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Total requis</span>
            <span className="text-text">{fuel.total.toFixed(1)} L</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
            <span>Marge</span>
            <Badge variant={marginOk ? 'success' : 'error'}>
              {margin >= 0 ? '+' : ''}{margin.toFixed(1)} L
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Masse carburant total requis</span>
            <span className="text-text">{fuel.totalWeight.toFixed(1)} kg</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Endurance totale avion</span>
            <span className="text-text">{Math.floor(fuel.endurance_min / 60)}h{String(fuel.endurance_min % 60).padStart(2, '0')}</span>
          </div>
          {!marginOk && (
            <p className="text-xs text-danger font-medium bg-red-900/20 rounded p-2">
              Attention : le carburant disponible est insuffisant pour ce vol.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
