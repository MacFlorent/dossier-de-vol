import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  qnh: number
  temp: number
  pa: number
  da: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
}

function bestRunway(runways: RunwayInfo[], windDir: number, windSpeed: number): RunwayInfo {
  return runways.reduce((best, r) =>
    headwindKt(windDir, windSpeed, r.headingMag) > headwindKt(windDir, windSpeed, best.headingMag) ? r : best
  )
}

export function AerodromeWeatherCard({ runways, inputs, qnh, temp, pa, da, onUpdate }: Props) {
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
      <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">Conditions</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Météo</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="QNH (hPa)" type="number" value={qnh === 0 ? '' : qnh} placeholder="0"
              onChange={e => onUpdate({ qnh: e.target.value === '' ? 0 : Number(e.target.value) })} />
            <Input label="Temp (°C)" type="number" value={temp === 0 ? '' : temp} placeholder="0"
              onChange={e => onUpdate({ temp: e.target.value === '' ? 0 : Number(e.target.value) })} />
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
