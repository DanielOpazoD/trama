import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'

import {
  findPdfLazyEntrypointIssues,
  findPdfStudioSourceLazyIssues,
  PDF_LAZY_ENTRYPOINT_BASES,
} from './pdf-lazy-entrypoints.mjs'

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'trama-pdf-entrypoints-'))
  const assets = join(root, 'assets')
  mkdirSync(assets)
  for (const [file, contents] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
  }
  return root
}

test('allows PDF chunks to stay lazy behind dynamic imports', () => {
  const root = createFixture({
    'index.html': `
      <script type="module" crossorigin src="/assets/index-abc123.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-react-def456.js">
      <link rel="stylesheet" href="/assets/index-ghi789.css">
    `,
    'assets/index-abc123.js': `
      import "./vendor-react-def456.js";
      const openPdf = () => import("./PdfStudioView-lazy99.js");
    `,
    'assets/vendor-react-def456.js': 'export const react = true;',
    'assets/PdfStudioView-lazy99.js': 'import "./vendor-pdfjs-pdf999.js";',
    'assets/vendor-pdfjs-pdf999.js': 'export const pdfjs = true;',
  })

  expect(findPdfLazyEntrypointIssues(root)).toEqual([])
})

test('rejects PDF vendor chunks in index.html modulepreloads', () => {
  const root = createFixture({
    'index.html': `
      <script type="module" crossorigin src="/assets/index-abc123.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-pdf-lib-bad999.js">
    `,
    'assets/index-abc123.js': 'export const app = true;',
    'assets/vendor-pdf-lib-bad999.js': 'export const pdfLib = true;',
  })

  expect(findPdfLazyEntrypointIssues(root)).toEqual([
    {
      asset: 'vendor-pdf-lib-bad999.js',
      kind: 'initial-pdf-asset',
      reason: 'PDF chunk is referenced directly by dist/index.html',
    },
  ])
})

test('rejects static PDF imports from initial entry chunks', () => {
  const root = createFixture({
    'index.html': `
      <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    `,
    'assets/index-abc123.js': `
      import "./vendor-query-def456.js";
      import "./pdfjsLoader-bad999.js";
    `,
    'assets/vendor-query-def456.js': 'export const query = true;',
    'assets/pdfjsLoader-bad999.js': 'export const loader = true;',
  })

  expect(findPdfLazyEntrypointIssues(root)).toEqual([
    {
      asset: 'index-abc123.js',
      importee: 'pdfjsLoader-bad999.js',
      kind: 'initial-static-pdf-import',
      reason: 'Initial entry chunk statically imports a PDF runtime chunk',
    },
  ])
})

test('tracks stamp assets as a lazy PDF-adjacent entrypoint', () => {
  expect(PDF_LAZY_ENTRYPOINT_BASES).toContain('StampAssetMenuHost')
})

test('rejects a static PdfTextEditor import from the PDF Studio shell', () => {
  const root = createFixture({
    'src/components/notas/pdfStudio/PdfStudioView.tsx': `
      import { PdfTextEditor } from './editor/PdfTextEditor'
      export function PdfStudioView() {
        return <PdfTextEditor />
      }
    `,
  })

  expect(findPdfStudioSourceLazyIssues({ root })).toEqual([
    {
      check: 'pdf-studio-editor-lazy-shell',
      file: 'src/components/notas/pdfStudio/PdfStudioView.tsx',
      line: 1,
      reason: 'PdfTextEditor debe cargarse con React.lazy desde el shell PDF.',
      text: "import { PdfTextEditor } from './editor/PdfTextEditor'",
    },
  ])
})

test('allows PdfTextEditor behind React.lazy from the PDF Studio shell', () => {
  const root = createFixture({
    'src/components/notas/pdfStudio/PdfStudioView.tsx': `
      import { lazy } from 'react'
      const PdfTextEditor = lazy(() => import('./editor/PdfTextEditor'))
      export function PdfStudioView() {
        return null
      }
    `,
  })

  expect(findPdfStudioSourceLazyIssues({ root })).toEqual([])
})

test('reports a missing build output as a contract issue', () => {
  const root = createFixture({})

  expect(findPdfLazyEntrypointIssues(root)).toEqual([
    {
      asset: 'index.html',
      kind: 'missing-index',
      reason: 'dist/index.html is required before checking PDF lazy entrypoints',
    },
  ])
})

test('can be imported when process.argv[1] is absent', async () => {
  const originalArgv = process.argv
  process.argv = [originalArgv[0]]
  try {
    await expect(import('./pdf-lazy-entrypoints.mjs?argv-missing')).resolves.toBeDefined()
  } finally {
    process.argv = originalArgv
  }
})
