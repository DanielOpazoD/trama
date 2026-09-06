# Contratos de lectura en runtime

## Problema

Los tipos de `src/api` viven solo en compilación. El backend (real o de demo)
puede devolver otra forma y nadie lo ve hasta que un componente hace
`.map` sobre `undefined` y la app cae al ErrorBoundary. Pasó tres veces con
la demo (`health.auth`, `x/status.counts`, `home`) y el contrato de #440 solo
comprueba que la ruta exista, no lo que devuelve. Era el pendiente de fondo
de la última evaluación: «formas validadas en runtime en el borde».

## Cambios

- **`src/api/contracts.ts`**: la forma mínima que cada consumidor lee, en
  `zod/mini`, para nueve lecturas GET: `home`, `counts`, `health`,
  `x/status`, `entities-refs-count`, `momentos-orphaned-blobs`,
  `momentos-url-preview`, `saved-queries`, `momentos-share-invitations`. Cada
  contrato declara además la ruta con la que la demo lo prueba.
- **`requestContract(key, url)`** en `request.ts`: pide con `request` y
  verifica contra el contrato. Nunca sustituye la respuesta (los esquemas
  son parciales a propósito: campos de más pasan sin mirarse). En desarrollo
  y tests un desvío rechaza la promesa con el campo culpable; en producción
  se reporta una vez por sesión a consola y a `/api/error-log` y la app sigue
  con lo que llegó.
- **Carga diferida**: `contracts.ts` (y zod) entran por `import()` después de
  la primera respuesta verificada. Medido: chunk de 6,5 KB gz que no aparece
  en `index.html`; la carga inicial pasa de 198 a 199 KB (el código de
  `requestContract` en `request.ts`).
- **Tres cierres en test**:
  1. `contracts.test.ts`: entrega tal cual cuando cumple; rechaza nombrando
     contrato y campo cuando no.
  2. `demoRoutes.contract.test.ts` gana la mitad que le faltaba: cada
     respuesta de la demo debe cumplir el contrato del cliente.
  3. En compilación, `[Tipo] extends [Salida del esquema]`: si alguien cambia
     el tipo del cliente y olvida el esquema (o al revés), `typecheck` falla.

## Decisiones

- **Verificar, no parsear.** Devolver la salida de zod recortaría campos que
  el esquema no lista y obligaría a esquemas completos (cientos de líneas por
  fila). Con esquemas parciales el contrato dice lo que el consumidor
  necesita y nada más.
- **`contracts.ts` es hoja.** Importar tipos de `momentos.ts` o `x.ts` desde
  ahí cerraba un ciclo con `request.ts` (lo dijo `check:architecture`). La
  relación tipo ↔ esquema vive en el test, que sí puede importar de todos.
- **El check de tipos va entre corchetes.** `T extends S` distribuye sobre
  uniones: con `XStatus`, el miembro `{ connected: false }` bastaba para dar
  `true` y un campo renombrado en el miembro conectado pasaba. Se vio por
  mutación antes de cerrar el pack; `[T] extends [S]` lo arregla y ambas
  mutaciones (unión y objeto) rompen `typecheck`.
- **Nueve lecturas, no setenta.** Entran las que ya se cayeron y las que
  devuelven objeto (donde `[]` revienta). Las listas de filas (`entities`,
  `quotes`…) pasan por `transform.ts` y tienen su propio ruido; van después,
  con el mismo mecanismo.

## Validación

- Mutaciones: la demo devolviendo `counts` sin `momentos` falla el contrato
  de demo nombrando el campo; renombrar `counts` en `XStatus` o `mode` en
  `HealthResponse` rompe `typecheck` en `contracts.test.ts`.
- Tests de `src/api`, de demo y de las vistas consumidoras en verde;
  `typecheck`, `lint`, `format:check`, gates del job `lint` (incluidos
  `architecture`, `dependency-cruiser`, `knip`) y el presupuesto de bundle.

## Lo que encontró el contrato antes de entrar

- Una fixture de `NotasFeedView.test.tsx` simulaba la vista previa de URL sin
  `source`, campo que el servidor siempre manda. El test pasaba porque nada
  comparaba la fixture con el contrato; con `requestContract` en desarrollo
  el desvío rechaza la lectura y el test cayó en CI. Se completó la fixture.

## Pendiente

- Extender los contratos a las lecturas de listas (`entities`, `quotes`,
  `relationships`, `momentos`, `notes`) con esquemas parciales de fila; hoy
  siguen sin verificación.
- Los contratos son del cliente; las funciones de Netlify no los importan.
  Compartirlos (que `home.mts` valide su salida con el mismo esquema)
  cerraría el borde desde los dos lados.
