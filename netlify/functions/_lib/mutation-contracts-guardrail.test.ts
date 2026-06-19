import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MUTATION_ENDPOINTS = [
  'netlify/functions/notes.mts',
  'netlify/functions/_lib/recortes-endpoint.ts',
  'netlify/functions/_lib/momentos-endpoint.ts',
  'netlify/functions/momentos-restore.mts',
  'netlify/functions/notas-attachments.mts',
  'netlify/functions/notas-attachments-upload.mts',
]

const ADHOC_ERROR_RESPONSE =
  /\b(?:new Response|Response\.json)\s*\([\s\S]*?,\s*\{[\s\S]*?\bstatus\s*:\s*(?:4|5)\d\d\b[\s\S]*?\}/

describe('mutation contracts guardrail', () => {
  it('mantiene mutaciones privadas sobre ApiErrors, no errores text/plain ad hoc', () => {
    for (const file of MUTATION_ENDPOINTS) {
      const source = readFileSync(file, 'utf8')

      expect(source, file).toMatch(/ApiErrors/)
      expect(source, file).not.toMatch(ADHOC_ERROR_RESPONSE)
    }
  })

  it('detecta variantes ad hoc aunque usen variables o Response.json', () => {
    expect("return new Response('bad', { status: 400 })").toMatch(ADHOC_ERROR_RESPONSE)
    expect('return new Response(errorBody, { status: 500 })').toMatch(
      ADHOC_ERROR_RESPONSE,
    )
    expect('return Response.json({ error: "bad" }, { status: 409 })').toMatch(
      ADHOC_ERROR_RESPONSE,
    )
    expect('return Response.json({ ok: true }, { status: 201 })').not.toMatch(
      ADHOC_ERROR_RESPONSE,
    )
  })

  it('mantiene el 500 inesperado de withObservability delegando en ApiErrors.internal', () => {
    const source = readFileSync('netlify/functions/_lib/handler-wrap.ts', 'utf8')

    expect(source).toMatch(
      /return ApiErrors\.internal\(requestId, 'Error interno del servidor'\)/,
    )
  })
})
