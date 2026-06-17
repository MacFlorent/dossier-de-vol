import type { FlightDossier, DossierTab } from '../types'
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
          onUpdate={(branches) => update({ branches })}
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
