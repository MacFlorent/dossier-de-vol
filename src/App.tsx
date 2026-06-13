import { useReducer } from 'react'
import type { FlightDossier, DossierTab, Screen } from './types'
import { HomeScreen } from './screens/HomeScreen'
import { AircraftEditorScreen } from './screens/AircraftEditorScreen'
import { DossierScreen } from './screens/DossierScreen'
import { AppChrome } from './components/AppChrome'

interface AppState {
  screen: Screen
  editingAircraftId: string | null
  dossier: FlightDossier | null
  dossierTab: DossierTab
}

type AppAction =
  | { type: 'GO_HOME' }
  | { type: 'NEW_AIRCRAFT' }
  | { type: 'EDIT_AIRCRAFT'; id: string }
  | { type: 'OPEN_DOSSIER'; dossier: FlightDossier }
  | { type: 'SET_TAB'; tab: DossierTab }
  | { type: 'UPDATE_DOSSIER'; dossier: FlightDossier }
  | { type: 'CLOSE_DOSSIER' }

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'GO_HOME':
      return { ...state, screen: 'home', dossier: null, editingAircraftId: null }
    case 'NEW_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: null }
    case 'EDIT_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: action.id }
    case 'OPEN_DOSSIER':
    case 'UPDATE_DOSSIER':
      return { ...state, screen: 'dossier', dossier: action.dossier }
    case 'SET_TAB':
      return { ...state, dossierTab: action.tab }
    case 'CLOSE_DOSSIER':
      return { ...state, screen: 'home', dossier: null }
    default:
      return state
  }
}

const initialState: AppState = {
  screen: 'home',
  editingAircraftId: null,
  dossier: null,
  dossierTab: 'route',
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
      />
      <main className="flex-1 overflow-auto">
        {state.screen === 'home' && (
          <HomeScreen
            onNewAircraft={() => dispatch({ type: 'NEW_AIRCRAFT' })}
            onEditAircraft={(id) => dispatch({ type: 'EDIT_AIRCRAFT', id })}
            onNewDossier={(aircraftId) => {
              import('./lib/storage').then(({ getAircraft }) => {
                const aircraft = getAircraft(aircraftId)
                if (!aircraft) return
                const now = new Date()
                const dossier: FlightDossier = {
                  id: crypto.randomUUID(),
                  name: `${aircraft.name} ${now.toISOString().slice(0, 10)}`,
                  date: now.toISOString().slice(0, 10),
                  departureTime: '',
                  aircraft: { ...aircraft, snapshotAt: now.toISOString() },
                  route: null,
                  weatherInputs: { fields: {}, winds: [], notes: '' },
                  navOverrides: {},
                  navNotes: {},
                  fuelInputs: {
                    gsBase: aircraft.tas,
                    windAdjust: 0,
                    roulage: 10,
                    marge: 10,
                    extras: [],
                    reserveMin: 30,
                    derouteMin: 30,
                    plein: false,
                  },
                  loading: Object.fromEntries(aircraft.stations.map(s => [s.name, 0])),
                  perfInputs: {},
                  notes: '',
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                }
                dispatch({ type: 'OPEN_DOSSIER', dossier })
              })
            }}
            onOpenDossier={(dossier) => dispatch({ type: 'OPEN_DOSSIER', dossier })}
          />
        )}
        {state.screen === 'aircraft-editor' && (
          <AircraftEditorScreen
            editingAircraftId={state.editingAircraftId}
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
      </main>
    </div>
  )
}
