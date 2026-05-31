import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const LLM_HELPER_LOG_EXEMPT: Record<string, string> = {
  'x-classify.mts': 'delegates LLM calls and extraction_log writes to runClassify()',
  'x-sync.mts':
    'best-effort classification delegates extraction_log writes to runClassify()',
  'x-scheduled-sync.mts':
    'scheduled best-effort classification delegates extraction_log writes to runClassify()',
}

function source(file: string): string {
  return readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
}

describe('guardrail: LLM cost-cap y extraction_log', () => {
  const files = [
    'ask.mts',
    'atlas.mts',
    'chat-messages.mts',
    'cronicas.mts',
    'extract-from-image.mts',
    'extract.mts',
    'proactive-suggestions.mts',
    'quote-reflect.mts',
    'reclassify-entities.mts',
    'spotify-library-snapshot.mts',
    'spotify-suggest-artists.mts',
    'suggest-relationships.mts',
    'voz.mts',
    'x-classify.mts',
    'x-cronica.mts',
    'x-scheduled-sync.mts',
    'x-sync.mts',
  ]

  for (const file of files) {
    it(`${file} chequea presupuesto mensual antes del LLM y registra costo`, () => {
      const src = source(file)
      expect(src).toMatch(/checkMonthlyBudget/)
      if (file in LLM_HELPER_LOG_EXEMPT) {
        expect(src).toMatch(/runClassify/)
        expect(LLM_HELPER_LOG_EXEMPT[file]).toBeTruthy()
      } else {
        expect(src).toMatch(/INSERT INTO extraction_log/)
        expect(src).toMatch(/cost_cents/)
        expect(src).toMatch(/user_id/)
      }
    })
  }

  it('reindex-embeddings mantiene la excepción de embeddings observable', () => {
    const src = source('reindex-embeddings.mts')
    expect(src).toMatch(/reindex_embeddings_batch/)
    expect(src).toMatch(/estimatedCostCents/)
    expect(src).toMatch(/errors/)
  })

  it('embeddings centraliza el transporte OpenAI bajo providers LLM', () => {
    const embeddings = source('_lib/embeddings.ts')
    const provider = source('_lib/llm/providers/openai-compatible.ts')

    expect(embeddings).not.toMatch(/https:\/\/api\.openai\.com/)
    expect(embeddings).not.toMatch(/\bfetch\(/)
    expect(provider).toMatch(/\/embeddings/)
  })

  it('cada checkMonthlyBudget pasa userId y requestId explícitos', () => {
    for (const file of files) {
      const src = source(file)
      const calls = src.matchAll(/checkMonthlyBudget\s*\(([^)]*)\)/g)
      for (const call of calls) {
        const args = call[1] ?? ''
        expect(
          args.split(',').length,
          `${file} llama checkMonthlyBudget sin requestId explícito`,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })
})
