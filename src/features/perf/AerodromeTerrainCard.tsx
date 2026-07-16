import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt, crosswindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  title: string
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  elevation: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
  onEditReferential: () => void
}

export function AerodromeTerrainCard({
  title, runways, inputs, elevation, onUpdate, onEditReferential,
}: Props) {
  const handleRunwaySelect = (ident: string) => {
    const rwy = runways.find(r => r.ident === ident)
    if (!rwy) return
    const wkt = (inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined)
      ? headwindKt(inputs.windDirDeg, inputs.windSpeedKt, rwy.headingMag)
      : inputs.windKt
    onUpdate({ selectedRunway: ident, windKt: wkt, surface: rwy.surface, toda: rwy.toda, lda: rwy.lda })
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{title}</h2>
        <button type="button" aria-label="Éditer référentiel" onClick={onEditReferential}
          className="text-[var(--text-dim)] hover:text-[var(--amber)] text-sm">
          <span aria-hidden="true">✏️</span>
        </button>
      </div>

      {runways.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Piste active
          </label>
          <div className="flex gap-2 flex-wrap">
            {runways.map(rwy => {
              const hasWind = inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined
              const hw = hasWind ? headwindKt(inputs.windDirDeg!, inputs.windSpeedKt!, rwy.headingMag) : 0
              const xw = hasWind ? crosswindKt(inputs.windDirDeg!, inputs.windSpeedKt!, rwy.headingMag) : 0
              return (
                <button
                  key={rwy.ident}
                  type="button"
                  onClick={() => handleRunwaySelect(rwy.ident)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    inputs.selectedRunway === rwy.ident
                      ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {rwy.ident} ({rwy.headingMag}° — {hw >= 0 ? '+' : ''}{hw}kt face / {Math.abs(xw)}kt trav.{xw !== 0 ? (xw > 0 ? ' D' : ' G') : ''})
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input label="Élév. (ft)" type="number" value={elevation === 0 ? '' : elevation} placeholder="0"
          onChange={e => onUpdate({ elevation: e.target.value === '' ? 0 : Number(e.target.value) })} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Surface</label>
          <button type="button"
            onClick={() => onUpdate({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
            className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
              inputs.surface === 'hard'
                ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                : 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10'
            }`}>
            {inputs.surface === 'hard' ? 'Dur' : 'Herbe'}
          </button>
        </div>
        <Input label="TODA (m)" type="number" value={inputs.toda ?? ''} placeholder="optionnel"
          onChange={e => onUpdate({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
        <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
          onChange={e => onUpdate({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </div>
    </Card>
  )
}
