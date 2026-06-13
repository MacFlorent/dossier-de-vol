import { useState, useCallback } from 'react'
import type { ImportedRoute } from '../../types'
import { parseFlightplan } from '../../lib/flightplan/parser'
import { findIcaoByCoords } from '../../lib/icao/database'
import { Button } from '../../components/ui/Button'

interface Props {
  onImport: (route: ImportedRoute, weightBalance: Record<string, number>) => void
  /** When true, renders a compact button instead of a full drop zone */
  compact?: boolean
}

export function FlightplanImport({ onImport, compact = false }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [multipleRoutes, setMultipleRoutes] = useState<{ routes: ImportedRoute[]; wb: Record<string, number> } | null>(null)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setMultipleRoutes(null)
    try {
      const text = await file.text()
      const parsed = parseFlightplan(text, file.name)

      if (parsed.routes.length === 0) {
        setError('Aucune route trouvée dans ce fichier')
        return
      }

      // Resolve ICAO codes for Aerodrome waypoints
      const resolvedRoutes = parsed.routes.map(route => ({
        ...route,
        waypoints: route.waypoints.map(wp => {
          if (wp.type === 'Aerodrome') {
            const icao = findIcaoByCoords(wp.lat, wp.lng)
            if (icao) return { ...wp, name: icao }
          }
          return wp
        }),
      }))

      if (resolvedRoutes.length === 1) {
        onImport(resolvedRoutes[0], parsed.weightBalance)
      } else {
        setMultipleRoutes({ routes: resolvedRoutes, wb: parsed.weightBalance })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de lecture du fichier')
    }
  }, [onImport])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const openFilePicker = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.flightplan'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) processFile(file)
    }
    input.click()
  }, [processFile])

  if (multipleRoutes) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-[var(--text-2)]">
          Ce fichier contient {multipleRoutes.routes.length} routes. Laquelle importer ?
        </p>
        {multipleRoutes.routes.map((route, i) => {
          const dep = route.waypoints[0]
          const arr = route.waypoints[route.waypoints.length - 1]
          return (
            <button
              key={i}
              onClick={() => { onImport(route, multipleRoutes.wb); setMultipleRoutes(null) }}
              className="w-full text-left p-3 rounded border border-[var(--border)] hover:border-[var(--amber)] text-[var(--text-1)] text-sm transition-colors"
            >
              Route {i + 1}: {dep?.name || '?'} → {arr?.name || '?'} ({route.waypoints.length} waypoints)
            </button>
          )
        })}
        <Button variant="ghost" size="sm" onClick={() => setMultipleRoutes(null)}>Annuler</Button>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={openFilePicker}>
          Changer de route
        </Button>
        {error && <span className="text-[var(--red)] text-xs">{error}</span>}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--amber)] transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={openFilePicker}
    >
      <div className="text-[var(--text-muted)] text-sm">
        Importer un fichier <span className="font-mono text-[var(--amber)]">.flightplan</span>
      </div>
      <div className="text-[var(--text-dim)] text-xs">Glisser-déposer ou cliquer</div>
      {error && (
        <div className="text-[var(--red)] text-xs mt-2">{error}</div>
      )}
    </div>
  )
}
