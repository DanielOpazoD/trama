# Imprenta: los recortes se suman, y la barra deja de estorbar

Dos cosas distintas en la misma pantalla.

## 1. Cada recorte enviado empezaba un documento desde cero

Enviar un recorte a Imprenta abre el estudio con esa página. Al volver a Notas y
enviar otro, el primero había desaparecido: el segundo no se sumaba, lo
reemplazaba.

La causa no estaba en la importación. `addFiles` **ya era aditivo** (`let next =
doc` y luego `addPdfSource`). El problema era el ciclo de vida: en `NotasWorld`
el contenido va envuelto en `<div key={section}>`, así que **cambiar de sección
desmonta el estudio**, y su documento vivía en un `useState` interno sin
persistencia. Salir a Notas lo destruía; el siguiente envío llegaba a un
documento vacío.

**Arreglo:** el historial del documento se eleva a `NotasWorld`, por encima del
cambio de sección. `usePdfStudioDocumentHistory` acepta un estado externo y sigue
gestionando el suyo cuando no lo recibe, que es lo que quieren los tests y
cualquier montaje aislado.

**Por qué no se persiste en disco:** `PdfSource` guarda un `File` vivo. Serializar
pediría IndexedDB y un ciclo de rehidratación entero para resolver algo que se
arregla no destruyendo el estado.

**Planillas no lo comparte.** Sus plantillas se abren de la nube, no se acumulan;
mezclar ambos documentos sería confundir dos flujos.

**Y el aviso lo dice.** Sumar en silencio a un documento existente desorienta
tanto como reemplazarlo: ahora nombra el destino — «2 imágenes al documento en
curso (tenía 3 páginas)».

## 2. La barra: de ocho controles a uno

Inventario de lo que había, siempre visible:

`Importar` · `↶ ↷` · `⊞ 1 2 4 6` · `N páginas` · `Página ▾` · `Nuevo documento` ·
`Guardar PDF` · `⋯`

Los problemas, concretos:

- **Con el documento vacío, cuatro controles no podían hacer nada:** la primaria
  deshabilitada, ajustes de un documento inexistente, «Nuevo documento» en un
  documento ya nuevo, y el segmentado de imágenes por hoja.
- **`⊞ 1 2 4 6` no se entendía.** Números sueltos con un icono diminuto, y
  encima un ajuste que sólo importa en el instante de importar, ocupando sitio
  permanente.
- **Descartar el trabajo estaba PEGADO a guardar.** Un clic de más y adiós.
- **Los ajustes vivían en dos menús sin regla adivinable:** numeración,
  encabezado y pie en «Página»; marca de agua y compresión en «⋯». Había que
  buscar en ambos.
- **«Imágenes por hoja» aparecía dos veces**, segmentado en escritorio y como
  selector en móvil.
- **Mismo icono de archivo** para «Página» y «Nuevo documento», dos cosas sin
  relación.

### Lo que hay ahora

Una regla: **la interfaz crece con el trabajo.**

- **Documento vacío:** sólo `Importar`. El lienzo ya lleva la invitación y los
  formatos aceptados; no hacía falta repetirlo con controles inertes.
- **Con documento:** `Importar` · `↶ ↷` · `N páginas` · `Ajustes ▾` ·
  `Guardar PDF` · `⋯`
- **`Ajustes`** reúne los cinco ajustes del documento —numeración y su posición,
  encabezado, pie, imágenes por hoja, marca de agua, compresión— agrupados por
  cuándo actúan: «Encabezado y pie», «Al importar», «Al exportar».
- **`⋯`** queda para herramientas —OCR buscable, detectar formularios, descargar
  PDF rellenable— y, abajo y separado, `Descartar y empezar de nuevo`, marcado
  como destructivo.

Planillas conserva su barra completa incluso vacía: ahí se entra a rellenar una
plantilla abierta de la nube, no a componer desde cero.

## Validación

Cada invariante verificado **en rojo** por mutación:

| mutación                                       | qué falla                                  |
| ---------------------------------------------- | ------------------------------------------ |
| el documento vuelve a vivir dentro del estudio | «dos recortes se suman al mismo documento» |
| la barra se muestra entera con documento vacío | «sólo ofrece traer algo»                   |
| descartar deja de ser destructivo              | «marcado como destructivo»                 |
| la marca de agua vuelve al menú `⋯`            | «los ajustes en un solo menú»              |

La del color merece nota: se mutó el `danger` real y el test lo detecta por
**estilo computado**, no por el nombre de la prop. Mutar lo que la aserción
consulta sólo demuestra que la aserción se lee a sí misma.

### Dos tests que fijaban el diseño anterior

`PdfStudioView.test.tsx` afirmaba literalmente «la barra principal mantiene una
fila compacta con **Nuevo documento a la par del guardado**» — exactamente la
adyacencia peligrosa que había que deshacer. Y el otro usaba el `aria-label` del
control segmentado. Reescritos al contrato nuevo.

Uno de ellos pedía `toBeVisible` sobre un grupo oculto con `hidden` de Tailwind:
**en los unitarios no hay hoja de estilos**, así que la clase no tiene efecto y
la aserción no puede funcionar. El unitario comprueba el mecanismo (la clase) y
lo pintado lo mide `e2e/imprenta-barra.spec.ts`, que cuenta controles con caja
real.

### El ratchet estructural, y una extracción de verdad

`PdfStudioView.tsx` se pasó de su tope (374/365). La regla del repo es extraer,
no subir el ratchet, así que se extrajeron `onFileInput` y `onDropFiles` a
`usePdfStudioImport`: son el mismo gesto —traer algo— expresado de dos maneras, y
su sitio es junto al `addFiles` que alimentan. 363 líneas.

### Verificado como ajeno

El snapshot `pdf-studio-toolbar-mobile` falla, pero **falla también en main con
el working tree limpio**. Es deriva previa de la barra del editor de
anotaciones, que este PR no toca; la prueba es opt-in
(`PDF_STUDIO_VISUAL=1` + macOS) y por eso nadie la vio. No se actualiza aquí:
absorber una deriva ajena haría mentir al diff. Queda reportado aparte.

### Resto

Suite completa (5088 tests), `typecheck`, `lint`, `format:check`, los 33 gates
no-DB, `build`, budget de bundle, y 45 e2e con a11y, el gate anti-oclusión, el
editor de Imprenta y los seis snapshots visuales que sí estaban al día.
