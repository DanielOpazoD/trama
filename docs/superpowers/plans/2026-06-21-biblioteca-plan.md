# Plan: sección Biblioteca

**Rama:** `feat/biblioteca`
**Fecha:** 2026-06-21
**Alcance v1 acordado:** visor unificado de archivos **+ subida genérica**.

---

## 1. Objetivo

Un lugar único para ver, buscar, filtrar y gestionar todos los archivos y recursos del usuario: adjuntos de notas, fotos de momentos, imágenes de recortes, PDFs guardados, firmas, y archivos subidos directamente a la Biblioteca. Estética Trama: papel/tinta, editorial, silenciosa, no corporativa.

## 2. Hallazgos que condicionan el diseño

Tras revisar el repo (no es greenfield):

1. **Ya existe un manifiesto de assets**: `storage_assets`
   ([migración](../../../netlify/database/migrations/20260621120000_storage_assets/migration.sql),
   [lib](../../../netlify/functions/_lib/storage-assets.ts)). Registra todos los blobs
   con `user_id`, `domain`, `owner_type`, `mime_type`, `byte_size`, `checksum`, `deleted_at`, RLS por usuario.
2. **Pero NO está backfilleado.** La migración es solo `CREATE TABLE`; `storage_assets` solo se
   llena con escrituras nuevas (`recordStorageAsset`). **Los archivos anteriores al 2026-06-21 no están en el manifiesto.**
   → El read-model de la Biblioteca **no puede apoyarse solo en `storage_assets`**; debe unir las tablas por dominio.
3. **No hay router por path.** Trama cambia de vista por estado (`ViewMode` + `ViewRouter`) y persiste cosas en
   query params. `/biblioteca` no aplica; se adapta a una vista `'biblioteca'` + persistencia en `?tab=&q=&tipo=&fuente=&vista=`.
4. **Patrones universales ya resueltos:** soft delete (`deleted_at`), RLS por `user_id` (Clerk-ready, hoy
   single-user `legacy-single-user`), storage adapter, `ApiErrors`, Zod, transforms snake↔camel. Ver [AGENTS.md](../../../AGENTS.md).
5. **Primitivas y tokens listos:** `ViewHeader`, `OverflowMenu` (popover), `EmptyMessage`, `Skeleton`,
   `Tooltip`, `useModalOverlay`, `.btn-ink`, `.chip`, `.card-paper*`, `.card-segment`. Estética en tokens
   (paper/ink, sombras cálidas, `font-serif` Spectral). Íconos: SVG propios en `Icons.tsx` (no hay librería externa).

## 2.1 Revisión del video de referencia (2026-06-21)

Revisé la grabación (Biblioteca de ChatGPT, 55 s). **Confirma casi toda la spec.** Verificado:

- Layout: sidebar + H1 "Biblioteca" + buscador "Buscar" + botón pill negro "Nuevo ⌄".
- Tabs Todo / Imágenes / Archivos con `?tab=`; toolbar a la derecha: filtro (con badge de activos), cuadrícula, lista.
- Lista = tabla Nombre / Modificado / Tamaño, **encabezados ordenables** (vi orden por Modificado ↑/↓ y por Tamaño ↓),
  íconos por tipo (PDF terracota, JSON `{}`, genérico) y **miniatura real para imágenes** (gif/png/jpeg) inline.
- Cuadrícula = cards 3 col: nombre arriba, ícono/miniatura grande, metadato "PDF · 164 KB"; al hover, acciones
  verticales a la derecha (lápiz, carpeta, descarga, papelera roja) + círculo de selección.
- Popover de filtros: **Fuente** (Subidos, Generados) · **Tipo de archivo** (Imágenes, Documentos, Hojas de cálculo,
  Presentaciones, PDF) · separador · **Eliminados recientemente**. Tipo es selección única (check), refiltra al
  instante (skeleton → resultados/empty).
