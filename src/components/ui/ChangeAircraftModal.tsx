import { useState, useMemo } from 'react'
import type { Aircraft } from '../../types'
import { listAircraft } from '../../lib/storage'
import { Button } from './Button'

interface ChangeAircraftModalProps {
  currentAircraftId: string
  onConfirm: (id: string) => void
  onClose: () => void
}

export function ChangeAircraftModal({ currentAircraftId, onConfirm, onClose }: ChangeAircraftModalProps) {
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
