import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import type { AircraftSnapshot, FlightBranch, FlightAerodrome, FlightSegment } from '../../types'
import { getAerodromeDb, getAerodrome } from '../../lib/icao/aerodromeDb'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
import { SegmentCard } from '../../components/ui/SegmentCard'
import { SegmentsSection } from '../../components/ui/SegmentsSection'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const makeIcon = (color: string, size: number) => new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">` +
    `<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24S24 21 24 12C24 5.4 18.6 0 12 0z" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5" fill="white"/></svg>`
  ),
  iconSize: [size, size * 1.5], iconAnchor: [size / 2, size * 1.5], popupAnchor: [0, -size * 1.5],
})

type AeroRole = FlightAerodrome['role']

const ROLE_ICONS: Record<AeroRole, L.Icon> = {
  DEP: makeIcon('#4d8df0', 24), ARR: makeIcon('#46c98a', 24),
  ALTERNATE: makeIcon('#f0a93b', 20), OVERFLY: makeIcon('#888888', 16),
}
const ROLE_LABELS: Record<AeroRole, string> = { DEP: 'DEP', ARR: 'ARR', ALTERNATE: 'ALT', OVERFLY: 'OVFL' }
const ROLE_COLORS: Record<AeroRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', ALTERNATE: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}
const ROLE_CYCLE: AeroRole[] = ['DEP', 'ARR', 'ALTERNATE', 'OVERFLY']

function syncAlternateSegment(branch: FlightBranch): FlightBranch {
  const hasAlternate = branch.aerodromes.some(a => a.role === 'ALTERNATE')
  const hasAltSeg = branch.segments.some(s => s.role === 'ALTERNATE')
  if (hasAlternate && !hasAltSeg) {
    const altSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ALTERNATE',
      name: 'Déroutement', distanceNm: 0, headingMag: 0, wind: null, notes: '',
    }
    return { ...branch, segments: [...branch.segments, altSeg] }
  }
  if (!hasAlternate && hasAltSeg) {
    return { ...branch, segments: branch.segments.filter(s => s.role !== 'ALTERNATE') }
  }
  return branch
}

interface AddAerodromeModalProps {
  onAdd: (a: Omit<FlightAerodrome, 'id'>) => void
  onClose: () => void
}

