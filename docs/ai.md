# IA: providers, costos, troubleshooting

## Cuándo abrir esto

- Quiero cambiar el provider de IA (de DeepSeek a OpenAI, o por tarea).
- Quiero saber cuánto he gastado este mes.
- La IA responde lento o se cuelga.
- Quiero apagar TODA la IA (modo Off).
- Quiero forzar que toda IA pase por un solo provider.

## Verificación rápida

| Qué                                   | Dónde                                           |
| ------------------------------------- | ----------------------------------------------- |
| ¿Cuánto gasté en IA este mes?         | Settings → Health (ver gráfico)                 |
| ¿Qué provider está usando cada tarea? | Settings → "IA por tarea"                       |
| ¿Hay errores recientes de IA?         | Settings → Health                               |
| Estado actual del toggle IA           | Sidebar → icono de chispa (chip muestra estado) |

## El toggle global de IA

En la sidebar (arriba de Configuración) hay un icono con tres estados:

| Estado                  | Qué hace                                              | Cuándo usarlo                                    |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **Auto** (default)      | Cada tarea usa su provider configurado                | Uso normal                                       |
| **Off**                 | Bloquea TODAS las llamadas IA (servidor devuelve 423) | "No quiero gastar hoy", trabajo manual puro      |
| **Forzar `<provider>`** | Override: TODAS las llamadas por ese provider         | Una key se cayó / comparar providers / debugging |

Click en el icono abre las opciones. La elección persiste en localStorage. Aplica de inmediato sin recargar.

## Cambiar el provider de una tarea específica

Trama tiene 7 tareas IA con su provider configurable independiente:

- `extract` — extraer entidades/citas de texto
- `extract-image` — extraer desde imagen (necesita provider con vision: openai o gemini)
- `suggest-relationships` — proponer conexiones nuevas entre entidades existentes
- `reclassify` — proponer cambios de tipo de entidades
- `reflect` — reflexión IA sobre una cita
- `chat` — el chat conversacional y la AskBar
- `panel` — chat focalizado en una entidad

1. Settings → "IA por tarea".
2. Por cada tarea: dropdown con providers disponibles.
3. Opcional: model override (ej. `gpt-4o-mini` en lugar del default).
4. Opcional: verifier (cross-verification con un segundo provider).

## Configurar API keys (Netlify env vars)

Para que un provider funcione, necesita su API key en Netlify:

| Provider  | Env var                                  |
| --------- | ---------------------------------------- |
| DeepSeek  | `AI_API_KEY` (legacy, sigue funcionando) |
| OpenAI    | `OPENAI_API_KEY`                         |
| Anthropic | `ANTHROPIC_API_KEY`                      |
| Gemini    | `GEMINI_API_KEY`                         |

Para añadir una key nueva:

1. https://app.netlify.com/sites/trama/configuration/env
2. `Add a variable`
3. `Contains secret values` ✓
4. Trigger deploy → Clear cache and deploy (~3 min) para que tome efecto.

**No hace falta una key por cada provider**. Si solo tenés `OPENAI_API_KEY` y `AI_API_KEY`, podés usar OpenAI y DeepSeek. Anthropic y Gemini quedan deshabilitados (y la UI no los va a poder seleccionar — bueno, sí los va a mostrar pero al llamar va a dar error).

## Fallback cross-provider (resiliencia)

Si el provider primario tiene una **caída transitoria** (5xx, timeout o red), el despachador puede caer automáticamente a otro provider y reintentar, en vez de devolver error. Es **opt-in** vía env var:

| Env var                 | Ejemplo         | Qué hace                                                    |
| ----------------------- | --------------- | ----------------------------------------------------------- |
| `AI_FALLBACK_PROVIDERS` | `openai,gemini` | Lista ordenada de providers a intentar si el primario falla |

Reglas:

- **Solo fallas transitorias** disparan el fallback. Un 4xx (auth/bad-request) o un JSON inválido NO cae a otro provider — sería enmascarar un bug real.
- Un provider de la cadena **solo se usa si tiene su key DEDICADA** (`OPENAI_API_KEY`, etc.). La `AI_API_KEY` compartida NO sirve de fallback acá: usarla contra OpenAI daría un 401 garantizado. Sin key propia, el provider se omite de la cadena.
- **Cuidado con el costo**: caer a Anthropic puede costar ~7× más que DeepSeek (ver tabla de costos abajo). Por eso es opt-in explícito.
- Sin la env var (default), no hay fallback — comportamiento histórico, cero sorpresas.
- También cubre **streaming** (el chat cae a respuesta no-streaming en un solo bloque) y **vision** (openai↔gemini).
- Cada fallback se loguea (`llm_fallback_succeeded` / `llm_provider_failed`) en los logs de Netlify Functions para diagnóstico.

## Cost cap mensual

La env var `AI_MONTHLY_BUDGET_CENTS` corta TODAS las llamadas IA cuando se alcanza el límite. Es la única protección de gasto que tenés (el rate limiting por IP se removió a propósito).

