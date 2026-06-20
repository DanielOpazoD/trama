import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import { findPdfLazyEntrypointIssues } from './pdf-lazy-entrypoints.mjs'

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'trama-pdf-entrypoints-'))
  const assets = join(root, 'assets')
  mkdirSync(assets)
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(root, file), contents)
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
