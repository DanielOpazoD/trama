import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const EXTENSION_DIR = join(process.cwd(), 'extension')
const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'))

describe('extension manifest smoke', () => {
  it('es MV3 instalable con background, popup e iconos existentes', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.background).toEqual({
      service_worker: 'background.js',
      type: 'module',
    })
    expect(existsSync(join(EXTENSION_DIR, manifest.background.service_worker))).toBe(true)
    expect(existsSync(join(EXTENSION_DIR, manifest.action.default_popup))).toBe(true)
    for (const icon of Object.values(manifest.icons)) {
      expect(existsSync(join(EXTENSION_DIR, icon))).toBe(true)
    }
  })

  it('mantiene permisos mínimos y deja hosts amplios como permiso opcional', () => {
    expect(manifest.permissions).toEqual([
      'activeTab',
      'contextMenus',
      'storage',
      'scripting',
      'alarms',
    ])
    expect(manifest.host_permissions ?? []).toEqual([])
    expect(manifest.optional_host_permissions).toEqual(['*://*/*'])
  })
})
