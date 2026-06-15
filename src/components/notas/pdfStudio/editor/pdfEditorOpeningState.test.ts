import { describe, expect, it } from 'vitest'
import {
  beginPdfEditorOpening,
  recordPdfEditorOpeningPlacement,
} from './pdfEditorOpeningState'

describe('pdfEditorOpeningState', () => {
  it('mantiene la pagina solicitada pinneada hasta dos firmas estables', () => {
    let state = beginPdfEditorOpening(4)

    state = recordPdfEditorOpeningPlacement(state, {
      placed: true,
      sheetReady: true,
      signature: '0:0:700:s|1:700:700:s|4:2800:700:s',
    })
    expect(state.finished).toBe(false)
    expect(state.stableHits).toBe(0)

    state = recordPdfEditorOpeningPlacement(state, {
      placed: true,
      sheetReady: true,
      signature: '0:0:700:s|1:700:700:s|4:2800:700:s',
    })
    expect(state.finished).toBe(false)
    expect(state.stableHits).toBe(1)

    state = recordPdfEditorOpeningPlacement(state, {
      placed: true,
      sheetReady: true,
      signature: '0:0:700:s|1:700:700:s|4:2800:700:s',
    })
    expect(state.finished).toBe(true)
    expect(state.finishReason).toBe('stable')
  })

  it('reinicia estabilidad si cambia la geometria de las paginas previas', () => {
    let state = beginPdfEditorOpening(2)
    state = recordPdfEditorOpeningPlacement(state, {
      placed: true,
      sheetReady: true,
      signature: '0:0:700:s|1:700:500:p|2:1200:700:s',
    })
    state = recordPdfEditorOpeningPlacement(state, {
      placed: true,
      sheetReady: true,
      signature: '0:0:700:s|1:700:900:s|2:1600:700:s',
    })

    expect(state.finished).toBe(false)
    expect(state.stableHits).toBe(0)
    expect(state.lastSignature).toContain('1:700:900:s')
  })

  it('libera por timeout aunque nunca haya hoja real colocada', () => {
    let state = beginPdfEditorOpening(9)
    for (let i = 0; i < 53; i += 1) {
      state = recordPdfEditorOpeningPlacement(state, {
        placed: false,
        sheetReady: false,
        signature: null,
      })
    }

    expect(state.finished).toBe(true)
    expect(state.finishReason).toBe('timeout')
  })
})
