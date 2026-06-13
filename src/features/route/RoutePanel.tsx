import { useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import type { FlightDossier, ImportedRoute, RouteWaypoint } from '../../types'
import { FlightplanImport } from './FlightplanImport'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

// Custom icons
const depIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24S24 21 24 12C24 5.4 18.6 0 12 0z" fill="#4d8df0"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`),
  iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36],
})
const arrIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24S24 21 24 12C24 5.4 18.6 0 12 0z" fill="#46c98a"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`),
  iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36],
})
const wpIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><circle cx="9" cy="9" r="8" fill="#f0a93b" stroke="#0e1217" stroke-width="2"/></svg>`),
  iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -9],
})

interface Props {
  dossier: FlightDossier
  onUpdateRoute: (route: ImportedRoute) => void
  onUpdateWaypoint: (wpId: string, changes: Partial<RouteWaypoint>) => void
}

export function RoutePanel({ dossier, onUpdateRoute, onUpdateWaypoint }: Props) {
  const { route } = dossier

  const center = useMemo(() => {
    if (!route || route.waypoints.length === 0) return [46.5, 2.5] as [number, number]
    const lats = route.waypoints.map(w => w.lat)
    const lngs = route.waypoints.map(w => w.lng)
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ] as [number, number]
  }, [route])

  const bounds = useMemo(() => {
    if (!route || route.waypoints.length < 2) return undefined
    const lats = route.waypoints.map(w => w.lat)
    const lngs = route.waypoints.map(w => w.lng)
    return [
      [Math.min(...lats) - 0.2, Math.min(...lngs) - 0.2],
      [Math.max(...lats) + 0.2, Math.max(...lngs) + 0.2],
    ] as [[number, number], [number, number]]
  }, [route])

  const positions = useMemo(
    () => route?.waypoints.map(w => [w.lat, w.lng] as [number, number]) ?? [],
    [route]
  )

  const totalDist = useMemo(() => {
    if (!route || route.waypoints.length < 2) return 0
    let d = 0
    for (let i = 1; i < route.waypoints.length; i++) {
      const prev = route.waypoints[i - 1]
      const cur = route.waypoints[i]
      const dlat = (cur.lat - prev.lat) * 60
      const dlng = (cur.lng - prev.lng) * 60 * Math.cos(prev.lat * Math.PI / 180)
      d += Math.sqrt(dlat * dlat + dlng * dlng)
    }
    return Math.round(d)
  }, [route])

  if (!route) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold text-[var(--text-1)] mb-4">Route</h2>
        <FlightplanImport
          onImport={(importedRoute, weightBalance) => {
            onUpdateRoute(importedRoute)
            // TODO: Task 16 will handle weightBalance pre-fill for M&C
            void weightBalance
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div className="h-64 flex-shrink-0">
        <MapContainer
          center={center}
          zoom={8}
          bounds={bounds}
          className="h-full w-full"
          style={{ backgroundColor: '#0e1217' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
          {positions.length >= 2 && (
            <Polyline positions={positions} color="#f0a93b" weight={2} opacity={0.8} />
          )}
          {route.waypoints.map((wp, i) => {
            const isFirst = i === 0
            const isLast = i === route.waypoints.length - 1
            const icon = isFirst ? depIcon : isLast ? arrIcon : wpIcon
            return (
              <Marker key={wp.id} position={[wp.lat, wp.lng]} icon={icon}>
                <Popup>{wp.name || wp.type} — {wp.alt_ft}ft</Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-chrome)]">
        <span className="text-sm text-[var(--text-muted)]">
          {route.waypoints.length} waypoints · ~{totalDist} nm · {route.sourceFile}
        </span>
        <div className="ml-auto">
          <FlightplanImport
            compact
            onImport={(importedRoute) => onUpdateRoute(importedRoute)}
          />
        </div>
      </div>

      {/* Waypoints list */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {route.waypoints.map((wp, i) => {
          const isFirst = i === 0
          const isLast = i === route.waypoints.length - 1
          return (
            <Card key={wp.id} padding="sm" className="flex gap-3 items-start">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono mt-0.5"
                style={{
                  backgroundColor: isFirst ? 'var(--blue)' : isLast ? 'var(--green)' : 'var(--bg-inset)',
                  color: (isFirst || isLast) ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {i}
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Input
                  label="Nom"
                  value={wp.name}
                  onChange={(e) => onUpdateWaypoint(wp.id, { name: e.target.value })}
                />
                <Input
                  label="Alt (ft)"
                  type="number"
                  value={wp.alt_ft}
                  onChange={(e) => onUpdateWaypoint(wp.id, { alt_ft: Number(e.target.value) })}
                />
                <Input
                  label="Notes"
                  value={wp.notes}
                  onChange={(e) => onUpdateWaypoint(wp.id, { notes: e.target.value })}
                  placeholder="Fréquences, espaces..."
                />
              </div>
              <Badge variant="neutral" className="flex-shrink-0 mt-4 text-[10px]">{wp.type}</Badge>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
