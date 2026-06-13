import { normAngle } from './coordinates'

export interface WindCorrectionResult {
  wca: number   // wind correction angle (°), positif = droite
  gs: number    // vitesse sol (kt)
  th: number    // cap vrai corrigé (°V)
}

/**
 * Calcule le cap à tenir et la vitesse sol depuis un triangle des vitesses.
 * @param tc   Cap vrai de la route (°V)
 * @param tas  Vitesse air vraie (kt)
 * @param windDir Direction d'où vient le vent, vent vrai (°V)
 * @param windSpeed Vitesse du vent (kt)
 */
export function solveWindTriangle(
  tc: number,
  tas: number,
  windDir: number,
  windSpeed: number,
): WindCorrectionResult {
  // Composante de vent croisé (positive = de droite)
  const wd = ((windDir - tc + 180) % 360) - 180  // vent relatif à la route
  const wdRad = (wd * Math.PI) / 180

  // WCA = asin(Vw × sin(WD) / TAS), borné à ±90°
  const sinWca = (windSpeed * Math.sin(wdRad)) / tas
  const wca = Math.asin(Math.max(-1, Math.min(1, sinWca))) * (180 / Math.PI)

  // GS = TAS × cos(WCA) − composante vent de face
  const gs = tas * Math.cos(wca * (Math.PI / 180)) - windSpeed * Math.cos(wdRad)

  return {
    wca: Math.round(wca * 10) / 10,
    gs: Math.max(1, Math.round(gs)),
    th: normAngle(tc + wca),
  }
}

/**
 * Retourne le vent interpolé à une altitude donnée depuis un tableau de couches.
 * Interpolation linéaire simple entre les deux couches encadrantes.
 */
export function windAtAltitude(
  altitude: number,
  layers: { altitude_ft: number; direction_deg: number; speed_kt: number }[],
): { direction_deg: number; speed_kt: number } {
  if (layers.length === 0) return { direction_deg: 0, speed_kt: 0 }
  const sorted = [...layers].sort((a, b) => a.altitude_ft - b.altitude_ft)
  if (altitude <= sorted[0].altitude_ft) return { direction_deg: sorted[0].direction_deg, speed_kt: sorted[0].speed_kt }
  const last = sorted[sorted.length - 1]
  if (altitude >= last.altitude_ft) return { direction_deg: last.direction_deg, speed_kt: last.speed_kt }

  const lower = sorted.findLast(l => l.altitude_ft <= altitude)!
  const upper = sorted.find(l => l.altitude_ft > altitude)!
  const t = (altitude - lower.altitude_ft) / (upper.altitude_ft - lower.altitude_ft)
  return {
    direction_deg: normAngle(lower.direction_deg + t * (upper.direction_deg - lower.direction_deg)),
    speed_kt: lower.speed_kt + t * (upper.speed_kt - lower.speed_kt),
  }
}
