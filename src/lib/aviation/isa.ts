/**
 * Altitude-pression (PA) depuis l'altitude-pression de calage (QNH).
 * Approximation : +27 ft par hPa d'écart à 1013 hPa.
 */
export function pressureAltitude(altitudeFt: number, qnh: number): number {
  return altitudeFt + 27 * (1013 - qnh)
}

/** Déviation ISA : OAT − température ISA à cette altitude */
export function isaDeviation(altitudeFt: number, oat: number): number {
  const isaTemp = 15 - 2 * (altitudeFt / 1000)
  return oat - isaTemp
}

/** Densité relative en fonction de PA et OAT (ratio σ = ρ/ρ₀) */
export function densityRatio(pressureAlt: number, oat: number): number {
  const T = oat + 273.15
  const T0 = 288.15
  const p = (1 - pressureAlt * 6.8755856e-6) ** 5.2558797
  return p * (T0 / T)
}

/** Altitude-densité depuis PA et OAT */
export function densityAltitude(pressureAlt: number, oat: number): number {
  const σ = densityRatio(pressureAlt, oat)
  return pressureAlt + (1 - σ) * 145366
}
