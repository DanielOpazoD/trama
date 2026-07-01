# PDF Studio: contrato de modulo

PDF Studio es un subsistema client-side. Su contrato se organiza por fronteras
estables para que Imprenta y Planillas puedan crecer sin mezclar estado React,
DOM, Workers y modelo puro.

## Fronteras

| Frontera      | Responsabilidad                                                                  | Puede depender de                         | No debe depender de                                       |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Modelo puro   | `PdfDoc`, pages, sources, anotaciones, campos, historial y helpers de texto.     | Tipos TS y funciones puras.               | React, DOM, pdf.js, pdf-lib, IndexedDB, Workers.          |
| Comandos      | Reducers/operaciones testeables que traducen intencion UI a cambios de `PdfDoc`. | Modelo puro.                              | Componentes, cache de thumbnails, efectos de red/archivo. |
| Rendering     | Miniaturas, backgrounds de pagina, medicion de canvas y pdf.js.                  | Modelo y browser APIs.                    | Mutar `PdfDoc` o escribir workspace.                      |
| Workspace     | Borrador local, biblioteca, guardados y sanitizacion de persistencia.            | API local/IndexedDB y modelo normalizado. | Geometria de editor o export pipeline.                    |
| Export/import | Lectura de archivos, ensamblado, Workers, formularios reales y OCR.              | Modelo, pdf-lib/pdf.js, Workers.          | Estado React interno de vistas.                           |

## Reglas de importacion

- `src/lib/pdfStudio/model/model.ts` es fachada compatible. Codigo nuevo puede
  importar directo desde `modelDocument`, `modelPages`, `modelAnnotations`,
  `modelForms`, `history` o `pageCommands` cuando quiera una frontera precisa.
- Los componentes pueden orquestar efectos, pero las transformaciones de
  documento deben vivir en modelo/comandos y tener tests unitarios.
- El hook de navegacion del editor mantiene la fuente de verdad logica; los
  helpers de apertura/geometry son el contrato testeado para la relacion entre
  pagina solicitada, pagina visible, zoom y layout.
- `pdfjs-dist` y `pdfjs-dist/build/pdf.worker.min.mjs?url` solo se importan en
  `src/lib/pdfStudio/pdfRuntime/pdfjsLoader.ts`. Los consumidores piden
  `loadPdfjsDocument()` para que worker, cache y tipos vivan en un unico borde.
- Los imports dinamicos de `pdf-lib` y `@pdf-lib/fontkit` solo se hacen en
  `src/lib/pdfStudio/pdfRuntime/pdfLibLoader.ts`. Los flujos de exportacion,
  OCR buscable, imagenes a PDF y Libro usan `loadPdfLib()` / `loadPdfFontkit()`.
- Los imports estaticos de tipos desde `pdf-lib` siguen permitidos en modulos
  PDF-only. El runtime de `pdf-lib` no se importa estaticamente desde
  consumidores: incluso AcroForms usa `loadPdfLib()`.

El guardrail ejecutable es:

```bash
npm run check:pdf-runtime-boundaries
```

Ese check bloquea nuevos imports runtime directos o estaticos de PDF.js, worker
PDF.js, `pdf-lib` o fontkit fuera de los loaders compartidos.

## Contrato de entrypoints lazy

PDF Studio puede ser pesado, pero no puede entrar al shell inicial. El build
debe mantener `pdf-lib`, PDF.js, OCR y workers PDF detras de imports dinamicos
activados por la vista/accion del usuario.

| Superficie            | PDF permitido en carga inicial | PDF permitido lazy                             | Razon                                                      |
| --------------------- | ------------------------------ | ---------------------------------------------- | ---------------------------------------------------------- |
| `dist/index.html`     | ninguno                        | `PdfStudioView` y derivados via dynamic import | Evita que el primer render pague costos de PDF Studio.     |
| Shell/App inicial     | ninguno                        | vistas PDF lazy                                | Mantiene inicio, auth y mundo Notas independientes de PDF. |
| `PdfStudioView`       | no aplica                      | `pdfjsLoader`, `pdfLibLoader`, workers         | La vista ya expresa intencion de usar PDF.                 |
| Export/OCR/Form/Libro | no aplica                      | `vendor-pdf-lib`, `vendor-pdfjs`, `vendor-ocr` | Chunks pesados solo cuando el usuario ejecuta esos flujos. |
| Workers PDF           | no aplica                      | workers dedicados                              | Mantienen trabajo pesado fuera del hilo principal.         |

El guardrail ejecutable es:

```bash
npm run build
npm run check:pdf-lazy-entrypoints
```

Ese check lee `dist/index.html` y el grafo de imports estaticos desde los
assets iniciales. Los imports dinamicos a PDF se permiten; los imports
estaticos o modulepreloads PDF desde el entrypoint inicial fallan.

Tambien valida el borde de fuente `PdfStudioView -> PdfTextEditor`: el shell de
PDF Studio no puede importar el editor de texto de forma estatica. El editor se
carga con `React.lazy` cuando una pagina entra a edicion, de modo que el shell
lazy de PDF Studio no arrastre toda la superficie de anotaciones antes de que el
usuario la pida.

## Inventario ejecutable de entrypoints

La fuente de verdad de entrypoints PDF vive en
`scripts/pdf-entrypoint-inventory.mjs`. Ese inventario alimenta:

