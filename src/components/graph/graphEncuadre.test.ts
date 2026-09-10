import { describe, expect, it } from 'vitest'
import { computeFitToView } from '../../hooks/usePanZoom'
import { GRAPH_NODE_INK } from './GraphNode'
import { computePositionBounds } from './graphViewModel'
import { FIT_MAX_ZOOM, graphFitBounds } from './useGraphViewport'

/**
 * El encuadre de punta a punta: posiciones → caja inflada por la tinta → zoom.
 *
 * Existe porque la sonda de `computeFitToView` sola pasaba por trivialidad: le
 * pasábamos la caja y el techo a mano, así que devolver el techo viejo (1.15)
 * o dejar de inflar la caja no la rompía. Esta afirma la CADENA que usa
 * `useGraphViewport`, con sus constantes de producción.
 */

/** Las seis posiciones del seed de prueba (caja de centros 247×235). */
const SEIS = new Map([
  ['borges', { x: -6, y: 0 }],
  ['cortazar', { x: -3, y: -147 }],
  ['ficciones', { x: 141, y: -44 }],
  ['rayuela', { x: -88, y: 88 }],
  ['laberinto', { x: 86, y: 88 }],
  ['radiohead', { x: -123, y: -32 }],
])

const LIENZO = { width: 1184, height: 851 }
const LIMITES = { minZoom: 0.25, maxZoom: 2.5 }

function encuadrar(techo = FIT_MAX_ZOOM) {
  const bbox = graphFitBounds(SEIS)
  if (!bbox) throw new Error('sin caja')
  const { zoom } = computeFitToView({
    ...LIENZO,
    bbox,
    padding: 140,
    maxFitZoom: techo,
    ...LIMITES,
  })
  return {
    zoom,
    fraccionAncho: ((bbox.maxX - bbox.minX) * zoom) / LIENZO.width,
    fraccionAlto: ((bbox.maxY - bbox.minY) * zoom) / LIENZO.height,
  }
}

describe('encuadre del grafo (cadena completa)', () => {
  it('seis nodos llenan más de la mitad del lienzo, sin tocar los bordes', () => {
    const { fraccionAncho, fraccionAlto } = encuadrar()
    expect(fraccionAncho).toBeGreaterThan(0.5)
    expect(fraccionAlto).toBeGreaterThan(0.6)
    expect(fraccionAncho).toBeLessThan(1)
    expect(fraccionAlto).toBeLessThan(1)
  })

  it('con el techo viejo se quedaba en un racimo: menos del 20 % del área', () => {
    const viejo = encuadrar(1.15)
    expect(viejo.fraccionAncho * viejo.fraccionAlto).toBeLessThan(0.2)
    // Y la mejora es real, no un empate.
    const nuevo = encuadrar()
    expect(nuevo.fraccionAncho * nuevo.fraccionAlto).toBeGreaterThan(
      viejo.fraccionAncho * viejo.fraccionAlto * 2,
    )
  })

  it('la caja de la tinta es mayor y su centro cae más abajo que la de centros', () => {
    const sinTinta = computePositionBounds(SEIS)
    const conTinta = graphFitBounds(SEIS)
    if (!sinTinta || !conTinta) throw new Error('sin caja')
    // Exacto, no «mayor»: cada borde crece justo lo que pinta ese lado. Una
    // afirmación cualitativa deja pasar que se olvide inflar UN borde.
    expect(conTinta.minX).toBe(sinTinta.minX - GRAPH_NODE_INK.side)
    expect(conTinta.maxX).toBe(sinTinta.maxX + GRAPH_NODE_INK.side)
    expect(conTinta.minY).toBe(sinTinta.minY - GRAPH_NODE_INK.up)
    expect(conTinta.maxY).toBe(sinTinta.maxY + GRAPH_NODE_INK.down)
    // Las etiquetas cuelgan debajo del disco, así que el centro del DIBUJO
    // está más abajo que el centro de los centros. Encuadrar por el segundo
    // deja el grafo montado hacia arriba.
    expect((conTinta.minY + conTinta.maxY) / 2).toBeGreaterThan(
      (sinTinta.minY + sinTinta.maxY) / 2,
    )
  })

  it('cuando el techo no manda, ignorar la tinta recorta el dibujo', () => {
    // Con seis nodos el techo (2) vincula antes y tapa el error. El caso que
    // lo destapa es un grafo mediano, donde manda `fitScale`: si se encuadra
    // contra la caja de centros, el zoom sale mayor de lo que cabe y las
    // etiquetas de los bordes se salen del lienzo.
    const medio = new Map([
      ['a', { x: -400, y: -300 }],
      ['b', { x: 400, y: 300 }],
    ])
    const util = { ancho: LIENZO.width - 280, alto: LIENZO.height - 204 }

    const conTinta = graphFitBounds(medio)
    const sinTinta = computePositionBounds(medio)
    if (!conTinta || !sinTinta) throw new Error('sin caja')

    const zoomBien = computeFitToView({
      ...LIENZO,
      bbox: conTinta,
      padding: 140,
      maxFitZoom: FIT_MAX_ZOOM,
      ...LIMITES,
    }).zoom
    const zoomMal = computeFitToView({
      ...LIENZO,
      bbox: sinTinta,
      padding: 140,
      maxFitZoom: FIT_MAX_ZOOM,
      ...LIMITES,
    }).zoom
    expect(zoomMal).toBeGreaterThan(zoomBien)

    const tintaReal = {
      ancho: conTinta.maxX - conTinta.minX,
      alto: conTinta.maxY - conTinta.minY,
    }
    // Bien encuadrado cabe…
    expect(tintaReal.ancho * zoomBien).toBeLessThanOrEqual(util.ancho + 1)
    expect(tintaReal.alto * zoomBien).toBeLessThanOrEqual(util.alto + 1)
    // …y sin inflar, no: el dibujo real desborda el área útil.
    expect(tintaReal.alto * zoomMal).toBeGreaterThan(util.alto)
  })

  it('el techo de producción es 2 y cabe bajo el máximo de zoom', () => {
    expect(FIT_MAX_ZOOM).toBe(2)
    expect(FIT_MAX_ZOOM).toBeLessThanOrEqual(LIMITES.maxZoom)
    // Y la tinta no es simétrica: las etiquetas cuelgan, así que abajo pinta
    // más que arriba. Si alguien la iguala, el encuadre vuelve a montarse.
    expect(GRAPH_NODE_INK.down).toBeGreaterThan(GRAPH_NODE_INK.up)
    expect(GRAPH_NODE_INK.side).toBeGreaterThan(0)
  })
})
