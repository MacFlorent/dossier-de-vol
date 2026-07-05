import { useState } from 'react'

interface FlightTabStripProps {
  branches: { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
  onRename?: (id: string, label: string) => void
  onAdd?: () => void
  className?: string
}

export function FlightTabStrip({ branches, activeId, onSelect, onRename, onAdd, className = '' }: FlightTabStripProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className={`flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] overflow-x-auto ${className}`}>
      {branches.map(b => (
        <div
          key={b.id}
          role="button"
          tabIndex={0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-t text-sm cursor-pointer select-none transition-colors ${
            b.id === activeId
              ? 'bg-[var(--bg-card)] text-[var(--text-1)] border border-b-0 border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-1)]'
          }`}
          onClick={() => onSelect(b.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(b.id)
            }
          }}
        >
          {onRename && editingId === b.id ? (
            <input
              autoFocus
              defaultValue={b.label}
              className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
              onBlur={e => { onRename(b.id, e.target.value || b.label); setEditingId(null) }}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span onDoubleClick={onRename ? () => setEditingId(b.id) : undefined}>{b.label}</span>
          )}
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="px-2 py-1 text-sm text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors"
        >
          +
        </button>
      )}
    </div>
  )
}
