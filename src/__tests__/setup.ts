// Node 26 has an experimental localStorage accessor that conflicts with jsdom.
// Install a minimal Storage implementation so localStorage works in tests.
class FakeStorage implements Storage {
  private store: Record<string, string> = {}
  get length() { return Object.keys(this.store).length }
  key(index: number) { return Object.keys(this.store)[index] ?? null }
  getItem(key: string) { return this.store[key] ?? null }
  setItem(key: string, value: string) { this.store[key] = value }
  removeItem(key: string) { delete this.store[key] }
  clear() { this.store = {} }
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: new FakeStorage(),
})
