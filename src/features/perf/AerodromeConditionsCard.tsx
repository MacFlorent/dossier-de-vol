import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt, crosswindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  elevation: number
  qnh: number
  temp: number
  pa: number
  da: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
  onEditReferential: () => void
}

function bestRunway(runways: RunwayInfo[], windDir: number, windSpeed: number): RunwayInfo {
  return runways.reduce((best, r) =>
    headwindKt(windDir, windSpeed, r.headingMag) > headwindKt(windDir, windSpeed, best.headingMag) ? r : best
  )
}

export function AerodromeConditionsCard({
  runways, inputs, elevation, qnh, temp, pa, da, onUpdate, onEditReferential,
}: Props) {
  const handleRunwaySelect = (ident: string) => {
    const rwy = runways.find(r => r.ident === ident)
    if (!rwy) return
    const wkt = (inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined)
      ? headwindKt(inputs.windDirDeg, inputs.windSpeedKt, rwy.headingMag)
      : inputs.windKt
    onUpdate({ selectedRunway: ident, windKt: wkt, surface: rwy.surface, toda: rwy.toda, lda: rwy.lda })
  }

  const updateWind = (changes: { windDirDeg?: number; windSpeedKt?: number }) => {
    const nextDir = 'windDirDeg' in changes ? changes.windDirDeg : inputs.windDirDeg
    const nextSpeed = 'windSpeedKt' in changes ? changes.windSpeedKt : inputs.windSpeedKt
    if (!inputs.selectedRunway && runways.length > 0 && nextDir !== undefined && nextSpeed !== undefined) {
      const rwy = bestRunway(runways, nextDir, nextSpeed)
      onUpdate({
        ...changes,
        selectedRunway: rwy.ident,
        windKt: headwindKt(nextDir, nextSpeed, rwy.headingMag),
        surface: rwy.surface,
        toda: rwy.toda,
        lda: rwy.lda,
      })
      return
    }
    onUpdate(changes)
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Conditions</h2>
        <button type="button" aria-label="Éditer référentiel" onClick={onEditReferential}
          className="text-[var(--text-dim)] hover:text-[var(--amber)] text-sm">✏️</button>
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
                  {rwy.ident} ({rwy.headingMag}° — {hw >= 0 ? '+' : ''}{hw}kt face / {Math.abs(xw)}kt trav.)
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Terrain</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Élév. (ft)" type="number" value={elevation}
              onChange={e => onUpdate({ elevation: Number(e.target.value) })} />
            <Input label="QNH (hPa)" type="number" value={qnh}
              onChange={e => onUpdate({ qnh: Number(e.target.value) })} />
            <Input label="Temp (°C)" type="number" value={temp}
              onChange={e => onUpdate({ temp: Number(e.target.value) })} />
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="TODA (m)" type="number" value={inputs.toda ?? ''} placeholder="optionnel"
              onChange={e => onUpdate({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
              onChange={e => onUpdate({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <dl className="text-xs text-[var(--text-dim)] flex gap-4">
            <div className="flex gap-1"><dt>Alt pression</dt><dd className="font-mono text-[var(--text-1)]">{Math.round(pa)} ft</dd></div>
            <div className="flex gap-1"><dt>Alt densité</dt><dd className="font-mono text-[var(--text-1)]">{Math.round(da)} ft</dd></div>
          </dl>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Vent réel</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Vent dir. (°M)" type="number" value={inputs.windDirDeg ?? ''} placeholder="—"
              onChange={e => updateWind({ windDirDeg: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="Vent vitesse (kt)" type="number" value={inputs.windSpeedKt ?? ''} placeholder="0"
              onChange={e => updateWind({ windSpeedKt: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          {runways.length === 0 && (
            <Input label="Vent (kt) — manuel" type="number" value={inputs.windKt === 0 ? '' : inputs.windKt} placeholder="0"
              hint="+face / −arrière"
              onChange={e => onUpdate({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })} />
          )}
        </div>
      </div>
    </Card>
  )
}
