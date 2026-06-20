import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  API_REQUEST_CONTRACTS,
  formatApiRequestContractReport,
  validateApiRequestContracts,
} from './api-request-contracts.mjs'

const root = process.cwd()

describe('api request contracts', () => {
  it('declara superficies privadas con razón y archivos reales', () => {
    expect(API_REQUEST_CONTRACTS.map((contract) => contract.domain)).toEqual([
      'search',
      'notes',
      'recortes',
      'momentos',
      'notas-attachments',
      'notas-attachments-upload',
    ])

    for (const contract of API_REQUEST_CONTRACTS) {
      expect(readFileSync(join(root, contract.file), 'utf8').length).toBeGreaterThan(0)
      expect(contract.reason.length).toBeGreaterThan(30)
      expect(contract.requires.length).toBeGreaterThan(0)
    }
  })

  it('pasa sobre el código actual y genera reporte legible para CI', () => {
    const result = validateApiRequestContracts()

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(formatApiRequestContractReport(result)).toContain('api_request_contracts: ok')
    expect(formatApiRequestContractReport(result)).toContain('notas-attachments-upload')
    expect(formatApiRequestContractReport(result)).toContain('momentos')
  })

  it('falla si una superficie vuelve al parsing manual de query params', () => {
    const tmp = join(tmpdir(), `trama-api-contracts-${randomUUID()}`)
    try {
      const file = 'netlify/functions/_lib/search-endpoint.ts'
      mkdirSync(join(tmp, 'netlify/functions/_lib'), { recursive: true })
      writeFileSync(
        join(tmp, file),
        `
          const url = new URL(req.url)
          const q = url.searchParams.get('q')
          parseSearchParams(req, SearchQueryParams, requestId)
          requireMethod(req, requestId, ['GET'])
          console.log(q)
        `,
      )

      const result = validateApiRequestContracts({
        root: tmp,
        contracts: [API_REQUEST_CONTRACTS[0]],
      })

      expect(result.ok).toBe(false)
      expect(result.issues).toEqual([
        {
          domain: 'search',
          file,
          message: 'manual request parsing is not allowed here: searchParams.get(',
        },
      ])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('falla si falta un marker de helper esperado', () => {
    const tmp = join(tmpdir(), `trama-api-contracts-${randomUUID()}`)
    try {
      const file = 'netlify/functions/notas-attachments-upload.mts'
      mkdirSync(join(tmp, 'netlify/functions'), { recursive: true })
      writeFileSync(
        join(tmp, file),
        `
          requireMethod(req, requestId, ['POST'])
          readFormData(req, requestId)
        `,
      )

      const result = validateApiRequestContracts({
        root: tmp,
        contracts: [API_REQUEST_CONTRACTS[5]],
      })

      expect(result.ok).toBe(false)
      expect(result.issues).toEqual([
        {
          domain: 'notas-attachments-upload',
          file,
          message:
            'missing required request contract marker: parseFormFields(formData, AttachmentUploadFields, requestId)',
        },
      ])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('reporta archivos faltantes y continúa validando las demás superficies', () => {
    const tmp = join(tmpdir(), `trama-api-contracts-${randomUUID()}`)
    try {
      const existingFile = 'netlify/functions/notas-attachments-upload.mts'
      mkdirSync(join(tmp, 'netlify/functions'), { recursive: true })
      writeFileSync(
        join(tmp, existingFile),
        `
          requireMethod(req, requestId, ['POST'])
          readFormData(req, requestId)
          parseFormFields(formData, AttachmentUploadFields, requestId)
        `,
      )

      const result = validateApiRequestContracts({
        root: tmp,
        contracts: [API_REQUEST_CONTRACTS[0], API_REQUEST_CONTRACTS[5]],
      })

      expect(result.ok).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({
        domain: 'search',
        file: 'netlify/functions/_lib/search-endpoint.ts',
      })
      expect(result.issues[0]?.message).toContain('contract file could not be read:')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
