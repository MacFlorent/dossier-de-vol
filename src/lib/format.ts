export function formatDuration(min: number): string {
  if (!isFinite(min)) return '∞'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h${String(m).padStart(2, '0')}`
}
