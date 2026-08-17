# Un piso de cobertura donde un desplome no se vería

## Problema

El umbral de ramas es el más flojo de los cuatro globales (66%, frente a 78 de
líneas). La tentación es empujar ese número global, pero eso premia cubrir lo
fácil: `src` tiene ~102.000 líneas, así que un módulo pequeño puede desplomarse
sin mover la aguja del total ni un decimal.

Es literalmente lo que pasó con el defecto de las 16 hojas que pesaban 1,8 GB
(#404): vivía en el pipeline de exportación, y la suite entera seguía verde.

## Cambio

Un piso propio para `src/lib/pdfStudio/assemble/**`, el pipeline que decide qué
bytes acaban en el archivo que el usuario descarga.

| eje        | medido | piso |
| ---------- | ------ | ---- |
| statements | 79,92  | 77   |
| branches   | 72,66  | 70   |
| functions  | 91,25  | 88   |
| lines      | 82,94  | 80   |

Los pisos quedan por debajo de lo medido para absorber el jitter de v8, siguiendo
el patrón que el repo ya usa para `auth.ts` y `cost-cap.ts`.

## Decisiones

- **Se elige por consecuencia, no por número bajo.** Los módulos con las ramas
  más flojas del repo son los wrappers `.mts` de Netlify (varios al 0%), pero
  ahí la baja cobertura es **por diseño**: son wrappers finos que delegan en
  `_lib`, y así lo dice la convención. Ponerles un piso sería fijar lo
  equivocado.
- **Se descartó `src/lib/biblioteca/**`.** Parecía candidato (58% de ramas), pero
ese número lo arrastra `officeParse.worker.ts`, que por definición no se
  ejecuta en tests unitarios: los Workers no corren en vitest. Un piso ahí
  mediría cuánto worker hay, no cuánto está probado.
- **Un directorio y no archivo por archivo.** El pipeline se reparte entre once
  módulos que se mueven juntos; un piso por archivo obligaría a retocar la
  configuración en cada refactor sin ganar señal.

## Validación

- Suite completa con cobertura en verde: **5396 tests**, umbral nuevo incluido.

**Verificado por mutación** — porque un umbral que no se aplica es peor que
ninguno, ya que aparenta cobertura:

```
branches: 99 →
ERROR: Coverage for branches (72.66%) does not meet
"**/src/lib/pdfStudio/assemble/**" threshold (99%)
```

El glob resuelve, el piso se evalúa y falla nombrando el módulo.

## Pendiente

- El umbral global de ramas sigue en 66%. Subirlo pide cubrir superficies
  concretas, no cambiar el número: cada punto son ~1.000 ramas repartidas por
  todo el repo.
