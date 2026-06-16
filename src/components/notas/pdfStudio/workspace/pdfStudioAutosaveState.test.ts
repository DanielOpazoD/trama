import { describe, expect, it } from 'vitest'
import {
  createAutosaveFailedState,
  createAutosaveRestoredState,
  createAutosaveSavedState,
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

    expect(describePdfStudioAutosaveState(createAutosaveSavedState(10, 2))).toMatchObject(
      {
        tone: 'safe',
        label: 'Autoguardado',
        detail: '2 páginas guardadas hace 10s.',
      },
    )
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
