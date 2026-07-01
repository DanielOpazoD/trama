export type PdfStudioAutosaveState =
  | { kind: 'idle'; pages: number }
  | { kind: 'saving'; pages: number }
  | { kind: 'saved'; pages: number; savedAt: number }
  | { kind: 'restored'; pages: number; savedAt: number | null }
  | { kind: 'failed'; pages: number }

export type PdfStudioAutosaveDescription = {
  tone: 'neutral' | 'working' | 'safe' | 'restored' | 'risk'
  label: string
  detail: string
}

export function createAutosaveSavingState(pages: number): PdfStudioAutosaveState {
  return { kind: 'saving', pages }
}

export function createAutosaveRestoredState(pages: number): PdfStudioAutosaveState {
  return { kind: 'restored', pages, savedAt: null }
}

export function createAutosaveFailedState(pages: number): PdfStudioAutosaveState {
  return { kind: 'failed', pages }
}

export function describePdfStudioAutosaveState(
  state: PdfStudioAutosaveState,
  now = Date.now(),
): PdfStudioAutosaveDescription {
  if (state.kind === 'saving') {
    return {
      tone: 'working',
      label: 'Autoguardando',
      detail: `${pageLabel(state.pages)} ${agree(state.pages, 'protegida', 'protegidas')} en este dispositivo.`,
    }
  }
  if (state.kind === 'saved') {
    return {
      tone: 'safe',
      label: 'Autoguardado',
      detail: `${pageLabel(state.pages)} ${agree(state.pages, 'guardada', 'guardadas')} ${relativeTime(now - state.savedAt)}.`,
    }
  }
  if (state.kind === 'restored') {
    return {
      tone: 'restored',
      label: 'Borrador recuperado',
      detail: `${pageLabel(state.pages)} ${agree(state.pages, 'restaurada', 'restauradas')} desde este dispositivo.`,
    }
  }
  if (state.kind === 'failed') {
    return {
      tone: 'risk',
      label: 'Sin autoguardado',
      detail: `No se pudo proteger el borrador local de ${pageLabel(state.pages)}.`,
    }
  }
  return {
    tone: 'neutral',
    label: 'Sin borrador',
    detail: 'Importa un PDF o imagen para empezar.',
  }
}

function pageLabel(pages: number): string {
  return `${pages} ${pages === 1 ? 'página' : 'páginas'}`
}

function agree(pages: number, singular: string, plural: string): string {
  return pages === 1 ? singular : plural
}

function relativeTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `hace ${minutes} min`
}
