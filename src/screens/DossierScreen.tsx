import type { FlightDossier, DossierTab, FlightBranch, FuelInputs } from '../types'
import { BranchesPanel } from '../features/branches/BranchesPanel'
import { WeatherPanel } from '../features/weather/WeatherPanel'
import { FuelPanel } from '../features/fuel/FuelPanel'
import { WBPanel } from '../features/wb/WBPanel'
import { PerfPanel } from '../features/perf/PerfPanel'
import { DossierPanel } from '../features/dossier/DossierPanel'

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
      {activeTab === 'branches' && (
        <BranchesPanel
          branches={dossier.branches}
          onUpdate={(branches: FlightBranch[]) => {
            const speed = dossier.aircraft.characteristics.regimes[0].speed
            const defaultFuel: FuelInputs = { gsBase: speed, windAdjust: 0, roulage: 10, marge: 10, extras: [], reserveMin: 30, derouteMin: 30, plein: false }
            const synced: Record<string, FuelInputs> = {}
            for (const b of branches) {
              synced[b.id] = dossier.fuelInputs[b.id] ?? { ...defaultFuel }
            }
            update({ branches, fuelInputs: synced })
          }}
        />
      )}
      {activeTab === 'weather' && (
        <WeatherPanel dossier={dossier} onUpdate={(weatherInputs) => update({ weatherInputs })} />
      )}
      {activeTab === 'fuel' && (
        <FuelPanel
          dossier={dossier}
          onUpdate={(fuelInputs) => update({ fuelInputs })}
        />
      )}
      {activeTab === 'wb' && (
        <WBPanel dossier={dossier} onUpdate={(loading) => update({ loading })} />
      )}
      {activeTab === 'perf' && (
        <PerfPanel
          dossier={dossier}
          onUpdate={(perfInputs) => update({ perfInputs })}
          onUpdateRegulatory={(perfRegulatory) => update({ perfRegulatory })}
        />
      )}
      {activeTab === 'dossier' && <DossierPanel dossier={dossier} />}
    </div>
  )
}
