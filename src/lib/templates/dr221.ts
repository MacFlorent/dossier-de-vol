import type { Aircraft, PerformanceTable } from '../../types'

function computeDA(pa: number, oat: number): number {
  return pa + 120 * (oat - (15 - 2 * pa / 1000))
}

function weightFactor(w: number): number {
  return 1 + 0.02 * (w - 800) / 50
}

function buildTable(baseDist: number): PerformanceTable {
  const weights = [800, 900, 1000]
  const pressureAltitudes = [0, 1000, 2000, 3000, 4000, 6000]
  const oats = [-10, 0, 15, 30, 40]

  const values = weights.map(w =>
    pressureAltitudes.map(pa =>
      oats.map(oat => {
        const da = computeDA(pa, oat)
        const daFactor = 1 + 0.12 * Math.max(0, da) / 1000
        return Math.round(baseDist * daFactor * weightFactor(w))
      })
    )
  )

  return {
    weights,
    pressureAltitudes,
    oats,
    values,
    grassFactor: 1.20,
    headwindFactor: 0.025,
    tailwindFactor: 0.02,
    slopeFactor: 0.07,
  }
}

export const DR221_TEMPLATE: Aircraft = {
  id: 'template-dr221',
  name: 'DR221',
  registration: '',
  sdReference: '',

  characteristics: {
    regimes: [
      { label: '75% puissance', ias: 108, fuelBurn: 22 },
      { label: '65% puissance', ias: 100, fuelBurn: 20 },
    ],
    fuelCapacity: 116,
  },

  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    maxWeight: 1000,
    stations: [
      { name: 'Pilote', arm: 375, maxWeight: 120 },
      { name: 'Passager', arm: 505, maxWeight: 100 },
      { name: 'Bagages', arm: 545, maxWeight: 30 },
      { name: 'Carburant', arm: 350, maxWeight: 84 },
    ],
    envelopePoints: [
      [615, 295],
      [615, 430],
      [880, 430],
      [1000, 425],
      [1000, 360],
      [880, 295],
    ],
  },

  performance: {
    toTable: buildTable(290),
    ldgTable: buildTable(480),
    factors: {
      regulatory: 1.15,
      grass: 1.20,
      headwindPerKt: 0.025,
      tailwindPerKt: 0.02,
    },
  },
}
