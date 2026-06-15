import { TEMPLATES, createFromTemplate, getTemplate } from '../../lib/templates'

describe('TEMPLATES — autodiscovery', () => {
  it('contains at least one template', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0)
  })

  it('each template has key, label, and template fields', () => {
    for (const t of TEMPLATES) {
      expect(typeof t.key).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(t.template).toHaveProperty('id')
      expect(t.template).toHaveProperty('name')
      expect(t.template).toHaveProperty('massBalance')
      expect(t.template).toHaveProperty('performance')
    }
  })

  it('dr221 template is present', () => {
    const t = getTemplate('dr221')
    expect(t).not.toBeNull()
    expect(t!.name).toBe('DR221')
  })

  it('createFromTemplate assigns new id and clears registration', () => {
    const ac = createFromTemplate('dr221', 'new-uuid')
    expect(ac).not.toBeNull()
    expect(ac!.id).toBe('new-uuid')
    expect(ac!.registration).toBe('')
  })

  it('createFromTemplate returns null for unknown key', () => {
    expect(createFromTemplate('nonexistent', 'x')).toBeNull()
  })
})
