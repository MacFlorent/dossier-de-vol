export interface PerfTableValidation {
  errors: string[]
  warnings: string[]
}

export function validatePerformanceTable(table: unknown): PerfTableValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof table !== 'object' || table === null) {
    errors.push('Table invalide — objet JSON attendu')
    return { errors, warnings }
  }

  const t = table as Record<string, unknown>

  const axes = ['weights', 'pressureAltitudes', 'oats'] as const
  for (const ax of axes) {
    const val = t[ax]
    if (!Array.isArray(val) || val.length === 0) {
      errors.push(`Axe ${ax} manquant ou vide`)
    } else {
      for (let i = 1; i < val.length; i++) {
        if ((val[i] as number) <= (val[i - 1] as number)) {
          errors.push(`Axe ${ax} doit être trié croissant`)
          break
        }
      }
    }
  }

  if (errors.length > 0) return { errors, warnings }

  const weights = t.weights as number[]
  const pas = t.pressureAltitudes as number[]
  const oats = t.oats as number[]

  if (!Array.isArray(t.values)) {
    errors.push('values manquant')
    return { errors, warnings }
  }

  const values = t.values as number[][][]
  if (values.length !== weights.length) {
    errors.push(
      `values : dimension poids incohérente (attendu ${weights.length}, reçu ${values.length})`
    )
  } else {
    for (let wi = 0; wi < weights.length; wi++) {
      if (!Array.isArray(values[wi]) || values[wi].length !== pas.length) {
        errors.push(`values[${wi}] : dimension PA incohérente`)
      } else {
        for (let pi = 0; pi < pas.length; pi++) {
          if (!Array.isArray(values[wi][pi]) || values[wi][pi].length !== oats.length) {
            errors.push(`values[${wi}][${pi}] : dimension OAT incohérente`)
          } else {
            for (let oi = 0; oi < oats.length; oi++) {
              if (values[wi][pi][oi] <= 0) {
                errors.push(`Distance invalide à [${wi}][${pi}][${oi}] : doit être > 0`)
              }
            }
          }
        }
      }
    }
  }

  if (Array.isArray(t.grassValues)) {
    const gv = t.grassValues as number[][][]
    let dimensionsOk = gv.length === weights.length
    if (dimensionsOk) {
      for (let wi = 0; wi < weights.length && dimensionsOk; wi++) {
        if (!Array.isArray(gv[wi]) || gv[wi].length !== pas.length) {
          dimensionsOk = false
        } else {
          for (let pi = 0; pi < pas.length && dimensionsOk; pi++) {
            if (!Array.isArray(gv[wi][pi]) || gv[wi][pi].length !== oats.length) {
              dimensionsOk = false
            } else {
              for (let oi = 0; oi < oats.length; oi++) {
                if (gv[wi][pi][oi] <= 0) {
                  errors.push(`Distance invalide à grassValues[${wi}][${pi}][${oi}] : doit être > 0`)
                }
              }
            }
          }
        }
      }
    }
    if (!dimensionsOk) errors.push('grassValues : dimensions différentes de values')
  }

  if (t.weightCorrection === 'quadratic') {
    if (t.referenceWeight === undefined || t.referenceWeight === null) {
      errors.push('referenceWeight requis avec weightCorrection: quadratic')
    }
    if (weights.length > 1) {
      errors.push('quadratic attend un seul poids — utiliser interpolate pour plusieurs poids')
    }
  }

  // Warnings
  if (Array.isArray(t.grassValues) && t.grassFactor !== undefined) {
    warnings.push('grassFactor ignoré — grassValues est prioritaire')
  }

  if (Array.isArray(t.windCorrections)) {
    if (t.headwindFactor !== undefined) {
      warnings.push('headwindFactor ignoré — windCorrections est prioritaire')
    }
    if (t.tailwindFactor !== undefined) {
      warnings.push('tailwindFactor ignoré — windCorrections est prioritaire')
    }
    const wc = t.windCorrections as Array<{ speedKt: number; factor: number }>
    if (wc.length > 0 && wc[0].speedKt !== 0) {
      warnings.push('windCorrections : premier point devrait être speedKt=0, factor=1.0')
    }
    for (const pt of wc) {
      if (pt.factor > 1.0) {
        warnings.push(
          `windCorrections : facteur > 1.0 à speedKt=${pt.speedKt} — suspect pour vent de face`
        )
      }
    }
  }

  if (t.referenceWeight !== undefined && t.weightCorrection !== 'quadratic') {
    warnings.push("referenceWeight ignoré — weightCorrection n'est pas quadratic")
  }
  if (t.weightCorrectionDivisor !== undefined && t.weightCorrection !== 'quadratic') {
    warnings.push("weightCorrectionDivisor ignoré — weightCorrection n'est pas quadratic")
  }

  return { errors, warnings }
}
