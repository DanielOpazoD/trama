# Imprenta: 16 hojas que pesaban 1,8 GB, y una grilla sin scroll

## Problema

Dos fallos reportados sobre un libro de 600 páginas importado en Imprenta:

1. **Exportar 16 hojas producía un archivo de 1,8 GB.** El PDF salía correcto —16
   páginas, contenido bien— pero pesaba como si llevara el libro entero dieciséis
   veces. Porque eso era exactamente lo que llevaba.
2. **Con muchas hojas no había scroll.** Las 600 miniaturas se cargaban y todo lo
   que pasaba del alto de pantalla quedaba inalcanzable.

## Causa

### El peso

Dos multiplicadores que se componen:

- **`copyPages` una vez por página.** pdf-lib crea un `PDFObjectCopier` nuevo en
  cada llamada, y ese copier es lo único que deduplica objetos ya copiados. El
  pipeline copiaba de a una página, así que todo lo compartido —fuentes
  embebidas, imágenes, recursos— se reembebía una vez por página.
- **`/Resources` heredado del árbol de páginas.** `copyPages` baja a la página
  los atributos heredables, `/Resources` entre ellos. Un libro que cuelga sus
  recursos del nodo raíz del árbol le entrega a CADA página copiada los recursos
  de las 600.

Medido con fixtures sintéticas (300 páginas, extraer 16):

| escenario                               | hoy      | + lote  | + poda      |
| --------------------------------------- | -------- | ------- | ----------- |
| `/Resources` heredado del árbol         | 188,0 MB | 11,8 MB | **0,63 MB** |
| `/Resources` propio + fuente compartida | 32,6 MB  | 2,6 MB  | 2,6 MB      |

La poda sola no arregla el segundo caso (la fuente se usa de verdad); el lote
solo no arregla el primero. Hacen falta los dos.

### El scroll

`section.pdf-studio` traía `flex min-h-0 flex-1`, pero el contenedor que monta
Imprenta (`NotasWorld`) es `display: block`: ahí `flex-1` no da altura ninguna.
La sección crecía con la grilla (600 hojas ≈ 16.000px), el `overflow-y-auto` del
área de trabajo nunca se activaba porque su propia altura era la del contenido, y
el `overflow-hidden` del `main` recortaba el resto. Medido en el navegador:
`scrollHeight === clientHeight === 15937`.

## Cambios

- `assemble/assemblePageCopy.ts` (nuevo): junta el pedido y copia todas las
  páginas de un mismo source en UNA llamada a `copyPages`. Si el lote falla
  —source con una página ilegible— reintenta de a una y sólo cae la que falla.
- `assemble/assemblePageResources.ts` (nuevo): antes de copiar, deja en cada
  página sólo los `/XObject` y `/Font` que nombra.
- `assemble/assemble.ts`: usa el copier en vez de `copyPages` por página, y
  separa «avisar de un source con problemas» de «dejar de intentarlo».
- `ocr/pdfOcrSearchablePdf.ts`: el mismo defecto de copia de a una, corregido.
- `PdfStudioView.tsx`: `h-full` en la sección, y fuera el `flex-1` inerte.

## Hallazgos de revisión (Greptile, ambos P1, ambos corregidos)

1. **El recorrido de formularios anidados perdía las cadenas profundas.** El tope
   de 4 vueltas era arbitrario: con una cadena de 5+ formularios listada al revés
   en el diccionario, cada pasada resolvía un solo eslabón y el más hondo quedaba
   sin leer — su fuente se podaba y el contenido desaparecía en silencio. Ahora se
   recorre por frontera, sin tope; termina porque `scanned` sólo crece y está
   acotado por el número de entradas, así que un ciclo tampoco da vueltas.
2. **El reintento de a una recuperaba páginas y luego las tiraba.** Una hoja
   ilegible marcaba el source entero como salteado y se perdían también las sanas
   —incluidas las que el fallback ya había copiado—. Era el comportamiento previo
   al pack, pero con el reintento en su sitio quedaba absurdo. Ahora una hoja
   suelta ilegible se anota y se sigue; sólo un source que no se puede ni abrir
   corta el resto.

## Decisiones

