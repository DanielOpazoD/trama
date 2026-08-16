# Doce avisos que nadie miraba, y un parser encerrado

## Problema

`npm audit --omit=dev` devolvía **12 vulnerabilidades en dependencias de
producción, 6 de severidad alta**. Ninguna estaba decidida: no había gate que las
mirara, así que se fueron acumulando en silencio. Entre ellas:

- **`pdfjs-dist` — ejecución arbitraria de JavaScript al abrir un PDF malicioso**
  (GHSA-hq66-cqwq-w95j). En una aplicación cuya función central es abrir PDFs.
- `dompurify` — la biblioteca con la que se sanitiza HTML de archivos ajenos.
- `ws`, `@netlify/blobs`, `@netlify/dev-utils`, `image-size` y la familia
  OpenTelemetry.
- **`xlsx` — contaminación de prototipo (GHSA-4r6h-8v6p-xvw6) y ReDoS
  (GHSA-5pgg-2g8v-p4x9), sin parche publicado**, corriendo en el hilo principal
  cada vez que la Biblioteca abre una hoja de cálculo.

## Cambios

### Las once que tenían parche

`npm audit fix` sin `--force`: sólo se movió `package-lock.json`, ningún rango
declarado en `package.json`. `pdfjs-dist` 6.0.227 → 6.2.108, `dompurify`
3.4.11 → 3.4.13, `ws` 8.20.1 → 8.21.3, `@netlify/blobs` 10.7.8 → 10.7.13;
`image-size` desapareció del árbol.

Producción queda con un único aviso: `xlsx`.

### La que no tiene parche

El parseo de hojas de cálculo se movió a un **Worker de un solo uso**
(`src/lib/biblioteca/officeSheets.worker.ts`). Un Worker es un realm de
JavaScript propio: si el archivo ensucia `Object.prototype`, lo ensucia ahí, y
ese realm se termina en cuanto devuelve el resultado. La aplicación —su estado,
sus tokens, su DOM— vive en otro. De regalo, un ReDoS cuelga un hilo desechable
con temporizador en vez de congelar la interfaz.

### El gate

`scripts/check-deps-advisories.mjs` falla si aparece un aviso alto o crítico en
dependencias de producción que no esté aceptado **por escrito**. Corre en el job
`lint` del CI. Hoy la única excepción es `xlsx`, con su razón.

## Decisiones

- **El cliente NO cae al hilo principal si no hay Worker.** Es la decisión
  central y va contra el patrón del resto del repo, donde las operaciones
  pesadas degradan a síncrono. Acá el Worker no está para no bloquear la
  interfaz: está para que un archivo malicioso no alcance el realm de la
  aplicación. Un fallback devolvería en silencio exactamente el riesgo que este
  módulo existe para quitar. Sin Worker, la planilla no se previsualiza y se
  dice.
- **El HTML cruza la frontera sin sanitizar.** DOMPurify necesita un DOM y en un
  Worker no lo hay, así que sanitiza el hilo principal justo antes de inyectar.
  Lo que cruza son strings inertes.
- **Sólo se movió `xlsx`, no `mammoth`.** `mammoth` no tiene aviso abierto y
  podría depender de APIs del DOM. Mover por simetría lo que no está roto es
  cómo se rompen cosas.
- **El budget de `vendor-pdfjs` duplicado sube de 250 a 260 KB.** Son ~2 KB gzip
  por copia que trae el parche de ejecución arbitraria. No se rechaza un parche
  de esa gravedad para conservar un número; la razón queda escrita junto al
  budget.
- **Aceptar un aviso exige una razón de más de 80 caracteres**, comprobado por
  test. Una razón corta es una casilla marcada, no una decisión.
- **El gate mira sólo `--omit=dev`.** Un aviso en una herramienta de build no
  llega al navegador del usuario y no debe frenar un merge.

## Validación

- Suite completa: **5368 tests** en verde (788 archivos).
- `typecheck`, `lint`, `format:check`, `build` y `check-bundle-size` en verde.
- 17 gates `check:*` en verde, incluido el nuevo `check:deps-advisories`.
- `npm audit --omit=dev`: de 12 avisos (6 altos) a **1**, aceptado por escrito.

**Verificado por mutación**: añadir un fallback al hilo principal en
`officeSheetsClient` pone en rojo el test que guarda esa garantía.

**Verificado en el navegador**, con una planilla real de dos hojas generada para
la prueba:

- El Worker parsea correcto: hojas `Presupuesto` y `Ventas`, 4 filas, el total
  165000 presente en el HTML.
- `Object.prototype` del hilo principal: 12 propiedades antes y 12 después.
- `window.XLSX` sigue `undefined`: la librería nunca entra al hilo principal.
- En el bundle, `vendor-xlsx` lo referencia **un solo chunk**, el del Worker.

## Pendiente

- El modo demo no sirve un `.xlsx` real para `demo-sheet-1`, así que el visor
  completo (descarga → Worker → sanitizado → tabla) no se puede ejercitar de
  punta a punta desde el preview. El Worker sí se verificó con bytes reales; el
  cableado del visor queda cubierto por tests.
- `mammoth` sigue parseando `.docx` en el hilo principal. No tiene aviso abierto,
  pero es material arbitrario del usuario y el Worker ya está construido.
