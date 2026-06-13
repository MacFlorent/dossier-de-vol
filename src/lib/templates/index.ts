import type { Aircraft } from '../../types'
import { DR221_TEMPLATE } from './dr221'

export interface TemplateEntry {
  key: string
  label: string
  template: Aircraft
}

export const TEMPLATES: TemplateEntry[] = [
  { key: 'dr221', label: 'DR221', template: DR221_TEMPLATE },
]

export function getTemplate(key: string): Aircraft | null {
  return TEMPLATES.find(t => t.key === key)?.template ?? null
}

export function createFromTemplate(key: string, id: string): Aircraft | null {
  const tmpl = getTemplate(key)
  if (!tmpl) return null
  return { ...tmpl, id, registration: '' }
}
