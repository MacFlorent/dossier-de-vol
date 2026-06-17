import { useState, useCallback, useRef } from 'react'
import { listAircraft, deleteAircraft, loadDossierFromFile, downloadFleet } from '../lib/storage'
import { TEMPLATES } from '../lib/templates'
import type { FlightDossier, Aircraft } from '../types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FleetImportModal } from '../features/fleet/FleetImportModal'

interface HomeScreenProps {
  onNewAircraft: () => void
  onEditAircraft: (id: string) => void
  onDuplicateAircraft: (ac: Aircraft) => void
  onNewDossier: (aircraftId: string) => void
  onOpenDossier: (dossier: FlightDossier) => void
}

export function HomeScreen({ onNewAircraft, onEditAircraft, onDuplicateAircraft, onNewDossier, onOpenDossier }: HomeScreenProps) {
  const [aircraft, setAircraft] = useState(() => listAircraft())
  const [error, setError] = useState<string | null>(null)
  const [importModal, setImportModal] = useState<Aircraft[] | null>(null)
  const fleetFileInputRef = useRef<HTMLInputElement>(null)

  const handleDelete = useCallback((id: string) => {
    if (confirm('Supprimer cet avion ?')) {
      deleteAircraft(id)
      setAircraft(listAircraft())
    }
  }, [])

  const handleOpenFile = useCallback(async (file: File) => {
    try {
      const dossier = await loadDossierFromFile(file)
      onOpenDossier(dossier)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier invalide')
    }
  }, [onOpenDossier])

  const handleFleetFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.version !== 1 || !Array.isArray(data.aircraft) || data.aircraft.length === 0) {
          setError('Fichier de flotte invalide (version manquante ou liste vide)')
          return
        }
        setImportModal(data.aircraft as Aircraft[])
      } catch {
        setError('Fichier invalide — JSON malformé')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.version === 1 && Array.isArray(data.aircraft)) {
          if (data.aircraft.length === 0) {
            setError('Fichier de flotte invalide (liste vide)')
            return
          }
          setImportModal(data.aircraft as Aircraft[])
        } else if (data.id && data.name) {
          onOpenDossier(data as FlightDossier)
        } else {
          setError('Format de fichier non reconnu')
        }
      } catch {
        setError('Fichier invalide — JSON malformé')
      }
    }
    reader.readAsText(file)
  }, [onOpenDossier])

  return (
    <div
      className="min-h-full p-6 max-w-4xl mx-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text-1)] mb-1">dossier de vol</h1>
        <p className="text-[var(--text-muted)] text-sm">Préparation de vol VFR</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-sm">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Fermer</button>
        </div>
      )}

      {/* Fleet section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Flotte ({aircraft.length})
          </h2>
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={downloadFleet} disabled={aircraft.length === 0}>
              ↓ Exporter
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fleetFileInputRef.current?.click()}>
              ↑ Importer
            </Button>
            <input
              ref={fleetFileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFleetFile(file)
                e.target.value = ''
              }}
            />
            <Button variant="secondary" size="sm" onClick={onNewAircraft}>
              + Nouvel avion
            </Button>
          </div>
        </div>

        {aircraft.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-[var(--text-muted)] mb-4">Aucun avion configuré</p>
            <p className="text-[var(--text-dim)] text-xs mb-4">
              Templates disponibles : {TEMPLATES.map(t => t.label).join(', ')}
            </p>
            <Button onClick={onNewAircraft}>Configurer un avion</Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {aircraft.map((ac) => (
              <Card key={ac.id} padding="md" className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-1)]">{ac.name}</div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {ac.registration} · {ac.characteristics.regimes[0].speed}kt · {ac.characteristics.regimes[0].fuelBurn}L/h · {ac.characteristics.fuelCapacity}L
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => onNewDossier(ac.id)}>
                    Nouveau dossier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEditAircraft(ac.id)}>
                    Modifier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDuplicateAircraft(ac)}>
                    Dupliquer
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(ac.id)}>
                    ✕
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Open dossier section */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
          Ouvrir un dossier
        </h2>
        <Card
          padding="lg"
          className="text-center border-dashed border-2 cursor-pointer hover:border-[var(--amber)] transition-colors"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.json'
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) handleOpenFile(file)
            }
            input.click()
          }}
        >
          <p className="text-[var(--text-muted)] mb-2">Glisser-déposer un fichier .json</p>
          <p className="text-[var(--text-dim)] text-xs">ou cliquer pour parcourir</p>
        </Card>
      </section>

      {importModal && (
        <FleetImportModal
          aircraft={importModal}
          onComplete={() => {
            setImportModal(null)
            setAircraft(listAircraft())
          }}
          onCancel={() => setImportModal(null)}
        />
      )}
    </div>
  )
}
