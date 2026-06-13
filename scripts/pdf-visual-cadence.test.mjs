import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('PDF visual regression cadence', () => {
  it('expone un script npm dedicado para los snapshots visuales', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts['e2e:pdf-visual']).toContain('PDF_STUDIO_VISUAL=1')
    expect(pkg.scripts['e2e:pdf-visual']).toContain('e2e/pdf-studio-visual.spec.ts')
  })

  it('tiene workflow macOS manual y semanal para visual PDF', () => {
    const workflowPath = join(process.cwd(), '.github/workflows/pdf-visual.yml')
    expect(existsSync(workflowPath)).toBe(true)
    const workflow = readFileSync(workflowPath, 'utf8')
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).toContain('schedule')
    expect(workflow).toContain('macos-latest')
    expect(workflow).toMatch(/PDF_STUDIO_VISUAL:\s+['"]1['"]/)
    expect(workflow).toContain('npm run e2e:pdf-visual')
  })
})
