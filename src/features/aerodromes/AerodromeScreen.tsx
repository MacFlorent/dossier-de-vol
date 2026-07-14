import { useState, useRef, useCallback } from 'react'
import type { StoredAerodrome } from '../../types'
import {
  getAerodromeDb, upsertAerodrome, deleteAerodromeFromDb,
  exportAerodromeDb, importAerodromeDb,
} from '../../lib/icao/aerodromeDb'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { AerodromeEditForm } from './AerodromeEditForm'

function AerodromeCard({
  aerodrome,
  onSave,
  onDelete,
}: {
  aerodrome: StoredAerodrome
  onSave: (a: StoredAerodrome) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(aerodrome)

  const save = () => { onSave(draft); setEditing(false) }
  const cancel = () => { setDraft(aerodrome); setEditing(false) }

  return (
    <Card padding="md">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-[var(--amber)] font-semibold">{aerodrome.icao}</span>
        <span className="text-[var(--text-1)] flex-1">{aerodrome.name}</span>
        <Badge variant="neutral">{aerodrome.elevationFt} ft</Badge>
        <Badge variant="neutral">{aerodrome.runways.length} piste{aerodrome.runways.length !== 1 ? 's' : ''}</Badge>
        <Button variant="ghost" size="sm" onClick={() => setEditing(e => !e)}>
          {editing ? 'Fermer' : 'Modifier'}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>✕</Button>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <AerodromeEditForm draft={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Enregistrer</Button>
            <Button variant="ghost" size="sm" onClick={cancel}>Annuler</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function AerodromeScreen() {
  const [db, setDb] = useState(() => getAerodromeDb())
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = () => setDb(getAerodromeDb())

  const handleSave = useCallback((a: StoredAerodrome) => {
    upsertAerodrome({ ...a, updatedAt: new Date().toISOString() })
    refresh()
  }, [])

  const handleDelete = useCallback((icao: string) => {
    if (confirm(`Supprimer ${icao} de la base ?`)) {
      deleteAerodromeFromDb(icao)
      refresh()
    }
  }, [])

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.version !== 1 || !Array.isArray(data.aerodromes)) {
          setError('Format invalide (version manquante ou liste vide)')
          return
        }
        const { added, updated } = importAerodromeDb(data.aerodromes)
        refresh()
        setError(null)
        alert(`Import OK — ${added} ajouté(s), ${updated} mis à jour`)
      } catch {
        setError('JSON invalide')
      }
    }
    reader.readAsText(file)
  }, [])

  const filtered = db.filter(a =>
    a.icao.includes(search.toUpperCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-[var(--text-1)] mb-6">Base aérodromes</h1>

      {error && (
        <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-sm">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Fermer</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher ICAO ou nom..."
          className="flex-1 min-w-48 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
        />
        <Button variant="ghost" size="sm" onClick={exportAerodromeDb}>↓ Exporter</Button>
        <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>↑ Importer</Button>
        <input ref={importRef} type="file" accept=".json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }} />
      </div>

      {/* List */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--text-dim)]">{filtered.length} aérodrome{filtered.length !== 1 ? 's' : ''}</p>
        {filtered.map(a => (
          <AerodromeCard
            key={a.icao}
            aerodrome={a}
            onSave={handleSave}
            onDelete={() => handleDelete(a.icao)}
          />
        ))}
      </div>
    </div>
  )
}
