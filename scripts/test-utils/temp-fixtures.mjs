import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

export function makeTempFixtureRoot(prefix, files) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const resolvedRoot = resolve(root)
  for (const [file, contents] of Object.entries(files)) {
    const fullPath = resolve(root, file)
    if (fullPath !== resolvedRoot && !fullPath.startsWith(`${resolvedRoot}${sep}`)) {
      throw new Error(`Fixture path escapes outside fixture root: ${file}`)
    }
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, contents)
  }
  return { root }
}
