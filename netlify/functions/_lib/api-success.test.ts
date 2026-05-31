import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ApiSuccess } from './api-error'

const repoRoot = process.cwd()

describe('ApiSuccess', () => {
  it('devuelve respuestas vacías explícitas para accepted y noContent', async () => {
    const accepted = ApiSuccess.accepted()
    const noContent = ApiSuccess.noContent()

    expect(accepted.status).toBe(202)
    expect(await accepted.text()).toBe('')
    expect(noContent.status).toBe(204)
    expect(await noContent.text()).toBe('')
  })

  it('mantiene las respuestas 202/204 vacías centralizadas en ApiSuccess', () => {
    const files = [
      'netlify/functions/ai-settings.mts',
      'netlify/functions/chat-threads.mts',
      'netlify/functions/cost-alert-check.mts',
      'netlify/functions/entity-types.mts',
      'netlify/functions/error-log.mts',
      'netlify/functions/proactive-suggestions.mts',
      'netlify/functions/relationship-types.mts',
      'netlify/functions/spotify-scheduled-sync.mts',
      'netlify/functions/spotify-status.mts',
      'netlify/functions/web-vitals.mts',
      'netlify/functions/x-scheduled-sync.mts',
    ]

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8')
      expect(source, file).not.toMatch(
        /new Response\(null,\s*\{\s*status:\s*(202|204)\s*\}\)/,
      )
    }
  })
})
