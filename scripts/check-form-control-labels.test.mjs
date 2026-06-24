import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  checkFormControlLabels,
  collectFormControlLabels,
} from './check-form-control-labels.mjs'

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-form-labels-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  function write(relPath, source) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return { root, write }
}

const comp = (body) => `export const C = () => (${body})`

describe('collectFormControlLabels (detección)', () => {
  it('marca como SIN ETIQUETA un control con solo placeholder', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="Buscar" />'))
    const out = collectFormControlLabels(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ file: 'src/A.tsx', kind: 'input', exempt: false })
  })

  it('reconoce aria-label, aria-labelledby, title y type="hidden" como etiquetados', async () => {
    const { root, write } = await makeRepo()
    write('src/Aria.tsx', comp('<input aria-label="Nombre" />'))
    write(
      'src/By.tsx',
      comp('<><span id="l">N</span><textarea aria-labelledby="l" /></>'),
    )
    write('src/Title.tsx', comp('<select title="Tipo"><option>x</option></select>'))
    write('src/Hidden.tsx', comp('<input type="hidden" value="x" />'))
    expect(collectFormControlLabels(root)).toHaveLength(0)
  })

  it('reconoce la asociación <label htmlFor> ↔ id dentro del archivo', async () => {
    const { root, write } = await makeRepo()
    write('src/Pair.tsx', comp('<><label htmlFor="n">Nombre</label><input id="n" /></>'))
    expect(collectFormControlLabels(root)).toHaveLength(0)
  })

  it('captura el tag completo aunque un handler traiga `>` dentro de {} (extractTag)', async () => {
    const { root, write } = await makeRepo()
    // El aria-label va DESPUÉS del arrow handler: si el escaneo cortara en el
    // `>` de `=>`, no lo vería y lo contaría como sin etiqueta.
    write(
      'src/Arrow.tsx',
      comp('<input onChange={(e) => go(e.target.value)} aria-label="Filtro" />'),
    )
    expect(collectFormControlLabels(root)).toHaveLength(0)
  })

  it('excluye archivos *.test.tsx', async () => {
    const { root, write } = await makeRepo()
    write('src/Real.tsx', comp('<input placeholder="x" />'))
    write('src/Real.test.tsx', comp('<input placeholder="solo-en-test" />'))
    expect(collectFormControlLabels(root).map((e) => e.file)).toEqual(['src/Real.tsx'])
  })

  it('marca exempt:true + razón (sin el cierre `*/}`) con un marcador JSX arriba', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      [
        'export const C = () => (',
        '  <label>',
        '    {/* form-control-label-exempt: envuelto por <label> con el texto "x" */}',
        '    <input type="checkbox" />',
        '  </label>',
        ')',
      ].join('\n'),
    )
    const out = collectFormControlLabels(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      exempt: true,
      reason: 'envuelto por <label> con el texto "x"',
    })
  })
})

describe('checkFormControlLabels (ratchet)', () => {
  it('FALLA si el conteo supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="x" />'))
    const result = checkFormControlLabels({ root, baseline: 0 })
    expect(result.ok).toBe(false)
    expect(result.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="x" />'))
    expect(checkFormControlLabels({ root, baseline: 1 }).ok).toBe(true)
    const below = checkFormControlLabels({ root, baseline: 2 })
    expect(below.ok).toBe(true)
    expect(below.dropped).toBe(true)
  })

  it('un marcador form-control-label-exempt en la línea de arriba exime el control', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      [
        'export const C = () => (',
        '  <label>',
        '    Llave física',
        '    {/* form-control-label-exempt: checkbox envuelto por <label> padre */}',
        '    <input type="checkbox" />',
        '  </label>',
        ')',
      ].join('\n'),
    )
    const r = checkFormControlLabels({ root, baseline: 0 })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    expect(r.exempt).toHaveLength(1)
    expect(r.exempt[0].reason).toBe('checkbox envuelto por <label> padre')
  })

  it('FALLA con un marcador colgante (sin control sin nombre debajo)', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      [
        'export const C = () => (',
        '  <label>',
        '    {/* form-control-label-exempt: quedó huérfano tras un refactor */}',
        '    <input id="n" aria-label="ya tiene nombre" />',
        '  </label>',
        ')',
      ].join('\n'),
    )
    const r = checkFormControlLabels({ root, baseline: 0 })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.kind === 'danglingMarker')).toBe(true)
    expect(r.dangling.map((d) => d.file)).toContain('src/A.tsx')
  })
})
