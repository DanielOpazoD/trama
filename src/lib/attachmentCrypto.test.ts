import { beforeEach, describe, expect, it } from 'vitest'
import {
  decryptAttachmentBlob,
  encryptAttachmentFile,
  isEncryptedAttachmentKey,
} from './attachmentCrypto'

beforeEach(() => {
  window.localStorage.clear()
})

describe('attachmentCrypto', () => {
  it('cifra y descifra bytes de anexos sin conservar plaintext en el payload', async () => {
    const plainText = 'contenido privado del anexo'
    const file = new File([plainText], 'brief.md', { type: 'text/markdown' })

    const encrypted = await encryptAttachmentFile(file)
    const encryptedText = await encrypted.text()

    expect(encrypted.name).toBe('brief.md.tramaenc')
    expect(encrypted.type).toBe('application/octet-stream')
    expect(encryptedText).not.toContain(plainText)

    const decrypted = await decryptAttachmentBlob(encrypted, {
      encrypted: true,
      fileName: 'brief.md',
      mimeType: 'text/markdown',
    })

    expect(await decrypted.text()).toBe(plainText)
    expect(decrypted.type).toBe('text/markdown')
  })

  it('detecta anexos cifrados por storageKey', () => {
    expect(isEncryptedAttachmentKey('user/a1.tramaenc')).toBe(true)
    expect(isEncryptedAttachmentKey('user/a1.pdf')).toBe(false)
  })
})
