import { beforeEach, describe, expect, it } from 'vitest'
import {
  createVault,
  decryptVaultSecret,
  encryptVaultSecret,
  exportVaultConfig,
  generatePhysicalKey,
  hasVaultConfig,
  planVaultRestore,
  restoreVaultConfig,
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

  it('separa la configuración del vault por usuario del navegador', async () => {
    await createVault('password-alice', undefined, { userId: 'alice' })

    expect(hasVaultConfig({ userId: 'alice' })).toBe(true)
    expect(hasVaultConfig({ userId: 'bob' })).toBe(false)

    await createVault('password-bob', undefined, { userId: 'bob' })

    const unlockedAlice = await unlockVault('password-alice', undefined, {
      userId: 'alice',
    })
    expect(unlockedAlice.type).toBe('secret')
    await expect(
      unlockVault('password-alice', undefined, { userId: 'bob' }),
    ).rejects.toThrow()
  })
})

describe('vaultCrypto — respaldo de la configuración', () => {
  it('lo exportado basta para abrir el vault en otro navegador con la misma contraseña', async () => {
    const key = await createVault('la-de-siempre')
    const encrypted = await encryptVaultSecret('sk-guardada-antes', key)
    const backup = exportVaultConfig()
    expect(backup).not.toBeNull()
    expect(JSON.stringify(backup)).not.toContain('la-de-siempre')

    // "Otro navegador": sin nada en localStorage.
    window.localStorage.clear()
    expect(hasVaultConfig()).toBe(false)

    expect(restoreVaultConfig(backup)).toBe('restored')
    const reopened = await unlockVault('la-de-siempre')
    await expect(decryptVaultSecret(encrypted, reopened)).resolves.toBe(
      'sk-guardada-antes',
    )
  })

  it('no pisa un vault local distinto: las claves de este navegador siguen abriéndose', async () => {
    await createVault('vault-viejo')
    const backupViejo = exportVaultConfig()
    window.localStorage.clear()

    const keyLocal = await createVault('vault-de-aqui')
    const encryptedLocal = await encryptVaultSecret('clave-local', keyLocal)

    expect(planVaultRestore(backupViejo)).toBe('kept-local')
    expect(restoreVaultConfig(backupViejo)).toBe('kept-local')
    const stillLocal = await unlockVault('vault-de-aqui')
    await expect(decryptVaultSecret(encryptedLocal, stillLocal)).resolves.toBe(
      'clave-local',
    )
    // Con otra contraseña, AES-GCM falla la autenticación antes de llegar al
    // verificador: el error es del navegador, no el mensaje propio.
    await expect(unlockVault('vault-viejo')).rejects.toThrow()
  })

  it('reconoce el mismo vault y rechaza lo que no es una configuración', async () => {
    await createVault('igual')
    const backup = exportVaultConfig()
    expect(restoreVaultConfig(backup)).toBe('same-vault')

    window.localStorage.clear()
    for (const basura of [
      null,
      'texto',
      { v: 2 },
      { v: 1, kdf: 'PBKDF2-SHA-256', salt: '' },
    ]) {
      expect(restoreVaultConfig(basura), JSON.stringify(basura)).toBe('invalid')
    }
    expect(hasVaultConfig()).toBe(false)
  })

  it('respeta el ámbito por usuario: restaurar para uno no toca al otro', async () => {
    await createVault('de-ana', undefined, { userId: 'ana' })
    const backupAna = exportVaultConfig({ userId: 'ana' })
    window.localStorage.clear()

    expect(restoreVaultConfig(backupAna, { userId: 'ana' })).toBe('restored')
    expect(hasVaultConfig({ userId: 'ana' })).toBe(true)
    expect(hasVaultConfig({ userId: 'beto' })).toBe(false)
  })
})
