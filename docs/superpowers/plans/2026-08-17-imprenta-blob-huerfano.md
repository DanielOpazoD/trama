# El PDF que se subía y no se podía borrar

## Problema

Cada guardado de Imprenta —creación, plantilla o copia rellenada— sube el PDF
ensamblado a Netlify Blobs. Al eliminar esa creación, `removeSaved` quitaba el
registro de IndexedDB y la plantilla remota, pero **nunca borraba el PDF**.

El camino existía entero y sin usar: `deletePdfStudioSavedPdf` y
`listPdfStudioSavedPdfs` están escritos y testeados en `src/api/`, y sólo
aparecían en su propio test. Ninguna pantalla los llamaba.

Y había una segunda mitad que no se veía desde el cliente: **el `DELETE` del
backend tampoco borraba el objeto**. Marcaba la fila con `deleted_at` y hacía
`softDeleteStorageAsset`, que es otro `UPDATE`. `store.delete()` no aparecía en
todo el archivo. Así que arreglar sólo el cliente habría dejado el huérfano
igual, con la sensación de haberlo cerrado.

Como este dominio no tiene endpoint que sirva el blob, un objeto sin fila viva no
se puede volver a pedir por ninguna vía: conservarlo es ocupar espacio para
siempre a cambio de nada.

## Cambios

- **Backend** (`pdf-studio-saved-pdfs.mts`): el `DELETE` borra el objeto antes de
  marcar el manifest, copiando el orden que ya usa `pdf-studio-templates`
  —primero el blob, después el manifest— para no dejar un manifest vivo
  apuntando a algo que ya no está.
- **Cliente** (`usePdfStudioWorkspace.ts`): `removeSaved` llama a
  `deletePdfStudioSavedPdf` cuando esa creación tiene `serverPdf`.

## Decisiones

- **La fila queda en soft-delete y el objeto no.** No es incoherencia: la fila
  pesa nada y sirve de rastro; el PDF pesa y nadie puede volver a pedirlo.
- **Best-effort, como el resto del borrado.** `removeSaved` ya es
  fire-and-forget para IndexedDB y para la plantilla remota. Sin red, el registro
  local se va igual; lo que cambia es que ahora existe el camino, no que se
  garantice el resultado.
- **Import directo y no un prop inyectado.** `uploadSavedPdf` se inyecta porque
  necesita `preparePdf`, que vive en la vista. El borrado sólo necesita un id, y
  añadir un prop obligaría a tocar `PdfStudioView.tsx`, que está exactamente en
  su tope de ratchet (365/365).

## Validación

- Suite completa: **5403 tests** en verde.
- `typecheck`, `lint`, `format:check` y 18 gates `check:*` en verde, incluidos
  `storage-boundaries` y `hard-delete-allowlist`, que son los que vigilan esta
  clase de cambio.

**Verificado por mutación en los dos lados**, porque arreglar uno solo deja el
huérfano igual:

- Quitar el `store.delete` del backend → el test del endpoint falla nombrando la
  clave que debía borrarse.
- Quitar la llamada del cliente → el test del hook falla.

## Pendiente

- Resuelto (pack `2026-09-05-imprenta-pdfs-guardados-servidos`): el dominio
  `pdf-studio-saved-pdfs` ya tiene endpoint de servir, espejo de
  `notas-attachments-file`, y esos PDFs se descargan, se ven y vuelven a
  Imprenta desde Biblioteca.
- Queda una carrera anterior a este cambio: si se borra mientras la subida está
  en vuelo, `syncSavedPdf` todavía hace `putSavedDoc` y resucita el registro
  local; y como en ese momento no había `serverPdf`, el blob queda huérfano sin
  rastro. Se arregla con un guard de cancelación en `syncSavedPdf`.
