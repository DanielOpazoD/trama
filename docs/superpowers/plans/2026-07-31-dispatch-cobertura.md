# El router del subsistema LLM deja de estar a ciegas

## Problema

`dispatch.ts` elige **qué proveedor de IA se llama**, decide **si se cae a otro
cuando el primero falla** y decide **si se sirve de caché**. Las tres cosas
tienen factura.

Estaba en **24,32 % de ramas**: tres de cada cuatro decisiones sin verificar.
Era el mayor hueco medido del repositorio, y quedó anotado como fuera de alcance
del pack anterior precisamente porque merecía uno propio.

## La invariante que domina el fichero

> **Un fallo permanente (4xx) NO cae al siguiente proveedor.**

Si cayera, una clave mal configurada gastaría una llamada facturada en **cada**
proveedor de la cadena, y el error real —«tu API key no vale»— quedaría
enterrado bajo un genérico «todos los proveedores fallaron». Sólo lo transitorio
(5xx / 429 / red), que llega envuelto en `LLMTransientError`, justifica probar
otro.

La misma regla vale para la cadena de visión, y se verifica por separado.

## Lo que se fija

**29 tests** repartidos en los cuatro puntos de entrada. Se doblan los
colaboradores: aquí se prueban las **decisiones del despachador**, no los
proveedores ni el formato SSE, que tienen sus propios tests.

Además de la invariante:

- **La caché no gasta.** Un acierto no toca ningún proveedor.
- **Lo que responde un fallback se cachea bajo la clave del primario.** Es lo
  que el propio código documenta: así la siguiente petición idéntica no vuelve a
  estrellarse contra el proveedor caído.
- **El transitorio del último eslabón se relanza**, no se traga.
- **Visión exige DOS condiciones**, no una: el otro proveedor tiene que estar en
  `AI_FALLBACK_PROVIDERS` **y** tener clave dedicada. Sin clave propia, caer a
  él fallaría con un 401 habiendo gastado la llamada. Se verifica quitando cada
  condición por separado.
- **Un override a `deepseek`/`anthropic` en visión se ignora**: no tienen API de
  imagen cableada, y obedecerlo llamaría a un endpoint que no existe.
- **El streaming nunca miente sobre la caché.** El SSE real siempre pega al
  proveedor, así que su `done` no puede decir `fromCache: true`.
- **Anthropic y Gemini mantienen el contrato** aunque no tengan streaming: un
  chunk con todo el texto y su `done`. Si esto se rompiera, el chat quedaría
  mudo con esos proveedores sin que nada lo avisara.
- **Los errores del streaming salen como frame**, no como excepción.

## Validación

Seis mutaciones, cada una sobre una decisión con consecuencia:

| mutación                                         | qué falla                                      |
| ------------------------------------------------ | ---------------------------------------------- |
| **el permanente también cae al siguiente**       | «NO cae al siguiente ante un fallo permanente» |
| deja de leer la caché                            | «sirve de caché sin tocar ningún proveedor»    |
| no cachea lo que respondió el fallback           | «cachea la respuesta del fallback…»            |
| el override a un proveedor sin visión se obedece | los 2 de «ignora un override a…»               |
| visión cae al otro sin exigir clave dedicada     | «sin clave dedicada no hay cadena»             |
| el streaming dice que vino de caché              | «trocea el SSE y cierra con el usage»          |

### Resultado medido

|                          | antes     | después   |
| ------------------------ | --------- | --------- |
| `dispatch.ts` sentencias | 34,95     | **96,74** |
| `dispatch.ts` **ramas**  | **24,32** | **82,43** |
| `dispatch.ts` líneas     | 35,89     | **98,29** |
| `_lib/llm` ramas         | 55,22     | **76,61** |

**Umbral propio** para `dispatch.ts` (93 / 78 / 84 / 95), siguiendo el patrón de
`auth.ts`, `cost-cap.ts`, `user-rls.ts`, `retry.ts` y `transcription.ts`.

**El umbral global NO se toca.** Pasó de 68,71 a 68,92 de ramas: 393 líneas
sobre ~102.000 no mueven una media. Y ése es justamente el argumento del piso
propio — sin él, este fichero podría volver al 24 % sin que el total se
inmutara. Subir el global 0,2 puntos sólo añadiría fragilidad sin proteger nada.

Verificado que el global aguanta **con `dispatch.ts` ya excluido** del cómputo
(Vitest saca del total a los que llevan piso propio): la corrida de verificación
pasa con 68,92.

### Dos líneas sin cubrir, a propósito

Las únicas que quedan (135 y 390) son los `throw` que el propio fichero marca
como **inalcanzables**: _«el loop siempre retorna o lanza, pero satisface a
TS»_. Escribir tests para código inalcanzable sube el número sin verificar nada
— sería exactamente el «que pase CI» que el config prohíbe.

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle y la suite completa.

## Fuera de alcance

- **`db-cache.ts`** (40 % ramas) y **`config.ts`** (61,9 %).
- **`gemini.ts`** (46 %) y **`openai-compatible.ts`** (50 %) — los proveedores.
- **ADRs** (`docs/adr/`): la cadena de proveedores y su regla
  transitorio/permanente es una de las decisiones que ese documento debe
  explicar, y ahora está entendida a fondo.
