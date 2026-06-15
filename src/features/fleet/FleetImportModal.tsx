import { useState } from 'react'
import type { Aircraft } from '../../types'
import { importFleet, listAircraft } from '../../lib/storage'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

interface Props {
  aircraft: Aircraft[]
  onComplete: () => void
  onCancel: () => void
}

export function FleetImportModal({ aircraft, onComplete, onCancel }: Props) {
  const existingRegistrations = new Set(listAircraft().map(ac => ac.registration))

  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(aircraft.filter(ac => !existingRegistrations.has(ac.registration)).map(ac => ac.registration))
  )

  const toggle = (registration: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(registration)) {
        next.delete(registration)
      } else {
        next.add(registration)
      }
      return next
    })
  }

  const handleImport = () => {
    const toImport = aircraft.filter(ac => selected.has(ac.registration))
    importFleet(toImport)
    onComplete()
  }

  const selectedCount = selected.size

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title={`Import flotte — ${aircraft.length} avion${aircraft.length > 1 ? 's' : ''} trouvé${aircraft.length > 1 ? 's' : ''}`}
    >
      {/* Aircraft table */}
      <table className="w-full text-sm mb-3">
        <thead>
          <tr className="text-xs text-[var(--text-dim)] text-left border-b border-[var(--border)]">
            <th className="pb-2 w-8"></th>
            <th className="pb-2 pr-3">Nom</th>
            <th className="pb-2 pr-3">Immatriculation</th>
            <th className="pb-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {aircraft.map(ac => {
            const isExisting = existingRegistrations.has(ac.registration)
            const checked = selected.has(ac.registration)
            return (
              <tr
                key={ac.registration || ac.id}
                className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-row-hover,var(--bg-card))]"
                onClick={() => toggle(ac.registration)}
              >
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(ac.registration)}
                    onClick={e => e.stopPropagation()}
                    className="accent-[var(--amber)]"
                  />
                </td>
                <td className="py-2 pr-3 text-[var(--text-1)]">{ac.name}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-muted)] text-xs">{ac.registration || '—'}</td>
                <td className="py-2">
                  {isExisting
                    ? <Badge variant="warning">Existant ⚠</Badge>
                    : <Badge variant="success">Nouveau</Badge>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Warning */}
      <p className="text-xs text-[var(--text-dim)] mb-4">
        Les avions « Existant » cochés seront écrasés.
      </p>

      {/* Footer */}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button
          variant="primary"
          onClick={handleImport}
          disabled={selectedCount === 0}
        >
          Importer {selectedCount > 0 ? `${selectedCount} avion${selectedCount > 1 ? 's' : ''}` : ''}
        </Button>
      </div>
    </Modal>
  )
}
