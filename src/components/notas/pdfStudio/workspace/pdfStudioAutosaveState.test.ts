import { describe, expect, it } from 'vitest'
import {
  createAutosaveFailedState,
  createAutosaveRestoredState,
  createAutosaveSavingState,
  describePdfStudioAutosaveState,
} from './pdfStudioAutosaveState'

describe('pdfStudioAutosaveState', () => {
  it('describe estados accionables de guardado', () => {
    expect(describePdfStudioAutosaveState(createAutosaveSavingState(3))).toMatchObject({
      tone: 'working',
      label: 'Autoguardando',
      detail: '3 páginas protegidas en este dispositivo.',
    })

    const now = 1_700_000_000_000
    expect(
      describePdfStudioAutosaveState(
        { kind: 'saved', pages: 2, savedAt: now - 10_000 },
        now,
      ),
    ).toMatchObject({
      tone: 'safe',
      label: 'Autoguardado',
      detail: '2 páginas guardadas hace 10s.',
    })
  })

  it('usa concordancia singular para una pagina', () => {
    const now = 1_700_000_000_000

    expect(describePdfStudioAutosaveState(createAutosaveSavingState(1))).toMatchObject({
      detail: '1 página protegida en este dispositivo.',
    })
    expect(
      describePdfStudioAutosaveState(
        { kind: 'saved', pages: 1, savedAt: now - 10_000 },
        now,
      ),
    ).toMatchObject({
      detail: '1 página guardada hace 10s.',
    })
    expect(describePdfStudioAutosaveState(createAutosaveRestoredState(1))).toMatchObject({
      detail: '1 página restaurada desde este dispositivo.',
    })
  })

  it('marca recuperación y fallos como estados visibles', () => {
    expect(describePdfStudioAutosaveState(createAutosaveRestoredState(4))).toMatchObject({
      tone: 'restored',
      label: 'Borrador recuperado',
      detail: '4 páginas restauradas desde este dispositivo.',
    })

    expect(describePdfStudioAutosaveState(createAutosaveFailedState(2))).toMatchObject({
      tone: 'risk',
      label: 'Sin autoguardado',
      detail: 'No se pudo proteger el borrador local de 2 páginas.',
    })
  })
})
