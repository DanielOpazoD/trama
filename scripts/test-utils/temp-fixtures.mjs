import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function makeTempFixtureRoot(prefix, files) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  for (const [file, contents] of Object.entries(files)) {
    const fullPath = join(root, file)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, contents)
  }
  return { root }
}
