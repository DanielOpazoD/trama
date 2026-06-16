import { describe, expect, it } from 'vitest'
import { clerkLocalization } from './clerkLocalization'

describe('clerkLocalization', () => {
  it('localizes the sign-in footer action to Spanish', () => {
    expect(clerkLocalization.signIn?.start?.actionText).toBe('¿No tienes una cuenta?')
    expect(clerkLocalization.signIn?.start?.actionLink).toBe('Crear cuenta')
  })
})
