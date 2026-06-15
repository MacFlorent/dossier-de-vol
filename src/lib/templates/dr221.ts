import type { Aircraft, PerformanceTable } from '../../types'

function buildTable(baseDist: number): PerformanceTable {
  const weights = [800, 900, 1000]
  const pressureAltitudes = [0, 1000, 2000, 3000, 4000, 6000]
  const oats = [-10, 0, 15, 30, 40]

  const values = weights.map(w =>
    pressureAltitudes.map(pa =>
      oats.map(oat => {
        const isa = 15 - 2 * pa / 1000
        const da = pa + (oat - isa) * 120
        const daFactor = 1 + 0.12 * Math.max(0, da) / 1000
        const wFactor = 1 + 0.02 * (w - 800) / 50
        return Math.round(baseDist * daFactor * wFactor)
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
      { name: 'Pilote', arm: 375, kind: 'dry' },
      { name: 'Passager', arm: 505, kind: 'dry' },
      { name: 'Bagages', arm: 545, kind: 'dry' },
      { name: 'Carburant', arm: 350, kind: 'fuel' },
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
  },
}
