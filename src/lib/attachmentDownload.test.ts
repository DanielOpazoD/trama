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

  it('conserva un File cuando nombre y mime ya calzan con el anexo', async () => {
    const file = new File(['ok'], 'contexto.pdf', { type: 'application/pdf' })

    const prepared = await prepareAttachmentDownload(file, {
      fileName: 'contexto.pdf',
      mimeType: 'application/pdf',
    })

    expect(prepared).toBe(file)
  })

  it('usa el mime original del blob cuando no recibe uno explícito', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' })

    const prepared = await prepareAttachmentDownload(blob, {
      fileName: 'paquete.zip',
      mimeType: '',
    })

    expect(prepared).toBeInstanceOf(File)
    expect((prepared as File).name).toBe('paquete.zip')
    expect(prepared.type).toBe('application/zip')
  })
})
