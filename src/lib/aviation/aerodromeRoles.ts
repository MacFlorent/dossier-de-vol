import type { FlightAerodrome } from '../../types'

export type AeroRole = FlightAerodrome['role']

export const ROLE_LABELS: Record<AeroRole, string> = { DEP: 'DEP', ARR: 'ARR', ALTERNATE: 'ALT', OVERFLY: 'OVFL' }
export const ROLE_COLORS: Record<AeroRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', ALTERNATE: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}
export const ROLE_CYCLE: AeroRole[] = ['DEP', 'ARR', 'ALTERNATE', 'OVERFLY']
