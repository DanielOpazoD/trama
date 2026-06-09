import { describe, it, expect } from 'vitest'
import { AskBody, ChatThreadCreateBody, ChatMessageSendBody } from './chat-body-schemas'

describe('AskBody', () => {
  // Regresión: el cliente (`ai.ask`) manda `view/selectedEntityId/threadId`
  // como `null` cuando no hay contexto (`options?.view ?? null`). Zod
  // `.optional()` SÓLO acepta `undefined`, así que sin `.nullable()` cualquier
  // mensaje (p. ej. "soledad") daba 400 "Body inválido".
  it('acepta null en view/selectedEntityId/threadId', () => {
    const result = AskBody.safeParse({
      text: 'soledad',
      view: null,
      selectedEntityId: null,
      threadId: null,
    })
    expect(result.success).toBe(true)
  })

  it('acepta los campos de contexto ausentes', () => {
    expect(AskBody.safeParse({ text: 'soledad' }).success).toBe(true)
  })

  it('acepta strings en los campos de contexto', () => {
    expect(
      AskBody.safeParse({
        text: 'hola',
        view: 'inicio',
        selectedEntityId: 'ent_1',
        threadId: 'thr_1',
      }).success,
    ).toBe(true)
  })

  it('rechaza text vacío', () => {
    expect(AskBody.safeParse({ text: '' }).success).toBe(false)
  })
})

describe('ChatThreadCreateBody', () => {
  it('acepta null en title/context', () => {
    expect(ChatThreadCreateBody.safeParse({ title: null, context: null }).success).toBe(
      true,
    )
  })
})

describe('ChatMessageSendBody', () => {
  it('exige content no vacío', () => {
    expect(ChatMessageSendBody.safeParse({ content: 'hola' }).success).toBe(true)
    expect(ChatMessageSendBody.safeParse({ content: '' }).success).toBe(false)
  })
})
