import { beforeEach, describe, expect, it } from 'vitest'
import { prepareAttachmentDownload } from './attachmentDownload'

beforeEach(() => {
  window.localStorage.clear()
})

describe('attachmentDownload', () => {
  it('devuelve el blob original: los anexos no usan vault ni key local', async () => {
    const plainText = 'contenido privado del anexo'
    const blob = new Blob([plainText], { type: 'text/markdown' })

    const prepared = await prepareAttachmentDownload(blob, {
      fileName: 'brief.md',
      mimeType: 'text/markdown',
    })

    expect(await prepared.text()).toBe(plainText)
    expect(prepared.type).toBe('text/markdown')
    expect(window.localStorage.getItem('trama.notas.attachments.key.v1')).toBeNull()
  })
})
