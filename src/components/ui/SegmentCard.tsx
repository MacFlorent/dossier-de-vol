import { useState } from 'react'
import type { FlightSegment } from '../../types'
import { computeSegmentTiming } from '../../lib/aviation/windTriangle'
import { formatDuration } from '../../lib/format'
import { Card } from './Card'
import { Badge } from './Badge'
import { Input } from './Input'

interface SegmentCardProps {
  segment: FlightSegment
  tas: number
  isLastEnroute: boolean
  onChange: (seg: FlightSegment) => void
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export function SegmentCard({
  segment, tas, isLastEnroute, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: SegmentCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isAlternate = segment.role === 'ALTERNATE'
  const { gs, wca, timeMin } = computeSegmentTiming(segment, tas)

  return (
    <Card padding="sm" className={isAlternate ? 'border-[var(--amber)]/50 bg-[var(--amber)]/5' : ''}>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Déplier segment' : 'Replier segment'}
          className="text-[var(--text-dim)] hover:text-[var(--text-1)] px-1">
          {collapsed ? '▸' : '▾'}
        </button>
        {isAlternate && <Badge variant="warning">ALT</Badge>}
        {collapsed ? (
          <span className="flex-1 text-sm text-[var(--text-1)] truncate">
            {segment.name || 'Segment'} · {segment.distanceNm} nm · {gs.toFixed(0)} kt · {formatDuration(timeMin)}
          </span>
        ) : (
          <input value={segment.name} onChange={e => onChange({ ...segment, name: e.target.value })}
            placeholder="Nom du segment"
            className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--border)] focus:border-[var(--amber)] focus:outline-none text-[var(--text-1)]" />
        )}
        {!isAlternate && (
          <div className="flex gap-1">
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↑</button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↓</button>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={isAlternate || isLastEnroute}
          aria-label="Supprimer segment"
          className="text-[var(--text-dim)] hover:text-[var(--red)] disabled:opacity-30 text-sm px-1">✕</button>
      </div>
      {!collapsed && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <Input label="Dist (nm)" type="number" value={segment.distanceNm ?? ''}
              onChange={e => onChange({ ...segment, distanceNm: Number(e.target.value) })} />
            <Input label="Cap°M" type="number" value={segment.headingMag ?? ''}
              onChange={e => onChange({ ...segment, headingMag: Number(e.target.value) })} />
            <Input label="Vent °M" type="number" value={segment.wind?.directionDeg ?? ''}
              onChange={e => onChange({ ...segment, wind: { ...segment.wind ?? { speedKt: 0 }, directionDeg: Number(e.target.value) } })} />
            <Input label="Force kt" type="number" value={segment.wind?.speedKt ?? ''}
              onChange={e => {
                const kt = Number(e.target.value)
                onChange({ ...segment, wind: kt === 0 ? null : { ...segment.wind ?? { directionDeg: 0 }, speedKt: kt } })
              }} />
          </div>
          <div className="flex gap-4 text-xs text-[var(--text-dim)]">
            <span>GS: <span className={`font-mono ${gs <= 0 ? 'text-[var(--red)]' : 'text-[var(--text-2)]'}`}>{gs.toFixed(0)} kt{gs <= 0 && ' ⚠'}</span></span>
            <span>WCA: <span className="font-mono text-[var(--text-2)]">{wca > 0 ? '+' : ''}{wca.toFixed(1)}°</span></span>
            <span>Durée: <span className="font-mono text-[var(--text-2)]">{formatDuration(timeMin)}</span></span>
          </div>
        </>
      )}
    </Card>
  )
}
