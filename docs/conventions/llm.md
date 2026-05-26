# LLM — abstracción y caminos de propuesta

## El LLM

Toda llamada a un modelo pasa por `netlify/functions/_lib/llm/` (split DD5 — antes era un solo archivo de 807 LOC). Tres funciones públicas en el barrel `llm.ts`:

- `askLLMForJson(messages)` — fuerza `response_format: json_object`. Para extract/suggest/reclassify.
- `askLLMForText(messages)` — texto plano (no streaming). Para el auto-título de threads y como fallback en Anthropic/Gemini.
- `askLLMForTextStreaming(messages)` — async generator de `{chunk|done|error}` frames. SSE real en DeepSeek/OpenAI; fallback de un único chunk en Anthropic/Gemini.

Las tres:
- Leen provider y key de env vars (NUNCA hardcodeadas) — `_lib/llm/config.ts` con fail-fast si falta key crítica
- Cachean por hash del input en `llm_cache` (Postgres, DD6 — antes solo en-memory)
- Hacen retry con backoff en 5xx/429, no en 4xx
- Devuelven `{ content, usage, fromCache }` — usage incluye costo estimado

**No llames a APIs de LLM directamente.** Si necesitás un proveedor nuevo, agregalo en `PROVIDER_DEFAULTS` y en cada dispatcher (`providers/{openai-compatible,anthropic,gemini}.ts`). Nunca hagas `fetch('https://api.openai.com/...')` desde otro archivo.

## Los caminos de propuesta IA

Endpoints que terminan en propuestas estructuradas que la UI muestra para aprobar:

| Endpoint | Prompt | Validator |
|---|---|---|
| `/api/extract` | `_lib/extract-prompt.ts` | `_lib/extract-validate.ts` |
| `/api/suggest-relationships` | `_lib/suggest-relationships-prompt.ts` | reusa `extract-validate` con `validEntityTypes` vacío |
| `/api/reclassify-entities` | `_lib/reclassify-prompt.ts` | `_lib/reclassify-validate.ts` |
| `/api/chat/threads/:id/messages` | `_lib/chat-prompt.ts` (system + history) | `_lib/chat-validate.ts` (extrae JSON entre markers `<<<TRAMA-PROPOSAL ... TRAMA-PROPOSAL>>>`) |
| `/api/spotify/import-playlist` | (no LLM — parse y fetch determinístico) | filtra en el endpoint |
| `/api/quotes/:id/reflect` (κ6) | `_lib/reflect-prompt.ts` | (texto plano, no JSON) |
| `/api/momentos/:id/suggest-entities` (ξ2) | inline en el handler | filtra IDs válidos contra existing |
| `/api/momentos/:id/vision-suggest` (ξ3) | inline (vision multimodal) | filtra IDs válidos contra existing |

Cuando agregues un camino nuevo, sigue el patrón: prompt aislado, validator puro, endpoint que orquesta. Loguea el resultado en `extraction_log` para que el dashboard de costos lo capture.
