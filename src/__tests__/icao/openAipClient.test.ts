import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromOpenAip } from '../../../src/lib/icao/openAipClient'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => mockFetch.mockReset())

const API_RESPONSE = {
  items: [{
    icaoCode: 'LFPN',
    name: 'Paris Toussus-le-Noble',
    geometry: { type: 'Point', coordinates: [2.1119, 48.7497] },
    elevation: { value: 163.98, unit: 0 },
    runways: [
      {
        designator: '25',
        trueHeading: 252,
        dimension: { length: { value: 900, unit: 1 } },
        surface: { mainComposite: 0 },
      },
      {
        designator: '07',
        trueHeading: 72,
        dimension: { length: { value: 900, unit: 1 } },
        surface: { mainComposite: 5 },
      },
    ],
  }],
}

describe('fetchFromOpenAip', () => {
  it('maps OpenAIP response to StoredAerodrome', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => API_RESPONSE,
    })

    const result = await fetchFromOpenAip('LFPN', 'test-key')

    expect(result).not.toBeNull()
    expect(result!.icao).toBe('LFPN')
    expect(result!.name).toBe('Paris Toussus-le-Noble')
    expect(result!.lat).toBeCloseTo(48.7497)
    expect(result!.lng).toBeCloseTo(2.1119)
    expect(result!.elevationFt).toBeCloseTo(538, 0)  // 163.98m * 3.28084
    expect(result!.runways).toHaveLength(2)
    expect(result!.runways[0]).toMatchObject({
      ident: '25',
      headingTrue: 252,
      lengthFt: 900,
      surface: 'hard',
    })
    expect(result!.runways[1].surface).toBe('grass')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('LFPN'),
      expect.objectContaining({ headers: { 'x-openaip-api-key': 'test-key' } })
    )
  })

  it('returns null when API returns empty items', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    expect(await fetchFromOpenAip('XXXX', 'key')).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
    expect(await fetchFromOpenAip('LFPN', 'bad-key')).toBeNull()
  })

  it('returns null on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    expect(await fetchFromOpenAip('LFPN', 'key')).toBeNull()
  })

  it('handles elevation in feet (unit=1) without conversion', async () => {
    const resp = { items: [{ ...API_RESPONSE.items[0], elevation: { value: 538, unit: 1 } }] }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => resp })
    const result = await fetchFromOpenAip('LFPN', 'key')
    expect(result!.elevationFt).toBeCloseTo(538, 0)
  })
})
