import { describe, expect, it } from 'vitest'
import {
  resolveInitialNotasSection,
  resolveInitialWorld,
  resolveNextWorldForClientUser,
} from './worldShellModel'

describe('worldShellModel', () => {
  it('resuelve el mundo inicial con prioridad URL, storage valido y default', () => {
    expect(
      resolveInitialWorld({
        initialWorldFromUrl: 'notas',
        savedWorld: 'trama',
        defaultWorld: 'trama',
      }),
    ).toBe('notas')

    expect(
      resolveInitialWorld({
        initialWorldFromUrl: null,
        savedWorld: 'notas',
        defaultWorld: 'trama',
      }),
    ).toBe('notas')

    expect(
      resolveInitialWorld({
        initialWorldFromUrl: null,
        savedWorld: 'biblioteca',
        defaultWorld: 'notas',
      }),
    ).toBe('notas')
  })

  it('solo lee deep-link de seccion cuando el mundo inicial es Notas', () => {
    expect(
      resolveInitialNotasSection({
        initialWorldFromUrl: 'notas',
        search: '?world=notas&section=pdf',
      }),
    ).toBe('pdf')
    expect(
      resolveInitialNotasSection({
        initialWorldFromUrl: 'trama',
        search: '?world=trama&section=pdf',
      }),
    ).toBeNull()
  })

  it('resetea mundo al default cuando cambia el usuario autenticado', () => {
    expect(
      resolveNextWorldForClientUser({
        clientUserId: 'u2',
        previousClientUserId: 'u1',
      }),
    ).toEqual({ shouldPersistUser: true, shouldResetWorld: true })
    expect(
      resolveNextWorldForClientUser({
        clientUserId: 'u1',
        previousClientUserId: 'u1',
      }),
    ).toEqual({ shouldPersistUser: false, shouldResetWorld: false })
    expect(
      resolveNextWorldForClientUser({
        clientUserId: null,
        previousClientUserId: 'u1',
      }),
    ).toEqual({ shouldPersistUser: false, shouldResetWorld: false })
  })
})
