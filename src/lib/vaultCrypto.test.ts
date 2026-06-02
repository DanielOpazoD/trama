import { beforeEach, describe, expect, it } from 'vitest'
import {
  createVault,
  decryptVaultSecret,
  encryptVaultSecret,
  generatePhysicalKey,
  unlockVault,
  vaultRequiresPhysicalKey,
} from './vaultCrypto'

beforeEach(() => {
  window.localStorage.clear()
})

describe('vaultCrypto', () => {
  it('requiere contraseña y key física cuando el vault se creó con segundo factor', async () => {
    const physicalKey = generatePhysicalKey()
    const createdKey = await createVault('password-seguro', physicalKey)
    const encrypted = await encryptVaultSecret('sk-test-secreta', createdKey)

    expect(vaultRequiresPhysicalKey()).toBe(true)
    await expect(unlockVault('password-seguro')).rejects.toThrow('Llave física requerida')
    await expect(unlockVault('password-seguro', 'KEY-INCORRECTA')).rejects.toThrow()

    const unlockedKey = await unlockVault('password-seguro', physicalKey)
    await expect(decryptVaultSecret(encrypted, unlockedKey)).resolves.toBe(
      'sk-test-secreta',
    )
  })

  it('persiste solo configuración/verificador del vault, no secretos ni key física', async () => {
    const physicalKey = generatePhysicalKey()
    const vaultKey = await createVault('password-seguro', physicalKey)
    const encrypted = await encryptVaultSecret('token-super-privado', vaultKey)
    const storedConfig = window.localStorage.getItem('trama.notas.vault.v1') ?? ''

    expect(storedConfig).not.toContain('password-seguro')
    expect(storedConfig).not.toContain(physicalKey)
    expect(storedConfig).not.toContain('token-super-privado')
    expect(encrypted).not.toContain('token-super-privado')
  })
})
