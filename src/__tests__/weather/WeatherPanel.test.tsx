import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WeatherPanel } from '../../features/weather/WeatherPanel'
import type { FlightDossier, FlightBranch, WeatherInputs, FlightAerodrome, FlightSegment } from '../../types'

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
}

const baseWeather: WeatherInputs = { fields: {}, notes: '' }

const defaultSegment: FlightSegment = {
  id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '',
}

function makeAerodrome(identifier: string, role: FlightAerodrome['role']): FlightAerodrome {
  return { id: identifier, identifier, role }
}

function makeBranch(aerodromes: FlightAerodrome[] = []): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes, segments: [defaultSegment], notes: '' }
}

function makeDossier(branches: FlightBranch[], weather: WeatherInputs = baseWeather): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: {} as FlightDossier['aircraft'],
    branches, weatherInputs: weather, fuelInputs: {},
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('WeatherPanel — aerodrome derivation from branches', () => {
  it('shows empty-state when branches have no aerodromes', () => {
    render(<Wrapper><WeatherPanel dossier={makeDossier([makeBranch([])])} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText(/Aucun aérodrome dans les branches/i)).toBeInTheDocument()
  })

  it('shows a DEP aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFPN', 'DEP')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPN')).toBeInTheDocument()
  })

  it('shows an ARR aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFPO', 'ARR')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('shows an ALTERNATE aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFOB', 'ALTERNATE')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFOB')).toBeInTheDocument()
  })

  it('shows an OVERFLY aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFMN', 'OVERFLY')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFMN')).toBeInTheDocument()
  })

  it('deduplicates the same ICAO across branches', () => {
    const dossier = makeDossier([
      makeBranch([makeAerodrome('LFPN', 'DEP')]),
      { id: 'b2', label: 'Retour', aerodromes: [makeAerodrome('LFPN', 'ARR')], segments: [defaultSegment], notes: '' },
    ])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getAllByText('LFPN')).toHaveLength(1)
  })

  it('collects aerodromes across multiple branches', () => {
    const dossier = makeDossier([
      makeBranch([makeAerodrome('LFPN', 'DEP')]),
      { id: 'b2', label: 'Retour', aerodromes: [makeAerodrome('LFPO', 'ARR')], segments: [defaultSegment], notes: '' },
    ])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPN')).toBeInTheDocument()
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })
})
