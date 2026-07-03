import { afterEach, describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  formFieldStyleDefaultsFromField,
  loadFormFieldStyleDefaults,
  parseFormFieldStyleDefaults,
  saveFormFieldStyleDefaults,
} from './pdfFormFieldStyleDefaults'

const styled = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
  sizeRatio: 0.05,
  bold: true,
  color: '#b3412c',
  bgColor: '#ffffff',
  align: 'center',
})

afterEach(() => {
  window.localStorage.clear()
})

describe('formFieldStyleDefaultsFromField', () => {
  it('captura estilo Y tamaño del cuadro (los nuevos casilleros lo replican)', () => {
    const defaults = formFieldStyleDefaultsFromField(styled)

    expect(defaults).toEqual({
      sizeRatio: 0.05,
      bold: true,
      color: '#b3412c',
      bgColor: '#ffffff',
      align: 'center',
      wRatio: 0.3,
      hRatio: 0.05,
    })
  })
})

describe('applyDefaultsToInitialBox', () => {
  it('reemplaza alto y ancho de la caja inicial con el tamaño recordado', async () => {
    const { applyDefaultsToInitialBox } = await import('./pdfFormFieldStyleDefaults')
    const base = { xRatio: 0.2, yRatio: 0.4, wRatio: 0.25, hRatio: 0.04 }

    expect(applyDefaultsToInitialBox(base, { wRatio: 0.5, hRatio: 0.1 })).toEqual({
      xRatio: 0.2,
      yRatio: 0.4,
      wRatio: 0.5,
      hRatio: 0.1,
    })
    expect(applyDefaultsToInitialBox(base, null)).toBe(base)
    expect(applyDefaultsToInitialBox(base, { bold: true })).toEqual(base)
  })
})

describe('persistencia de defaults', () => {
  it('guarda y recupera por usuario', () => {
    const defaults = formFieldStyleDefaultsFromField(styled)
    saveFormFieldStyleDefaults('user-a', defaults)

    expect(loadFormFieldStyleDefaults('user-a')).toEqual(defaults)
    expect(loadFormFieldStyleDefaults('user-b')).toBeNull()
  })

  it('guardar null limpia el default recordado', () => {
    saveFormFieldStyleDefaults('user-a', formFieldStyleDefaultsFromField(styled))
    saveFormFieldStyleDefaults('user-a', null)

    expect(loadFormFieldStyleDefaults('user-a')).toBeNull()
  })

  it('sobrevive storage corrupto sin romper', () => {
    window.localStorage.setItem(
      'trama:pdf-studio:field-style-defaults:user-a',
      '{no es json',
    )
    expect(loadFormFieldStyleDefaults('user-a')).toBeNull()
  })
})

describe('parseFormFieldStyleDefaults', () => {
  it('filtra tipos inválidos campo a campo', () => {
    expect(
      parseFormFieldStyleDefaults({
        font: 'comic-sans',
        sizeRatio: 'grande',
        bold: 'sí',
        color: 'rojo',
        bgColor: '#f2c94c',
        align: 'justify',
      }),
    ).toEqual({ bgColor: '#f2c94c' })
  })

  it('devuelve null si nada es rescatable', () => {
    expect(parseFormFieldStyleDefaults('texto')).toBeNull()
    expect(parseFormFieldStyleDefaults({ font: 'papiro' })).toBeNull()
  })
})
