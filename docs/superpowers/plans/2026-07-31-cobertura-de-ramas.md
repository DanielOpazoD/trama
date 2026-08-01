# Los dos módulos que deciden gasto dejan de estar sin tests

## Cómo se eligió el objetivo

Con datos, no por tamaño. Una corrida real de `test:coverage` sobre
`netlify/functions/_lib/llm` daba **59,6 % sentencias · 54,22 % ramas**, y
dentro:

| fichero            | sentencias              | ramas | líneas |
| ------------------ | ----------------------- | ----- | ------ |
| `transcription.ts` | **0**                   | **0** | **0**  |
| `dispatch.ts`      | 34,95                   | 24,32 | 35,89  |
| `db-cache.ts`      | 51,85                   | 40    | 59,09  |
| `cache.ts`         | 76,19                   | 60    | 77,77  |
| `retry.ts`         | — sin fichero de test — |       |        |

El criterio no fue «el hueco más grande» sino **consecuencia por línea**.
`dispatch.ts` tiene el peor porcentaje, pero son 393 líneas: cubrirlo bien es
otro pack, y meterlo aquí habría convertido esto en un refactor.

## Los dos elegidos

**`retry.ts`** — 58 líneas, ocho ramas, ningún test. Decide dos cosas caras:

- **Dinero.** Cada reintento es otra llamada facturada. Reintentar un 401 no lo
  arregla nunca y multiplica el gasto por tres.
- **Corrección.** Sólo lo que sale envuelto en `LLMTransientError` hace que el
  despachador caiga a **otro** proveedor. Si un 4xx se envolviera, un bug de
  credenciales se disfrazaría de «proveedor caído» y se enmascararía recorriendo
  la cadena entera.

**`transcription.ts`** — 0 % y **calcula dinero**: su estimación por minuto es
lo que el tope mensual de gasto contabiliza por cada nota de voz. Una constante
equivocada no rompe nada visible; sólo hace que el cap cuente mal, en silencio,
hasta que la factura no cuadra.

Los tests **no fijan el número exacto** del coste —es una estimación declarada,
clavarla sería falso— sino sus **propiedades**: que crece con la duración, que
nunca es cero, y que un minuto de audio no produce un disparate.

## Validación

25 tests nuevos. Seis mutaciones, cada una sobre una decisión con consecuencia:

| mutación                                | qué falla                                    |
| --------------------------------------- | -------------------------------------------- |
| reintenta también los 4xx               | los 5 casos de «no reintenta un 4xx»         |
| deja de envolver en `LLMTransientError` | los 4 de «reintenta hasta agotar»            |
| el 429 deja de ser transitorio          | «reintenta un 429 hasta agotar»              |
| confunde segundos con minutos           | «un minuto cuesta del orden de 0,6 céntimos» |
| desaparece el suelo de 0,1              | «nunca baja de 0,1 céntimos»                 |
| informa tokens falsos                   | «devuelve el texto y un usage de openai»     |

La cuarta es la que más importa: **caza el factor 60** en la facturación, que es
justo el error que nadie ve.

### Umbrales, con los números medidos

El propio `vitest.config.ts` lo pide: _«si subiste el piso porque agregaste
tests, actualizá estos números explícitamente — el threshold es una decisión
consciente, no un "que pase CI"»_.

Medido tras los tests: **77,76 sentencias · 68,71 ramas · 76,65 funciones ·
80,10 líneas**. Los pisos quedan ~2 puntos por debajo, como el resto del
fichero:

|            | antes | ahora  |
| ---------- | ----- | ------ |
| ramas      | 63    | **66** |
| líneas     | 77    | **78** |
| sentencias | 74    | **75** |
| funciones  | 72    | **74** |

Además, **piso propio para los dos ficheros** (95 %), siguiendo el patrón que ya
tienen `auth.ts`, `cost-cap.ts` y `user-rls.ts`. El motivo es el que declara el
config: son 124 líneas sobre ~102.000, así que podrían desplomarse **sin mover
la aguja del total**. Ambos miden 100 %.

Comprobado que los umbrales aguantan con esos dos ficheros ya excluidos del
cómputo global (Vitest saca del total a los que llevan piso propio): la corrida
de verificación pasa con el global intacto en 68,71.

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle y la suite completa.

Nota de proceso: dos corridas de cobertura se perdieron por el flaky de
`buildLibro` bajo carga —yo estaba ejecutando mutaciones en paralelo—. La
medición buena es la que corrió sola.

## Fuera de alcance

- **`dispatch.ts`**: 393 líneas al 24,32 % de ramas. El mayor hueco que queda;
  merece pack propio.
- **`db-cache.ts`** (40 % ramas) y **`gemini.ts`** (46 %).
- **El inspector**: convertir en gate automático las reglas de UI que este
  programa viene encontrando a mano (controles inertes, acciones duplicadas,
  hover sin alternativa táctil).
