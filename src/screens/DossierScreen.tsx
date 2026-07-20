import type { FlightDossier, DossierTab, FlightBranch, FuelInputs } from '../types'
import { BranchesPanel } from '../features/branches/BranchesPanel'
import { FuelPanel } from '../features/fuel/FuelPanel'
import { WBPanel } from '../features/wb/WBPanel'
import { PerfPanel } from '../features/perf/PerfPanel'
import { DossierPrintSheet } from '../features/dossier/DossierPrintSheet'
import { DEFAULT_FUEL_INPUTS } from '../lib/aviation/fuelCalc'
import { getAircraft } from '../lib/storage'
import { applyAircraftChange } from '../lib/dossierTransforms'

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
          aircraft={dossier.aircraft}
          onUpdate={(branches: FlightBranch[]) => {
            const synced: Record<string, FuelInputs> = {}
            for (const b of branches) {
              synced[b.id] = dossier.fuelInputs[b.id] ?? { ...DEFAULT_FUEL_INPUTS }
            }
            update({ branches, fuelInputs: synced })
          }}
        />
      )}
      {activeTab === 'fuel' && (
        <FuelPanel
          dossier={dossier}
          onUpdate={(fuelInputs) => update({ fuelInputs })}
          onUpdateBranches={(branches: FlightBranch[]) => update({ branches })}
          onChangeAircraft={(newAircraftId) => {
            const newAircraft = getAircraft(newAircraftId)
            if (newAircraft) onUpdate(applyAircraftChange(dossier, newAircraft))
          }}
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
          onUpdateExtraAerodromes={(perfExtraAerodromes) => update({ perfExtraAerodromes })}
        />
      )}
      <div className="print-only">
        <DossierPrintSheet dossier={dossier} />
      </div>
    </div>
  )
}
