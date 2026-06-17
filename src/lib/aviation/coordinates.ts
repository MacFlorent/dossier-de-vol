const R_NM = 3440.065  // rayon terrestre en milles nautiques

function toRad(deg: number): number { return (deg * Math.PI) / 180 }
function toDeg(rad: number): number { return (rad * 180) / Math.PI }

/** Distance orthodromique entre deux points (milles nautiques) */
export function distanceNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lng2 - lng1)
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * Math.asin(Math.sqrt(a)) * R_NM
}

/** Cap initial (°V) du point 1 vers le point 2 [0–360] */
export function trueCourse(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Normalise un angle dans [0, 360) */
export function normAngle(deg: number): number { return ((deg % 360) + 360) % 360 }

/** Composante de vent face à une piste (kt). Positif = vent de face, négatif = vent de dos. */
export function headwindKt(
  windDirTrue: number,
  windSpeedKt: number,
  runwayHeadingTrue: number,
): number {
  const angle = ((windDirTrue - runwayHeadingTrue) + 360) % 360
  return Math.round(windSpeedKt * Math.cos(angle * Math.PI / 180))
}
