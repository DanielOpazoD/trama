# Momentos — álbum de todos los años, chrome compacto y filtro Videos

## Problema

Al abrir Momentos (vista Álbum por defecto, filtro "Todos") el usuario solo veía
las fotos del año más reciente (2026), no las de años anteriores que sí tenía
subidas. Además el "chrome" (composer + cuadro de filtros con rótulos
contenido/vista + botón compartir) comía demasiado alto vertical antes de que
empezaran las fotos, restándoles protagonismo. Por último, el cuadro de
contenido ofrecía Todos/Notas/Recortes/Fotos pero no una forma de ver solo los
**videos** (que desde el pack de video viven como item dentro de kind='foto').

## Piezas / Cambios

- **Fix del álbum (todos los años).** El `Paginator` (carga manual) vive solo en
  el timeline; el álbum recibía únicamente la primera página (page size = 30),
  que en una cuenta con 27+ fotos es justo el año más reciente. Ahora un efecto
  en `MomentosView` auto-carga todas las páginas (`fetchNextPage` hasta agotar
  `hasNextPage`) cuando la vista es Álbum o el filtro es Videos. Un pie sereno
  ("recogiendo años anteriores…") aparece mientras corre.
- **Chrome compacto.** `MomentosFilters` pasó de una tarjeta con borde + dos
  rótulos apilados ("contenido"/"vista") a **una sola fila**: chips a la
  izquierda, segmentado Línea/Álbum a la derecha, sin tarjeta ni rótulos (los
  chips se explican solos). Márgenes `mb-6→mb-4` en el composer y la toolbar, y
  `space-y-6→space-y-4` sobre el control de tamaño del álbum. Resultado: las
  fotos suben y ganan el protagonismo del alto.
- **Filtro Videos.** Nuevo chip "Videos" en el cuadro de contenido. Modelo
  `ContentFilter = 'all' | MomentoKind | 'video'`: `video` se traduce a la query
  `kind='foto'` (`contentFilterToKind`) y se refina client-side a los momentos
  con al menos un clip (`momentoHasVideo`). Seleccionar Videos salta al Álbum
  (una pared de clips) y auto-carga todas las páginas.
- **FilterChip compartido.** La barra usaba una copia local del chip con
  `text-xs` (alias legacy vetado). Ahora usa el `FilterChip` compartido del mundo
  Trama (mismo lenguaje que Entidades/Citas, `text-caption`), quitando la deuda.
- **Extracción `useDayFilter`.** Para mantener `MomentosView` bajo su ratchet
  estructural (la lógica de video lo empujó a 315/300), el trío del filtro por
  día (`useDayFilter`/`readDayParam`/`clearDayFilter` — la plomería del `?day=`
  del heatmap) se movió a `momentos/useDayFilter.ts`. MomentosView quedó en
  282/300.

## Decisiones (con el porqué)

- **Auto-cargar en álbum en vez de un Paginator en el álbum.** El álbum es una
  galería por año, no una página; un "cargar más" ahí rompería la sensación de
  archivo completo. El timeline conserva su carga manual (lectura cronológica,
  no exhaustiva).
- **`video` como filtro derivado, no como kind nuevo.** El video es un item
  dentro de `kind='foto'` (modelo del pack de video); inventar un kind rompería
  el backend y las escrituras. Derivar la query a fotos + refinar por
  `momentoHasVideo` no toca el servidor ni el esquema.
- **Videos salta al Álbum.** Un muro de miniaturas con badge de play lee mejor
  que clips sueltos en el timeline; y al forzar álbum se auto-cargan todas las
  páginas, así el refinado por clip ve todos los años, no solo el primero.
- **Espejo estable de los primitivos de paginación.** `const { hasNextPage,
isFetchingNextPage, fetchNextPage } = momentosQuery` antes del efecto — así
  exhaustive-deps queda satisfecho sin depender del objeto query completo (que
  muta cada render).
- **No inflé el seed demo ni el baseline de design-tokens.** El demo tiene <30
  momentos (1 página, un solo año), así que el fix no es demoble ahí; se cubre
  con un test de integración que afirma que en álbum se pide `cursor=p2` sola.
  El baseline legacy de design-tokens (499) tiene un hueco heredado de packs
  previos; no lo reclamo desde un pack de Momentos para mantener el diff
  enfocado.

## Validación

- **Typecheck** ✓ · **lint** ✓ (0 warnings; el exhaustive-deps se resolvió con
  el espejo) · **format:check** ✓
- **Gates**: design-tokens ✓ (bajó a 423, quitó un `text-xs`), icon-button ✓,
  focus-ring ✓, form-control-labels ✓, frontend-boundaries ✓,
  **structure-ratchets ✓** (MomentosView 282/300 tras extraer `useDayFilter`),
  modal-overlay ✓, knip ✓, dead-code ✓
- **Suite completa**: 4981 passed | 17 skipped (incluye tests nuevos:
  `contentFilterToKind`, `momentoHasVideo`, chip Videos, y la **regresión del
  álbum** que afirma la auto-carga de `cursor=p2`)
- **build** ✓ · **budget de bundle** ✓ (todos los chunks dentro)
- **e2e** `momentos.spec.ts` ✓ (3/3 en chromium — labels Fotos/Álbum/Línea y
  "3 fotos" intactos)
- **Navegador** (modo prueba, 1280): chrome compacto verificado en Álbum y
  Línea; chip Videos filtra + salta a Álbum + muestra "Ningún video todavía."
  (el demo no tiene clips). El fix de todos-los-años se cubre por lógica + test
  de integración (no demoble con <30 momentos en un solo año).

## Post-revisión

Dos hallazgos reales corregidos tras la primera revisión (ambos en el efecto
de auto-carga que introduce este pack):

1. **CodeRabbit (Major) — tormenta de reintentos.** Si `fetchNextPage()` falla
   tras sus retries, `isFetchingNextPage` vuelve a `false` con `hasNextPage` aún
   `true`, y el efecto lo re-disparaba en cada render. Fix: sumar
   `isFetchNextPageError` (campo de `useInfiniteQuery` v5) al guard y a las deps.
2. **Revisión independiente (Important) — empty state falso durante la
   auto-carga.** El gate `items.length === 0` mostraba el mensaje "vacío" antes
   de que llegaran las páginas siguientes: con el filtro Videos, la 1ª página de
   fotos sin clips dejaba parpadear "Ningún video todavía." hasta que llegaba el
   video de una página posterior. Fix: `MomentosEmptyState` recibe `loadingMore`
   (`autoLoadsAllPages && (hasNextPage || isFetchingNextPage)`) y muestra un pie
   sereno ("buscando tus videos…" / "recogiendo tus momentos…") mientras el
   auto-load no se agota; solo declara "vacío" cuando ya no quedan páginas. Test
   determinista con la 2ª página en vuelo (promesa controlada) que afirma que el
   empty state NO aparece hasta cerrar la última página. Lección reutilizable:
   un gate de "vacío" sobre datos paginados/refinados debe distinguir "vacío de
   verdad" de "todavía cargando".
