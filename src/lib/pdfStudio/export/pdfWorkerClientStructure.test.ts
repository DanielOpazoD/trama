import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const STATIC_HEAVY_FALLBACK_IMPORTS = [
  {
    file: 'src/lib/pdfStudio/export/exportWorkerClient.ts',
    blocked: ["from '../assemble/assemble'"],
  },
  {
    file: 'src/lib/pdfStudio/forms/pdfFormWorkerClient.ts',
    blocked: ["from './pdfForms'"],
  },
  {
    file: 'src/lib/pdfStudio/ocr/pdfOcrWorkerClient.ts',
    blocked: ["from './pdfOcr'"],
  },
]

describe('pdf worker clients', () => {
  it('no importan fallbacks pesados de forma estatica', () => {
    for (const { file, blocked } of STATIC_HEAVY_FALLBACK_IMPORTS) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      for (const token of blocked) {
        expect(source, `${file} debe cargar ${token} solo por import()`).not.toContain(
          token,
        )
      }
    }
  })
})
