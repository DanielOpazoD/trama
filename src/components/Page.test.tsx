import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Page, PageFill } from './Page'

describe('<Page />', () => {
  it('pone el carril de lectura y el ritmo de sección por defecto', () => {
    render(
      <Page>
        <p>cuerpo</p>
      </Page>,
    )
    const page = screen.getByText('cuerpo').parentElement
    expect(page).toHaveAttribute('data-page')
    expect(page?.className).toContain('max-w-3xl')
    expect(page?.className).toContain('gap-ritmo-seccion')
  })

  it('el carril de taller es más ancho y aprieta el padding en móvil', () => {
    render(
      <Page width="workbench">
        <p>c</p>
      </Page>,
    )
    const page = screen.getByText('c').parentElement
    expect(page?.className).toContain('max-w-5xl')
    expect(page?.className).toContain('px-5')
    expect(page?.className).toContain('md:px-8')
  })

  it('align="fill" reclama el alto sobrante; "top" no', () => {
    const { rerender } = render(
      <Page align="fill">
        <p>c</p>
      </Page>,
    )
    expect(screen.getByText('c').parentElement?.className).toContain('flex-1')
    rerender(
      <Page align="top">
        <p>c</p>
      </Page>,
    )
    expect(screen.getByText('c').parentElement?.className).not.toContain('flex-1')
    expect(screen.getByText('c').parentElement).toHaveAttribute('data-page-align', 'top')
  })

  it('el ritmo tiene dos roles y se puede apagar', () => {
    const { rerender } = render(
      <Page rhythm="block">
        <p>c</p>
      </Page>,
    )
    expect(screen.getByText('c').parentElement?.className).toContain('gap-ritmo-bloque')
    rerender(
      <Page rhythm="none">
        <p>c</p>
      </Page>,
    )
    const clases = screen.getByText('c').parentElement?.className ?? ''
    expect(clases).not.toContain('gap-ritmo')
  })
})

describe('<PageFill />', () => {
  it('crece con flex-1 A SECAS: con min-h-0 el caso vacío colapsaría', () => {
    render(
      <PageFill>
        <p>hoja</p>
      </PageFill>,
    )
    const fill = screen.getByText('hoja').parentElement
    expect(fill).toHaveAttribute('data-page-fill')
    expect(fill?.className).toContain('flex-1')
    expect(fill?.className).not.toContain('min-h-0')
  })

  it('center usa márgenes automáticos, no justify-center', () => {
    render(
      <PageFill center>
        <p>hoja</p>
      </PageFill>,
    )
    // `justify-center` deja lo de arriba en coordenadas negativas cuando el
    // contenido no cabe; `m-auto` solo reparte lo que sobra.
    const envoltorio = screen.getByText('hoja').parentElement
    expect(envoltorio?.className).toContain('m-auto')
    const fill = envoltorio?.parentElement
    expect(fill?.className).not.toContain('justify-center')
  })
})