function AddAerodromeModal({ onAdd, onClose }: AddAerodromeModalProps) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AeroRole>('OVERFLY')
  const [freeMode, setFreeMode] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db.filter(a => a.icao.startsWith(q) || a.name.toUpperCase().includes(q)).slice(0, 8)
  }, [query, db])

  const submit = (icao?: string) => {
    const id_val = icao ?? identifier.toUpperCase()
    if (!id_val) return
    onAdd({ identifier: id_val, role })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un aérodrome</h3>
        <div className="flex gap-1 mb-3">
          {ROLE_CYCLE.map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                role === r ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                           : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        {!freeMode ? (
          <>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ICAO ou nom..."
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2" />
            {suggestions.map(a => (
              <button key={a.icao} onClick={() => submit(a.icao)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
                <span className="font-mono text-[var(--amber)]">{a.icao}</span>
                <span className="text-[var(--text-2)] truncate">{a.name}</span>
              </button>
            ))}
            <button onClick={() => setFreeMode(true)} className="mt-2 text-xs text-[var(--text-dim)] underline">
              Identifiant libre
            </button>
          </>
        ) : (
          <>
            <input autoFocus value={identifier} onChange={e => setIdentifier(e.target.value.toUpperCase())}
              placeholder="Identifiant (ex: LFXX)"
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => submit()}>Ajouter</Button>
              <Button variant="ghost" size="sm" onClick={() => setFreeMode(false)}>Retour</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface BranchViewProps {
  branch: FlightBranch
  isOnly: boolean
  speedKt: number
  onChange: (branch: FlightBranch) => void
  onDelete: () => void
}

function BranchView({ branch, isOnly, speedKt, onChange, onDelete }: BranchViewProps) {
  const [showAddAero, setShowAddAero] = useState(false)

  const resolved = useMemo(() =>
    branch.aerodromes.map(a => ({ a, aero: getAerodrome(a.identifier) }))
  , [branch.aerodromes])

  const positions: [number, number][] = resolved.filter(r => r.aero).map(r => [r.aero!.lat, r.aero!.lng])
  const routePositions: [number, number][] = resolved
    .filter(r => r.aero && (r.a.role === 'DEP' || r.a.role === 'ARR'))
    .map(r => [r.aero!.lat, r.aero!.lng])
  const center: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [46.5, 2.5]

  const totalDistNm = branch.segments.filter(s => s.role === 'ENROUTE').reduce((s, seg) => s + seg.distanceNm, 0)

  const alternateSegment = branch.segments.find(s => s.role === 'ALTERNATE')

  const addAerodrome = (a: Omit<FlightAerodrome, 'id'>) => {
    const updated = { ...branch, aerodromes: [...branch.aerodromes, { ...a, id: crypto.randomUUID() }] }
    onChange(syncAlternateSegment(updated))
  }

  const removeAerodrome = (id: string) => {
    const updated = { ...branch, aerodromes: branch.aerodromes.filter(a => a.id !== id) }
    onChange(syncAlternateSegment(updated))
  }

  const cycleAerodromeRole = (id: string) => {
    const updated = {
      ...branch,
      aerodromes: branch.aerodromes.map(a =>
        a.id === id ? { ...a, role: ROLE_CYCLE[(ROLE_CYCLE.indexOf(a.role) + 1) % ROLE_CYCLE.length] } : a
      ),
    }
    onChange(syncAlternateSegment(updated))
  }

  const updateSegment = (seg: FlightSegment) =>
    onChange({ ...branch, segments: branch.segments.map(s => s.id === seg.id ? seg : s) })

  return (
    <div className="flex flex-col h-full">
      <div className="h-48 flex-shrink-0">
        <MapContainer center={center} zoom={7} className="h-full w-full" style={{ backgroundColor: '#0e1217' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd" maxZoom={19} />
          {routePositions.length >= 2 && <Polyline positions={routePositions} color="#f0a93b" weight={2} opacity={0.7} />}
          {resolved.filter(r => r.aero).map(({ a, aero }) => (
            <Marker key={a.id} position={[aero!.lat, aero!.lng]} icon={ROLE_ICONS[a.role]}>
              <Popup>{ROLE_LABELS[a.role]} — {a.identifier} — {aero!.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Distance totale</span>
        <span className="font-mono text-sm text-[var(--text-1)]">{totalDistNm}</span>
        <span className="text-xs text-[var(--text-dim)]">nm</span>
        {!isOnly && (
          <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>Supprimer vol</Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Aérodromes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Aérodromes</p>
            <Button variant="ghost" size="sm" onClick={() => setShowAddAero(true)}>+ Aérodrome</Button>
          </div>
          {branch.aerodromes.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm text-center py-2">Aucun aérodrome</p>
          )}
          {resolved.map(({ a, aero }) => (
            <Card key={a.id} padding="sm" className="mb-2">
              <div className="flex gap-3 items-center">
                <Badge variant="neutral"
                  style={{ backgroundColor: ROLE_COLORS[a.role], color: 'white', minWidth: '3rem', textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => cycleAerodromeRole(a.id)}>
                  {ROLE_LABELS[a.role]}
                </Badge>
                <span className="font-mono text-[var(--amber)] text-sm">{a.identifier}</span>
                <span className="flex-1 text-sm text-[var(--text-2)] truncate">
                  {aero ? aero.name : <span className="text-[var(--text-dim)]">custom</span>}
                </span>
                <button onClick={() => removeAerodrome(a.id)} aria-label="Supprimer aérodrome"
                  className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1">✕</button>
              </div>
            </Card>
          ))}
        </div>

        {/* Segments */}
        <div>
          <SegmentsSection branch={branch} tas={speedKt} onChange={onChange} />
          {alternateSegment && (
            <div className="mb-2">
              <SegmentCard
                segment={alternateSegment} tas={speedKt}
                isLastEnroute={false}
                onChange={updateSegment}
                canMoveUp={false} canMoveDown={false}
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-[var(--text-dim)] uppercase tracking-wider block mb-1">Notes</label>
          <textarea value={branch.notes} onChange={e => onChange({ ...branch, notes: e.target.value })}
            rows={3} placeholder="Commentaires libres sur ce tronçon..."
            className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none resize-none" />
        </div>
      </div>

      {showAddAero && <AddAerodromeModal onAdd={addAerodrome} onClose={() => setShowAddAero(false)} />}
    </div>
  )
}

interface Props {
  branches: FlightBranch[]
  aircraft: AircraftSnapshot
  onUpdate: (branches: FlightBranch[]) => void
}

export function BranchesPanel({ branches, aircraft, onUpdate }: Props) {
  const speedKt = aircraft.characteristics.regimes[0].speed
  const [activeId, setActiveId] = useState(() => branches[0]?.id ?? '')
  const activeBranch = branches.find(b => b.id === activeId) ?? branches[0]

  const addBranch = () => {
    const newBranch: FlightBranch = {
      id: crypto.randomUUID(),
      label: `Vol ${branches.length + 1}`,
      aerodromes: [],
      segments: [{ id: crypto.randomUUID(), role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }],
      notes: '',
    }
    const updated = [...branches, newBranch]
    onUpdate(updated)
    setActiveId(newBranch.id)
  }

  const deleteBranch = (id: string) => {
    const updated = branches.filter(b => b.id !== id)
    onUpdate(updated)
    setActiveId(updated[0]?.id ?? '')
  }

  const updateBranch = (branch: FlightBranch) =>
    onUpdate(branches.map(b => b.id === branch.id ? branch : b))

  return (
    <div className="flex flex-col h-full">
      <FlightTabStrip
        branches={branches}
        activeId={activeId}
        onSelect={setActiveId}
        onRename={(id, label) => {
          const b = branches.find(x => x.id === id)
          if (b) updateBranch({ ...b, label })
        }}
        onAdd={addBranch}
      />
      {activeBranch && (
        <BranchView branch={activeBranch} isOnly={branches.length === 1}
          speedKt={speedKt} onChange={updateBranch} onDelete={() => deleteBranch(activeBranch.id)} />
      )}
    </div>
  )
}
