# Test Architecture

Este contrato ordena helpers compartidos para tests sin crear un framework propio.
La regla es simple: un helper se usa cuando elimina ruido repetido y deja más
visible el comportamiento probado.

## Principios

- Los tests siguen leyendo como especificaciones. Si hay que abrir muchos
  helpers para entender el caso, el helper está escondiendo intención.
- Las factories tienen defaults válidos y overrides explícitos. No generan datos
  aleatorios ni dependen del reloj.
- Los builders de requests modelan la frontera HTTP real: URL absoluta, query
  params, JSON, FormData, auth y `x-request-id`.
- Los helpers multiusuario hacen visible el owner esperado. No reemplazan las
  assertions de seguridad.
- Los smokes live con tokens reales no usan estas fixtures; siguen sus runbooks.

## Ubicaciones

| Archivo                                   | Uso                                                                               | Límite                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| `src/test/factories/domain.ts`            | Factories camelCase para state/UI: notas, recortes, momentos, attachments y feed. | No modela SQL ni snake_case.            |
| `src/test/cache/queryClientHarness.tsx`   | `QueryClient` aislado + providers para `renderHook`.                              | No agrega stores ni estado global.      |
| `netlify/functions/_lib/test-fixtures.ts` | Request builders, usuarios A/B y rows snake_case para endpoint tests.             | No reemplaza mocks SQL existentes.      |
| `scripts/test-utils/temp-fixtures.mjs`    | Directorios temporales para tests de scripts.                                     | No es script operacional ni comando CI. |

## Matriz De Migración

| Superficie                                     | Antes                                                 | Ahora                                                        |
| ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `recortes-endpoint.test.ts`                    | `new Request(...)` y row base local.                  | `buildApiRequest`, `buildJsonApiRequest`, `buildRecorteRow`. |
| `momentos-endpoint.test.ts`                    | Filas repetidas con `kind/payload/origin/timestamps`. | `buildMomentoRow` en list/get/delete/post críticos.          |
| `notas-attachments-endpoint.test.ts`           | Query strings, request-id y rows a mano.              | Request builder + `buildNotasAttachmentRow`.                 |
| `isolation.test.ts`                            | Token request local y `flatMap(values)` repetido.     | `buildApiRequest` + `assertSqlValuesContainUser`.            |
| `cacheContracts.test.tsx`                      | Factories locales de nota/recorte/feed.               | Factories compartidas de dominio.                            |
| `useMomentos.test.tsx`, `useRecortes.test.tsx` | Wrappers `QueryClientProvider` locales.               | `createQueryClientHarness`.                                  |
| `check-script-registry.test.mjs`               | `mkdtempSync/mkdirSync/writeFileSync` local.          | `makeTempFixtureRoot`.                                       |

## Reglas Para Nuevos Tests

1. Si el test necesita una entidad válida por defecto, usa una factory y
   sobreescribe solo los campos relevantes para el caso.
2. Si el test necesita un request Netlify, usa `buildApiRequest` o
   `buildJsonApiRequest` para no copiar headers, base URL y query params.
3. Si el test valida aislamiento, usa usuarios explícitos (`TEST_USERS.a/b`) o
   una constante local clara, y mantén una assertion visible del `user_id`.
4. Si el helper no reduce al menos dos repeticiones reales, escribe el dato
   inline en el test.
5. No agregues snapshots para reemplazar assertions de seguridad, ownership,
   validación o cache.

## No Objetivos

- No reescribir toda la suite.
- No mover smokes productivos con secrets reales a fixtures fake.
- No meter random data, faker, factories globales mutables ni DSL propio.
- No esconder payloads críticos detrás de builders opacos.
