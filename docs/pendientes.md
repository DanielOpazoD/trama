# Pendientes declarados

<!-- GENERADO por `npm run pendientes`. No editar a mano: la fuente es la
sección «## Pendiente» de cada plan en docs/superpowers/plans/. Para cerrar
uno, edita el plan de origen (quítalo o márcalo como resuelto) y regenera. -->

**35 pendientes** en 21 planes. Del más reciente al más viejo.

## 2026-09-05 · Una aguja para el sensor: web vitals en el panel de salud

Plan: [2026-09-05-vitals-en-el-panel-de-salud.md](superpowers/plans/2026-09-05-vitals-en-el-panel-de-salud.md)

- FCP y TTFB se guardan pero no se muestran. Son diagnósticos, no Core Web Vitals; entran cuando alguien los necesite para explicar un LCP.
- No hay serie temporal: si el p75 empeora, la tarjeta lo dice, pero no cuándo empezó. Un sparkline diario por métrica es el paso siguiente natural.
- La query no está en `check:query-plans` (pide Postgres local). El índice `idx_web_vitals_metric_time` la cubre, pero conviene confirmarlo con `EXPLAIN` cuando haya base a mano.

## 2026-09-05 · Los pendientes en un solo lugar

Plan: [2026-09-05-registro-de-pendientes.md](superpowers/plans/2026-09-05-registro-de-pendientes.md)

- El registro no distingue urgencias: cada pendiente pesa lo mismo. Si crece, una marca en el plan («[alto]») que el script respete sería suficiente.

## 2026-09-05 · React 19

Plan: [2026-09-05-react-19.md](superpowers/plans/2026-09-05-react-19.md)

- `StrictMode` no está activado; React 19 lo hace más útil (doble render con reutilización de memo). Activarlo es un pack propio porque puede sacar a la luz efectos no idempotentes.
- Los budgets `jspdf.es.min` y `html2canvas.esm` en `check-bundle-size.mjs` son restos: esos chunks ya no se emiten desde #412. Borrarlos es limpieza, no urgencia.

## 2026-09-05 · Tres lunes en rojo por Prettier

Plan: [2026-09-05-prettier-3-9-y-grupo-tooling.md](superpowers/plans/2026-09-05-prettier-3-9-y-grupo-tooling.md)

- ESLint 10.4 → 10.9 y typescript-eslint 8.60 → 8.68 siguen dentro de #417. El CI nunca llegó a ejecutar `lint` con esas versiones porque `format:check` cortaba antes; si traen una regla nueva, se verá en el rebase.

## 2026-09-05 · Un merge queue en vez de rebasar a mano (no disponible)

Plan: [2026-09-05-merge-queue.md](superpowers/plans/2026-09-05-merge-queue.md)

- `pdf-visual.yml` no escucha `merge_group`. No es requerido, así que no bloquea; si algún día lo fuera, hay que añadirle el disparador.

## 2026-09-05 · Imprenta: elegir hojas sin apuntar, y un OCR que vuelve

Plan: [2026-09-05-imprenta-teclado-y-ocr-de-vuelta.md](superpowers/plans/2026-09-05-imprenta-teclado-y-ocr-de-vuelta.md)

- Flechas arriba/abajo con Shift para extender la selección desde el teclado sin pasar por el ratón; hoy las flechas reordenan, y cambiarlas de sentido pide decidir primero qué gesto gana.
- Un e2e con un PDF real en Imprenta cubriría lo que la demo no puede.

## 2026-09-05 · Los PDF guardados de Imprenta se pueden recuperar

Plan: [2026-09-05-imprenta-pdfs-guardados-servidos.md](superpowers/plans/2026-09-05-imprenta-pdfs-guardados-servidos.md)

- La miniatura sigue siendo el ícono de tipo: `Thumbnail` solo pide el blob para imágenes. Renderizar la primera hoja con pdf.js en la card es posible ahora que el blob se sirve, pero pesa y conviene medirlo antes.
- Al re-guardar, el `UPSERT` apunta la fila al key nuevo y el blob viejo queda sin fila: es el huérfano por re-guardado, distinto del de #414. Se cierra borrando el key anterior en el mismo `POST`.

