import { describe, expect, it } from 'vitest'
import {
  BEGIN,
  END,
  STAT_TOLERANCE,
  extractEmbedded,
  findMapIssues,
  measureRepo,
} from './architecture-map.mjs'

/** Mapa mínimo pero VÁLIDO: cada test rompe una sola cosa y comprueba que el
 *  gate la nombre. Si el gate dejara de mirar algo, el test correspondiente se
 *  pondría verde con el mapa roto — por eso cada uno afirma también que el
 *  mapa base no produce ese código. */
function mapaBase() {
  return {
    meta: {
      stats: { endpoints: 100, migraciones: 90, specsE2E: 30, scriptsOperacionales: 120 },
      layers: [
        { id: 'ui', label: 'UI', color: '#111' },
        { id: 'db', label: 'Datos', color: '#222' },
      ],
    },
    nodes: [
      {
        id: 'a',
        label: 'A',
        layer: 'ui',
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        files: ['src/a.ts'],
      },
      {
        id: 'b',
        label: 'B',
        layer: 'db',
        x: 200,
        y: 0,
        w: 100,
        h: 50,
        files: ['src/b.ts'],
      },
    ],
    edges: [{ from: 'a', to: 'b', kind: 'data' }],
    flows: [
      {
        id: 'f1',
        label: 'Flujo',
        summary: 'x',
        steps: [
          { node: 'a', label: 'primero', file: 'src/a.ts' },
          { node: 'b', label: 'después', file: 'src/b.ts' },
        ],
      },
    ],
  }
}

/** Clon profundo sin `structuredClone`: el entorno de lint de scripts/ no lo
 *  declara como global y estos fixtures son JSON plano. */
const clonar = (x) => JSON.parse(JSON.stringify(x))

const REAL = { endpoints: 100, migraciones: 90, specsE2E: 30, scriptsOperacionales: 120 }
const TODO_EXISTE = () => true

function correr(
  map,
  { exists = TODO_EXISTE, embedded = undefined, measured = REAL } = {},
) {
  return findMapIssues({
    map,
    embedded: embedded === undefined ? clonar(map) : embedded,
    exists,
    measured,
  })
}

const codigos = (issues) => issues.map((i) => i.code)

describe('findMapIssues', () => {
  it('un mapa íntegro y sincronizado no reporta nada', () => {
    expect(correr(mapaBase())).toEqual([])
  })

  it('caza el archivo citado que ya no existe — la podredumbre que motiva el gate', () => {
    const issues = correr(mapaBase(), { exists: (f) => f !== 'src/b.ts' })
    expect(codigos(issues)).toContain('archivo-inexistente')
    // El mensaje tiene que decir QUIÉN lo cita, o no se puede arreglar.
    const msg = issues.find((i) => i.code === 'archivo-inexistente').message
    expect(msg).toContain('src/b.ts')
    expect(msg).toContain('nodo "b"')
    expect(msg).toContain('flujo "f1" paso 2')
  })

  it('caza una arista que apunta a un nodo inexistente', () => {
    const map = mapaBase()
    map.edges.push({ from: 'a', to: 'fantasma', kind: 'data' })
    expect(codigos(correr(map))).toContain('arista-rota')
  })

  it('caza un paso de flujo que apunta a un nodo inexistente', () => {
    const map = mapaBase()
    map.flows[0].steps.push({ node: 'fantasma', label: 'z', file: 'src/a.ts' })
    expect(codigos(correr(map))).toContain('paso-roto')
  })

  it('caza ids duplicados', () => {
    const map = mapaBase()
    map.nodes.push({ ...map.nodes[0], x: 400 })
    expect(codigos(correr(map))).toContain('nodo-duplicado')
  })

  it('caza una capa que no está declarada en meta.layers', () => {
    const map = mapaBase()
    map.nodes[1].layer = 'inventada'
    expect(codigos(correr(map))).toContain('capa-desconocida')
  })

  it('caza un nodo sin ninguna arista: o sobra, o falta su relación', () => {
    const map = mapaBase()
    map.nodes.push({
      id: 'c',
      label: 'C',
      layer: 'ui',
      x: 400,
      y: 0,
      w: 100,
      h: 50,
      files: [],
    })
    expect(codigos(correr(map))).toContain('nodo-suelto')
  })

  it('caza dos cajas dibujadas una encima de la otra', () => {
    const map = mapaBase()
    map.nodes[1].x = 50 // se mete dentro de la caja de "a"
    expect(codigos(correr(map))).toContain('cajas-solapadas')
  })

  it('caza el HTML que quedó con una versión vieja del grafo', () => {
    const map = mapaBase()
    const viejo = clonar(map)
    viejo.nodes[0].purpose = 'algo que ya no dice el JSON'
    const issues = correr(map, { embedded: viejo })
    expect(codigos(issues)).toContain('html-desincronizado')
    expect(issues.find((i) => i.code === 'html-desincronizado').message).toContain(
      'architecture-map:build',
    )
  })

  it('caza el HTML sin marcadores (no se pudo extraer el grafo)', () => {
    expect(codigos(correr(mapaBase(), { embedded: null }))).toContain(
      'html-sin-marcadores',
    )
  })

  it('un contador que envejeció dentro de la banda NO molesta', () => {
    const map = mapaBase()
    const real = {
      ...REAL,
      endpoints: REAL.endpoints + Math.floor(REAL.endpoints * STAT_TOLERANCE),
    }
    expect(codigos(correr(map, { measured: real }))).not.toContain('stat-obsoleta')
  })

  it('un contador de otra era SÍ falla', () => {
    const map = mapaBase()
    const real = { ...REAL, endpoints: REAL.endpoints * 2 }
    const issues = correr(map, { measured: real })
    expect(codigos(issues)).toContain('stat-obsoleta')
    expect(issues.find((i) => i.code === 'stat-obsoleta').message).toContain('200')
  })

  it('un mapa que no es un grafo se rechaza sin explotar', () => {
    expect(
      codigos(
        findMapIssues({ map: null, embedded: null, exists: TODO_EXISTE, measured: REAL }),
      ),
    ).toContain('mapa-ilegible')
    const codes = codigos(
      findMapIssues({
        map: { meta: {} },
        embedded: null,
        exists: TODO_EXISTE,
        measured: REAL,
      }),
    )
    expect(codes).toContain('mapa-incompleto')
  })
})

describe('extractEmbedded', () => {
  it('recupera el grafo embebido entre los marcadores', () => {
    const html = `<script>\n${BEGIN}\n      const DATA = {"nodes":[{"id":"a"}]};\n      ${END}\n</script>`
    expect(extractEmbedded(html)).toEqual({ nodes: [{ id: 'a' }] })
  })

  it('devuelve null si faltan los marcadores o el bloque no es JSON', () => {
    expect(extractEmbedded('<script>const DATA = {};</script>')).toBeNull()
    expect(extractEmbedded(`${BEGIN} const DATA = no-es-json; ${END}`)).toBeNull()
  })
})

describe('measureRepo', () => {
  it('cuenta el repo de verdad, no una constante', () => {
    const m = measureRepo()
    // Cotas amplias a propósito: esto prueba que MIRA el disco, y el gate ya
    // compara contra el mapa con su propia tolerancia.
    expect(m.endpoints).toBeGreaterThan(50)
    expect(m.migraciones).toBeGreaterThan(50)
    expect(m.specsE2E).toBeGreaterThan(10)
    expect(m.scriptsOperacionales).toBeGreaterThan(50)
  })
})