- Default si no la pones: **5000 (≈ USD 50/mes)**. Si quieres más, ajustar.
- La medición es por mes calendario. El primero de cada mes se resetea.
- Cuando se alcanza, los endpoints devuelven `429 RATE_LIMITED` con el shape canónico de API. La app sigue funcionando para todo lo manual.

Settings → Health muestra el gasto acumulado del mes en vivo.

## La IA responde lento

### Síntoma A: el chat tarda 5-10 segundos en empezar a responder

Normal cuando se cumple TODO esto:

- Es el primer mensaje del thread (no hay context cacheado).
- HyDE está activo (genera un párrafo hipotético antes de embeber).
- Reranker está activo (LLM lee 30 candidatos antes de responder).

Tiempo desglosado típico: ~500ms HyDE + ~50ms embedding + ~50ms SQL + ~1.5s reranker + ~2s respuesta = ~4s. Aceptable.

Si querés bajar la latencia, podés tunear bajando los topK de retrieval en `_lib/rag-context.ts` o quitando el rerank/HyDE — pero baja la calidad.

### Síntoma B: 30+ segundos sin respuesta

Algo raro pasa. Diagnóstico:

1. Settings → Health → ¿hay errores recientes con un timestamp coincidiendo?
2. Si la respuesta del provider está tardando: el provider tiene problemas. Cambiá temporalmente al toggle "Forzar otro".
3. Si está colgada en HNSW search: probablemente el índice se está reconstruyendo en Neon. Esperar 5 min.
4. Si la respuesta llega pero el front no la pinta: bug. Reportar.

### Síntoma C: el modelo "inventa" cosas (alucina)

Trama tiene defensas en los prompts contra alucinación pero no es infalible. Si pasa mucho:

- Verificá que el provider configurado para chat sea uno con buena calidad (DeepSeek o GPT-4o-mini, no un modelo cualquiera).
- En Settings → IA por tarea, activá cross-verification para `chat`: un segundo provider lee la respuesta del primero y vota. Reduce alucinación a cambio de doble costo.

## La IA "no funciona" (error 4xx/5xx)

1. Settings → Health → ¿hay un error reciente con la palabra `LLM`, `provider`, `embedding`?
2. Si dice `OPENAI_API_KEY no está configurada` o equivalente: la env var no está. Ir a Netlify → Env → añadir.
3. Si dice `Embeddings API error 401`: la key es inválida o caducó. Renovar en el dashboard del provider.
4. Si dice `Embeddings API error 429`: rate limit del provider. Esperar o cambiar provider.
5. Si dice `Embeddings API error 503`: el provider está caído. No es problema tuyo, no hay nada que hacer salvo cambiar de provider mientras dura.

## Costos: cómo se forman

| Operación                     | Tokens aprox       | Costo aprox (DeepSeek) | Costo aprox (GPT-4o-mini) |
| ----------------------------- | ------------------ | ---------------------- | ------------------------- |
| Extract entity de un párrafo  | 500 in + 300 out   | $0.0002                | $0.00026                  |
| Chat turn (sin RAG complejo)  | 2000 in + 500 out  | $0.0008                | $0.0006                   |
| Chat turn (con HyDE + rerank) | 4000 in + 1000 out | $0.0014                | $0.0013                   |
| Embedding (siempre OpenAI)    | 200 tokens         | $0.000004              | —                         |
| Reflect quote                 | 300 in + 400 out   | $0.0005                | $0.00056                  |

Para uso típico personal: 30 chat turns + 50 extractions + 10 reflexiones por día = ~$0.07/día = **~$2/mes**.

Con cap mensual de $50 tenés 25x el uso típico, suficiente para días de mucho trabajo.

## Reindexar embeddings (para búsqueda semántica)

Cuando importás datos viejos o cambiás el modelo de embeddings:

1. Settings → "Búsqueda semántica" → ver "Sin indexar: N entidades, M citas".
2. Si N > 0 → clic en **"Indexar lo pendiente"**.
3. La UI hace polling al endpoint hasta llegar a 0.
4. Costo: ~$0.000002 por fila. Para 1000 entities + 5000 quotes = $0.012 total.

## Contexto técnico

- Toda llamada IA generativa pasa por `_lib/llm.ts` (3 funciones: `askLLMForJson`, `askLLMForText`, `askLLMForTextStreaming`).
- Cada llamada se loguea en `extraction_log` con tokens, costo, latencia, provider.
- El cost cap está en `_lib/cost-cap.ts` y se chequea al inicio de cada endpoint IA.
- HyDE + reranker viven en `_lib/rag-context.ts` + `_lib/llm-rerank.ts`.
- Excepción deliberada: embeddings usa `_lib/embeddings.ts` con transporte OpenAI centralizado en `_lib/llm/providers/openai-compatible.ts`, porque es infraestructura de búsqueda, no generación configurable. Sus fallos se loguean como `embed_failed`; su costo estimado está documentado arriba para reindexados masivos y debe revisarse antes de correr lotes grandes.
- Cada lote de `/api/reindex-embeddings` emite `reindex_embeddings_batch` con `attempted`, `processed`, `errors`, `estimatedTokens` y `estimatedCostCents`; revisar esos eventos si se corre un backfill grande.
