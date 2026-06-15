import { describe, it, expect } from 'vitest'
import { bold, italic, quote, link } from './markdownFormat'

describe('bold', () => {
  it('envuelve la selección en **…** y selecciona el texto interno', () => {
    const r = bold('hola mundo', 0, 4)
    expect(r.value).toBe('**hola** mundo')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('hola')
  })

  it('toggle off cuando la selección ya está envuelta', () => {
    const r = bold('**hola** mundo', 0, 8)
    expect(r.value).toBe('hola mundo')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('hola')
  })

  it('toggle off cuando los marcadores quedan justo por fuera de la selección', () => {
    // Selección = "hola" (sin los **), con ** a cada lado.
    const r = bold('**hola** mundo', 2, 6)
    expect(r.value).toBe('hola mundo')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('hola')
  })

  it('envuelve selección vacía (inserta marcadores con caret en medio)', () => {
    const r = bold('ab', 1, 1)
    expect(r.value).toBe('a****b')
    expect(r.selStart).toBe(r.selEnd)
  })
})

describe('italic', () => {
  it('envuelve la selección en _…_', () => {
    const r = italic('hola mundo', 5, 10)
    expect(r.value).toBe('hola _mundo_')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('mundo')
  })

  it('toggle off cuando la selección ya está en cursiva', () => {
    const r = italic('_mundo_', 0, 7)
    expect(r.value).toBe('mundo')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('mundo')
  })

  it('usa `_` y no choca con la negrita `**` adyacente', () => {
    // La cursiva con `_` envuelve limpio aunque haya negrita `**` al lado: el
    // renderer italiza `_…_` y reserva `*` para `**negrita**`.
    const r = italic('**hola** x', 9, 10)
    expect(r.value).toBe('**hola** _x_')
  })
})

describe('quote', () => {
  it('prefija una sola línea con "> "', () => {
    const r = quote('una linea', 0, 9)
    expect(r.value).toBe('> una linea')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('> una linea')
  })

  it('prefija varias líneas seleccionadas', () => {
    const src = 'uno\ndos\ntres'
    const r = quote(src, 0, src.length)
    expect(r.value).toBe('> uno\n> dos\n> tres')
  })

  it('toggle off cuando todas las líneas ya están citadas', () => {
    const src = '> uno\n> dos'
    const r = quote(src, 0, src.length)
    expect(r.value).toBe('uno\ndos')
  })

  it('expande a línea completa aunque la selección empiece a mitad', () => {
    const src = 'hola mundo'
    const r = quote(src, 5, 7) // selecciona "mu"
    expect(r.value).toBe('> hola mundo')
  })

  it('no arrastra la línea siguiente cuando la selección termina en salto', () => {
    const src = 'uno\ndos'
    // Selecciona "uno\n" (incluye el salto).
    const r = quote(src, 0, 4)
    expect(r.value).toBe('> uno\ndos')
  })
})

describe('link', () => {
  it('convierte la selección en [sel](https://) y selecciona la url', () => {
    const r = link('ver Trama', 4, 9)
    expect(r.value).toBe('ver [Trama](https://)')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('https://')
  })

  it('sin selección inserta [](https://) con la url seleccionada', () => {
    const r = link('', 0, 0)
    expect(r.value).toBe('[](https://)')
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('https://')
  })
})
