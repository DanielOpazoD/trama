/* global module */

const CLIENT_SOURCE = '^src/'
const CLIENT_RUNTIME = '^src/(?!.*\\.(?:test|spec)\\.)'
const SERVER_FUNCTION = '^netlify/functions/[^/]+\\.mts$'
const FUNCTION_LIB = '^netlify/functions/_lib/'
const PDF_RUNTIME_LOADER =
  '^src/lib/pdfStudio/pdfRuntime/(?:pdfjsLoader|pdfLibLoader)\\.ts$'
const PDF_TEST_OR_ASSEMBLY =
  '^src/lib/(?:pdfStudio/(?:assemble|forms)/.*\\.(?:test\\.)?ts|libro/.*\\.test\\.ts)$'

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Evita ciclos nuevos en el grafo de imports versionado.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-client-to-netlify-functions',
      severity: 'error',
      comment:
        'El cliente debe hablar con /api/* via src/api; nunca importar handlers Netlify.',
      from: {
        path: CLIENT_SOURCE,
      },
      to: {
        path: '^netlify/functions/',
      },
    },
    {
      name: 'no-client-netlify-blobs',
      severity: 'error',
      comment: 'Netlify Blobs es server-only; el cliente debe pasar por endpoints/API.',
      from: {
        path: CLIENT_SOURCE,
      },
      to: {
        dependencyTypes: ['npm'],
        path: '^@netlify/blobs$',
      },
    },
    {
      name: 'no-client-server-only-modules',
      severity: 'error',
      comment:
        'El runtime browser no puede depender de APIs Node ni paquetes server-only.',
      from: {
        path: CLIENT_RUNTIME,
      },
      to: {
        path: '^(?:node:)?(?:fs|path|crypto|child_process|os|url|stream|buffer|http|https|net|dns|zlib)$|^@netlify/(?:database|functions)$',
      },
    },
    {
      name: 'netlify-wrappers-delegate-to-lib',
      severity: 'error',
      comment:
        'Los wrappers netlify/functions/*.mts no deben importar otros wrappers; la logica compartida vive en _lib.',
      from: {
        path: SERVER_FUNCTION,
      },
      to: {
        path: '^netlify/functions/[^/]+\\.mts$',
      },
    },
    {
      name: 'no-lib-to-function-wrapper',
      severity: 'error',
      comment:
        '_lib es capa reusable; no debe depender de wrappers runtime con config.path.',
      from: {
        path: FUNCTION_LIB,
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: '^netlify/functions/[^/]+\\.mts$',
      },
    },
    {
      name: 'pdf-heavy-imports-through-loaders',
      severity: 'error',
      comment:
        'PDF Studio debe cargar pdf.js/pdf-lib via loaders; tests y ensambladores browser-only quedan allowlisteados.',
      from: {
        path: '^src/',
        pathNot: `${PDF_RUNTIME_LOADER}|${PDF_TEST_OR_ASSEMBLY}`,
      },
      to: {
        dependencyTypes: ['npm'],
        path: '^(?:pdfjs-dist|pdf-lib|@pdf-lib/fontkit)$',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: [
        '^coverage/',
        '^dist/',
        '^playwright-report/',
        '^test-results/',
        '\\.d\\.ts$',
      ].join('|'),
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^(src|netlify/functions|extension|scripts)/[^/]+',
      },
    },
  },
}
