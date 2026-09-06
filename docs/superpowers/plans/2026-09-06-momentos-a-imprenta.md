# Fotos de Momentos a Imprenta: el puente entre mundos

## Problema

El PR #235 (junio) proponía un puente Recortes → Imprenta por un evento en
memoria. Se cerró como superado con razón: main ya mandaba a Imprenta desde el
feed de Notas, desde una nota, desde Biblioteca y desde las capturas, todo
por props dentro del mundo Notas. Pero al pedir «resuélvelo agregando la
función», la pregunta correcta era otra: ¿qué origen de imágenes sigue sin
camino a Imprenta? Uno: **las fotos de Momentos**. Momentos vive en el mundo
Trama; `NotasWorld` no está montado, así que no hay props que pasar, y los
`File` no viajan por la URL.

## Cambios

- **`src/lib/imprentaHandoff.ts`**: la cola en memoria del #235, para el único
  origen que la necesita. `handOffFilesToImprenta(files)` encola y avisa por
  `IMPRENTA_HANDOFF_EVENT`; `takeHandedOffImprentaFiles()` drena.
- **`useWorldShellController`** escucha el aviso: precarga el mundo Notas, deja
  Imprenta como sección pendiente y cambia de mundo.
- **`NotasWorld`** drena la cola al montar y cada vez que el puente avisa
  mientras Notas está abierto, y entrega por el mismo
  `deliverFilesToImprenta` que usan los demás orígenes: mismo toast, mismo
  documento en curso.
- **`MomentoEntry`**: acción «Fotos a Imprenta» en el menú del momento cuando
  tiene fotos (los videos no cuentan). `momentoPhotosToPdfFiles` baja cada foto
  por su URL autenticada y separa las que fallan, con el contrato de
  `recortesToPdfFiles`.

## Decisiones

- **Un evento, no un contexto ni props.** El remitente está en otro árbol de
  React y el destinatario aún no existe cuando se envía. Una cola de módulo con
  aviso es lo mínimo que funciona; si el usuario recarga a mitad de camino,
  vuelve a enviar.
- **El toast lo da NotasWorld**, que sabe si había un documento en curso. Desde
  Momentos solo se avisa el fallo (ninguna foto bajó).
- **La e2e usa el backend simulado, no la demo**: las fotos de la demo son SVG e
  Imprenta compone hojas con JPEG/PNG (`createImageBitmap` + `embedPng`).

## Validación

- Unidad: cola (2), adaptador de fotos (3), menú del momento (2), controlador
  de mundos (1), drenaje en NotasWorld (1).
- **e2e nueva** `momentos-a-imprenta.spec.ts`: desde Momentos, la acción
  cruza a Notas, Imprenta abre con las dos fotos como hojas 1 y 2 y el toast
  dice «2 imágenes enviadas a Imprenta». En verde en local.
- `typecheck`, `lint`, `format:check` y los gates del job `lint` en verde.

## Pendiente

- Resuelto (pack `2026-09-06-album-a-imprenta`): la acción está también en
  «Opciones de foto» del Álbum, con el mismo hook que la Línea.
- En el arnés de unidad, el mock de `PdfStudioView` no intercepta el import
  perezoso de `NotasWorld` (se ve el estudio real); el test del drenaje afirma
  la sección y la cola, y la e2e afirma el resto. Conviene entender por qué.
