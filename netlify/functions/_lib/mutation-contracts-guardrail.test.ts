import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MUTATION_CONTRACTS = [
  {
    file: 'netlify/functions/notes.mts',
    endpoints: [
      'POST /api/notes',
      'PATCH /api/notes/:id',
      'DELETE /api/notes/:id',
      'POST /api/notes/:id/restore',
      'POST /api/notes/:id/promote',
    ],
  },
  {
    file: 'netlify/functions/_lib/recortes-endpoint.ts',
    endpoints: [
      'POST /api/recortes',
      'PATCH /api/recortes/:id',
      'DELETE /api/recortes/:id',
      'POST /api/recortes/:id/restore',
      'POST /api/recortes/:id/promote',
      'POST /api/recortes/:id/unpromote',
    ],
  },
  {
    file: 'netlify/functions/_lib/momentos-endpoint.ts',
    endpoints: [
      'POST /api/momentos',
      'PATCH /api/momentos/:id',
      'DELETE /api/momentos/:id',
    ],
  },
  {
    file: 'netlify/functions/momentos-restore.mts',
    endpoints: ['POST /api/momentos-restore'],
  },
  {
    file: 'netlify/functions/notas-attachments.mts',
    endpoints: ['DELETE /api/notas-attachments/:id'],
  },
  {
    file: 'netlify/functions/notas-attachments-upload.mts',
    endpoints: ['POST /api/notas-attachments-upload'],
  },
  {
    file: 'netlify/functions/momentos-upload.mts',
    endpoints: ['POST /api/momentos-upload'],
  },
  {
    file: 'netlify/functions/momentos-audio-upload.mts',
    endpoints: ['POST /api/momentos-audio-upload'],
  },
  {
    file: 'netlify/functions/recortes-image-upload.mts',
    endpoints: ['POST /api/recortes-image-upload'],
  },
]

const UPLOAD_ROUTE_CONTRACTS = [
  {
    file: 'netlify/functions/momentos-upload.mts',
    clientFile: 'src/api/momentos.ts',
    path: '/api/momentos-upload',
    forbiddenClientPath: '/api/momentos/upload',
  },
  {
    file: 'netlify/functions/momentos-audio-upload.mts',
    clientFile: 'src/api/momentos.ts',
    path: '/api/momentos-audio-upload',
    forbiddenClientPath: '/api/momentos/audio-upload',
  },
  {
    file: 'netlify/functions/recortes-image-upload.mts',
    clientFile: 'src/api/recortes.ts',
    path: '/api/recortes-image-upload',
    forbiddenClientPath: '/api/recortes/image-upload',
  },
]

const ADHOC_ERROR_RESPONSE =
  /\b(?:new Response|Response\.json)\s*\([\s\S]*?,\s*\{[\s\S]*?\bstatus\s*:\s*(?:4|5)\d\d\b[\s\S]*?\}/
const CONTRACT_HARD_DELETE =
  /\bDELETE\s+FROM\s+(?:notes|recortes|momentos|notas_attachments)\b/i

describe('mutation contracts guardrail', () => {
  it('mantiene mutaciones privadas sobre ApiErrors, no errores text/plain ad hoc', () => {
    for (const { file } of MUTATION_CONTRACTS) {
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

  it('mantiene documentado cada endpoint mutante cubierto por el contrato', () => {
    const docs = readFileSync('docs/conventions/mutation-contracts.md', 'utf8')

    for (const { endpoints } of MUTATION_CONTRACTS) {
      for (const endpoint of endpoints) {
        expect(docs, endpoint).toContain(endpoint)
      }
    }
  })

  it('prohíbe hard-delete en las tablas soft-delete del contrato', () => {
    for (const { file } of MUTATION_CONTRACTS) {
      const source = readFileSync(file, 'utf8')

      expect(source, file).not.toMatch(CONTRACT_HARD_DELETE)
    }
  })

  it('mantiene el 500 inesperado de withObservability delegando en ApiErrors.internal', () => {
    const source = readFileSync('netlify/functions/_lib/handler-wrap.ts', 'utf8')

    expect(source).toMatch(
      /return ApiErrors\.internal\(requestId, 'Error interno del servidor'\)/,
    )
  })

  it('mantiene uploads privados en rutas hyphenated que no colisionan con :id', () => {
    for (const {
      file,
      clientFile,
      path,
      forbiddenClientPath,
    } of UPLOAD_ROUTE_CONTRACTS) {
      const endpointSource = readFileSync(file, 'utf8')
      const clientSource = readFileSync(clientFile, 'utf8')

      expect(endpointSource, file).toContain(`path: '${path}'`)
      expect(clientSource, clientFile).toContain(`'${path}'`)
      expect(clientSource, clientFile).not.toContain(`'${forbiddenClientPath}'`)
    }
  })
})