## 2026-09-05 · Imprenta en un navegador de verdad: elegir hojas y volver desde Biblioteca

Plan: [2026-09-05-e2e-imprenta-seleccion.md](superpowers/plans/2026-09-05-e2e-imprenta-seleccion.md)

- El e2e corre solo en Chromium de escritorio, como el resto de la suite.
- Sigue sin e2e de OCR; si algún día se empaqueta el idioma con la app, entra.

## 2026-09-05 · La llave del vault viaja en el respaldo

Plan: [2026-09-05-claves-llave-en-el-backup.md](superpowers/plans/2026-09-05-claves-llave-en-el-backup.md)

- Re-cifrar las claves de un vault a otro (para fusionar dos respaldos con contraseñas distintas) no existe. Hoy el aviso es honesto: se conservan las locales y las ajenas no se abren.
- El export sigue sin incluir `prompts` ni `secrets` en el tipo `ExportPayload` aunque el servidor los envía y el import los acepta. El tipo es más estrecho que el archivo real; no afecta a este cambio, pero conviene alinearlo.

## 2026-09-05 · Accesibilidad: el mundo Trama entero, y en móvil

Plan: [2026-09-05-a11y-movil-y-mundo-trama.md](superpowers/plans/2026-09-05-a11y-movil-y-mundo-trama.md)

- El salto intermitente de 829 px en el editor tras abrir la miniatura 8: o es un flaky de render de miniaturas o un defecto de anclaje. Reproducir con `--repeat-each` y decidir.
- Las auditorías usan estado vacío o casi vacío; una vista con datos reales puede tener violaciones que aquí no aparecen. Conectar `visual-sweep` con axe sobre la demo completa es el siguiente paso.
- `heading-order` y `scrollable-region-focusable` son reglas de `best-practice`; si aparecen más como estas al crecer el corpus, conviene un test unitario de estructura de encabezados por vista.

## 2026-08-17 · El PDF que se subía y no se podía borrar

Plan: [2026-08-17-imprenta-blob-huerfano.md](superpowers/plans/2026-08-17-imprenta-blob-huerfano.md)

- Queda una carrera anterior a este cambio: si se borra mientras la subida está en vuelo, `syncSavedPdf` todavía hace `putSavedDoc` y resucita el registro local; y como en ese momento no había `serverPdf`, el blob queda huérfano sin rastro. Se arregla con un guard de cancelación en `syncSavedPdf`.

## 2026-08-16 · Un piso de cobertura donde un desplome no se vería

Plan: [2026-08-16-piso-de-ramas-donde-se-decide.md](superpowers/plans/2026-08-16-piso-de-ramas-donde-se-decide.md)

- El umbral global de ramas sigue en 66%. Subirlo pide cubrir superficies concretas, no cambiar el número: cada punto son ~1.000 ramas repartidas por todo el repo.

## 2026-08-16 · Dos maquetadores de imágenes-a-hoja, y sólo hacía falta uno

Plan: [2026-08-16-pila-documental-por-uso-real.md](superpowers/plans/2026-08-16-pila-documental-por-uso-real.md)

- Quedan cuatro vendors documentales pesados (`pdf-lib`, el worker de pdf.js, `xlsx`, `mammoth`). Los cuatro se usan de verdad y ya cargan de forma perezosa; no hay redundancia que quitar sin cambiar funcionalidad.

## 2026-08-16 · Imprenta: 16 hojas que pesaban 1,8 GB, y una grilla sin scroll

Plan: [2026-08-16-imprenta-export-peso-y-navegacion.md](superpowers/plans/2026-08-16-imprenta-export-peso-y-navegacion.md)

