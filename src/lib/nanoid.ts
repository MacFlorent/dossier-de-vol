/** ID unique court (crypto.randomUUID simplifié) */
export function nanoid(): string {
  return crypto.randomUUID()
}
