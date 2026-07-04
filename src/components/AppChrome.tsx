import { useState, useMemo } from 'react'
import type { Aircraft, FlightDossier, DossierTab, Screen } from '../types'
import { listAircraft } from '../lib/storage'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'

const DOSSIER_TABS: { key: DossierTab; label: string }[] = [
  { key: 'branches', label: 'Vols' },
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
  onUpdateName?: (name: string) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

function ChangeAircraftModal({ currentAircraftId, onConfirm, onClose }: {
  currentAircraftId: string
  onConfirm: (id: string) => void
  onClose: () => void
}) {
  const [pending, setPending] = useState<Aircraft | null>(null)
  const fleet = useMemo(() => listAircraft().filter(a => a.id !== currentAircraftId), [currentAircraftId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {pending ? (
          <>
            <p className="text-sm text-[var(--text-1)] mb-4">
              Changer l'avion pour <strong>{pending.name}</strong> ? Les données carburant (GS de base), masse &amp; centrage et performances seront réinitialisées.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Annuler</Button>
              <Button variant="danger" size="sm" onClick={() => { onConfirm(pending.id); onClose() }}>Confirmer</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Changer d'avion</h3>
            {fleet.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Aucun autre avion dans la flotte.</p>
            ) : (
              <div className="space-y-1">
                {fleet.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setPending(a)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[var(--bg-inset)] transition-colors"
                  >
                    <div className="text-sm font-medium text-[var(--text-1)]">{a.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{a.registration}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function AppChrome({ screen, dossier, dossierTab, onGoHome, onSetTab, onDownload, onUpdateName, onChangeAircraft }: AppChromeProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [showChangeModal, setShowChangeModal] = useState(false)

  const handleNameClick = () => {
    if (!dossier || !onUpdateName) return
    setNameValue(dossier.name)
    setEditingName(true)
  }

  const handleNameConfirm = () => {
    if (nameValue.trim()) onUpdateName?.(nameValue.trim())
    setEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleNameConfirm()
    if (e.key === 'Escape') setEditingName(false)
  }

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
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={handleNameConfirm}
                onKeyDown={handleNameKeyDown}
                className="text-sm bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none flex-1 min-w-0"
              />
            ) : (
              <span
                className={`text-[var(--text-2)] text-sm truncate flex-1 min-w-0 ${onUpdateName ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
                onClick={handleNameClick}
                title={onUpdateName ? 'Cliquer pour renommer' : undefined}
              >
                {dossier.name}
              </span>
            )}
            <span className="text-[var(--text-dim)] text-xs shrink-0">{dossier.aircraft.name}</span>
            {onChangeAircraft && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowChangeModal(true)}>
                Changer
              </Button>
            )}
            <span className="text-[var(--text-dim)] text-xs shrink-0">{dossier.date}</span>
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
      {showChangeModal && dossier && onChangeAircraft && (
        <ChangeAircraftModal
          currentAircraftId={dossier.aircraft.id}
          onConfirm={onChangeAircraft}
          onClose={() => setShowChangeModal(false)}
        />
      )}
    </header>
  )
}