- El peso real del caso del usuario no se pudo medir contra su libro: las fixtures reproducen la forma del PDF, no el archivo. La proporción medida (16× por el lote, ~300× añadiendo la poda) predice unos pocos MB donde había 1,8 GB, pero conviene confirmarlo con el libro real.
- La barra del documento sigue desplazándose fuera de vista al bajar por la grilla. Con 600 hojas eso obliga a volver arriba para exportar.

## 2026-08-16 · La barra deja de esconderse, y aparece cómo llegar a la hoja 480

Plan: [2026-08-16-imprenta-barra-fija-y-salto-a-hoja.md](superpowers/plans/2026-08-16-imprenta-barra-fija-y-salto-a-hoja.md)

- El salto es un campo numérico. Un carril de posición vertical —un minimapa que muestre dónde estás dentro de las 600— sería mejor affordance, pero es otra decisión de diseño y otro PR.

## 2026-08-16 · El gate del anillo de foco existía en el papel

Plan: [2026-08-16-foco-visual-al-ci.md](superpowers/plans/2026-08-16-foco-visual-al-ci.md)

- Las baselines se generaron en esta máquina (macOS). Si el runner `macos-latest` renderiza distinto, el primer CI lo dirá — y ese desacuerdo sería información, no ruido.
- `visual-sweep` sigue sin correr en ningún sitio. Antes de conectarlo hay que bajarle el ruido; hoy no está en condiciones de bloquear un merge.

## 2026-08-16 · El `.docx` también sale del hilo principal

Plan: [2026-08-16-docx-fuera-del-hilo-principal.md](superpowers/plans/2026-08-16-docx-fuera-del-hilo-principal.md)

- La previsualización completa (descarga → Worker → sanitizado → render) sigue sin poder ejercitarse desde el preview: el `demoRouter` no sirve un `.docx` ni un `.xlsx` reales. El Worker sí se verificó con bytes reales.

## 2026-08-16 · Doce avisos que nadie miraba, y un parser encerrado

Plan: [2026-08-16-deps-vulnerabilidades-y-xlsx-aislado.md](superpowers/plans/2026-08-16-deps-vulnerabilidades-y-xlsx-aislado.md)

- El modo demo no sirve un `.xlsx` real para `demo-sheet-1`, así que el visor completo (descarga → Worker → sanitizado → tabla) no se puede ejercitar de punta a punta desde el preview. El Worker sí se verificó con bytes reales; el cableado del visor queda cubierto por tests.
- `mammoth` sigue parseando `.docx` en el hilo principal. No tiene aviso abierto, pero es material arbitrario del usuario y el Worker ya está construido.

## 2026-08-16 · El peso de exportar deja de ser una sorpresa

Plan: [2026-08-16-corpus-pdf-y-presupuesto-de-peso.md](superpowers/plans/2026-08-16-corpus-pdf-y-presupuesto-de-peso.md)

- La envolvente de memoria sigue sin medirse (ver decisiones).
- El corpus reproduce formas, no archivos reales. Si aparece un libro que rompe de otra manera, la forma nueva se agrega acá y el presupuesto la cubre sola.

## 2026-08-16 · El gate de accesibilidad deja de mirar sólo un tercio

Plan: [2026-08-16-a11y-todas-las-superficies.md](superpowers/plans/2026-08-16-a11y-todas-las-superficies.md)

- El mundo `trama` (grafo, momentos, atlas, citas, chat) sigue con tests escritos a mano y sin ratchet equivalente: sus vistas no viven en una constante como `NOTAS_SECTIONS`. Cerrar ese lado pide primero un inventario de vistas del que derivarlo.
- Todas las auditorías corren a un único viewport de escritorio. Los defectos históricos de esta serie aparecieron en anchos móviles.

## 2026-07-03 · Planillas Trust Pack — estado de nube visible y versiones restaurables

Plan: [2026-07-03-planillas-trust-pack.md](superpowers/plans/2026-07-03-planillas-trust-pack.md)

- Ciclo completo con sesión real: guardar → editar → «Versiones…» muestra la versión anterior → restaurar → aparece la restaurada en otro navegador.