- `scripts/pdf-bundle-families.mjs`: familias y bases del payload PDF.
- `scripts/pdf-lazy-entrypoints.mjs`: chunks prohibidos en el shell inicial.
- `scripts/check-bundle-size.mjs`: duplicados aceptados de vendors PDF.

Las superficies inventariadas son `viewer`, `editor`, `assembleExport`,
`forms`, `ocr`, `stamps` y `libro`. Si aparece una nueva forma de leer,
escribir o decorar PDF, debe agregarse ahi primero y despues ajustar tests/docs;
no dupliques listas en scripts sueltos.

## Contrato de payload PDF

El peso PDF se mide como lazy payload, no como bundle inicial. El objetivo no es
eliminar todos los chunks repetidos (Vite puede partir el grafo entre workers y
rutas lazy), sino hacer visibles las familias que crecen y evitar duplicacion
accidental de fronteras.

| Familia                  | Bases principales                                                  | Razon del budget                                           |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `PDF lazy payload total` | todas las bases PDF lazy                                           | Techo global para Imprenta/Planillas/Libro/OCR.            |
| `PDF viewer`             | `PdfStudioView`, `pdf.worker.min`, `vendor-pdfjs`                  | Render y preview; owns PDF.js compartido.                  |
| `PDF editor`             | `PdfTextEditor`                                                    | Anotaciones y texto solo al abrir una pagina para editar.  |
| `PDF assemble/export`    | `assemble`, `assembleImages`, `pdfExport.worker`, `vendor-pdf-lib` | Exportacion, redacciones, imagenes y vendors de escritura. |
| `PDF OCR`                | `pdfOcr*`, `vendor-ocr`                                            | Reconocimiento local y armado buscable.                    |
| `PDF forms`              | `pdfForms`, `pdfForm.worker`                                       | Inspeccion/relleno de AcroForms.                           |
| `PDF stamps`             | `StampAssetMenuHost`                                               | Biblioteca de firmas/timbres cargada desde el editor.      |
| `PDF libro`              | `buildLibro`, `libroPreview`                                       | Florilegio imprimible y preview del libro.                 |

Antes de subir un budget, corre:

```bash
npm run build
npm run bundle:report
```

Si el crecimiento cae en una familia, primero revisa si entro una dependencia
nueva o si un import dejo de pasar por `pdfRuntime`. Solo sube el budget cuando
el crecimiento es intencional y queda explicado en el PR.

## Auditoria de workers y duplicacion

El snapshot testeable vive en `scripts/fixtures/pdf-bundle-snapshot.mjs`. Es un
contrato de forma, no de hash: registra bases logicas, workers y duplicaciones
observadas para que el PR siguiente vea si cambio el grafo PDF.

| Base               | Estado esperado | Decision                                                          |
| ------------------ | --------------- | ----------------------------------------------------------------- |
| `vendor-pdf-lib`   | duplicado x4    | Aceptado por grafo lazy/worker; se vigila por familia y total.    |
| `vendor-pdfjs`     | duplicado x2    | Aceptado por viewer + usos con worker; no se fuerza merge manual. |
| `vendor-ocr`       | duplicado x2    | Aceptado por OCR UI/worker; bajo budget propio.                   |
| `pdf.worker.min`   | worker externo  | Necesario para PDF.js; se mide en `PDF viewer` y total.           |
| `pdfExport.worker` | worker dedicado | Necesario para export pesado sin bloquear UI.                     |
| `pdfForm.worker`   | worker dedicado | Necesario para AcroForms pesados.                                 |
| `pdfOcr.worker`    | worker dedicado | Necesario para OCR local con progreso/cancelacion.                |

Si aparece una duplicacion nueva, primero revisa `npm run
check:pdf-runtime-boundaries`. Si el guardrail esta verde, el siguiente paso es
leer el grafo de Vite/worker antes de intentar consolidar chunks a mano.

`bundle:check` tambien ratchea las duplicaciones aceptadas de vendors PDF
pesados. Esos limites (`vendor-pdf-lib`, `vendor-pdfjs`, `vendor-ocr`) congelan
count y gzip total observado; el reporte marca duplicados aceptados como
`aceptado: count actual/max, gzip actual/max KB` y regresiones por eje
(`count`, `gzKb` o ambos). Si uno crece, el PR debe demostrar si el aumento
viene de una capacidad real o de un import que se salio de `pdfRuntime`.

## Contrato de navegacion del editor

Al abrir una miniatura o saltar de pagina, la pagina solicitada manda hasta que
la geometria relevante queda estable o el usuario gesticula manualmente. Durante
esa transicion, la pagina visible inferida por scroll no puede sobrescribir
`currentPage`. En modo libre, el scroll vuelve a sincronizar la pagina visible y
las inflaciones tardias sobre el viewport compensan `scrollTop`.

La evidencia minima para tocar esta zona es:

- unit tests de `pdfEditorOpeningGeometry`.
- tests del hook `usePdfTextEditorPageNavigation`.
- smoke e2e de PDF Studio al abrir, navegar, editar y exportar cuando el cambio
  afecte UI/rendering.

## Compatibilidad

La API historica desde `model.ts` se mantiene para no forzar migraciones masivas.
PRs de refactor pueden mover implementacion a modulos enfocados, pero deben
preservar exports de fachada o migrar consumidores de forma explicita y testeada.
