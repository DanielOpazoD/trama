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

const SHARED_HEAVY_WORKER_CLIENTS = [
  'src/lib/pdfStudio/export/exportWorkerClient.ts',
  'src/lib/pdfStudio/forms/pdfFormWorkerClient.ts',
  'src/lib/pdfStudio/ocr/pdfOcrWorkerClient.ts',
]

const SHARED_HEAVY_WORKER = 'src/lib/pdfStudio/export/pdfHeavy.worker.ts'

const LEGACY_OPERATION_WORKERS = [
  'pdfExport.worker.ts',
  'pdfForm.worker.ts',
  'pdfOcr.worker.ts',
]

const SHARED_WORKER_DYNAMIC_MODULES = [
  '../assemble/assemble',
  '../forms/pdfForms',
  '../ocr/pdfOcr',
]

const SHARED_WORKER_STATIC_IMPORTS = [
  "from '../assemble/assemble'",
  "from '../forms/pdfForms'",
  "from '../ocr/pdfOcr'",
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

  it('usan un unico worker pesado compartido para no duplicar vendors PDF', () => {
    for (const file of SHARED_HEAVY_WORKER_CLIENTS) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).toContain('createPdfHeavyWorker')
      for (const worker of LEGACY_OPERATION_WORKERS) {
        expect(source, `${file} no debe referenciar ${worker}`).not.toContain(worker)
      }
    }
  })

  it('mantiene las operaciones pesadas detras de import dinamico dentro del worker compartido', () => {
    const source = readFileSync(resolve(process.cwd(), SHARED_HEAVY_WORKER), 'utf8')

    for (const modulePath of SHARED_WORKER_DYNAMIC_MODULES) {
      expect(source).toContain(`import('${modulePath}')`)
    }
    for (const importStatement of SHARED_WORKER_STATIC_IMPORTS) {
      expect(source).not.toContain(importStatement)
    }
  })

  it('centraliza cancelacion de export/OCR y cancelacion cooperativa de formularios', () => {
    const source = readFileSync(resolve(process.cwd(), SHARED_HEAVY_WORKER), 'utf8')

    expect(source).toContain('const controllers = new Map<string, AbortController>()')
    expect(source).toContain('const cancelled = new Set<string>()')
    expect(source).toContain("controllers.get(message.id)?.abort('cancelled')")
    expect(source).toContain('cancelled.add(message.id)')
    expect(source).toContain('throwIfCancelled(message.id)')
  })
})
