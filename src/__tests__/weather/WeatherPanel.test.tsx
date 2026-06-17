import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WeatherPanel } from '../../features/weather/WeatherPanel'
import type { FlightDossier, FlightBranch, WeatherInputs } from '../../types'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = makeQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const baseWeather: WeatherInputs = {
  fields: {},
  winds: [],
  notes: '',
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return {
    id: 'b1',
    label: 'Aller',
    points: [],
    distanceNm: 0,
    notes: '',
    ...overrides,
  }
}

function makeDossier(branches: FlightBranch[], weather: WeatherInputs = baseWeather): FlightDossier {
  return {
    id: 'dos-1',
    name: 'Test',
    date: '2026-06-17',
    departureTime: '09:00',
    aircraft: {} as FlightDossier['aircraft'],
    branches,
    weatherInputs: weather,
    fuelInputs: {},
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    notes: '',
    createdAt: '2026-06-17T00:00:00Z',
    updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('WeatherPanel — aerodrome derivation from branches', () => {
  it('shows empty-state message when branches have no aerodromes', () => {
    const dossier = makeDossier([makeBranch({ points: [] })])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText(/Aucun aérodrome dans les branches/i)).toBeInTheDocument()
  })

  it('shows a DEP aerodrome from branches', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText('LFPN')).toBeInTheDocument()
  })

  it('shows an ARR aerodrome from branches', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('shows a DIVERT aerodrome from branches', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFOB', role: 'DIVERT' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText('LFOB')).toBeInTheDocument()
  })

  it('shows an OVERFLY aerodrome from branches', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFMN', role: 'OVERFLY' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText('LFMN')).toBeInTheDocument()
  })

  it('excludes non-AERODROME points (VOR, NDB, WAYPOINT, USER)', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [
          { id: 'p1', type: 'VOR',      identifier: 'LMG',   role: 'OVERFLY' },
          { id: 'p2', type: 'NDB',      identifier: 'GS',    role: 'OVERFLY' },
          { id: 'p3', type: 'WAYPOINT', identifier: 'MOROK', role: 'OVERFLY' },
          { id: 'p4', type: 'USER',     identifier: 'USER1', role: 'OVERFLY' },
        ],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText(/Aucun aérodrome dans les branches/i)).toBeInTheDocument()
    expect(screen.queryByText('LMG')).not.toBeInTheDocument()
    expect(screen.queryByText('GS')).not.toBeInTheDocument()
  })

  it('deduplicates the same ICAO appearing in multiple branches', () => {
    const dossier = makeDossier([
      makeBranch({
        id: 'b1',
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      }),
      makeBranch({
        id: 'b2',
        label: 'Retour',
        points: [{ id: 'p2', type: 'AERODROME', identifier: 'LFPN', role: 'ARR' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    // Should appear exactly once
    expect(screen.getAllByText('LFPN')).toHaveLength(1)
  })

  it('collects aerodromes across multiple branches', () => {
    const dossier = makeDossier([
      makeBranch({
        id: 'b1',
        points: [{ id: 'p1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      }),
      makeBranch({
        id: 'b2',
        label: 'Retour',
        points: [{ id: 'p2', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' }],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getByText('LFPN')).toBeInTheDocument()
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('deduplicates the same ICAO in different roles within the same branch', () => {
    const dossier = makeDossier([
      makeBranch({
        points: [
          { id: 'p1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' },
          { id: 'p2', type: 'AERODROME', identifier: 'LFPN', role: 'DIVERT' },
        ],
      }),
    ])
    render(
      <Wrapper>
        <WeatherPanel dossier={dossier} onUpdate={vi.fn()} />
      </Wrapper>
    )
    expect(screen.getAllByText('LFPN')).toHaveLength(1)
  })
})
