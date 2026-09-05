import { beforeEach, describe, expect, it } from 'vitest'
import { createVault, exportVaultConfig, hasVaultConfig } from '../../lib/vaultCrypto'
import type { ExportPayload } from '../../types'
import {
  applyVaultFromImport,
  attachVaultToExport,
  importDoneMessage,
  splitVaultFromImport,
  vaultImportNotice,
} from './dataVaultBackup'

const SCOPE = { userId: 'legacy-single-user' }
const BASE: ExportPayload = {
  version: 2,
  exportedAt: '2026-09-05T00:00:00Z',
  entities: [],
  relationships: [],
  quotes: [],
}

beforeEach(() => window.localStorage.clear())

describe('dataVaultBackup', () => {
  it('sin vault local, el export sale tal cual y sin campo `vault`', () => {
    const out = attachVaultToExport(BASE, SCOPE)
    expect(out).toBe(BASE)
    expect('vault' in out).toBe(false)
  })

  it('con vault local, el export lo lleva y el import lo separa antes de ir al servidor', async () => {
    await createVault('pass', undefined, SCOPE)
    const exported = attachVaultToExport(BASE, SCOPE)
    expect(exported.vault).toEqual(exportVaultConfig(SCOPE))

    const { payload, vault } = splitVaultFromImport(exported)
    expect('vault' in payload).toBe(false)
    expect(vault).toEqual(exported.vault)
  })

  it('la vista previa anticipa lo que hará la restauración', async () => {
    expect(vaultImportNotice(null, SCOPE)).toBeNull()
    expect(vaultImportNotice(undefined, SCOPE)).toBeNull()

    await createVault('otro', undefined, SCOPE)
    const ajeno = exportVaultConfig(SCOPE)
    window.localStorage.clear()
    expect(vaultImportNotice(ajeno, SCOPE)).toMatch(/se restaurará/)

    await createVault('local', undefined, SCOPE)
    expect(vaultImportNotice(ajeno, SCOPE)).toMatch(/OTRO vault/)
    expect(vaultImportNotice(exportVaultConfig(SCOPE), SCOPE)).toMatch(/la misma/)
    expect(vaultImportNotice({ v: 9 }, SCOPE)).toMatch(/no se reconoce/)
  })

  it('aplicar instala el vault solo cuando no hay uno, y lo dice en el mensaje', async () => {
    await createVault('viajero', undefined, SCOPE)
    const backup = exportVaultConfig(SCOPE)
    window.localStorage.clear()

    expect(applyVaultFromImport(null, SCOPE)).toBeNull()
    expect(hasVaultConfig(SCOPE)).toBe(false)

    expect(applyVaultFromImport(backup, SCOPE)).toBe('Vault de Claves restaurado.')
    expect(hasVaultConfig(SCOPE)).toBe(true)

    // Segunda vez: mismo vault, nada que decir.
    expect(applyVaultFromImport(backup, SCOPE)).toBeNull()

    expect(
      importDoneMessage(
        { imported: 3, skipped: 0, failed: [] },
        'Vault de Claves restaurado.',
      ),
    ).toBe('Agregadas 3 entradas a tu trama Vault de Claves restaurado.')
    expect(importDoneMessage({ imported: 3, skipped: 0, failed: [] }, null)).toBe(
      'Agregadas 3 entradas a tu trama',
    )
  })
})
