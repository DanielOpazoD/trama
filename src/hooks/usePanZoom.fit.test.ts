import { describe, expect, it } from 'vitest'
import { computeFitToView } from './usePanZoom'

/**
 * El encuadre del grafo. Los números de partida salen de una medición real:
 * con el seed de prueba, seis nodos daban una caja de centros de 247×235 y
 * una tinta de 360×336 sobre un lienzo de 1184×851. Con el techo en 1.15 la
 * tinta ocupaba el 12 % del área, idéntica a 1440×900 y a 1280×720.
 */
const LIENZO = { width: 1184, height: 851 }
const LIMITES = { minZoom: 0.25, maxZoom: 2.5 }

/** La caja de centros medida, ya inflada por GRAPH_NODE_INK (±60, −32/+55). */
const SEIS_NODOS = { minX: -183.5, minY: -149.5, maxX: 183.5, maxY: 172.5 }

describe('computeFitToView', () => {
  it('un grafo chico llena el lienzo en vez de quedarse en un racimo', () => {
    const { zoom } = computeFitToView({
      ...LIENZO,
      bbox: SEIS_NODOS,
      padding: 140,
      maxFitZoom: 2,
      ...LIMITES,
    })
    expect(zoom).toBeCloseTo(2, 1)

    // Lo que importa no es el número sino la fracción pintada: con el techo
    // viejo era el 12 % del área; acá tiene que pasar de la mitad en cada eje.
    const ancho = (SEIS_NODOS.maxX - SEIS_NODOS.minX) * zoom
    const alto = (SEIS_NODOS.maxY - SEIS_NODOS.minY) * zoom
    expect(ancho / LIENZO.width).toBeGreaterThan(0.55)
    expect(alto / LIENZO.height).toBeGreaterThan(0.7)
    // Y no puede tocar los bordes: el margen del 12 % sigue existiendo.
    expect(ancho).toBeLessThan(LIENZO.width)
    expect(alto).toBeLessThan(LIENZO.height)
  })

  it('el techo viejo (1.15) dejaba ese mismo grafo en el 12 % del área', () => {
    const { zoom } = computeFitToView({
      ...LIENZO,
      bbox: SEIS_NODOS,
      padding: 140,
      maxFitZoom: 1.15,
      ...LIMITES,
    })
    const area =
      ((SEIS_NODOS.maxX - SEIS_NODOS.minX) *
        zoom *
        ((SEIS_NODOS.maxY - SEIS_NODOS.minY) * zoom)) /
      (LIENZO.width * LIENZO.height)
    expect(zoom).toBe(1.15)
    expect(area).toBeLessThan(0.17)
  })

  it('un grafo grande no se ve afectado por el techo: manda fitScale', () => {
    // Layout by-type manda los nodos a ±2640px: ahí fitScale baja de 1 y el
    // techo es indiferente, que es la razón por la que se puede subir. A esa
    // distancia fitScale (0,12) cae incluso por debajo del piso, y manda el
    // piso; el techo no interviene ni con 1.15 ni con 2.
    const grande = { minX: -2640, minY: -2640, maxX: 2640, maxY: 2640 }
    const con2 = computeFitToView({
      ...LIENZO,
      bbox: grande,
      padding: 140,
      maxFitZoom: 2,
      ...LIMITES,
    })
    const con115 = computeFitToView({
      ...LIENZO,
      bbox: grande,
      padding: 140,
      maxFitZoom: 1.15,
      ...LIMITES,
    })
    expect(con2.zoom).toBe(con115.zoom)
    expect(con2.zoom).toBe(LIMITES.minZoom)
  })

  it('con fitScale entre el piso y el techo, manda fitScale', () => {
    // Caja de 800×600: cabe, pero no da para 2×. Ni piso ni techo intervienen.
    const { zoom } = computeFitToView({
      ...LIENZO,
      bbox: { minX: -400, minY: -300, maxX: 400, maxY: 300 },
      padding: 140,
      maxFitZoom: 2,
      ...LIMITES,
    })
    expect(zoom).toBeCloseTo((851 - 102.12 * 2) / 600, 2)
    expect(zoom).toBeGreaterThan(LIMITES.minZoom)
    expect(zoom).toBeLessThan(2)
  })

  it('un solo nodo no dispara el zoom al máximo del lienzo', () => {
    const { zoom } = computeFitToView({
      ...LIENZO,
      bbox: { minX: -60, minY: -32, maxX: 60, maxY: 55 },
      padding: 140,
      maxFitZoom: 2,
      ...LIMITES,
    })
    expect(zoom).toBe(2)
  })

  it('el centro que devuelve es el de la caja, no el origen', () => {
    const { cx, cy } = computeFitToView({
      ...LIENZO,
      bbox: { minX: 100, minY: 200, maxX: 300, maxY: 400 },
      maxFitZoom: 2,
      ...LIMITES,
    })
    expect(cx).toBe(200)
    expect(cy).toBe(300)
  })

  it('en móvil el margen se acota al 12 % y no se come el viewport', () => {
    const { zoom } = computeFitToView({
      width: 375,
      height: 700,
      bbox: SEIS_NODOS,
      padding: 140,
      maxFitZoom: 2,
      ...LIMITES,
    })
    // 375 - 2*45 = 285 útiles sobre 367 de caja → algo menos de 1.
    expect(zoom).toBeGreaterThan(0.7)
    expect(zoom).toBeLessThan(1)
  })
})
