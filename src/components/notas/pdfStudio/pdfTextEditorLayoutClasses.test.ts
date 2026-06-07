import { describe, expect, it } from 'vitest'
import { pdfTextEditorBodyClass } from './pdfTextEditorLayoutClasses'

describe('pdfTextEditorBodyClass', () => {
  it('mantiene el cuerpo del editor como flex para que el visor tenga scroll real', () => {
    expect(pdfTextEditorBodyClass(false).split(' ')).toEqual(
      expect.arrayContaining(['min-h-0', 'flex', 'flex-1', 'flex-col']),
    )
  })

  it('mantiene el modo relleno como layout flex con panel lateral', () => {
    expect(pdfTextEditorBodyClass(true).split(' ')).toEqual(
      expect.arrayContaining(['min-h-0', 'flex', 'flex-1', 'flex-col', 'md:flex-row']),
    )
  })
})
