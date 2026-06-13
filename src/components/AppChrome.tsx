import type { FlightDossier, DossierTab, Screen } from '../types'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'

const DOSSIER_TABS: { key: DossierTab; label: string }[] = [
  { key: 'route', label: 'Route' },
  { key: 'weather', label: 'Météo' },
  { key: 'navlog', label: 'Navlog' },
  { key: 'fuel', label: 'Carbu' },
  { key: 'wb', label: 'M&C' },
  { key: 'perf', label: 'Perf' },
  { key: 'dossier', label: 'Dossier' },
]

interface AppChromeProps {
  screen: Screen
  dossier: FlightDossier | null
  dossierTab: DossierTab
  onGoHome: () => void
  onSetTab: (tab: DossierTab) => void
  onDownload?: () => void
}

export function AppChrome({ screen, dossier, dossierTab, onGoHome, onSetTab, onDownload }: AppChromeProps) {
  return (
    <header
      className="sticky top-0 z-50 flex flex-col no-print"
      style={{ backgroundColor: 'var(--bg-chrome)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={onGoHome}
          className="text-[var(--amber)] font-semibold text-sm tracking-wide hover:opacity-80 transition-opacity"
        >
          dossier de vol
        </button>

        {dossier && (
          <>
            <span className="text-[var(--text-dim)] text-sm">·</span>
            <span className="text-[var(--text-2)] text-sm truncate flex-1">{dossier.name}</span>
            <span className="text-[var(--text-dim)] text-xs">{dossier.date}</span>
          </>
        )}

        {!dossier && (
          <span className="text-[var(--text-dim)] text-xs">préparation de vol VFR</span>
        )}

        <div className="ml-auto flex gap-2">
          {onDownload && (
            <Button variant="secondary" size="sm" onClick={onDownload}>
              ↓ JSON
            </Button>
          )}
          {screen !== 'home' && (
            <Button variant="ghost" size="sm" onClick={onGoHome}>
              ← Accueil
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar (only when dossier is open) */}
      {screen === 'dossier' && dossier && (
        <TabBar
          tabs={DOSSIER_TABS}
          active={dossierTab}
          onChange={(key) => onSetTab(key as DossierTab)}
          className="px-4"
        />
      )}
    </header>
  )
}
