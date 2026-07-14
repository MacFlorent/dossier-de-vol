import { useState } from 'react'
import type { StoredAerodrome } from '../../types'
import { getAerodrome, upsertAerodrome } from '../../lib/icao/aerodromeDb'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { AerodromeEditForm } from '../aerodromes/AerodromeEditForm'

interface Props {
  icao: string
  onClose: () => void
}

export function AerodromeQuickEditModal({ icao, onClose }: Props) {
  const [draft, setDraft] = useState<StoredAerodrome>(
    () => getAerodrome(icao) ?? { icao, name: '', lat: 0, lng: 0, elevationFt: 0, runways: [], updatedAt: '' }
  )

  const save = () => {
    upsertAerodrome({ ...draft, updatedAt: new Date().toISOString() })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Aérodrome ${icao}`}>
      <AerodromeEditForm draft={draft} onChange={setDraft} />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save}>Enregistrer</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
      </div>
    </Modal>
  )
}
