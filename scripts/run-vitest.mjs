import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { buildVitestArgs } from './vitest-runner-args.mjs'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const key = createHash('sha1').update(projectRoot).digest('hex').slice(0, 10)
const safeRoot = join(tmpdir(), `trama-vitest-${key}-${process.pid}`)
const EXCLUDED_ROOTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.superpowers',
])

function ensureSafeRoot() {
  if (existsSync(safeRoot)) {
    const stat = lstatSync(safeRoot)
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmSync(safeRoot, { recursive: true, force: true })
    } else {
      rmSync(safeRoot, { force: true })
    }
  }

  mkdirSync(safeRoot, { recursive: true })
  cpSync(projectRoot, safeRoot, {
    recursive: true,
    dereference: false,
    filter(source) {
      const rel = relative(projectRoot, source)
      if (!rel) return true
      const [root] = rel.split(sep)
      return !EXCLUDED_ROOTS.has(root)
    },
  })

  const safeNodeModules = join(safeRoot, 'node_modules')
  if (!existsSync(safeNodeModules)) {
    symlinkSync(join(projectRoot, 'node_modules'), safeNodeModules, 'dir')
  }
}

ensureSafeRoot()

const vitestBin = join(safeRoot, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(
  process.execPath,
  [vitestBin, ...buildVitestArgs(process.argv.slice(2))],
  {
    cwd: safeRoot,
    env: { ...process.env, PWD: safeRoot },
    stdio: 'inherit',
  },
)

if (result.error) {
  console.error(result.error)
  rmSync(safeRoot, { recursive: true, force: true })
  process.exit(1)
}

rmSync(safeRoot, { recursive: true, force: true })
process.exit(result.status ?? 1)
