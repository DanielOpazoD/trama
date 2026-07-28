# El punto ciego del compilador: mocks de módulo incompletos

## Problema

`vi.mock(ruta, () => ({ … }))` devuelve un objeto **sin tipar**. TypeScript no
sabe que ese objeto debe parecerse al módulo real, así que añadir un export y
usarlo desde un endpoint deja el mock incompleto **sin un solo error de
compilación**: el endpoint llama a `undefined` y el test falla en runtime con un
error genérico, lejos de la causa.

Pasó en el PR #362: añadí `needsReconnect` a `_lib/x/index.ts` y dos endpoints
reventaron con `INTERNAL`. Hubo que rastrearlo a mano.

En un repositorio con **un solo `any` y cero `@ts-ignore`**, los mocks de módulo
son el punto ciego real del compilador. Y no es un caso aislado: hay **374
`vi.mock` en 180 archivos**.

## La regla

No es "mockea todo el módulo" — un mock parcial es legítimo y deseable: se
mockea lo que hace falta. La regla es más fina:

> el mock debe proveer todo lo que los **módulos bajo prueba** importan de ese
> módulo.

Si el test mockea `./x/index.js` y también importa `../x-status`, entonces todo
lo que `x-status` importe de `./x/index.js` tiene que estar en el mock. Nada
más, y nada menos. Esa distinción es lo que evita que el gate genere ruido: no
exige completitud, exige **suficiencia**.

## Lo que encontró en su primera corrida

Un defecto latente real: `netlify/functions/_lib/x-cronica-endpoint.test.ts`
mockea `./x/index.js` sin `softDeleteXCronicas`, que `x-cronica.mts:52` llama en
el camino `DELETE`. **Ese endpoint habría reventado con `TypeError` en cuanto
alguien ejercitara ese camino** — y nadie lo ejercitaba, porque no había test de
DELETE. Por eso sobrevivió.

Corregido con el mock completo **y** un test del camino que faltaba, que además
comprueba que el borrado va acotado al usuario autenticado.

## Calibración

La primera versión reportó **7 fallos, todos falsos positivos**: `SavedDoc`,
`Recorte`, `UserPrefs`, `VerifyVerdict`… todos **tipos** importados sin
`import type`. TypeScript los borra al compilar, así que el mock no tiene por
qué proveerlos.

El arreglo fue clasificar los exports del módulo destino en runtime
(`function`/`const`/`class`/`enum`, siguiendo `export *` para los barrels) y
exigir sólo ésos. De 7 hallazgos a 1, y el que quedó era real.

## Lo que este gate NO ve

Está impreso en cada corrida, porque un gate que no dice qué no mira es un gate
en el que no se puede confiar:

| motivo                                | nº      | comentario                           |
| ------------------------------------- | ------- | ------------------------------------ |
| factory no literal (`() => helper()`) | 106     | no hay claves que leer estáticamente |
| módulo externo                        | 45      | fuera de alcance por diseño          |
| `async (importOriginal)`              | 30      | ya cubren todo por construcción      |
| factory con cuerpo de bloque          | 2       | idem que el primero                  |
| **analizados**                        | **236** |                                      |

Y una limitación que no aparece en el contador: **el uso transitivo**. Si el
módulo bajo prueba importa un helper y ese helper usa el módulo mockeado, aquí
no se ve. Sólo se miran los imports directos del sujeto.

Los 45 "módulo externo" se separaron a propósito de los locales: un paquete de
terceros está fuera de alcance, pero un módulo local sin resolver sería un
agujero del propio gate. Hoy no hay ninguno.

## Validación

- **El gate caza el bug que lo motivó**: quitando `needsReconnect` del mock de
  `x-oauth.test.ts`, lo reporta señalando el sujeto (`x-status.mts`).
- **El defecto encontrado es real**: quitando `softDeleteXCronicas` del mock, el
  test nuevo de DELETE falla; con él, pasa.
- Suite completa, `typecheck`, `lint`, `format:check`.
- `check:script-registry` — el script y el gate quedan registrados en
  `SCRIPT_REGISTRY` y `QUALITY_GATES`, y añadidos al job `lint` del workflow.
