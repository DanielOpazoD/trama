# Pendientes declarados

<!-- GENERADO por `npm run pendientes`. No editar a mano: la fuente es la
sección «## Pendiente» de cada plan en docs/superpowers/plans/. Para cerrar
uno, edita el plan de origen (quítalo o márcalo como resuelto) y regenera. -->

**21 pendientes** en 14 planes. Del más reciente al más viejo.

## 2026-09-05 · Los pendientes en un solo lugar

Plan: [2026-09-05-registro-de-pendientes.md](superpowers/plans/2026-09-05-registro-de-pendientes.md)

- El registro no distingue urgencias: cada pendiente pesa lo mismo. Si crece, una marca en el plan («[alto]») que el script respete sería suficiente.

## 2026-09-05 · Tres lunes en rojo por Prettier

Plan: [2026-09-05-prettier-3-9-y-grupo-tooling.md](superpowers/plans/2026-09-05-prettier-3-9-y-grupo-tooling.md)

- ESLint 10.4 → 10.9 y typescript-eslint 8.60 → 8.68 siguen dentro de #417. El CI nunca llegó a ejecutar `lint` con esas versiones porque `format:check` cortaba antes; si traen una regla nueva, se verá en el rebase.

## 2026-09-05 · La llave del vault viaja en el respaldo

Plan: [2026-09-05-claves-llave-en-el-backup.md](superpowers/plans/2026-09-05-claves-llave-en-el-backup.md)

- Re-cifrar las claves de un vault a otro (para fusionar dos respaldos con contraseñas distintas) no existe. Hoy el aviso es honesto: se conservan las locales y las ajenas no se abren.
- El export sigue sin incluir `prompts` ni `secrets` en el tipo `ExportPayload` aunque el servidor los envía y el import los acepta. El tipo es más estrecho que el archivo real; no afecta a este cambio, pero conviene alinearlo.

## 2026-08-17 · El PDF que se subía y no se podía borrar

Plan: [2026-08-17-imprenta-blob-huerfano.md](superpowers/plans/2026-08-17-imprenta-blob-huerfano.md)

- El dominio `pdf-studio-saved-pdfs` sigue siendo de **sólo escritura**: no existe endpoint que sirva el blob, así que esos PDFs aparecen en Biblioteca sin miniatura ni descarga y no se pueden traer de vuelta a Imprenta. Cerrar eso pide un endpoint nuevo espejo de `notas-attachments-file`, que es otro pack.
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