- **La poda toca sólo `/XObject` y `/Font`.** Son donde están los bytes y las
  únicas categorías que se referencian siempre por nombre desde un content
  stream. `ExtGState`, `ColorSpace`, `Shading`, `Pattern` y `Properties` son
  livianas y pueden nombrarse desde el diccionario de otro recurso —una imagen
  que apunta a su `/ColorSpace` por nombre—, así que se copian enteras.
- **Sobre-aproximar los nombres.** Cuenta como usado cualquier token `/Nombre` de
  los streams, aunque venga de un comentario o de una cadena. También se leen las
  apariencias de anotaciones y los XObjects de formulario anidados. Un recurso de
  más pesa; uno de menos rompe la página.
- **La poda es optimización, no corrección.** Si un stream no se puede
  decodificar o la estructura no es la esperada, no poda y la exportación sigue
  igual que antes, sólo más pesada. Nunca impide exportar.
- **Muta el documento fuente en memoria**, que en exportación es una copia
  efímera cargada desde el `File`. No toca el archivo del usuario.
- **Se quitó `flex-1` en vez de sólo añadir `h-full`.** Era inerte bajo un padre
  block y es justo lo que hacía creer que la altura estaba resuelta.
- **NO se virtualizó la grilla.** Se midió con 600 tarjetas: el FLIP recorre los
  600 rects en 2,1 ms y un salto de scroll cuesta 8,4 ms. No hay problema que
  resolver, y virtualizar rompería el FLIP de reordenamiento.
- **NO se añadió un salto a hoja N.** El fallo reportado era la ausencia de
  scroll, y eso es lo que se corrigió; un paginador es otra decisión de diseño.

## Validación

- Suite completa: 5351 tests en verde (786 archivos).
- `typecheck`, `lint`, `format:check`, `build`, `check-bundle-size` en verde.
- Gates: design-tokens, icon-button, focus-ring, form-control-labels,
  frontend-boundaries, structure-ratchets, modal-overlay, knip, dead-code,
  pdf-runtime-boundaries, pdf-lazy-entrypoints, architecture-map, docs-drift,
  architecture, dependency-cruiser, script-registry, mock-completeness, adr-index,
  legacy-fallback.
- e2e: `imprenta-muchas-hojas` (nuevo), `pdf-studio-editor` e `imprenta-barra`,
  26 pasados.

**Verificado por mutación** (no sólo verde):

- Poda apagada → el test de peso falla: la hoja exportada se lleva los 60
  XObjects del libro en vez del suyo.
- Lote apagado → 1.243.542 bytes contra un techo de 300.000, y el contrato de
  `copyPages` pasa de 1 llamada a 20.
- `h-full` revertido → el e2e falla con `scrollH (2577) === clientH`: cero scroll.
- Tope de vueltas reintroducido en el recorrido de formularios → la cadena de 6
  pierde su fuente entera (`[]` en vez de `['Honda']`).
- Reintento de a una devuelto a saltear el source entero → llegan 2 hojas de 5 en
  vez de 4.

**Verificado en el navegador**, el flujo exacto del reporte: libro sintético de
600 páginas y 4,91 MB con `/Resources` colgado del nodo raíz → marcar 16 hojas →
Guardar. Resultado: **135.466 bytes (132 KB)**, 16 XObjects de formulario (uno
por hoja, no 9.600) y las hojas exactas marcadas —1, 6, 12, 41, 78, 121, 200,
251, 302, 356, 401, 461, 502, 541, 576, 600—. Con el defecto, esa misma
exportación pesaba ~78 MB.

Repetido tras los arreglos de revisión, con una cadena de 6 formularios anidados
listada al revés metida en la hoja 1: **133 KB**, 22 XObjects de formulario —16
hojas + los 6 eslabones— y la cadena entera intacta, `/F5` y su fuente `/Honda`
incluidos.

## Pendiente

- El peso real del caso del usuario no se pudo medir contra su libro: las
  fixtures reproducen la forma del PDF, no el archivo. La proporción medida
  (16× por el lote, ~300× añadiendo la poda) predice unos pocos MB donde había
  1,8 GB, pero conviene confirmarlo con el libro real.
- La barra del documento sigue desplazándose fuera de vista al bajar por la
  grilla. Con 600 hojas eso obliga a volver arriba para exportar.
