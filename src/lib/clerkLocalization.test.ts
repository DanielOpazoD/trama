import { describe, expect, it } from 'vitest'
import { clerkLocalization } from './clerkLocalization'

describe('clerkLocalization', () => {
  it('localizes the sign-in footer action to Spanish', () => {
    expect(clerkLocalization.signIn?.start?.title).toBe('Inicia sesión')
    expect(clerkLocalization.signIn?.start?.subtitle).toBe(
      'Continúa hacia tu archivo vivo.',
    )
    expect(clerkLocalization.signIn?.start?.actionText).toBe('¿No tienes una cuenta?')
    expect(clerkLocalization.signIn?.start?.actionLink).toBe('Crear cuenta')
  })

  it('localizes the sign-up start state to Spanish', () => {
    expect(clerkLocalization.signUp?.start?.title).toBe('Crea tu cuenta')
    expect(clerkLocalization.signUp?.start?.subtitle).toBe(
      'Empieza a hilar tu archivo personal.',
    )
    expect(clerkLocalization.signUp?.start?.actionText).toBe('¿Ya tienes una cuenta?')
    expect(clerkLocalization.signUp?.start?.actionLink).toBe('Iniciar sesión')
    expect(clerkLocalization.formButtonPrimary).toBe('Continuar')
  })
})
