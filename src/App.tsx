import { useReducer } from 'react'
import type { Aircraft, FlightDossier, DossierTab, Screen } from './types'
import { duplicateAircraft, getAircraft } from './lib/storage'
import { applyAircraftChange } from './lib/dossierTransforms'
import { DEFAULT_FUEL_INPUTS } from './lib/aviation/fuelCalc'
import { HomeScreen } from './screens/HomeScreen'
import { AircraftEditorScreen } from './screens/AircraftEditorScreen'
import { DossierScreen } from './screens/DossierScreen'
import { AppChrome } from './components/AppChrome'
import { AerodromeScreen } from './features/aerodromes/AerodromeScreen'

interface AppState {
  screen: Screen
  editingAircraftId: string | null
  prefillAircraft: Aircraft | null
  dossier: FlightDossier | null
  dossierTab: DossierTab
}

type AppAction =
  | { type: 'GO_HOME' }
  | { type: 'NEW_AIRCRAFT' }
  | { type: 'EDIT_AIRCRAFT'; id: string }
  | { type: 'PREFILL_AIRCRAFT'; aircraft: Aircraft }
  | { type: 'OPEN_DOSSIER'; dossier: FlightDossier }
  | { type: 'SET_TAB'; tab: DossierTab }
  | { type: 'UPDATE_DOSSIER'; dossier: FlightDossier }
  | { type: 'CLOSE_DOSSIER' }
  | { type: 'OPEN_AERODROME_DB' }

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'GO_HOME':
      return { ...state, screen: 'home', dossier: null, editingAircraftId: null, prefillAircraft: null }
    case 'NEW_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: null, prefillAircraft: null }
    case 'EDIT_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: action.id, prefillAircraft: null }
    case 'PREFILL_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: null, prefillAircraft: action.aircraft }
    case 'OPEN_DOSSIER':
    case 'UPDATE_DOSSIER':
      return { ...state, screen: 'dossier', dossier: action.dossier }
    case 'SET_TAB':
      return { ...state, dossierTab: action.tab }
    case 'CLOSE_DOSSIER':
      return { ...state, screen: 'home', dossier: null }
    case 'OPEN_AERODROME_DB':
      return { ...state, screen: 'aerodrome-db' }
    default:
      return state
  }
}

const initialState: AppState = {
  screen: 'home',
  editingAircraftId: null,
  prefillAircraft: null,
  dossier: null,
  dossierTab: 'branches',
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-app)' }}>
      <AppChrome
        screen={state.screen}
        dossier={state.dossier}
        dossierTab={state.dossierTab}
        onGoHome={() => dispatch({ type: 'GO_HOME' })}
        onSetTab={(tab) => dispatch({ type: 'SET_TAB', tab })}
        onDownload={state.dossier ? () => {
          import('./lib/storage').then(({ downloadDossier }) => downloadDossier(state.dossier!))
        } : undefined}
        onUpdateName={state.dossier ? (name) => {
          dispatch({ type: 'UPDATE_DOSSIER', dossier: { ...state.dossier!, name, updatedAt: new Date().toISOString() } })
        } : undefined}
        onChangeAircraft={state.dossier ? (newAircraftId) => {
          const newAircraft = getAircraft(newAircraftId)
          if (!newAircraft || !state.dossier) return
          dispatch({ type: 'UPDATE_DOSSIER', dossier: applyAircraftChange(state.dossier, newAircraft) })
        } : undefined}
      />
      <main className="flex-1 overflow-auto">
        {state.screen === 'home' && (
          <HomeScreen
            onNewAircraft={() => dispatch({ type: 'NEW_AIRCRAFT' })}
            onEditAircraft={(id) => dispatch({ type: 'EDIT_AIRCRAFT', id })}
            onDuplicateAircraft={(ac) => dispatch({ type: 'PREFILL_AIRCRAFT', aircraft: duplicateAircraft(ac) })}
            onNewDossier={(aircraftId) => {
              import('./lib/storage').then(({ getAircraft }) => {
                const aircraft = getAircraft(aircraftId)
                if (!aircraft) return
                const now = new Date()
                const branchId = crypto.randomUUID()
                const dossier: FlightDossier = {
                  id: crypto.randomUUID(),
                  name: `${aircraft.name} ${now.toISOString().slice(0, 10)}`,
                  date: now.toISOString().slice(0, 10),
                  departureTime: '',
                  aircraft: { ...aircraft, snapshotAt: now.toISOString() },
                  branches: [{
                    id: branchId,
                    label: 'Aller',
                    aerodromes: [],
                    segments: [{ id: crypto.randomUUID(), role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null }],
                    notes: '',
                  }],
                  fuelInputs: {
                    [branchId]: { ...DEFAULT_FUEL_INPUTS },
                  },
                  loading: Object.fromEntries(aircraft.massBalance.stations.map(s => [s.name, 0])),
                  perfRegulatory: 1.0,
                  perfInputs: {},
                  perfExtraAerodromes: [],
                  notes: '',
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                }
                dispatch({ type: 'OPEN_DOSSIER', dossier })
              })
            }}
            onOpenDossier={(dossier) => dispatch({ type: 'OPEN_DOSSIER', dossier })}
            onOpenAerodromeDb={() => dispatch({ type: 'OPEN_AERODROME_DB' })}
          />
        )}
        {state.screen === 'aircraft-editor' && (
          <AircraftEditorScreen
            editingAircraftId={state.editingAircraftId}
            prefillAircraft={state.prefillAircraft ?? undefined}
            onSave={() => dispatch({ type: 'GO_HOME' })}
            onCancel={() => dispatch({ type: 'GO_HOME' })}
          />
        )}
        {state.screen === 'dossier' && state.dossier && (
          <DossierScreen
            dossier={state.dossier}
            activeTab={state.dossierTab}
            onUpdate={(dossier) => dispatch({ type: 'UPDATE_DOSSIER', dossier })}
          />
        )}
        {state.screen === 'aerodrome-db' && (
          <AerodromeScreen />
        )}
      </main>
    </div>
  )
}
