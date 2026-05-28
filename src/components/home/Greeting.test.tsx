/**
 * Tests de regresión para `<Greeting />` — el header del HomeView que
 * NO usa `<ViewHeader />`. Es una excepción deliberada documentada en
 * `docs/conventions/filosofia-estetica.md` §6.1.
 *
 * Las propiedades que estos tests blindan:
 *  - h2 = fecha de hoy en serif, no la palabra "Inicio"
 *  - greeting eyebrow con `tracking-shout` (no el eyebrow estándar de
 *    `tracking-eyebrow`)
 *  - wash radial con `--accent-gold-soft` para que `useTimeOfDayAccent`
 *    haga respirar el saludo con la hora
 *  - `accent-rule` debajo del título (mismo cierre que ViewHeader)
 *
 * Si alguien intenta "normalizar" Greeting a un ViewHeader sin
 * discusión, alguno de estos tests rompe — y la falla apunta a la
 * sección de filosofía que explica por qué es una excepción.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Greeting } from './Greeting'

describe('<Greeting /> — header excepción (filosofía §6.1)', () => {
  it('h2 es la fecha de hoy (con dígitos), no la palabra "Inicio"', () => {
    render(<Greeting pendingCount={0} onNavigateToSuggestions={() => {}} />)
    const heading = screen.getByRole('heading', { level: 2 })
    // La fecha localizada incluye al menos un número (día 1-31).
    expect(heading.textContent).toMatch(/\d{1,2}/)
    // Y explícitamente NO es "Inicio" — ese era el h2 viejo, redundante
    // con el sidebar y el TopBar.
    expect(heading.textContent).not.toBe('Inicio')
  })

  it('eyebrow del greeting usa tracking-shout (no eyebrow estándar)', () => {
    const { container } = render(
      <Greeting pendingCount={0} onNavigateToSuggestions={() => {}} />,
    )
    // tracking-shout (0.3em) es ceremonial y reservado para greetings y
    // separator labels — distinto del tracking-eyebrow (0.18em) que usan
    // los section eyebrows estándar.
    const shoutEyebrow = container.querySelector('.tracking-shout')
    expect(shoutEyebrow).not.toBeNull()
    expect(shoutEyebrow!.textContent?.trim()).toBeTruthy()
  })

  it('aplica wash radial con --accent-gold-soft (time-of-day atmosphere)', () => {
    const { container } = render(
      <Greeting pendingCount={0} onNavigateToSuggestions={() => {}} />,
    )
    const header = container.querySelector('header')
    expect(header).not.toBeNull()
    const style = header!.getAttribute('style') ?? ''
    // El wash usa `var(--accent-gold-soft)` para que `useTimeOfDayAccent`
    // lo módule con la hora local. Si se reemplaza por un color fijo, la
    // identidad atmosférica del Home se pierde.
    expect(style).toContain('--accent-gold-soft')
    expect(style).toContain('radial-gradient')
  })

  it('tiene `accent-rule` debajo del título (cierre editorial canónico)', () => {
    const { container } = render(
      <Greeting pendingCount={0} onNavigateToSuggestions={() => {}} />,
    )
    expect(container.querySelector('.accent-rule')).not.toBeNull()
  })

  it('CTA de sugerencias solo aparece cuando pendingCount > 0', () => {
    const { rerender } = render(
      <Greeting pendingCount={0} onNavigateToSuggestions={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /sugerencia/i })).toBeNull()

    rerender(<Greeting pendingCount={3} onNavigateToSuggestions={() => {}} />)
    expect(
      screen.getByRole('button', { name: /3 sugerencias pendientes/i }),
    ).toBeInTheDocument()
  })
})
