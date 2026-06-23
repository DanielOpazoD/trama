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

describe('collectFormControlLabels', () => {
  it('marca como SIN ETIQUETA un control con solo placeholder', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="Buscar" />'))
    const out = collectFormControlLabels(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ file: 'src/A.tsx', kind: 'input' })
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
})

// Los tests pasan `exempt: new Map()` para aislarse del FORM_CONTROL_LABEL_EXEMPT
// real (sus entradas serían "stale" contra estos repos-fixture).
describe('checkFormControlLabels (ratchet)', () => {
  const noExempt = new Map()

  it('FALLA si el conteo supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="x" />'))
    const result = checkFormControlLabels({ root, baseline: 0, exempt: noExempt })
    expect(result.ok).toBe(false)
    expect(result.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="x" />'))
    expect(checkFormControlLabels({ root, baseline: 1, exempt: noExempt }).ok).toBe(true)
    const below = checkFormControlLabels({ root, baseline: 2, exempt: noExempt })
    expect(below.ok).toBe(true)
    expect(below.dropped).toBe(true)
  })

  it('respeta el allowlist EXEMPT por file:line', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input placeholder="x" />'))
    const exempt = new Map([['src/A.tsx:1', 'envuelto por <label> padre']])
    const result = checkFormControlLabels({ root, baseline: 0, exempt })
    expect(result.ok).toBe(true)
    expect(result.count).toBe(0)
  })

  it('FALLA con entrada EXEMPT stale (ya no corresponde)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<input aria-label="ya tiene" />'))
    const exempt = new Map([['src/A.tsx:1', 'razón vieja']])
    const result = checkFormControlLabels({ root, baseline: 0, exempt })
    expect(result.ok).toBe(false)
    expect(result.staleExempt).toEqual(['src/A.tsx:1'])
  })
})
