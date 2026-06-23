# Cache Contracts

Este documento fija el contrato mínimo para TanStack Query en `src/state/*`.
El objetivo no es crear un framework: es evitar invalidaciones dispersas,
rollbacks incompletos y read-models desincronizados entre Notas, Recortes,
Momentos, entidades, citas, relaciones, tareas, attachments y el feed unificado.

## Helpers

- `src/state/cacheInvalidation.ts` centraliza superficies de invalidación por
  dominio. Si una mutación toca Notas, Recortes, Momentos, entidades, citas,
  relaciones, tareas o attachments, usa el helper del dominio antes de agregar
  `qc.invalidateQueries(...)` directo.
- `src/state/cacheOptimistic.ts` centraliza snapshots y restores de cache. Los
  hooks optimistas deben capturar snapshot antes de parchear y restaurarlo en
  `onError`.
- `src/state/queryClient.ts` sigue siendo la fuente de verdad para las
  `queryKeys`. Los helpers importan esas keys; no duplican strings.

## Superficies Por Dominio

- Notas: `notes` + `notasFeed` + `search`. Promover una nota también invalida
  `momentosInfinite`, `cronologiaInfinite` y `home`.
- Recortes: `recortes` + `notasFeed` + `search`. Crear recorte también invalida
  `counts` y `home`. Promover invalida el destino: `quotes/quotesInfinite`,
  `entities` o `momentosInfinite`, además de `counts` y `home`.
- Momentos: `momentosInfinite`, `home`, `cronologiaInfinite`, `atlas` y
  `search`.
- Entidades: create/update invalidan sus read-models derivados
  (`entitiesInfinite`, `home`, `atlas`, `cronologiaInfinite`, y en create
  también `counts`/`entityRefsCount`). Delete refresca las listas infinitas del
  grafo (`entitiesInfinite`, `relationshipsInfinite`, `quotesInfinite`),
  agregados y superficies derivadas. Merge/restore además refrescan los queries
  base wholesale (`entities`, `relationships`, `quotes`) porque el servidor puede
  reasignar o revivir links, citas y momentos vinculados.
- Citas: create/delete invalidan `quotesInfinite`, `counts`, `entityRefsCount`
  y `home`; update invalida `quotesInfinite` y `home`; restore añade `quotes`
  wholesale al mismo contrato de delete.
- Relaciones: create/delete invalidan `relationshipsInfinite`, `counts`,
  `entityRefsCount` y `home`; update invalida `relationshipsInfinite` y `home`;
  restore añade `relationships` wholesale al mismo contrato de delete.
- Tareas: cualquier create/update/delete/restore invalida el prefijo `tasks`,
  `cronologiaInfinite` y `home`.
- Attachments: siempre invalida `notasAttachments(ownerType, ownerId)`. Si el
  owner es `note`, también invalida `notes`, `notasFeed` y `search` porque
  `hasImages` y `hasAudio` se derivan en servidor. Si el owner es `task`,
  invalida `tasks`.

## Matriz De Contratos

