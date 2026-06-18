import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import type { FlightBranch, FlightPoint, FlightPointRole } from '../../types'
import type { AircraftSnapshot } from '../../types'
import { getAerodromeDb, getAerodrome } from '../../lib/icao/aerodromeDb'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

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

const ROLE_ICONS: Record<FlightPointRole, L.Icon> = {
  DEP: makeIcon('#4d8df0', 24),
  ARR: makeIcon('#46c98a', 24),
  DIVERT: makeIcon('#f0a93b', 20),
  OVERFLY: makeIcon('#888888', 16),
}

const ROLE_LABELS: Record<FlightPointRole, string> = {
  DEP: 'DEP', ARR: 'ARR', DIVERT: 'DVRT', OVERFLY: 'OVFL',
}

const ROLE_COLORS: Record<FlightPointRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', DIVERT: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}

function formatDuration(distanceNm: number, speedKt: number): string {
  if (distanceNm <= 0) return '--'
  const totalMin = Math.round((distanceNm / speedKt) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

const ROLE_CYCLE: FlightPointRole[] = ['DEP', 'ARR', 'DIVERT', 'OVERFLY']
function cycleRole(role: FlightPointRole): FlightPointRole {
  return ROLE_CYCLE[(ROLE_CYCLE.indexOf(role) + 1) % ROLE_CYCLE.length]
}

interface AddPointModalProps {
  onAdd: (point: Omit<FlightPoint, 'id'>) => void
  onClose: () => void
}

function AddPointModal({ onAdd, onClose }: AddPointModalProps) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<FlightPointRole>('OVERFLY')
  const [unresolved, setUnresolved] = useState(false)
  const [identifier, setIdentifier] = useState('')

  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db.filter(a =>
      a.icao.startsWith(q) || a.name.toUpperCase().includes(q)
    ).slice(0, 8)
  }, [query, db])

  const submit = (icao?: string) => {
    const id_val = icao ?? identifier.toUpperCase()
    if (!id_val) return
    onAdd({ type: 'AERODROME', identifier: id_val, role })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un point</h3>

        {/* Role selector */}
        <div className="flex gap-1 mb-3">
          {(['DEP', 'ARR', 'DIVERT', 'OVERFLY'] as FlightPointRole[]).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                role === r ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                           : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        {!unresolved ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ICAO ou nom..."
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
            />
            {suggestions.map(a => (
              <button key={a.icao} onClick={() => submit(a.icao)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
                <span className="font-mono text-[var(--amber)]">{a.icao}</span>
                <span className="text-[var(--text-2)] truncate">{a.name}</span>
              </button>
            ))}
            <button
              onClick={() => setUnresolved(true)}
              className="mt-2 text-xs text-[var(--text-dim)] underline"
            >
              Ajouter sans résolution (identifiant libre)
            </button>
          </>
        ) : (
          <>
            <input
              autoFocus
              value={identifier}
              onChange={e => setIdentifier(e.target.value.toUpperCase())}
              placeholder="Identifiant (ex: LFXX, VOR, ...)"
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => submit()}>Ajouter</Button>
              <Button variant="ghost" size="sm" onClick={() => setUnresolved(false)}>Retour</Button>
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
  const [showAdd, setShowAdd] = useState(false)

  const resolved = useMemo(() =>
    branch.points.map(pt => ({
      pt,
      aero: pt.type === 'AERODROME' ? getAerodrome(pt.identifier) : undefined,
    }))
  , [branch.points])

  const mapPoints = resolved.filter(r => r.aero)
  const positions: [number, number][] = mapPoints.map(r => [r.aero!.lat, r.aero!.lng])
  const center: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length,
       positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [46.5, 2.5]

  const addPoint = (pt: Omit<FlightPoint, 'id'>) =>
    onChange({ ...branch, points: [...branch.points, { ...pt, id: crypto.randomUUID() }] })

  const removePoint = (id: string) =>
    onChange({ ...branch, points: branch.points.filter(p => p.id !== id) })

  const movePoint = (id: string, dir: -1 | 1) => {
    const idx = branch.points.findIndex(p => p.id === id)
    if (idx < 0) return
    const pts = [...branch.points]
    const swap = idx + dir
    if (swap < 0 || swap >= pts.length) return;
    [pts[idx], pts[swap]] = [pts[swap], pts[idx]]
    onChange({ ...branch, points: pts })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div className="h-48 flex-shrink-0">
        <MapContainer center={center} zoom={7} className="h-full w-full"
          style={{ backgroundColor: '#0e1217' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd" maxZoom={19}
          />
          {positions.length >= 2 && (
            <Polyline positions={positions} color="#f0a93b" weight={2} opacity={0.7} />
          )}
          {mapPoints.map(({ pt, aero }) => (
            <Marker key={pt.id} position={[aero!.lat, aero!.lng]} icon={ROLE_ICONS[pt.role]}>
              <Popup>{ROLE_LABELS[pt.role]} — {pt.identifier} — {aero!.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Distance */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-chrome)]">
        <div className="flex items-center gap-3">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Distance totale</label>
          <input
            type="number"
            value={branch.distanceNm || ''}
            placeholder="0"
            onChange={e => onChange({ ...branch, distanceNm: Number(e.target.value) })}
            className="w-24 text-right font-mono text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
          />
          <span className="text-xs text-[var(--text-dim)]">nm</span>
          <span className="font-mono text-xs text-[var(--text-dim)]">{formatDuration(branch.distanceNm, speedKt)}</span>
          {!isOnly && (
            <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>
              Supprimer vol
            </Button>
          )}
        </div>
      </div>

      {/* Points list */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Points</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>+ Ajouter</Button>
        </div>

        {branch.points.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">
            Aucun point — cliquez sur « + Ajouter »
          </p>
        )}

        {resolved.map(({ pt, aero }, idx) => (
          <Card key={pt.id} padding="sm">
            <div className="flex gap-3 items-center">
              <Badge
                variant="neutral"
                style={{ backgroundColor: ROLE_COLORS[pt.role], color: 'white', minWidth: '3rem', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => onChange({ ...branch, points: branch.points.map(p => p.id === pt.id ? { ...p, role: cycleRole(p.role) } : p) })}
              >
                {ROLE_LABELS[pt.role]}
              </Badge>
              <span className="font-mono text-[var(--amber)] text-sm">{pt.identifier}</span>
              <span className="flex-1 text-sm text-[var(--text-2)] truncate">
                {aero ? aero.name : <span className="text-[var(--text-dim)]">custom</span>}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => movePoint(pt.id, -1)}
                  disabled={idx === 0}
                  className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1"
                >↑</button>
                <button
                  onClick={() => movePoint(pt.id, 1)}
                  disabled={idx === branch.points.length - 1}
                  className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1"
                >↓</button>
                <button
                  onClick={() => removePoint(pt.id)}
                  className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1"
                >✕</button>
              </div>
            </div>
            <input
              type="text"
              value={pt.notes ?? ''}
              onChange={e => onChange({ ...branch, points: branch.points.map(p => p.id === pt.id ? { ...p, notes: e.target.value } : p) })}
              placeholder="Notes..."
              className="mt-1 w-full text-xs bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text-2)] focus:border-[var(--amber)] focus:outline-none"
            />
          </Card>
        ))}

        {/* Notes */}
        <div className="mt-4">
          <label className="text-xs text-[var(--text-dim)] uppercase tracking-wider block mb-1">Notes</label>
          <textarea
            value={branch.notes}
            onChange={e => onChange({ ...branch, notes: e.target.value })}
            rows={3}
            placeholder="Commentaires libres sur ce tronçon..."
            className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none resize-none"
          />
        </div>
      </div>

      {showAdd && <AddPointModal onAdd={addPoint} onClose={() => setShowAdd(false)} />}
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
      points: [],
      distanceNm: 0,
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

  const updateBranch = (branch: FlightBranch) => {
    onUpdate(branches.map(b => b.id === branch.id ? branch : b))
  }

  const [editingLabel, setEditingLabel] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Branch tabs */}
      {(branches.length > 1 || true) && (
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] overflow-x-auto">
          {branches.map(b => (
            <div
              key={b.id}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t text-sm cursor-pointer select-none transition-colors ${
                b.id === activeId
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] border border-b-0 border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-1)]'
              }`}
              onClick={() => setActiveId(b.id)}
            >
              {editingLabel === b.id ? (
                <input
                  autoFocus
                  defaultValue={b.label}
                  className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
                  onBlur={e => {
                    updateBranch({ ...b, label: e.target.value || b.label })
                    setEditingLabel(null)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingLabel(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span onDoubleClick={() => setEditingLabel(b.id)}>{b.label}</span>
              )}
            </div>
          ))}
          <button
            onClick={addBranch}
            className="px-2 py-1 text-sm text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors"
          >+</button>
        </div>
      )}

      {activeBranch && (
        <BranchView
          branch={activeBranch}
          isOnly={branches.length === 1}
          speedKt={speedKt}
          onChange={updateBranch}
          onDelete={() => deleteBranch(activeBranch.id)}
        />
      )}
    </div>
  )
}
