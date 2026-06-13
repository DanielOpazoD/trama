# Editorial Workflow Consolidation — Plan ejecutable

> **Tesis guía (de CODEX, adoptada):** No reconstruir Trama. Hacer que lo
> capturado circule mejor, conserve procedencia y **termine en una pieza
> editorial persistente.**

**Rama:** `claude/editorial-workflow-consolidation` (desde `main @ b6706fae`, post-#203).

## Estado verificado en `main` (lo que NO hay que rehacer)

- ✅ **Shell consolidado**: `src/App.tsx` = 619 líneas, `useAppModals` extraído.
- ✅ **Promote idempotente + provenance**: `netlify/functions/recortes.mts` `POST /:id/promote`
  crea cita/entidad/momento en un CTE, devuelve el existente si ya estaba promovido,
  arrastra `origin` (`importedFrom:'recorte'`) y calcula embeddings. Expuesto en
  `src/state/useRecortes.ts` (`promoteRecorte`).
- ✅ **Flujo (#203)**: `KnowledgeWorkflowView` = inbox (`buildKnowledgeInbox`) + mesa
  (localStorage vía `useKnowledgeWorkbench`) + propuesta (`buildNarrativeProposal`) +
  export Markdown (`buildEditorialMarkdown`). **No acciona ni persiste.**

## Principios

- Aditivo, sin reescrituras. Sin ORM, router propio, plugin de mundos, Redux ni EAV.
- Reusar patrones probados: vertical favoritos/recortes (migración → endpoint → schema
  Zod → api → hook → UI), CTE idempotente, RLS FORCE por usuario, soft-delete.
- Proyectos **mínimos** primero (título + materiales + borrador). Versionado/estados después.
- Cada bloque cierra con la suite verde (typecheck, lint, prettier, tests vía espejo /tmp,
  build, ratchets, migration-duplicates, cte-regression).

---

## Bloque 1 — Proyectos editoriales persistentes (mínimos) · el titular

Convertir la mesa temporal de Flujo en un objeto guardado. Reusa el patrón favoritos.

**Datos** — migración aditiva `reading_tables` (mesa/proyecto editorial):

- [ ] `netlify/database/migrations/20260613xxxxxx_reading_tables/migration.sql`:
      tabla `reading_tables` (id, user_id, title, material_ids JSONB DEFAULT '[]',
      draft_markdown TEXT, status TEXT DEFAULT 'borrador', origin JSONB, created_at,
      updated_at, deleted_at) + RLS FORCE + políticas per-user (select/insert/update) +
      índice `(user_id) WHERE deleted_at IS NULL`. CHECK title 1–200.

**Backend**:

- [ ] `netlify/functions/_lib/reading-table-schemas.ts`: Zod `ReadingTableCreateBody`
      (title, materialIds, draftMarkdown nullish), `ReadingTablePatchBody`.
- [ ] `netlify/functions/reading-tables.mts`: CRUD (GET list / POST create con
      `ensureUserRow` / PATCH / DELETE soft + restore). Sin CORS de extensión (es app-only).
- [ ] `netlify/functions/_lib/reading-tables-endpoint.test.ts`: list/create/patch/404/restore.

**App**:

- [ ] `src/api/readingTables.ts`: tipo `ReadingTable`, `readingTableFromRow`, `readingTablesApi`.
      Cablear en `src/api/index.ts`.
- [ ] `src/state/useReadingTables.ts`: query + create/update/remove (toast Deshacer). `queryKeys`.
- [ ] Demo: `demoTypes.ts`/`demoStore.ts`/`demoSeed.ts`/`demoRouter.ts` con `reading_tables`.

**UI (Flujo)**:

- [ ] En `KnowledgeWorkflowView`: botón **“Guardar mesa como proyecto”** (toma material_ids
      seleccionados + el Markdown del borrador), y una lista **“Proyectos”** para reabrir
      (rehidrata la mesa). Estética dossier, no kanban.
- [ ] Tests de componente con hooks mockeados.

**Verificar:** migration-duplicates, suite completa, smoke visual en preview (modo prueba).

---

## Bloque 2 — Inbox accionable (cierre de ciclo)

Las tarjetas del inbox hoy solo “añaden a mesa”. Sumar el siguiente paso, reusando lo existente.

- [ ] En `KnowledgeInboxCard`: menú de acción por ítem según `source`:
      recorte → **promover** (deep-link al promote de Recortes que ya existe) / **archivar**;
      sugerencia → **descartar/aplicar**; nota → **a Momento** (promote ya existe); tarea → **completar**.
- [ ] Usar las mutaciones existentes (`useRecortes`, `useProactive`, `useNotes`, tasks);
      no reimplementar el promote.
- [ ] Toasts de confirmación + Deshacer donde aplique.

**Verificar:** tests de las acciones + suite.

---

## Bloque 3 — Modo lectura editorial transversal

Superficie compartida para leer textos largos (borrador de Flujo, citas extensas, ensayos).

- [ ] `src/components/ReadingMode.tsx`: panel/modal fullscreen, medida ~65ch, serif,
      respiración vertical, capitular opcional, `prefers-reduced-motion`, cerrar con Esc.
- [ ] Botón “leer” en: borrador de Flujo (Bloque 1), Citas (cita larga), Chat (ensayo).
- [ ] Test de comportamiento (abrir/cerrar, foco, contenido).

**Verificar:** a11y básica (foco, Esc, roles) + suite.

---

## Fuera de alcance (anti-sobreingeniería)

- Versionado de borradores, estados ricos de proyecto, dossiers complejos → después.
- Mundos nuevos (Biblioteca/Diario/Taller), búsqueda semántica universal, weight/strength
  del grafo → no hay feature concreta que lo pida hoy.
- Tocar el modelo núcleo (entities/relationships/quotes) → sano, no se toca.

## Secuencia

Bloque 1 (vertical de datos→UI) → Bloque 2 (acciones) → Bloque 3 (lectura).
El único paso casi-irreversible es la migración del Bloque 1: va primero porque la forma
ya está probada por la mesa localStorage, pero se revisa con `migration-duplicates` antes de commitear.
