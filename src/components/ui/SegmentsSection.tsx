import type { FlightBranch, FlightSegment } from '../../types'
import { SegmentCard } from './SegmentCard'
import { Button } from './Button'

interface SegmentsSectionProps {
  branch: FlightBranch
  tas: number
  onChange: (branch: FlightBranch) => void
}

export function SegmentsSection({ branch, tas, onChange }: SegmentsSectionProps) {
  const enrouteSegments = branch.segments.filter(s => s.role === 'ENROUTE')

  const addSegment = () => {
    const newSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ENROUTE', name: '',
      distanceNm: 0, headingMag: 0, wind: null,
    }
    const altIdx = branch.segments.findIndex(s => s.role === 'ALTERNATE')
    const segs = [...branch.segments]
    altIdx >= 0 ? segs.splice(altIdx, 0, newSeg) : segs.push(newSeg)
    onChange({ ...branch, segments: segs })
  }

  const removeSegment = (id: string) => {
    const seg = branch.segments.find(s => s.id === id)
    if (!seg || seg.role === 'ALTERNATE') return
    if (enrouteSegments.length <= 1) return
    onChange({ ...branch, segments: branch.segments.filter(s => s.id !== id) })
  }

  const moveSegment = (id: string, dir: -1 | 1) => {
    const idx = enrouteSegments.findIndex(s => s.id === id)
    if (idx < 0) return
    const swap = idx + dir
    if (swap < 0 || swap >= enrouteSegments.length) return
    const segs = [...branch.segments]
    const ai = segs.findIndex(s => s.id === enrouteSegments[idx].id)
    const bi = segs.findIndex(s => s.id === enrouteSegments[swap].id)
    ;[segs[ai], segs[bi]] = [segs[bi], segs[ai]]
    onChange({ ...branch, segments: segs })
  }

  const updateSegment = (seg: FlightSegment) =>
    onChange({ ...branch, segments: branch.segments.map(s => s.id === seg.id ? seg : s) })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Segments</p>
        <Button variant="ghost" size="sm" onClick={addSegment}>+ Segment</Button>
      </div>
      {enrouteSegments.map((seg, idx) => (
        <div key={seg.id} className="mb-2">
          <SegmentCard
            segment={seg} tas={tas}
            isLastEnroute={enrouteSegments.length === 1}
            onRemove={() => removeSegment(seg.id)}
            onChange={updateSegment}
            onMoveUp={() => moveSegment(seg.id, -1)}
            onMoveDown={() => moveSegment(seg.id, 1)}
            canMoveUp={idx > 0}
            canMoveDown={idx < enrouteSegments.length - 1}
          />
        </div>
      ))}
    </div>
  )
}
