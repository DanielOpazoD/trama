import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PdfSheetJump } from './PdfSheetJump'

/**
 * Monta el salto dentro de un área con tarjetas, como en la grilla real: el
 * componente busca la hoja por `data-page-index` colgando del contenedor de
 * scroll, así que sin ese entorno no se estaría probando nada.
 */
function montar(total: number) {
  const área = document.createElement('div')
  área.className = 'pdf-studio-canvas'
  document.body.append(área)
  const tarjetas: HTMLElement[] = []
  for (let index = 0; index < total; index += 1) {
    const card = document.createElement('div')
    card.dataset.pageIndex = String(index)
    card.tabIndex = 0
    card.scrollIntoView = vi.fn()
    área.append(card)
    tarjetas.push(card)
  }
  const anfitrión = document.createElement('div')
  área.append(anfitrión)
  render(<PdfSheetJump total={total} />, { container: anfitrión })
  return { tarjetas, limpiar: () => área.remove() }
}

function saltar(valor: string) {
  const input = screen.getByLabelText('Ir a la hoja')
  fireEvent.change(input, { target: { value: valor } })
  fireEvent.submit(input.closest('form')!)
}

describe('PdfSheetJump', () => {
  it('lleva a la hoja pedida y le deja el foco', () => {
    const { tarjetas, limpiar } = montar(90)

    saltar('72')

    expect(tarjetas[71]!.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement).toBe(tarjetas[71])
    limpiar()
  })

  it('acota un número por encima del total a la última hoja', () => {
    // Escribir 999 en un libro de 90 es un dedazo, no un error: llevar al final
    // es más útil que no hacer nada y dejar al usuario adivinando.
    const { tarjetas, limpiar } = montar(90)

    saltar('999')

    expect(tarjetas[89]!.scrollIntoView).toHaveBeenCalled()
    limpiar()
  })

  it('acota el cero y los negativos a la primera hoja', () => {
    const { tarjetas, limpiar } = montar(90)

    saltar('-4')

    expect(tarjetas[0]!.scrollIntoView).toHaveBeenCalled()
    limpiar()
  })

  it('no hace nada con un valor que no es un número', () => {
    const { tarjetas, limpiar } = montar(90)

    saltar('')

    expect(
      tarjetas.some((card) => vi.mocked(card.scrollIntoView).mock.calls.length),
    ).toBe(false)
    limpiar()
  })

  it('no rompe si la hoja pedida todavía no está en el DOM', () => {
    // La grilla puede no haber montado esa tarjeta aún. Preferimos no moverse a
    // lanzar y dejar la barra rota.
    const { limpiar } = montar(3)

    expect(() => saltar('3')).not.toThrow()
    limpiar()
  })
})
