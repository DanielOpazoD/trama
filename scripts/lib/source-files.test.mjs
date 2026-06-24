import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { listFilesRecursive, scannedSourceFiles } from './source-files.mjs'

async function makeTree(files) {
  const root = await mkdtemp(join(tmpdir(), 'trama-source-files-'))
  for (const [relPath, body] of Object.entries(files)) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body ?? '')
  }
  return root
}

const rel = (root, paths) => paths.map((p) => p.slice(root.length + 1)).sort()

describe('listFilesRecursive', () => {
  it('lista todos los archivos recursivamente (paths absolutos)', async () => {
    const root = await makeTree({
      'a.ts': '',
      'sub/b.tsx': '',
      'sub/deep/c.css': '',
    })
    expect(rel(root, listFilesRecursive(root))).toEqual([
      'a.ts',
      'sub/b.tsx',
      'sub/deep/c.css',
    ])
  })

  it('devuelve [] si el directorio no existe (guarda existsSync)', () => {
    expect(listFilesRecursive('/no/existe/para/nada/trama')).toEqual([])
  })
})

describe('scannedSourceFiles', () => {
  it('por defecto: solo .tsx bajo src/, sin tests ni .d.ts', async () => {
    const root = await makeTree({
      'src/A.tsx': '',
      'src/B.test.tsx': '',
      'src/C.ts': '',
      'src/types.d.ts': '',
      'src/nested/D.tsx': '',
      'other/E.tsx': '',
    })
    expect(rel(root, scannedSourceFiles(root))).toEqual(['src/A.tsx', 'src/nested/D.tsx'])
  })

  it('extensions múltiples incluye .ts y excluye .test.ts y .d.ts (caso focus-ring)', async () => {
    const root = await makeTree({
      'src/style.ts': '',
      'src/A.tsx': '',
      'src/A.test.tsx': '',
      'src/util.test.ts': '',
      'src/types.d.ts': '',
    })
    expect(rel(root, scannedSourceFiles(root, { extensions: ['.tsx', '.ts'] }))).toEqual([
      'src/A.tsx',
      'src/style.ts',
    ])
  })

  it('includeTests / includeDts los traen de vuelta', async () => {
    const root = await makeTree({
      'src/A.tsx': '',
      'src/A.test.tsx': '',
      'src/types.d.ts': '',
    })
    expect(rel(root, scannedSourceFiles(root, { includeTests: true }))).toEqual([
      'src/A.test.tsx',
      'src/A.tsx',
    ])
    expect(
      rel(root, scannedSourceFiles(root, { extensions: ['.ts'], includeDts: true })),
    ).toEqual(['src/types.d.ts'])
  })

  it('respeta un dir base distinto', async () => {
    const root = await makeTree({
      'netlify/functions/x.ts': '',
      'src/A.tsx': '',
    })
    expect(
      rel(
        root,
        scannedSourceFiles(root, { dir: 'netlify/functions', extensions: ['.ts'] }),
      ),
    ).toEqual(['netlify/functions/x.ts'])
  })

  it('devuelve [] si el dir base no existe', async () => {
    const root = await makeTree({ 'src/A.tsx': '' })
    expect(scannedSourceFiles(root, { dir: 'no-existe' })).toEqual([])
  })
})
