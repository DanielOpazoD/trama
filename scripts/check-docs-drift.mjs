#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const checks = [
  {
    file: 'README.md',
    pattern: /npm run test:e2e/,
    message: 'README.md still documents npm run test:e2e; the script is npm run e2e.',
  },
  {
    file: 'docs/README.md',
    pattern: /Hoy es single-user por diseño/,
    message: 'docs/README.md still says Trama is single-user by design.',
  },
  {
    file: 'ARCHITECTURE.md',
    pattern: /A migrar a `xyflow` o `sigma\.js`|Migrar grafo a xyflow o sigma\.js/,
    message: 'ARCHITECTURE.md still describes sigma.js as a future graph migration.',
  },
  {
    file: 'docs/escala.md',
    pattern: /refactorizar GraphView para usar WebGL|Refactor WebGL del grafo/,
    message: 'docs/escala.md still describes WebGL graph rendering as future work.',
  },
]

const failures = checks.filter(({ file, pattern }) =>
  pattern.test(readFileSync(file, 'utf8')),
)

if (failures.length > 0) {
  console.error('Documentation drift checks failed:')
  for (const failure of failures) console.error(`  - ${failure.message}`)
  process.exit(1)
}

console.log('docs drift ok')
