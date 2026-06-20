import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FlightDossier, WeatherInputs, FieldWeather } from '../../types'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface Props {
  dossier: FlightDossier
  onUpdate: (weatherInputs: WeatherInputs) => void
}

export function WeatherPanel({ dossier, onUpdate }: Props) {
  const { weatherInputs } = dossier
  const [showMetar, setShowMetar] = useState(false)

  const uniqueAerodromes: string[] = [...new Set(
    dossier.branches.flatMap(b => b.aerodromes).map(a => a.identifier)
  )]

  const updateField = (icao: string, field: Partial<FieldWeather>) =>
    onUpdate({
      ...weatherInputs,
      fields: {
        ...weatherInputs.fields,
        [icao]: { ...{ qnh: 1013, temp: 15 }, ...weatherInputs.fields[icao], ...field },
      },
    })

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

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Terrains</h2>
        {uniqueAerodromes.length === 0 ? (
          <Card padding="md" className="text-center text-[var(--text-muted)] text-sm">
            Aucun aérodrome dans les branches (onglet Branches)
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
                      <Input label="QNH (hPa)" type="number" value={field.qnh}
                        onChange={e => updateField(icao, { qnh: Number(e.target.value) })} className="w-32" />
                      <Input label="Temp (°C)" type="number" value={field.temp}
                        onChange={e => updateField(icao, { temp: Number(e.target.value) })} className="w-32" />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Notes / NOTAM</h2>
        <textarea
          value={weatherInputs.notes}
          onChange={e => onUpdate({ ...weatherInputs, notes: e.target.value })}
          placeholder="Coller vos NOTAMs, SUPAIP, SIGMETs ici..."
          className="w-full h-40 px-3 py-2 rounded text-sm font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-none placeholder:text-[var(--text-dim)]"
        />
      </section>

      {uniqueAerodromes.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">METAR / TAF</h2>
            <Button variant="secondary" size="sm"
              onClick={() => { setShowMetar(true); fetchMetar(); fetchTaf() }}
              disabled={metarLoading || tafLoading}>
              {(metarLoading || tafLoading) ? 'Chargement...' : 'Récupérer'}
            </Button>
          </div>
          {showMetar && (
            <Card padding="md" inset>
              {(metarError || tafError) && (
                <p className="text-[var(--red)] text-xs mb-2">Erreur METAR/TAF — vérifiez la connexion réseau</p>
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