- Modal "Renombrar archivo" (input + Cancelar / Renombrar). Skeleton de carga. Empty state (lupa + "No se
  encontraron…" + botón "Cargar más").

**Novedades respecto al plan original (ajustadas abajo):**

- **Encabezados ordenables** en la lista → sube a v1.
- **Miniaturas de imágenes** inline (lista y cuadrícula) → versión ligera en v1 (sirvo la imagen real en pequeño;
  la generación de miniaturas —1ª página de PDF, downscale de imágenes grandes— sigue en v2).
- **"Mover a… / Nueva carpeta"**: el video mueve archivos a carpetas (acción carpeta en hover + modal "Mover a…"
  con "Nueva carpeta"). Es una decisión de modelo de datos y de alcance — ver §8.
- "Nuevo ⌄" no se abrió en el video → su menú lo tomo de tu spec, mostrando solo acciones reales.

## 3. Decisiones de arquitectura

### 3.1 Modelo de datos — read-model + decorador (NO una tabla `library_items` nueva)

Crear `library_items` sería una segunda fuente de verdad que se desincroniza de los blobs reales y choca con la
inmutabilidad de migraciones. En su lugar:

- **Read-model por UNION** de las fuentes que ya tienen los datos:

  | `kind` (discriminador) | Fuente                                                   | Título                                              | Fuente derivada                                            | mime / tamaño         |
  | ---------------------- | -------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | --------------------- |
  | `library-upload`       | `storage_assets` (domain `library-uploads`, **nuevo**)   | override.display_title                              | `subido`                                                   | de `storage_assets`   |
  | `notas-attachment`     | `notas_attachments`                                      | override ?? `file_name`                             | `origin.kind='ai'`→`generado`, si no `subido`              | de la fila            |
  | `recorte-image`        | `recorte_images` + `recortes`                            | override ?? `recortes.title` ?? `"Recorte · fecha"` | `recortes.source='whatsapp'`→`whatsapp`, si no `capturado` | `recorte_images.mime` |
  | `momento-foto`         | `momentos` (kind `foto`, payload `items[]`/`storageKey`) | override ?? `payload.caption` ?? `"Foto · fecha"`   | `capturado` / `whatsapp`                                   | del payload           |
  | `pdf-saved`            | `pdf_studio_saved_pdfs`                                  | override ?? nombre                                  | `generado`                                                 | de la fila            |
  | `pdf-stamp`            | `pdf_stamp_assets`                                       | nombre                                              | `generado`                                                 | de la fila            |

  Cada rama proyecta una forma común `{ kind, id, title, mimeType, byteSize, source, createdAt, updatedAt, ownerRef, thumbnailRef }`,
  filtra `deleted_at IS NULL` de su tabla nativa, ordena por `updated_at DESC`, pagina por cursor.

- **Tabla decoradora nueva `library_item_overrides`** — la capa propia de la Biblioteca, sin tocar las tablas de dominio:
  `id, user_id, item_kind, item_id, display_title?, tags?, pinned bool, ai_status?, deleted_at?, created_at, updated_at`,
  `UNIQUE (user_id, item_kind, item_id)`, RLS por `user_id`. Resuelve de forma uniforme:
  - **Renombrar** → escribe `display_title` (sirve para todos los `kind`).
  - **Borrado suave a nivel Biblioteca** → `overrides.deleted_at` (reversible; **no toca el blob ni la fila nativa**).
    El read-model los oculta; "Eliminados recientemente" lee `deleted_at IS NOT NULL`. Esto evita el problema de
    `recorte_images` (que no tiene `deleted_at`, borra en cascada) y respeta "no hard delete sin confirmación".
  - Para `library-upload` la fila override se crea en la subida con `display_title = nombre original` (es su nombre canónico,
    porque `storage_assets` no guarda filename).

> **Semántica a comunicar:** en v1, "eliminar" en la Biblioteca = _quitar de la Biblioteca_ (ocultar, reversible),
> no destruir el archivo en su origen. El borrado físico del blob (para `library-upload` huérfano) y "eliminar
> definitivamente" se difieren a v2.

### 3.2 Nuevo dominio de blobs `library-uploads`

Para la subida genérica (archivos que no cuelgan de ninguna nota/momento):

- Migración que **extiende el CHECK** `storage_assets_domain_check` para incluir `'library-uploads'`.
- Actualizar el tipo `StorageAssetDomain` en `storage-assets.ts`, la lista de stores del storage adapter,
  `docs/conventions/storage-boundaries.md` y lo que valide `scripts/storage-boundaries.mjs` / `check:storage-boundaries`.
- Subir vía storage adapter (Netlify Blobs, store `library-uploads`) + `recordStorageAsset({ domain:'library-uploads',
ownerType:'library', ownerId:<id>, ... })`. Validar mime allowlist + tamaño + magic bytes (igual que
  `notas-attachments-upload.mts`).

### 3.3 Derivación de "fuente" y "tipo"

- **Tipo** = prefijo de `mime_type` (`image/*`, `application/pdf`, hojas/presentaciones por subtipo, `audio/*`, `video/*`, otros).
- **Fuente** = derivada por `kind` + `origin`/`source` (tabla de arriba). Las fuentes que aún no existen
  (`importado desde URL`, `imagen generada por IA`) se **ocultan** en el popover hasta que tengan backend — nada de acciones falsas.

## 4. API

- `GET /api/biblioteca` — query Zod: `q?`, `tab? (todo|imagenes|archivos)`, `tipo?`, `fuente?`, `incluyeEliminados?`,
  `orden? (modificado-desc|modificado-asc|nombre-asc|nombre-desc|tamano-desc|tamano-asc)`, `cursor?`, `limit?`.
  Devuelve `{ items: LibraryItem[], nextCursor }`. RLS scoped, `ApiErrors`. Cada `LibraryItem` incluye
  `thumbnailUrl?` (para imágenes: URL del endpoint de servir, que el cliente pide en pequeño).
- `PATCH /api/biblioteca/:kind/:id` — renombrar (escribe override.display_title). Valida no-vacío, conserva extensión.
- `DELETE /api/biblioteca/:kind/:id` — borrado suave Biblioteca (override.deleted_at). `POST .../restore` para deshacer.
- `POST /api/biblioteca-upload` — subida genérica (store `library-uploads`).
- `GET /api/biblioteca-file/...` — servir/descargar `library-upload` (auth + ownership, como `momentos-file.mts`).
  Para items existentes, la descarga reusa sus endpoints (`notas-attachments-file`, `momentos-file`, `recortes-image`).
- Cliente: `src/api/biblioteca.ts` + tipos en `src/types/`.

## 5. Frontend

**Touch-points de registro** (recipe verificado):
`src/types/view.ts` (añadir `'biblioteca'`) · `src/lib/navigation.ts` (item + grupo) · `src/lib/sectionAccent.ts`
(acento) · `src/components/ViewRouter.tsx` (lazy + `ViewSlot`) · `src/components/Icons.tsx` (íconos nuevos) ·
`src/state/index.ts` + `src/state/useBiblioteca.ts` + queryKeys.

**Componentes** (modulares, como pide el spec): `BibliotecaView` (orquestador) + `biblioteca/`:
`BibliotecaHeader`, `BibliotecaTabs`, `BibliotecaToolbar`, `FilterPopover`, `ListView`, `GridView`, `FileCard`,
`RenameModal`, `EmptyState`, `BibliotecaSkeleton`.

**Comportamientos clave (confirmados en el video):**

- **Lista ordenable:** encabezados Nombre / Modificado / Tamaño clicables; default Modificado desc; alterna asc/desc con
  flecha indicadora. El orden viaja al backend (`orden`) y a la URL.
- **Miniaturas de imágenes:** en la celda Nombre (lista) y como arte de la card (cuadrícula) se muestra la imagen real
  servida en pequeño; los demás tipos usan ícono (PDF terracota, `{}` JSON, hoja genérica).
- **Paginación:** botón "Cargar más" (cursor), no scroll infinito.
- **Selección:** círculo de selección en la card (hover/seleccionado); las acciones masivas quedan en v2.

**Estado en URL:** `?tab=&q=&tipo=&fuente=&vista=&orden=` (búsqueda con debounce 200–300 ms). Lista/cuadrícula sin perder filtros.

**Estética:** tokens existentes, sin hardcodear `#F8F2E8` ni radios de 22px. "Nuevo" = `.btn-ink` (pill tinta) con
`OverflowMenu`; tabs = `.chip`; toggle vista = `.card-segment`; popover de filtros = `OverflowMenu`; renombrar =
`useModalOverlay`; cards = `.card-paper*`; título serif (`font-serif`). Sin emojis en UI. `prefers-reduced-motion`.
Íconos nuevos a dibujar en estilo de la casa (strokeWidth 1.6): cuadrícula, lista, filtros/sliders, subir, y glifos de
tipo (PDF terracota suave, imagen, documento, audio, `{}` código).

**Responsive:** `useIsMobile(768)`; mobile en columna, buscador full-width, tabs con scroll horizontal, acciones en
menú ⋯ en vez de hover. Auto-entra al `MobileMoreSheet` vía `navigation.ts`.

## 6. Fases (PRs pequeños, cada uno con tests + gates verdes)

> **Estado (2026-06-21):**
>
> - **PR1 ✅** read-model + endpoint `GET /api/biblioteca` + cliente + tipos + tests. (La extensión del dominio
>   `library-uploads` se movió al **PR4**.) Además se registró `library_item_overrides` en `PRIVATE_TABLE_CONTRACTS`
>   (faltaba; rompía `isolation-guardrail`/`auth-rls-contracts`).
> - **PR2 ✅** cascarón + vista lista (nav, header, buscador, pestañas, lista ordenable, skeleton/vacío/error,
>   "Cargar más", persistencia `?tab=&q=&orden=`, soporte modo prueba). Verificado en vivo (localhost:3100, modo prueba):
>   renderiza con datos demo, sin errores de consola. Ícono PDF ajustado a terracota `--type-idea` (no el rojo destructivo).
> - **DECISIÓN de ubicación:** Biblioteca vive en el **mundo Notas** (junto a Imprenta/Planillas), NO en el mundo Trama.
>   Implementado como `NotasSection` (`src/types/notas.ts` + `NotasWorldChrome` + `NotasWorld`), no como `ViewMode`.
> - Suite completa **3865/0**, typecheck, build, frontend-boundaries, architecture, structure-ratchets, knip, lint en verde.
> - Pendientes: **PR3** (filtros + cuadrícula + miniaturas) y **PR4** (subida + renombrar + borrado). **Sin commit aún.**

- **PR1 — Cimientos de datos (sin UI):** migración `library_item_overrides`; migración extender dominio
  `library-uploads`; lib read-model (UNION + filtros + búsqueda + paginación), unit + CTE regression; endpoint
  `GET /api/biblioteca`; `src/api/biblioteca.ts` + tipos.
- **PR2 — Cascarón + vista lista:** registro de vista/nav/acento/router; `BibliotecaView` + hooks + queryKeys;
  Header (título + buscador + "Nuevo" placeholder), Tabs, ListView con **encabezados ordenables**, skeleton, vacío,
  error, botón "Cargar más"; persistencia `?tab=&q=&orden=`.
- **PR3 — Filtros + cuadrícula + miniaturas:** `FilterPopover` (Fuente + Tipo, badge de activos), `GridView` + `FileCard`
  (acciones al hover + círculo de selección), toggle vista; **miniaturas de imágenes (versión ligera)**; íconos nuevos;
  persistencia `?tipo=&fuente=&vista=`.
- **PR4 — Acciones + subida:** store + endpoint de subida (allowlist + tamaño + magic bytes); descarga; `RenameModal`
  (PATCH override, optimista); borrado suave Biblioteca con deshacer (toast).

**v2 (después):** "Mover a…" / organización (ver §8); asociar a nota/entidad/momento; "Eliminados recientemente" UI +
eliminar definitivamente; miniaturas generadas (1ª página de PDF, downscale de imágenes grandes); procesamiento IA;
selección múltiple + acciones masivas; vista de detalle.

## 7. Reglas del repo a respetar (de AGENTS.md)

Migraciones inmutables + **timestamps únicos** (validar con `check:migration-duplicates`); snake_case SQL / camelCase TS
con transforms en la frontera; soft delete; `getSql()` + RLS (`setCurrentRlsUser`, `ensureUserRow`); blobs solo vía
storage adapter; errores con `ApiErrors`; Zod en endpoints. Gates a pasar: `storage-boundaries`, `auth-rls-contracts`,
`user-id-writes`, `client-api-contracts`, `frontend-boundaries`, `structure-ratchets`, `knip`, `dependency-cruiser`,
`cte-regression`, + `npm test`/`typecheck`/`build`.

## 8. Decisiones abiertas (defaults propuestos para confirmar en PR4)

- **Tamaño máx. de subida:** 25 MB (adjuntos hoy 20 MB, momentos 10 MB).
- **Tipos permitidos:** imágenes, PDF, documentos office/texto, audio. **Video: diferido** en v1 (coste/peso en Blobs).
- **Subida:** botón "Nuevo → Subir archivo" en v1; arrastrar-y-soltar opcional.
- **`pdf-stamp-assets` (firmas):** incluidas como `imagen/generado`; evaluar ocultarlas si ensucian la vista.
- **Borrado:** v1 = ocultar de Biblioteca (reversible); borrado físico/definitivo en v2.
- **"Mover a… / Nueva carpeta" (del video):** ¿cómo modelar la organización?
  - _Opción A (recomendada): reusar Proyectos de Trama._ "Mover a…" = asociar el archivo a un Proyecto existente
    (la tabla decoradora `library_item_overrides` lleva un `project_id`). Reusa un concepto que ya existe y la sidebar
    ya muestra "Proyectos"; coincide con tu spec original ("asociar a proyecto"). Sin árbol de carpetas paralelo.
  - _Opción B: carpetas genéricas nuevas_ (`library_collections` + pertenencia). Más fiel al video, pero crea una
    jerarquía paralela que hoy Trama no tiene.
  - _Opción C: omitir en v1_ (la acción carpeta queda visible pero deshabilitada con tooltip) y resolverlo en v2.
  - **DECISIÓN (2026-06-21): Opción B — carpetas nuevas**, construidas en **v2**. v2 añadirá `library_collections`
    (id, user_id, name, parent_id?, created_at, updated_at, deleted_at) + pertenencia (`collection_id` en la tabla
    decoradora o join). En **v1** el ícono de carpeta queda visible pero **deshabilitado con tooltip**, sin acciones
    falsas. → PR1 **no** reserva `project_id` en la decoradora.

## 9. Riesgos

- **UNION heterogéneo** (6 fuentes) con orden + paginación + búsqueda: cuidar índices y validar con `cte-regression`.
  Para un usuario con datos modestos es trivial; revisar a escala.
- **`momento-foto` multi-imagen:** desanidar `payload.items[]` (jsonb_array_elements) para listar cada foto.
- **Coherencia de descarga:** items existentes se sirven por sus endpoints; solo `library-upload` necesita endpoint nuevo.

## 10. Criterios de aceptación (v1)

Entrar a Biblioteca desde la nav; ver archivos reales; buscar por nombre; filtrar por tipo/fuente; alternar lista/cuadrícula
sin perder filtros; URL refleja tabs/búsqueda/filtros/orden; lista con nombre/modificado/tamaño y **encabezados ordenables**;
cuadrícula con nombre/icono/metadato; **miniatura real para imágenes**; acciones al hover; renombrar abre modal y actualiza;
eliminar usa soft delete; estados vacío/carga cuidados; estética Trama; subir un archivo y verlo aparecer.
