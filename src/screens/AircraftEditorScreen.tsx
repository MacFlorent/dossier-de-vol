import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Aircraft, WeightStation, PerformanceTable, CruiseRegime } from '../types'
import { getAircraft, saveAircraft } from '../lib/storage'
import { TEMPLATES, createFromTemplate } from '../lib/templates'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { validatePerformanceTable } from '../lib/aviation/perfTableValidation'
import type { PerfTableValidation } from '../lib/aviation/perfTableValidation'

interface Props {
  editingAircraftId: string | null
  onSave: () => void
  onCancel: () => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

// ── EnvelopePreview ───────────────────────────────────────────────────────────

function EnvelopePreview({ json }: { json: string }) {
  let points: [number, number][] = []
  try { points = JSON.parse(json) } catch { return null }
  if (points.length < 3) return null

  const width = 300, height = 180, pad = 30
  const cgs = points.map(p => p[1])
  const weights = points.map(p => p[0])
  const minCg = Math.min(...cgs), maxCg = Math.max(...cgs)
  const minW = Math.min(...weights), maxW = Math.max(...weights)
  const cgRange = maxCg - minCg || 1
  const wRange = maxW - minW || 1

  const sx = (cg: number) => pad + ((cg - minCg) / cgRange) * (width - 2 * pad)
  const sy = (w: number) => height - pad - ((w - minW) / wRange) * (height - 2 * pad)
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${sx(p[1]).toFixed(1)} ${sy(p[0]).toFixed(1)}`
  ).join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xs mt-2 border border-[var(--border)] rounded">
      <path d={d} fill="color-mix(in srgb, var(--amber) 12%, transparent)" stroke="var(--amber)" strokeWidth="1.5" />
      <text x={pad} y={height - 4} fontSize="8" fill="var(--text-dim)">{minCg} mm</text>
      <text x={width - pad - 24} y={height - 4} fontSize="8" fill="var(--text-dim)">{maxCg} mm</text>
      <text x={2} y={pad + 4} fontSize="8" fill="var(--text-dim)">{maxW} kg</text>
      <text x={2} y={height - pad} fontSize="8" fill="var(--text-dim)">{minW} kg</text>
    </svg>
  )
}

// ── PerfTablePreview ──────────────────────────────────────────────────────────

function PerfTablePreview({ json }: { json: string }) {
  const [oatIdx, setOatIdx] = useState(0)

  let table: PerformanceTable | null = null
  try {
    const parsed = JSON.parse(json)
    if (parsed?.weights && parsed?.pressureAltitudes && parsed?.oats && parsed?.values) {
      table = parsed as PerformanceTable
    }
  } catch { /* JSON invalide, on ne rend rien */ }

  if (!table) return null
  const t = table

  const safeIdx = Math.min(oatIdx, t.oats.length - 1)

  return (
    <div className="mt-2 overflow-x-auto">
      <div className="flex gap-1 mb-2 flex-wrap">
        {t.oats.map((oat, i) => (
          <button
            key={i}
            onClick={() => setOatIdx(i)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              i === safeIdx
                ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                : 'border-[var(--border)] text-[var(--text-dim)]'
            }`}
          >
            {oat}°C
          </button>
        ))}
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-right pr-4 pb-1 text-[var(--text-dim)] font-normal">PA (ft)</th>
            {t.weights.map(w => (
              <th key={w} className="text-right px-3 pb-1 text-[var(--text-dim)] font-normal">{w} kg</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.pressureAltitudes.map((pa, pi) => (
            <tr key={pa} className="border-t border-[var(--border)]">
              <td className="text-right pr-4 py-1 text-[var(--text-muted)]">{pa}</td>
              {t.weights.map((_, wi) => (
                <td key={wi} className="text-right px-3 py-1 text-[var(--text-1)]">
                  {t.values[wi]?.[pi]?.[safeIdx] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── AircraftEditorScreen ──────────────────────────────────────────────────────

export function AircraftEditorScreen({ editingAircraftId, onSave, onCancel }: Props) {
  const isNew = editingAircraftId === null

  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [sdReference, setSdReference] = useState('')

  const [regimes, setRegimes] = useState<CruiseRegime[]>([{ label: '75% puissance', ias: 100, fuelBurn: 20 }])
  const [fuelCapacity, setFuelCapacity] = useState(116)

  const [emptyWeight, setEmptyWeight] = useState(615)
  const [emptyArm, setEmptyArm] = useState(345)
  const [stations, setStations] = useState<WeightStation[]>([])
  const [envelopeJson, setEnvelopeJson] = useState('[]')

  const derivedMtom = useMemo(() => {
    try {
      const pts: [number, number][] = JSON.parse(envelopeJson)
      return pts.length > 0 ? Math.max(...pts.map(p => p[0])) : null
    } catch { return null }
  }, [envelopeJson])

  const [toTableJson, setToTableJson] = useState('{}')
  const [ldgTableJson, setLdgTableJson] = useState('{}')
  const [toTableValidation, setToTableValidation] = useState<PerfTableValidation>(() => validatePerformanceTable({}))
  const [ldgTableValidation, setLdgTableValidation] = useState<PerfTableValidation>(() => validatePerformanceTable({}))

  const runValidation = (json: string): PerfTableValidation => {
    let parsed: unknown = null
    try { parsed = JSON.parse(json) } catch { /* invalid JSON */ }
    return validatePerformanceTable(parsed)
  }

  const applyAircraft = useCallback((ac: Aircraft) => {
    setName(ac.name)
    setRegistration(ac.registration)
    setSdReference(ac.sdReference ?? '')
    setRegimes(ac.characteristics.regimes.map(r => ({ ...r })))
    setFuelCapacity(ac.characteristics.fuelCapacity)
    setEmptyWeight(ac.massBalance.emptyWeight)
    setEmptyArm(ac.massBalance.emptyArm)
    setStations(ac.massBalance.stations.map(s => ({ ...s })))
    setEnvelopeJson(JSON.stringify(ac.massBalance.envelopePoints, null, 2))
    const toJson = JSON.stringify(ac.performance.toTable, null, 2)
    const ldgJson = JSON.stringify(ac.performance.ldgTable, null, 2)
    setToTableJson(toJson)
    setLdgTableJson(ldgJson)
    setToTableValidation(validatePerformanceTable(ac.performance.toTable))
    setLdgTableValidation(validatePerformanceTable(ac.performance.ldgTable))
  }, [])

  useEffect(() => {
    if (editingAircraftId) {
      const ac = getAircraft(editingAircraftId)
      if (ac) applyAircraft(ac)
    }
  }, [editingAircraftId, applyAircraft])

  const handleTemplateSelect = useCallback((key: string) => {
    const ac = createFromTemplate(key, crypto.randomUUID())
    if (ac) applyAircraft(ac)
  }, [applyAircraft])

  const handleSave = useCallback(() => {
    let envelopePoints: [number, number][]
    let toTable: PerformanceTable
    let ldgTable: PerformanceTable
    try {
      envelopePoints = JSON.parse(envelopeJson)
      toTable = JSON.parse(toTableJson)
      ldgTable = JSON.parse(ldgTableJson)
    } catch {
      return
    }

    const maxWeight = envelopePoints.length > 0
      ? Math.max(...envelopePoints.map(p => p[0]))
      : 0

    const aircraft: Aircraft = {
      id: editingAircraftId ?? crypto.randomUUID(),
      name,
      registration,
      sdReference: sdReference || undefined,
      characteristics: { regimes, fuelCapacity },
      massBalance: { emptyWeight, emptyArm, maxWeight, stations, envelopePoints },
      performance: { toTable, ldgTable },
    }
    saveAircraft(aircraft)
    onSave()
  }, [
    editingAircraftId,
    name, registration, sdReference,
    regimes, fuelCapacity,
    emptyWeight, emptyArm, stations, envelopeJson,
    toTableJson, ldgTableJson,
    onSave,
  ])

  const addRegime = useCallback(() => {
    setRegimes(prev => [...prev, { label: '', ias: 100, fuelBurn: 20 }])
  }, [])

  const removeRegime = useCallback((idx: number) => {
    setRegimes(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateRegime = useCallback((idx: number, field: keyof CruiseRegime, value: string | number) => {
    setRegimes(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }, [])

  const addStation = useCallback(() => {
    setStations(prev => [...prev, { name: '', arm: 0, kind: 'dry' as const }])
  }, [])

  const removeStation = useCallback((idx: number) => {
    setStations(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
    setStations(prev => prev.map((s, i) => {
      if (i !== idx) return s
      if (field === 'kind') return { ...s, kind: value as 'dry' | 'fuel' }
      if (field === 'arm') return { ...s, arm: Number(value) }
      return { ...s, [field]: value }
    }))
  }, [])

  return (
    <div className="min-h-full p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">
          {isNew ? 'Nouvel avion' : 'Modifier l\'avion'}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {isNew ? 'Configurez un nouvel avion' : `Édition : ${name || registration || editingAircraftId}`}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {isNew && (
          <Card padding="md">
            <SectionTitle>Modèle de départ</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <Button key={t.key} variant="secondary" size="sm" onClick={() => handleTemplateSelect(t.key)}>
                  Depuis modèle : {t.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-2">
              Pré-remplit tous les champs — modifiez ensuite l'immatriculation et le nom.
            </p>
          </Card>
        )}

        {/* Informations générales */}
        <Card padding="md">
          <SectionTitle>Informations générales</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Nom" value={name} onChange={e => setName(e.target.value)} placeholder="DR221" />
            <Input label="Immatriculation" value={registration}
              onChange={e => setRegistration(e.target.value.toUpperCase())} placeholder="F-BPCT" />
            <Input label="Référence SkyDemon (optionnel)" value={sdReference}
              onChange={e => setSdReference(e.target.value)} placeholder="DR221" />
          </div>
        </Card>

        {/* Caractéristiques */}
        <Card padding="md">
          <SectionTitle>Caractéristiques</SectionTitle>

          {regimes.length === 0 ? (
            <p className="text-xs text-[var(--text-dim)] mb-2">Aucun régime — cliquez + pour en ajouter.</p>
          ) : (
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-dim)] text-left">
                    <th className="pb-1 pr-3 font-medium">Label</th>
                    <th className="pb-1 pr-3 font-medium">IAS (kt)</th>
                    <th className="pb-1 pr-3 font-medium">Conso (L/h)</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {regimes.map((r, idx) => (
                    <tr key={idx} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 px-2 py-1 rounded text-xs text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={r.label}
                            onChange={e => updateRegime(idx, 'label', e.target.value)}
                            placeholder="75% puissance"
                          />
                          {idx === 0 && (
                            <span className="text-xs text-[var(--amber)] whitespace-nowrap">défaut</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="number"
                          className="w-20 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                          value={r.ias}
                          onChange={e => updateRegime(idx, 'ias', Number(e.target.value))}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="number"
                          className="w-20 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                          value={r.fuelBurn}
                          onChange={e => updateRegime(idx, 'fuelBurn', Number(e.target.value))}
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-1 disabled:opacity-30"
                          onClick={() => removeRegime(idx)}
                          disabled={regimes.length === 1}
                          title="Supprimer ce régime"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={addRegime}>+ Ajouter régime</Button>

          <div className="mt-4 max-w-xs">
            <Input
              label="Capacité carburant (L)"
              type="number"
              value={fuelCapacity}
              onChange={e => setFuelCapacity(Number(e.target.value))}
            />
          </div>
        </Card>

        {/* Masse & centrage */}
        <Card padding="md">
          <SectionTitle>Masse &amp; centrage</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <Input label="Masse à vide (kg)" type="number" value={emptyWeight}
              onChange={e => setEmptyWeight(Number(e.target.value))} />
            <Input label="Bras à vide (mm)" type="number" value={emptyArm}
              onChange={e => setEmptyArm(Number(e.target.value))} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                MTOM (kg)
              </label>
              <div className="px-3 py-2 rounded text-sm font-mono text-[var(--text-muted)] bg-[var(--bg-inset)] border border-[var(--border)]">
                {derivedMtom ?? '—'}
              </div>
              <p className="text-xs text-[var(--text-dim)]">Déduit de l'enveloppe</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Stations de chargement
            </p>
            {stations.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)] mb-2">Aucune station.</p>
            ) : (
              <div className="overflow-x-auto mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--text-dim)] text-left">
                      <th className="pb-1 pr-3 font-medium">Nom</th>
                      <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
                      <th className="pb-1 pr-3 font-medium">Type</th>
                      <th className="pb-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stations.map((s, idx) => (
                      <tr key={idx} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-3">
                          <input
                            className="w-full px-2 py-1 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.name}
                            onChange={e => updateStation(idx, 'name', e.target.value)}
                            placeholder="Pilote"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input type="number"
                            className="w-24 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.arm}
                            onChange={e => updateStation(idx, 'arm', Number(e.target.value))}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select
                            className="px-2 py-1 rounded text-xs text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.kind}
                            onChange={e => updateStation(idx, 'kind', e.target.value)}
                          >
                            <option value="dry">Sec (kg)</option>
                            <option value="fuel">Carburant (L)</option>
                          </select>
                        </td>
                        <td className="py-1.5">
                          <button
                            className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-1"
                            onClick={() => removeStation(idx)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={addStation}>+ Ajouter station</Button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Points d'enveloppe [[kg, mm], ...]
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={envelopeJson}
              onChange={e => setEnvelopeJson(e.target.value)}
              spellCheck={false}
            />
            <EnvelopePreview json={envelopeJson} />
          </div>
        </Card>

        {/* Performances */}
        <Card padding="md">
          <SectionTitle>Performances</SectionTitle>

          <div className="flex flex-col gap-1 mb-6">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Table décollage (toTable — JSON)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={toTableJson}
              onChange={e => {
                setToTableJson(e.target.value)
                setToTableValidation(runValidation(e.target.value))
              }}
              spellCheck={false}
            />
            <PerfTablePreview json={toTableJson} />
            {toTableValidation.errors.length > 0 && (
              <div className="mt-1 p-2 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-0.5">
                {toTableValidation.errors.map((e, i) => <div key={i}>✕ {e}</div>)}
              </div>
            )}
            {toTableValidation.warnings.length > 0 && (
              <div className="mt-1 p-2 rounded border border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)] text-xs space-y-0.5">
                {toTableValidation.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Table atterrissage (ldgTable — JSON)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={ldgTableJson}
              onChange={e => {
                setLdgTableJson(e.target.value)
                setLdgTableValidation(runValidation(e.target.value))
              }}
              spellCheck={false}
            />
            <PerfTablePreview json={ldgTableJson} />
            {ldgTableValidation.errors.length > 0 && (
              <div className="mt-1 p-2 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-0.5">
                {ldgTableValidation.errors.map((e, i) => <div key={i}>✕ {e}</div>)}
              </div>
            )}
            {ldgTableValidation.warnings.length > 0 && (
              <div className="mt-1 p-2 rounded border border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)] text-xs space-y-0.5">
                {ldgTableValidation.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-3 justify-end pb-8">
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={toTableValidation.errors.length > 0 || ldgTableValidation.errors.length > 0}
          >
            Sauvegarder
          </Button>
        </div>
      </div>
    </div>
  )
}
