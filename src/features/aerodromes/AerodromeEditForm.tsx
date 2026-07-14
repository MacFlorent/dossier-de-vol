import type { StoredAerodrome, RunwayInfo } from '../../types'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

export function RunwayEditor({
  runways,
  onChange,
}: {
  runways: RunwayInfo[]
  onChange: (runways: RunwayInfo[]) => void
}) {
  const add = () => onChange([...runways, { ident: '', headingMag: 0, lengthFt: 0, surface: 'hard' }])
  const remove = (i: number) => onChange(runways.filter((_, j) => j !== i))
  const update = (i: number, changes: Partial<RunwayInfo>) =>
    onChange(runways.map((r, j) => j === i ? { ...r, ...changes } : r))

  return (
    <div className="space-y-2">
      {runways.map((rwy, i) => (
        <div key={i} className="grid grid-cols-6 gap-2 items-end">
          <Input label="Piste" value={rwy.ident}
            onChange={e => update(i, { ident: e.target.value })} />
          <Input label="QFU (°)" type="number" value={rwy.headingMag}
            onChange={e => update(i, { headingMag: Number(e.target.value) })} />
          <Input label="Long. (ft)" type="number" value={rwy.lengthFt}
            onChange={e => update(i, { lengthFt: Number(e.target.value) })} />
          <Input label="TODA (m)" type="number" value={rwy.toda ?? ''}
            placeholder="—"
            onChange={e => update(i, { toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <Input label="LDA (m)" type="number" value={rwy.lda ?? ''}
            placeholder="—"
            onChange={e => update(i, { lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <div className="flex gap-1 items-end pb-0.5">
            <button
              type="button"
              onClick={() => update(i, { surface: rwy.surface === 'hard' ? 'grass' : 'hard' })}
              className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                rwy.surface === 'hard'
                  ? 'border-[var(--amber)] text-[var(--amber)]'
                  : 'border-[var(--green)] text-[var(--green)]'
              }`}
            >
              {rwy.surface === 'hard' ? 'Dur' : 'Herbe'}
            </button>
            <button onClick={() => remove(i)}
              className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1">✕</button>
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add}>+ Piste</Button>
    </div>
  )
}

export function AerodromeEditForm({ draft, onChange }: {
  draft: StoredAerodrome
  onChange: (draft: StoredAerodrome) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input label="Nom" value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })} />
        <Input label="Lat" type="number" value={draft.lat}
          onChange={e => onChange({ ...draft, lat: Number(e.target.value) })} />
        <Input label="Lng" type="number" value={draft.lng}
          onChange={e => onChange({ ...draft, lng: Number(e.target.value) })} />
        <Input label="Élévation (ft)" type="number" value={draft.elevationFt}
          onChange={e => onChange({ ...draft, elevationFt: Number(e.target.value) })} />
      </div>
      <RunwayEditor
        runways={draft.runways}
        onChange={runways => onChange({ ...draft, runways })}
      />
    </div>
  )
}
