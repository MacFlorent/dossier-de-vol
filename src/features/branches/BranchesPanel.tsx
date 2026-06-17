import type { FlightBranch } from '../../types'

interface Props {
  branches: FlightBranch[]
  onUpdate: (branches: FlightBranch[]) => void
}

export function BranchesPanel({ branches }: Props) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-[var(--text-1)] mb-4">Branches</h2>
      <p className="text-[var(--text-muted)]">{branches.length} branche(s) — à implémenter (Task 5)</p>
    </div>
  )
}
