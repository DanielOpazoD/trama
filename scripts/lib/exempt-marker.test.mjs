import { describe, expect, it } from 'vitest'

import { createMarkerExemption } from './exempt-marker.mjs'

describe('createMarkerExemption', () => {
  const EX = createMarkerExemption('demo-exempt')

  it('markerFor exime la construcción cuando el marcador está en la MISMA línea', () => {
    const lines = ['<x /> // demo-exempt: razón aquí']
    const m = EX.markerFor(lines, 1)
    expect(m).not.toBeNull()
    expect(EX.reasonFrom(m)).toBe('razón aquí')
  })

  it('markerFor exime cuando el marcador está en la línea de ARRIBA', () => {
    const lines = ['// demo-exempt: razón arriba', '<x />']
    const m = EX.markerFor(lines, 2)
    expect(m).not.toBeNull()
    expect(EX.reasonFrom(m)).toBe('razón arriba')
  })

  it('markerFor devuelve null si no hay marcador en la línea ni en la de arriba', () => {
    const lines = ['const a = 1', '<x />']
    expect(EX.markerFor(lines, 2)).toBeNull()
  })

  it('markerFor NO mira la línea de ABAJO (solo misma o anterior)', () => {
    const lines = ['<x />', '// demo-exempt: abajo no cuenta']
    expect(EX.markerFor(lines, 1)).toBeNull()
  })

  it('reasonFrom limpia el cierre de un comentario JSX {/* … */}', () => {
    const lines = ['{/* demo-exempt: con cierre jsx */}']
    expect(EX.reasonFrom(EX.markerFor(lines, 1))).toBe('con cierre jsx')
  })

  it('danglingLines marca un marcador sin construcción en su línea ni en la siguiente', () => {
    const lines = ['// demo-exempt: huérfano', 'const x = 1', 'const y = 2']
    expect(EX.danglingLines(lines, new Set())).toEqual([1])
  })

  it('danglingLines NO marca si hay construcción en la misma línea o en la siguiente', () => {
    expect(EX.danglingLines(['// demo-exempt: ok', '<c/>'], new Set([2]))).toEqual([])
    expect(EX.danglingLines(['<c/> // demo-exempt: ok'], new Set([1]))).toEqual([])
  })

  it('NO exime si falta la razón (marcador pelado = bypass sin justificar)', () => {
    expect(EX.markerFor(['// demo-exempt:', '<x />'], 2)).toBeNull()
    expect(EX.markerFor(['// demo-exempt', '<x />'], 2)).toBeNull()
    // JSX pelado: el cierre `*/}` NO debe colar como razón.
    expect(EX.markerFor(['{/* demo-exempt: */}', '<x />'], 2)).toBeNull()
  })

  it('danglingLines SÍ detecta un marcador pelado (sin razón) para forzar limpieza', () => {
    // No exime (no tiene razón) y, sin construcción debajo, queda colgante: el
    // gate lo caza igual y obliga a ponerle razón o quitarlo.
    expect(EX.danglingLines(['// demo-exempt:'], new Set())).toEqual([1])
    expect(EX.danglingLines(['// demo-exempt'], new Set())).toEqual([1])
  })

  it('ROBUSTEZ: la exención sobrevive a un barrido que mueve líneas', () => {
    // El marcador y la construcción son adyacentes; un barrido que inserta líneas
    // ANTES los desplaza JUNTOS, así que la exención se mantiene — justamente lo
    // que el viejo allowlist file:LÍNEA NO lograba (su número de línea quedaba
    // stale y el gate fallaba en CI).
    const before = ['// demo-exempt: pegado al código', '<x />']
    expect(EX.markerFor(before, 2)).not.toBeNull()
    const swept = ['import a from "a"', 'import b from "b"', ...before]
    // la construcción ahora está en la línea 4; el marcador la sigue en la 3.
    const m = EX.markerFor(swept, 4)
    expect(m).not.toBeNull()
    expect(EX.reasonFrom(m)).toBe('pegado al código')
  })

  it('escapa metacaracteres del keyword (el `.` es literal, no comodín)', () => {
    const dotted = createMarkerExemption('a.b-exempt')
    expect(dotted.keywordRe.test('// a.b-exempt presente')).toBe(true)
    expect(dotted.keywordRe.test('// aXb-exempt presente')).toBe(false)
  })

  it('matchea el keyword como TOKEN COMPLETO, no como subcadena', () => {
    // Un keyword embebido en otro token (pegado por palabra o guion) NO cuenta:
    // ni exime ni se detecta como colgante.
    expect(
      EX.markerFor(['// not-demo-exempt: intento de colarse', '<x />'], 2),
    ).toBeNull()
    expect(EX.markerFor(['// legacy-demo-exempt: idem', '<x />'], 2)).toBeNull()
    expect(EX.danglingLines(['// not-demo-exempt: x'], new Set())).toEqual([])
    // El marcador legítimo (token completo) sí cuenta.
    expect(EX.markerFor(['// demo-exempt: válido', '<x />'], 2)).not.toBeNull()
  })

  it('rechaza un keyword vacío', () => {
    expect(() => createMarkerExemption('')).toThrow()
  })
})
