import type { FlightDossier, DossierTab } from '../types'
import { RoutePanel } from '../features/route/RoutePanel'
import { WeatherPanel } from '../features/weather/WeatherPanel'
import { NavlogPanel } from '../features/navlog/NavlogPanel'
import { FuelPanel } from '../features/fuel/FuelPanel'

// Stub components for other panels (will be replaced in Tasks 13-18)
function PanelStub({ name }: { name: string }) {
  return (
    <div className="p-8 text-center text-[var(--text-muted)]">
      {name} — à implémenter
    </div>
  )
}

interface DossierScreenProps {
  dossier: FlightDossier
  activeTab: DossierTab
  onUpdate: (dossier: FlightDossier) => void
}

export function DossierScreen({ dossier, activeTab, onUpdate }: DossierScreenProps) {
  const now = () => new Date().toISOString()
  const update = (partial: Partial<FlightDossier>) =>
    onUpdate({ ...dossier, ...partial, updatedAt: now() })

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {activeTab === 'route' && (
        <RoutePanel
          dossier={dossier}
          onUpdateRoute={(route) => update({ route })}
          onUpdateWaypoint={(wpId, changes) => {
            if (!dossier.route) return
            const waypoints = dossier.route.waypoints.map(w =>
              w.id === wpId ? { ...w, ...changes } : w
            )
            update({ route: { ...dossier.route, waypoints } })
          }}
        />
      )}
      {activeTab === 'weather' && (
        <WeatherPanel
          dossier={dossier}
          onUpdate={(weatherInputs) => update({ weatherInputs })}
        />
      )}
      {activeTab === 'navlog' && (
        <NavlogPanel
          dossier={dossier}
          onUpdate={update}
        />
      )}
      {activeTab === 'fuel' && (
        <FuelPanel
          dossier={dossier}
          onUpdate={(fuelInputs) => update({ fuelInputs })}
        />
      )}
      {activeTab === 'wb' && <PanelStub name="Masse & Centrage" />}
      {activeTab === 'perf' && <PanelStub name="Performances" />}
      {activeTab === 'dossier' && <PanelStub name="Dossier" />}
    </div>
  )
}
