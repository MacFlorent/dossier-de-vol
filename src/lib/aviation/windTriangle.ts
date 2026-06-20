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

export interface SegmentWindResult {
  gs: number   // vitesse sol (kt) — peut être négative
  wca: number  // angle de correction vent (°), positif = à droite
}

/**
 * Calcule GS et WCA pour un segment depuis le cap magnétique et le vent magnétique.
 * Tous les angles en °M. GS non bornée (une GS négative signale une erreur de saisie).
 */
export function computeSegmentWind(
  headingMag: number,
  tas: number,
  windDirMag: number,
  windSpeedKt: number,
): SegmentWindResult {
  if (windSpeedKt === 0) return { gs: tas, wca: 0 }
  const angleRad = ((windDirMag - headingMag) * Math.PI) / 180
  const headwindComponent = windSpeedKt * Math.cos(angleRad)
  const gs = tas - headwindComponent
  const sinWca = (windSpeedKt * Math.sin(angleRad)) / tas
  const wca = Math.asin(Math.max(-1, Math.min(1, sinWca))) * (180 / Math.PI)
  return {
    gs: Math.round(gs * 10) / 10,
    wca: Math.round(wca * 10) / 10,
  }
}
