import { useMemo, useState } from 'react'
import { getAerodromeDb } from '../../lib/icao/aerodromeDb'

interface Props {
  excluded: string[]
  onAdd: (icao: string) => void
  onClose: () => void
}

export function AddPerfAerodromeModal({ excluded, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('')
  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db
      .filter(a => !excluded.includes(a.icao))
      .filter(a => a.icao.startsWith(q) || a.name.toUpperCase().includes(q))
      .slice(0, 8)
  }, [query, db, excluded])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un aérodrome</h3>
        <input
          autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="ICAO ou nom..."
          className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
        />
        {suggestions.map(a => (
          <button key={a.icao} onClick={() => onAdd(a.icao)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
            <span className="font-mono text-[var(--amber)]">{a.icao}</span>
            <span className="text-[var(--text-2)] truncate">{a.name}</span>
          </button>
        ))}
        {query.length >= 1 && suggestions.length === 0 && (
          <p className="text-xs text-[var(--text-dim)] px-1">Aucun résultat</p>
        )}
      </div>
    </div>
  )
}
