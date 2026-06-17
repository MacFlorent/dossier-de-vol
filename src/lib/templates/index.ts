import type { Aircraft } from '../../types'

export interface TemplateEntry {
  key: string
  label: string
  template: Aircraft
}

const modules = import.meta.glob('../../../resources/*.json', { eager: true })

export const TEMPLATES: TemplateEntry[] = Object.entries(modules).flatMap(([path, mod]) => {
  const aircraft = (mod as { default: Aircraft }).default
  // Skip files that don't look like aircraft templates (e.g. aerodromes.json)
  if (!aircraft?.name || !aircraft?.massBalance || !aircraft?.performance) return []
  const key = path.split('/').pop()!.replace(/\.json$/, '')
  return [{ key, label: aircraft.name, template: aircraft }]
})

export function getTemplate(key: string): Aircraft | null {
  return TEMPLATES.find(t => t.key === key)?.template ?? null
}

export function createFromTemplate(key: string, id: string): Aircraft | null {
  const entry = TEMPLATES.find(t => t.key === key)
  if (!entry) return null
  return { ...entry.template, id, registration: '' }
}
