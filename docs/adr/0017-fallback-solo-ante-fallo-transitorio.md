# ADR-0017: Sólo un fallo transitorio cae al siguiente proveedor de LLM

- **Status**: Accepted
- **Date**: 2026-07-31
- **Deciders**: @DanielOpazoD

## Context

Trama habla con varios proveedores de LLM (DeepSeek, OpenAI, Anthropic,
Gemini) y `AI_FALLBACK_PROVIDERS` define una cadena: si el primero no responde,
se prueba el siguiente.

La pregunta que hay que contestar es **cuándo** vale la pena probar otro. Y
tiene dos respuestas malas y una buena, porque no todos los fallos son iguales:

- Un **5xx**, un **429** o un corte de red dicen «este proveedor no está
  disponible ahora». Otro proveedor sí puede estar.
- Un **4xx** dice «tu petición o tu credencial están mal». Ningún otro
  proveedor va a aceptar una clave que no existe ni un cuerpo inválido.

Cada intento es una llamada facturada.

## Decision

`fetchWithRetry` (`_lib/llm/retry.ts`) envuelve **sólo** lo transitorio en
`LLMTransientError`: 5xx, 429 y errores de red, tras agotar sus reintentos. Un
4xx se devuelve tal cual, sin envolver.

`dispatch.ts` cae al siguiente eslabón **si y sólo si** el error es
`LLMTransientError`. Cualquier otro se relanza inmediatamente, sin recorrer el
resto de la cadena.

La misma regla rige la cadena de visión, que además exige **dos** condiciones
para tener segundo eslabón: que el otro proveedor esté en
`AI_FALLBACK_PROVIDERS` **y** que tenga clave dedicada — sin clave propia, caer
a él fallaría con un 401 habiendo gastado la llamada.

## Consequences

### Positive

- Una clave mal configurada **falla una vez**, no una vez por proveedor.
- El error que ve quien depura es el real —«tu API key no vale»— y no un
  genérico «todos los proveedores fallaron» que entierra la causa.
- Una caída puntual de un proveedor **sí** se absorbe: es para lo que existe la
  cadena.
- Lo que responde un fallback se cachea bajo la clave del **primario**, así que
  la siguiente petición idéntica no vuelve a estrellarse contra el caído.

### Negative

- **La clasificación depende del código HTTP**, y los proveedores no siempre son
  fieles: alguno puede devolver 400 ante una sobrecarga temporal. En ese caso no
  habría fallback aunque conviniera.
- Un **429 por cuota agotada del mes** —permanente en la práctica— se trata como
  transitorio y consume la cadena entera antes de rendirse.

### Neutral

- La regla vive repartida en dos ficheros: `retry.ts` decide qué se envuelve y
  `dispatch.ts` decide qué hacer con lo envuelto. Es una separación deliberada
  —quien clasifica no decide la política— pero obliga a leer los dos para
  entender el comportamiento.

## Alternatives considered

- **Caer al siguiente ante cualquier error.** Es lo más simple y lo más caro:
  multiplica el gasto por el largo de la cadena y esconde los bugs de
  configuración, que son los más frecuentes.
- **No tener cadena; fallar y ya.** Deja la aplicación a merced de la
  disponibilidad de un solo proveedor.
- **Clasificar por el cuerpo del error en vez de por el código.** Cada proveedor
  tiene su formato; sería un analizador frágil por cada uno.
- **Reintentar el 4xx una sola vez contra otro proveedor.** Sigue gastando una
  llamada por un error que ya sabemos que no se arregla.

## References

- `netlify/functions/_lib/llm/retry.ts`, `netlify/functions/_lib/llm/dispatch.ts`
- ADR [0005](./0005-llm-task-routing-per-user.md) — el enrutado por tarea y
  usuario que decide qué proveedor es el primario.
- PR #378 — cobertura de `retry.ts`.
- PR #379 — cobertura de `dispatch.ts`; la regla queda fijada con un test cuya
  mutación (tratar el permanente como transitorio) lo tumba.
