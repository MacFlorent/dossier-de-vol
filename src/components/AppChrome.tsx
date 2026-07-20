import { useState } from 'react'
import type { FlightDossier, DossierTab, Screen } from '../types'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'
import { ChangeAircraftModal } from './ui/ChangeAircraftModal'

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
  onUpdateDate?: (date: string) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

export function AppChrome({ screen, dossier, dossierTab, onGoHome, onSetTab, onDownload, onUpdateName, onUpdateDate, onChangeAircraft }: AppChromeProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState('')
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

  const handleDateClick = () => {
    if (!dossier || !onUpdateDate) return
    setDateValue(dossier.date)
    setEditingDate(true)
  }

  const handleDateConfirm = () => {
    if (dateValue) onUpdateDate?.(dateValue)
    setEditingDate(false)
  }

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleDateConfirm()
    if (e.key === 'Escape') setEditingDate(false)
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
            {editingDate ? (
              <input
                autoFocus
                type="date"
                value={dateValue}
                onChange={e => setDateValue(e.target.value)}
                onBlur={handleDateConfirm}
                onKeyDown={handleDateKeyDown}
                className="text-xs bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none shrink-0"
              />
            ) : (
              <span
                className={`text-[var(--text-dim)] text-xs shrink-0 ${onUpdateDate ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
                onClick={handleDateClick}
                title={onUpdateDate ? 'Cliquer pour modifier' : undefined}
              >
                {dossier.date}
              </span>
            )}
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
