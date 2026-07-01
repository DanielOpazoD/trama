export const PDF_EDITOR_OPENING_RETRY_MS = 75
const PDF_EDITOR_OPENING_STABLE_HITS = 2
// Válvula de seguridad: ~4s de reintentos.
const PDF_EDITOR_OPENING_MAX_TICKS = 53

type PdfEditorOpeningFinishReason = 'stable' | 'timeout'

export type PdfEditorOpeningState = {
  pageIndex: number
  ticks: number
  stableHits: number
  lastSignature: string | null
  finished: boolean
  finishReason: PdfEditorOpeningFinishReason | null
}

export function beginPdfEditorOpening(pageIndex: number): PdfEditorOpeningState {
  return {
    pageIndex,
    ticks: 0,
    stableHits: 0,
    lastSignature: null,
    finished: false,
    finishReason: null,
  }
}

export function recordPdfEditorOpeningPlacement(
  state: PdfEditorOpeningState,
  input: {
    placed: boolean
    sheetReady: boolean
    signature: string | null
  },
): PdfEditorOpeningState {
  const ticks = state.ticks + 1
  const stable =
    input.placed &&
    input.sheetReady &&
    input.signature != null &&
    input.signature === state.lastSignature
  const stableHits = stable ? state.stableHits + 1 : 0
  const finished =
    stableHits >= PDF_EDITOR_OPENING_STABLE_HITS || ticks >= PDF_EDITOR_OPENING_MAX_TICKS
  return {
    ...state,
    ticks,
    stableHits,
    lastSignature: input.signature,
    finished,
    finishReason: finished
      ? stableHits >= PDF_EDITOR_OPENING_STABLE_HITS
        ? 'stable'
        : 'timeout'
      : null,
  }
}
