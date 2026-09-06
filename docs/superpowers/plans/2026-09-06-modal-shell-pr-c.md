# ModalShell, PR C: los cuatro PENDING

## Problema

El trinquete `check:modal-shell` (PR B, #437) dejó cuatro diálogos declarados
como deuda: `PromoteModal`, `LibroModal`, `LaminaModal` y
`BibliotecaLinkPicker`. Una lista PENDING solo vale si se vacía.

## Cambios

- **Tres migran a `ModalShell`**: `PromoteModal` (sm) y `LibroModal` (md)
  conservan su regla «mientras está ocupado no se cierra» con
  `closeOnEscape={!busy}` y un `onClose` guardado; `LaminaModal` (md) cierra
  siempre, como antes. Cada uno pierde su backdrop, su `useModalOverlay` y su
  caja fija; conserva header, cuerpo y footer. Sus tests pasan sin tocar
  aserciones de rol ni de botones; solo cambia la comprobación del portal de
  `LaminaModal`, que ahora mira la raíz `data-modal-root` colgada de `body`.
- **`BibliotecaLinkPicker` pasa a EXENTO con motivo**: se apila sobre
  `BibliotecaViewer`, que vive en `z-[100]` (la capa `max`); `ModalShell` usa
  `z-modal` (60) y quedaría detrás del visor. No es una caja estándar más:
  es un diálogo dentro de un overlay de pantalla completa.
- **PENDING queda vacío.** El gate sigue exigiendo motivo para toda entrada
  nueva.

## Decisiones

- **Los backdrops llevan nombre propio** («Cerrar sin promover», «Cerrar sin
  componer», «Cerrar lámina»): cada uno de estos diálogos tiene su X «Cerrar»
  en el header y dos botones con el mismo nombre confunden a los tests por rol
  y a los lectores de pantalla.
- **No se añade una capa configurable a `ModalShell`** para rescatar al
  picker. La causa real es que `BibliotecaViewer` usa `z-[100]`, la capa
  reservada; arreglar eso es otro pack y queda anotado.

## Validación

- `check:modal-shell`: ADOPTADOS 14, EXENTOS 25, PENDIENTES 0.
- Tests de los tres diálogos y del gate en verde; `typecheck`, `lint`,
  `format:check` y los gates del job `lint`.
- Suite completa de unidad en verde.

## Pendiente

- `BibliotecaViewer` vive en `z-[100]`, la capa `max` que la escala reserva
  para depuración; debería ser `z-lightbox` o `z-modal`, y entonces
  `BibliotecaLinkPicker` podría migrar a `ModalShell`.
