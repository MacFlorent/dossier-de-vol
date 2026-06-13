import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FlightDossier, WeatherInputs, WindLayer, FieldWeather } from '../../types'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface Props {
  dossier: FlightDossier
  onUpdate: (weatherInputs: WeatherInputs) => void
}

export function WeatherPanel({ dossier, onUpdate }: Props) {
  const { route, weatherInputs } = dossier
  const [showMetar, setShowMetar] = useState(false)

  // Stable IDs for wind rows so React reconciles correctly when a row is removed from the middle
  const windIdsRef = useRef<string[]>([])
  // Grow the id array when new rows are added
  while (windIdsRef.current.length < weatherInputs.winds.length) {
    windIdsRef.current.push(crypto.randomUUID())
  }

  // Extract unique aerodromes from route
  const aerodromes = route
    ? route.waypoints.filter(w => w.type === 'Aerodrome' && w.name).map(w => w.name)
    : []
  const uniqueAerodromes = [...new Set(aerodromes)]

  const updateField = (icao: string, field: Partial<FieldWeather>) => {
    onUpdate({
      ...weatherInputs,
      fields: {
        ...weatherInputs.fields,
        [icao]: { ...{ qnh: 1013, temp: 15 }, ...weatherInputs.fields[icao], ...field },
      },
    })
  }

  const updateWind = (idx: number, changes: Partial<WindLayer>) => {
    const winds = weatherInputs.winds.map((w, i) => i === idx ? { ...w, ...changes } : w)
    onUpdate({ ...weatherInputs, winds })
  }

  const addWind = () => {
    const lastAlt = weatherInputs.winds.length > 0
      ? weatherInputs.winds[weatherInputs.winds.length - 1].altitude_ft + 2000
      : 0
    onUpdate({
      ...weatherInputs,
      winds: [...weatherInputs.winds, { altitude_ft: lastAlt, direction_deg: 0, speed_kt: 0 }],
    })
  }

  const removeWind = (idx: number) => {
    windIdsRef.current.splice(idx, 1)
    onUpdate({
      ...weatherInputs,
      winds: weatherInputs.winds.filter((_, i) => i !== idx),
    })
  }

  // METAR/TAF queries — only enabled when user requests
  const icaoList = uniqueAerodromes.join(',')

  const { data: metarData, isLoading: metarLoading, error: metarError, refetch: fetchMetar } = useQuery({
    queryKey: ['metar', icaoList],
    queryFn: async () => {
      const res = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icaoList}&format=raw&hours=2`)
      if (!res.ok) throw new Error(`METAR fetch failed: ${res.status}`)
      return res.text()
    },
    enabled: false,
    staleTime: 10 * 60 * 1000,
  })

  const { data: tafData, isLoading: tafLoading, error: tafError, refetch: fetchTaf } = useQuery({
    queryKey: ['taf', icaoList],
    queryFn: async () => {
      const res = await fetch(`https://aviationweather.gov/api/data/taf?ids=${icaoList}&format=raw`)
      if (!res.ok) throw new Error(`TAF fetch failed: ${res.status}`)
      return res.text()
    },
    enabled: false,
    staleTime: 10 * 60 * 1000,
  })

  const handleFetchMetar = () => {
    setShowMetar(true)
    fetchMetar()
    fetchTaf()
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">

      {/* Section 1: Terrains */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Terrains
        </h2>
        {uniqueAerodromes.length === 0 ? (
          <Card padding="md" className="text-center text-[var(--text-muted)] text-sm">
            Importer une route d&apos;abord (onglet Route)
          </Card>
        ) : (
          <div className="grid gap-3">
            {uniqueAerodromes.map(icao => {
              const field = weatherInputs.fields[icao] ?? { qnh: 1013, temp: 15 }
              return (
                <Card key={icao} padding="sm">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-medium text-[var(--amber)] w-16">{icao}</span>
                    <div className="flex gap-3 flex-1">
                      <Input
                        label="QNH (hPa)"
                        type="number"
                        value={field.qnh}
                        onChange={(e) => updateField(icao, { qnh: Number(e.target.value) })}
                        className="w-32"
                      />
                      <Input
                        label="Temp (°C)"
                        type="number"
                        value={field.temp}
                        onChange={(e) => updateField(icao, { temp: Number(e.target.value) })}
                        className="w-32"
                      />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 2: Vents par altitude */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Vents par altitude
        </h2>
        <Card padding="none">
          <div
            className="grid text-xs text-[var(--text-dim)] px-4 py-2 border-b border-[var(--border)]"
            style={{ gridTemplateColumns: '120px 120px 120px 1fr' }}
          >
            <span>Altitude (ft)</span>
            <span>Direction (°V)</span>
            <span>Vitesse (kt)</span>
            <span />
          </div>
          {weatherInputs.winds.map((wind, idx) => (
            <div
              key={windIdsRef.current[idx]}
              className="grid items-center gap-2 px-4 py-2 border-b border-[var(--border)]"
              style={{ gridTemplateColumns: '120px 120px 120px 1fr' }}
            >
              <Input
                type="number"
                value={wind.altitude_ft}
                onChange={(e) => updateWind(idx, { altitude_ft: Number(e.target.value) })}
              />
              <Input
                type="number"
                value={wind.direction_deg}
                min={0}
                max={360}
                onChange={(e) => updateWind(idx, { direction_deg: Number(e.target.value) })}
              />
              <Input
                type="number"
                value={wind.speed_kt}
                min={0}
                onChange={(e) => updateWind(idx, { speed_kt: Number(e.target.value) })}
              />
              <button
                onClick={() => removeWind(idx)}
                className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm transition-colors"
                aria-label="Supprimer cette couche"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="px-4 py-2">
            <Button variant="ghost" size="sm" onClick={addWind}>
              + Ajouter couche
            </Button>
          </div>
        </Card>
      </section>

      {/* Section 3: Notes / NOTAM */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Notes / NOTAM
        </h2>
        <textarea
          value={weatherInputs.notes}
          onChange={(e) => onUpdate({ ...weatherInputs, notes: e.target.value })}
          placeholder="Coller vos NOTAMs, SUPAIP, SIGMETs ici..."
          className="w-full h-40 px-3 py-2 rounded text-sm font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-none placeholder:text-[var(--text-dim)]"
        />
      </section>

      {/* Section 4: METAR / TAF (collapsible, shown only when aerodromes are present) */}
      {uniqueAerodromes.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              METAR / TAF
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFetchMetar}
              disabled={metarLoading || tafLoading}
            >
              {(metarLoading || tafLoading) ? 'Chargement...' : 'Récupérer'}
            </Button>
          </div>
          {showMetar && (
            <Card padding="md" inset>
              {(metarError || tafError) && (
                <p className="text-[var(--red)] text-xs mb-2">
                  Erreur METAR/TAF — vérifiez la connexion réseau
                </p>
              )}
              {metarData && (
                <div className="mb-4">
                  <p className="text-xs text-[var(--text-dim)] mb-1">METAR</p>
                  <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap">{metarData}</pre>
                </div>
              )}
              {tafData && (
                <div>
                  <p className="text-xs text-[var(--text-dim)] mb-1">TAF</p>
                  <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap">{tafData}</pre>
                </div>
              )}
              {!metarData && !tafData && !metarLoading && !tafLoading && (
                <p className="text-xs text-[var(--text-muted)]">Aucune donnée reçue</p>
              )}
            </Card>
          )}
        </section>
      )}

    </div>
  )
}
