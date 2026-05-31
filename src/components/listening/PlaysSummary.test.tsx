import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlaysSummary } from './PlaysSummary'

describe('<PlaysSummary />', () => {
  it('renderiza métricas agregadas y horas para el periodo', () => {
    render(
      <PlaysSummary
        periodDays={30}
        loading={false}
        summary={{
          totalPlays: 1234,
          uniqueTracks: 88,
          uniqueArtists: 23,
          uniqueAlbums: 12,
          totalMinutes: 185,
        }}
      />,
    )

    expect(
      screen.getByRole('region', { name: /Resumen de escuchas — último mes/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/3 horas de música/i)).toBeInTheDocument()
  })

  it('usa placeholders durante carga', () => {
    render(<PlaysSummary periodDays={7} loading />)

    expect(
      screen.getByRole('region', { name: /Resumen de escuchas — última semana/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.queryByText(/hora/i)).not.toBeInTheDocument()
  })
})
