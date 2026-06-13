import { useState, useCallback, useEffect } from 'react'
import type { Aircraft, WeightStation, PerformanceTable } from '../types'
import { getAircraft, saveAircraft } from '../lib/storage'
import { TEMPLATES, createFromTemplate } from '../lib/templates'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

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

export function AircraftEditorScreen({ editingAircraftId, onSave, onCancel }: Props) {
  const isNew = editingAircraftId === null

  // Basic info
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [sdReference, setSdReference] = useState('')

  // Performances croisière
  const [ias, setIas] = useState(100)
  const [tas, setTas] = useState(106)
  const [fuelBurn, setFuelBurn] = useState(20)
  const [fuelCapacity, setFuelCapacity] = useState(116)
  const [fuelDensity, setFuelDensity] = useState(0.72)
  const [taxiFuel, setTaxiFuel] = useState(2)

  // Masse & centrage
  const [emptyWeight, setEmptyWeight] = useState(615)
  const [emptyArm, setEmptyArm] = useState(345)
  const [maxWeight, setMaxWeight] = useState(1000)
  const [magneticVariation, setMagneticVariation] = useState(0)
  const [stations, setStations] = useState<WeightStation[]>([])

  // Facteurs
  const [regulatory, setRegulatory] = useState(1.15)
  const [grass, setGrass] = useState(1.20)
  const [headwindPerKt, setHeadwindPerKt] = useState(0.025)
  const [tailwindPerKt, setTailwindPerKt] = useState(0.02)

  // Advanced JSON
  const [envelopeJson, setEnvelopeJson] = useState('[]')
  const [toTableJson, setToTableJson] = useState('{}')
  const [ldgTableJson, setLdgTableJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const applyAircraft = useCallback((ac: Aircraft) => {
    setName(ac.name)
    setRegistration(ac.registration)
    setSdReference(ac.sdReference ?? '')
    setIas(ac.ias)
    setTas(ac.tas)
    setFuelBurn(ac.fuelBurn)
    setFuelCapacity(ac.fuelCapacity)
    setFuelDensity(ac.fuelDensity)
    setTaxiFuel(ac.taxiFuel)
    setEmptyWeight(ac.emptyWeight)
    setEmptyArm(ac.emptyArm)
    setMaxWeight(ac.maxWeight)
    setMagneticVariation(ac.magneticVariation)
    setStations(ac.stations.map(s => ({ ...s })))
    setRegulatory(ac.factors.regulatory)
    setGrass(ac.factors.grass)
    setHeadwindPerKt(ac.factors.headwindPerKt)
    setTailwindPerKt(ac.factors.tailwindPerKt)
    setEnvelopeJson(JSON.stringify(ac.envelopePoints, null, 2))
    setToTableJson(JSON.stringify(ac.toTable, null, 2))
    setLdgTableJson(JSON.stringify(ac.ldgTable, null, 2))
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
    setJsonError(null)
    let envelopePoints: [number, number][]
    let toTable: PerformanceTable
    let ldgTable: PerformanceTable
    try {
      envelopePoints = JSON.parse(envelopeJson)
      toTable = JSON.parse(toTableJson)
      ldgTable = JSON.parse(ldgTableJson)
    } catch {
      setJsonError('JSON invalide dans les champs avancés')
      return
    }

    const aircraft: Aircraft = {
      id: editingAircraftId ?? crypto.randomUUID(),
      name,
      registration,
      sdReference: sdReference || undefined,
      ias,
      tas,
      fuelBurn,
      fuelCapacity,
      fuelDensity,
      taxiFuel,
      emptyWeight,
      emptyArm,
      maxWeight,
      magneticVariation,
      stations,
      envelopePoints,
      toTable,
      ldgTable,
      factors: { regulatory, grass, headwindPerKt, tailwindPerKt },
    }
    saveAircraft(aircraft)
    onSave()
  }, [
    editingAircraftId,
    name, registration, sdReference,
    ias, tas, fuelBurn, fuelCapacity, fuelDensity, taxiFuel,
    emptyWeight, emptyArm, maxWeight, magneticVariation,
    stations,
    regulatory, grass, headwindPerKt, tailwindPerKt,
    envelopeJson, toTableJson, ldgTableJson,
    onSave,
  ])

  // Station helpers
  const addStation = useCallback(() => {
    setStations(prev => [...prev, { name: '', arm: 0, maxWeight: 0 }])
  }, [])

  const removeStation = useCallback((idx: number) => {
    setStations(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
    setStations(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }, [])

  return (
    <div className="min-h-full p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">
          {isNew ? 'Nouvel avion' : 'Modifier l\'avion'}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {isNew ? 'Configurez un nouvel avion' : `Édition : ${name || registration || editingAircraftId}`}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* 1. Template selector (new only) */}
        {isNew && (
          <Card padding="md">
            <SectionTitle>Modèle de départ</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <Button
                  key={t.key}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTemplateSelect(t.key)}
                >
                  Depuis modèle : {t.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-2">
              Pré-remplit tous les champs — modifiez ensuite l'immatriculation et le nom.
            </p>
          </Card>
        )}

        {/* 2. Basic info */}
        <Card padding="md">
          <SectionTitle>Informations générales</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Nom"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="DR221"
            />
            <Input
              label="Immatriculation"
              value={registration}
              onChange={e => setRegistration(e.target.value.toUpperCase())}
              placeholder="F-BPCT"
            />
            <Input
              label="Référence SkyDemon (optionnel)"
              value={sdReference}
              onChange={e => setSdReference(e.target.value)}
              placeholder="DR221"
            />
          </div>
        </Card>

        {/* 3. Performances croisière */}
        <Card padding="md">
          <SectionTitle>Performances croisière</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Input
              label="IAS (kt)"
              type="number"
              value={ias}
              onChange={e => setIas(Number(e.target.value))}
            />
            <Input
              label="TAS (kt)"
              type="number"
              value={tas}
              onChange={e => setTas(Number(e.target.value))}
            />
            <Input
              label="Consommation (L/h)"
              type="number"
              value={fuelBurn}
              onChange={e => setFuelBurn(Number(e.target.value))}
            />
            <Input
              label="Capacité carbu (L)"
              type="number"
              value={fuelCapacity}
              onChange={e => setFuelCapacity(Number(e.target.value))}
            />
            <Input
              label="Densité (kg/L)"
              type="number"
              step="0.01"
              value={fuelDensity}
              onChange={e => setFuelDensity(Number(e.target.value))}
            />
            <Input
              label="Roulage (L)"
              type="number"
              step="0.5"
              value={taxiFuel}
              onChange={e => setTaxiFuel(Number(e.target.value))}
            />
          </div>
        </Card>

        {/* 4. Masse & centrage */}
        <Card padding="md">
          <SectionTitle>Masse &amp; centrage</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Input
              label="Masse à vide (kg)"
              type="number"
              value={emptyWeight}
              onChange={e => setEmptyWeight(Number(e.target.value))}
            />
            <Input
              label="Bras à vide (mm)"
              type="number"
              value={emptyArm}
              onChange={e => setEmptyArm(Number(e.target.value))}
            />
            <Input
              label="MTOM (kg)"
              type="number"
              value={maxWeight}
              onChange={e => setMaxWeight(Number(e.target.value))}
            />
            <Input
              label="Variation magnétique (°E)"
              type="number"
              step="0.5"
              value={magneticVariation}
              onChange={e => setMagneticVariation(Number(e.target.value))}
            />
          </div>

          {/* Stations */}
          <div className="mb-2">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Stations de chargement
            </p>
            {stations.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)] mb-2">Aucune station — cliquez + pour en ajouter.</p>
            ) : (
              <div className="overflow-x-auto mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--text-dim)] text-left">
                      <th className="pb-1 pr-3 font-medium">Nom</th>
                      <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
                      <th className="pb-1 pr-3 font-medium">Poids max (kg)</th>
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
                          <input
                            type="number"
                            className="w-24 px-2 py-1 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.arm}
                            onChange={e => updateStation(idx, 'arm', Number(e.target.value))}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            className="w-24 px-2 py-1 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.maxWeight}
                            onChange={e => updateStation(idx, 'maxWeight', Number(e.target.value))}
                          />
                        </td>
                        <td className="py-1.5">
                          <button
                            className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-1"
                            onClick={() => removeStation(idx)}
                            title="Supprimer cette station"
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
            <Button variant="ghost" size="sm" onClick={addStation}>
              + Ajouter station
            </Button>
          </div>
        </Card>

        {/* 5. Facteurs */}
        <Card padding="md">
          <SectionTitle>Facteurs réglementaires</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Input
              label="Réglementaire (×)"
              type="number"
              step="0.01"
              value={regulatory}
              onChange={e => setRegulatory(Number(e.target.value))}
            />
            <Input
              label="Herbe (×)"
              type="number"
              step="0.01"
              value={grass}
              onChange={e => setGrass(Number(e.target.value))}
            />
            <Input
              label="Vent de face (%/kt)"
              type="number"
              step="0.005"
              value={headwindPerKt}
              onChange={e => setHeadwindPerKt(Number(e.target.value))}
            />
            <Input
              label="Vent arrière (%/kt)"
              type="number"
              step="0.005"
              value={tailwindPerKt}
              onChange={e => setTailwindPerKt(Number(e.target.value))}
            />
          </div>
        </Card>

        {/* 6. Advanced JSON */}
        <Card padding="md">
          <SectionTitle>Données avancées (JSON)</SectionTitle>
          <p className="text-xs text-[var(--text-dim)] mb-4">
            Ces champs acceptent du JSON brut. Ils sont pré-remplis depuis le modèle ou l'avion existant.
          </p>

          {jsonError && (
            <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs">
              {jsonError}
            </div>
          )}

          <div className="flex flex-col gap-4">
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
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Table décollage (toTable — JSON)
              </label>
              <textarea
                className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
                rows={8}
                value={toTableJson}
                onChange={e => setToTableJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Table atterrissage (ldgTable — JSON)
              </label>
              <textarea
                className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
                rows={8}
                value={ldgTableJson}
                onChange={e => setLdgTableJson(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
        </Card>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end pb-8">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Sauvegarder
          </Button>
        </div>
      </div>
    </div>
  )
}
