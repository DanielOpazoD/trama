import {
  PDF_STUDIO_RECORTE_EVENT,
  enqueuePdfStudioRecorteFiles,
  takePdfStudioRecorteFiles,
} from './recorteBridge'

describe('pdfStudio/recorteBridge', () => {
  afterEach(() => {
    takePdfStudioRecorteFiles()
  })

  it('encola archivos, emite un evento con cantidad y drena en orden', () => {
    const seen: number[] = []
    const onEvent = (event: Event) => {
      seen.push((event as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener(PDF_STUDIO_RECORTE_EVENT, onEvent)

    const first = new File(['a'], 'a.png', { type: 'image/png' })
    const second = new File(['b'], 'b.png', { type: 'image/png' })
    enqueuePdfStudioRecorteFiles([first, second])

    expect(seen).toEqual([2])
    expect(takePdfStudioRecorteFiles()).toEqual([first, second])
    expect(takePdfStudioRecorteFiles()).toEqual([])

    window.removeEventListener(PDF_STUDIO_RECORTE_EVENT, onEvent)
  })

  it('ignora listas vacías para no navegar a Imprenta sin trabajo pendiente', () => {
    let events = 0
    const onEvent = () => {
      events += 1
    }
    window.addEventListener(PDF_STUDIO_RECORTE_EVENT, onEvent)

    enqueuePdfStudioRecorteFiles([])

    expect(events).toBe(0)
    expect(takePdfStudioRecorteFiles()).toEqual([])

    window.removeEventListener(PDF_STUDIO_RECORTE_EVENT, onEvent)
  })
})
