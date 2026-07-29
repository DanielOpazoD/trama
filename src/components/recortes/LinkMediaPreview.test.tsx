import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { cajaDeFoto, LinkMediaPreview } from './LinkMediaPreview'

describe('<LinkMediaPreview />', () => {
  it('acota el ancho del marco según el tamaño elegido', () => {
    const { rerender } = render(<LinkMediaPreview imageUrl="/x.png" size="pequena" />)
    expect(screen.getByTestId('link-media-image').parentElement).toHaveClass(
      'max-w-[150px]',
    )
    rerender(<LinkMediaPreview imageUrl="/x.png" size="mediana" />)
    expect(screen.getByTestId('link-media-image').parentElement).toHaveClass(
      'max-w-[260px]',
    )
    // 'grande' no acota (ancho completo, comportamiento histórico).
    rerender(<LinkMediaPreview imageUrl="/x.png" size="grande" />)
    const frame = screen.getByTestId('link-media-image').parentElement!
    expect(frame.className).not.toContain('max-w-[')
  })

  it('imagen propia (sin href) abre el visor con doble clic y con teclado', async () => {
    const onOpenImage = vi.fn()
    render(<LinkMediaPreview imageUrl="/x.png" onOpenImage={onOpenImage} />)
    const frame = screen.getByRole('button', { name: /ampliar imagen/i })

    await userEvent.dblClick(frame)
    expect(onOpenImage).toHaveBeenCalledTimes(1)

    frame.focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpenImage).toHaveBeenCalledTimes(2)
  })

  it('un solo clic NO abre el visor (solo doble clic)', async () => {
    const onOpenImage = vi.fn()
    render(<LinkMediaPreview imageUrl="/x.png" onOpenImage={onOpenImage} />)
    await userEvent.click(screen.getByRole('button', { name: /ampliar imagen/i }))
    expect(onOpenImage).not.toHaveBeenCalled()
  })

  it('con href, es un enlace y NO usa el visor (gana el original)', () => {
    const onOpenImage = vi.fn()
    render(
      <LinkMediaPreview
        imageUrl="/x.png"
        href="https://example.com"
        onOpenImage={onOpenImage}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

/**
 * Una foto propia no puede recortarse para caber en un marco.
 *
 * El marco era `aspect-[16/9]` + `object-cover` para todo. Correcto para la
 * imagen de un enlace —el sitio la publica en 16:9 en su Open Graph, así que
 * encajarla ahí la muestra entera— y destructivo para una foto: una vertical de
 * móvil (3:4) recortada a 16:9 pierde más de la mitad del alto, y lo que se
 * recorta es la franja central, que es donde suele estar lo fotografiado.
 *
 * La caja se calcula en vez de dejarla al dimensionado implícito del navegador
 * porque ahí hay dos trampas encadenadas, ambas vistas en pantalla:
 *
 *  1. `w-fit` en el marco con un tope en porcentaje en la imagen se definen el
 *     uno al otro, y el navegador resuelve el ciclo en cero: la miniatura
 *     desaparecía entera.
 *  2. Una `<img>` sin cargar mide cero, y `loading="lazy"` no carga lo que mide
 *     cero — se quedaba esperándose a sí misma para siempre.
 */
describe('cajaDeFoto', () => {
  const mediana = { ancho: 260, alto: 220 }

  it('conserva la proporción de una foto horizontal', () => {
    const caja = cajaDeFoto({ width: 4000, height: 3000 }, mediana)
    expect(caja.width / caja.height).toBeCloseTo(4 / 3, 2)
    expect(caja.width).toBeLessThanOrEqual(mediana.ancho)
    expect(caja.height).toBeLessThanOrEqual(mediana.alto)
  })

  /** El caso que motivó todo: la foto vertical de un móvil. */
  it('conserva la proporción de una foto vertical', () => {
    const caja = cajaDeFoto({ width: 3024, height: 4032 }, mediana)
    expect(caja.width / caja.height).toBeCloseTo(3 / 4, 2)
    expect(caja.height).toBeLessThanOrEqual(mediana.alto)
    // Y no se estira a lo ancho para rellenar el marco.
    expect(caja.width).toBeLessThan(mediana.ancho)
  })

  it('encoge por el lado que se pasa, no por los dos', () => {
    const pano = cajaDeFoto({ width: 3000, height: 500 }, mediana)
    expect(pano.width).toBe(mediana.ancho)
    expect(pano.height).toBeLessThan(mediana.alto)

    const alta = cajaDeFoto({ width: 500, height: 3000 }, mediana)
    expect(alta.height).toBe(mediana.alto)
    expect(alta.width).toBeLessThan(mediana.ancho)
  })

  /** Ampliar una miniatura pequeña la deja borrosa: mejor pequeña y nítida. */
  it('nunca amplía una foto más pequeña que el tope', () => {
    expect(cajaDeFoto({ width: 80, height: 60 }, mediana)).toEqual({
      width: 80,
      height: 60,
    })
  })

  /**
   * Antes de cargar no se conocen las dimensiones. Devolver cero dejaría el
   * marco colapsado, el esqueleto invisible y la imagen sin cargar por medir
   * cero — el bloqueo mutuo de arriba.
   */
  it('sin dimensiones devuelve una caja reservada, nunca cero', () => {
    for (const natural of [
      { width: 0, height: 0 },
      { width: 0, height: 100 },
      { width: 100, height: 0 },
      { width: Number.NaN, height: Number.NaN },
    ]) {
      const caja = cajaDeFoto(natural, mediana)
      expect(caja.width, JSON.stringify(natural)).toBeGreaterThan(0)
      expect(caja.height, JSON.stringify(natural)).toBeGreaterThan(0)
    }
  })
})

describe('<LinkMediaPreview /> — encuadre según el tipo de imagen', () => {
  it('un enlace vive en su 16:9', () => {
    render(<LinkMediaPreview imageUrl="/og.png" host="ejemplo.test" />)
    const marco = screen.getByTestId('link-media-image')
    expect(marco.className).toMatch(/aspect-\[16\/9\]/)
    // La proporción la fija el marco: no hay caja calculada que imponer.
    expect(marco.getAttribute('style')).toBeFalsy()
  })

  it('una foto no se encaja en 16:9 y trae su caja reservada', () => {
    render(<LinkMediaPreview imageUrl="blob:foto" encuadre="foto" />)
    const marco = screen.getByTestId('link-media-image')
    expect(marco.className).not.toMatch(/aspect-\[16\/9\]/)
    expect(marco.getAttribute('style')).toMatch(/width:\s*160px/)
    expect(marco.getAttribute('style')).toMatch(/height:\s*96px/)
  })

  /**
   * La imagen llena SIEMPRE su caja. En una foto la caja ya lleva su
   * proporción, así que `object-cover` no recorta nada; y llenarla es lo que
   * impide que `loading="lazy"` espere a un elemento de tamaño cero.
   */
  it('la imagen nunca queda sin tamaño mientras carga', () => {
    render(<LinkMediaPreview imageUrl="blob:foto" encuadre="foto" imageAlt="Una foto" />)
    const img = screen.getByAltText('Una foto')
    expect(img.className).toMatch(/h-full/)
    expect(img.className).toMatch(/w-full/)
  })
})
