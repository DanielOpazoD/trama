# PDF Studio OCR Buscable

## Objetivo

Agregar una primera version client-side de OCR para Imprenta que convierta PDFs
escaneados o imagenes importadas en PDFs con texto buscable y seleccionable, sin
subir archivos al backend.

## Alcance De Esta Rama

- Operacion pesada `pdf-ocr` ejecutada en Web Worker con progreso, cancelacion y
  errores tipados.
- Selector de idioma en UI, inicialmente `spa`, `eng` y `spa+eng`.
- OCR client-side con `tesseract.js` para documentos pequenos/medianos.
- Exportar dos artefactos: PDF buscable y sidecar `.txt`.
- Mantener el PDF visual original cuando sea posible, agregando texto invisible
  encima por pagina.
- Para imagenes importadas, generar pagina PDF con la imagen y capa OCR.
- Preparar una interfaz de adaptador backend futuro para OCRmyPDF/Tesseract
  servidor, sin implementarlo todavia.

## Fuera De Alcance

- OCR backend real.
- Entrenamiento de modelos o correccion manual avanzada de texto.
- Deteccion automatica perfecta de PDFs escaneados.
- OCR masivo sin limites de memoria.

## Arquitectura

`pdfOcr.ts` contiene la logica pura/browser-boundary: renderiza cada pagina a
canvas, ejecuta OCR, arma texto por pagina y produce un PDF buscable con
`pdf-lib`. Las coordenadas se derivan de los bloques/palabras devueltos por
Tesseract; si el motor no entrega cajas confiables, se usa una capa de texto
por lineas aproximadas.

`pdfOcrWorkerContract.ts`, `pdfOcrWorkerClient.ts` y `pdfOcr.worker.ts` siguen el
mismo patron que exportacion y formularios. El contrato devuelve:

- `pdfBlob`: PDF con capa de texto invisible.
- `textBlob`: sidecar `.txt`.
- `pages`: texto por pagina y confianza media.
- `warnings`: limites, paginas sin texto o fallbacks.

`pdfOcrBackendAdapter.ts` define una interfaz futura:

```ts
type PdfOcrBackendAdapter = {
  kind: 'client' | 'backend'
  run(input, options): Promise<PdfOcrResult>
}
```

La rama solo usa el adaptador `client`.

## Experiencia De Usuario

La accion vive en el menu de documento como "OCR buscable". Al abrirla, muestra
un panel compacto con idioma, resumen de paginas elegibles, boton para iniciar,
progreso y cancelar. Al terminar, descarga el PDF buscable y el `.txt`, y muestra
un resumen con paginas procesadas y advertencias.

## Riesgos Y Guardrails

- OCR y `pdf-lib` son pesados: todo corre en Worker y con progreso.
- Documentos grandes deben advertir antes de correr.
- Si Worker o Tesseract fallan, se informa el error y no se pierde el documento.
- La capa invisible puede no quedar perfectamente alineada en v1, pero debe ser
  buscable.
- Las paginas con redaccion real no deben pasar por OCR automaticamente sin
  advertir, porque podrian reintroducir texto sensible.

## Tests

- Contrato y cliente de Worker OCR: progreso, cancelacion y fallback.
- OCR core con Tesseract mockeado: genera texto por pagina y sidecar.
- Generacion de PDF buscable con `pdf-lib` mockeado: agrega texto invisible.
- Hook/UI: abre panel, selecciona idioma, inicia OCR, muestra progreso y descarga
  ambos archivos.
- E2E minimo: accion visible y flujo de inicio/cancelacion.