| Acción                                  | Queries afectadas                                                                                                                                                                            | Razón                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Crear/editar/eliminar/restaurar nota    | `notes`, `notasFeed`, `search`                                                                                                                                                               | Cambia contenido textual y el read-model del feed.                           |
| Promover nota a Momento                 | `notes`, `notasFeed`, `search`, `momentosInfinite`, `cronologiaInfinite`, `home`                                                                                                             | La nota cambia estado y aparece un Momento derivado.                         |
| Crear/editar/eliminar/restaurar recorte | `recortes`, `notasFeed`, `search`                                                                                                                                                            | Cambia captura indexable y su presencia en el feed.                          |
| Crear recorte                           | `recortes`, `notasFeed`, `search`, `counts`, `home`                                                                                                                                          | Además de la bandeja/feed, cambia métricas e Inicio.                         |
| Promover recorte                        | `recortes`, `notasFeed`, `search`, destino, `counts`, `home`                                                                                                                                 | El recorte cambia triage y nace/actualiza el objeto destino.                 |
| Revertir promoción de recorte           | `recortes`, `notasFeed`, `search`, posibles destinos, `counts`, `home`                                                                                                                       | El destino puede ser cita, entidad o momento.                                |
| Crear/editar/eliminar/restaurar Momento | `momentosInfinite`, `home`, `cronologiaInfinite`, `atlas`, `search`                                                                                                                          | Cambia timeline, agregados e índice global.                                  |
| Crear entidad                           | `counts`, `entityRefsCount`, `entitiesInfinite`, `home`, `atlas`, `cronologiaInfinite`                                                                                                       | Cambia grafo, agregados e Inicio.                                            |
| Editar entidad                          | `entitiesInfinite`, `home`, `atlas`, `cronologiaInfinite`                                                                                                                                    | Cambia read-models de grafo/timeline sin tocar relaciones.                   |
| Eliminar entidad                        | `counts`, `entityRefsCount`, `entitiesInfinite`, `relationshipsInfinite`, `quotesInfinite`, `home`, `atlas`, `cronologiaInfinite`, `momentosInfinite`                                        | Cascadea soft-delete a citas/relaciones y puede afectar momentos vinculados. |
| Merge/restaurar entidad                 | `entities`, `relationships`, `quotes`, `counts`, `entityRefsCount`, `entitiesInfinite`, `relationshipsInfinite`, `quotesInfinite`, `home`, `atlas`, `cronologiaInfinite`, `momentosInfinite` | Reasigna o revive relaciones derivadas del grafo.                            |
| Crear/eliminar cita                     | `quotesInfinite`, `counts`, `entityRefsCount`, `home`                                                                                                                                        | Cambia conteos, refs e Inicio.                                               |
| Editar cita                             | `quotesInfinite`, `home`                                                                                                                                                                     | Cambia listas y destacados sin mover refs necesariamente.                    |
| Restaurar cita                          | `quotes`, `quotesInfinite`, `counts`, `entityRefsCount`, `home`                                                                                                                              | Revive la cita y el query wholesale usado por vistas/cache de dominio.       |
| Crear/eliminar relación                 | `counts`, `entityRefsCount`, `relationshipsInfinite`, `home`                                                                                                                                 | Cambia grafo, refs e Inicio.                                                 |
| Editar relación                         | `relationshipsInfinite`, `home`                                                                                                                                                              | Cambia la lista y el resumen de Inicio.                                      |
| Restaurar relación                      | `relationships`, `counts`, `entityRefsCount`, `relationshipsInfinite`, `home`                                                                                                                | Revive la relación y el query wholesale usado por vistas/cache de dominio.   |
| Crear/editar/eliminar/restaurar tarea   | `tasks`, `cronologiaInfinite`, `home`                                                                                                                                                        | Cambia listas de tareas, calendario e Inicio.                                |
| Attachment de nota                      | `notasAttachments(owner)`, `notes`, `notasFeed`, `search`                                                                                                                                    | `hasImages`/`hasAudio` se recalculan server-side.                            |
| Attachment de tarea                     | `notasAttachments(owner)`, `tasks`                                                                                                                                                           | Solo cambia owner operativo de Tareas.                                       |

## Optimistic Update

Usa optimistic update solo cuando la UI se beneficia de respuesta inmediata y
el rollback es claro:

- patch de nota (`pinned`, título, contenido): snapshot de `notes` y todas las
  variantes cargadas de `notasFeed`.
- patch/promoción de recorte: snapshot de `recortes` y `notasFeed`.
- create/update de entidad, cita o relación: snapshot del query wholesale del
  dominio (`entities`, `quotes`, `relationships`) y restore en `onError`.
- update/delete de tarea: snapshot de todas las variantes bajo el prefijo
  `tasks` y restore en `onError`.
- mutations con side effects amplios o destino incierto: preferir invalidación
  simple en `onSuccess`.

El patrón recomendado es:

1. `cancelQueries` de las superficies afectadas.
2. `snapshotQuery` / `snapshotQueries`.
3. `setQueryData` optimista.
4. `restoreQuerySnapshot` / `restoreQueriesSnapshot` en `onError`.
5. Helper de invalidación en `onSettled` o `onSuccess` para reconciliar con el
   servidor.

## Undo

Los flujos `delete -> toast Deshacer -> restore` deben partir de la misma
superficie de delete. Cuando el restore revive un objeto que también tiene query
wholesale de dominio, añade ese query base: entidad añade `entities`,
`relationships` y `quotes`; cita añade `quotes`; relación añade `relationships`.
El restore usa el `deletedAt` exacto que devolvió el DELETE, porque el servidor
revive la fila y sus relaciones/attachments por esa marca.

## Tests

Cada cambio en estas superficies debe cubrir al menos una de estas pruebas:

- helper de invalidación: qué keys se invalidan y en qué orden;
- helper optimista: snapshot y rollback de una query puntual o prefijo;
- hook de dominio: delete/undo, promote o attachment owner con keys esperadas;
- rollback optimista: si la API falla, la cache vuelve al snapshot previo.
