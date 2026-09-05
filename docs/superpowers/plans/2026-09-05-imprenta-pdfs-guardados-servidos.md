# Los PDF guardados de Imprenta se pueden recuperar

## Problema

`pdf-studio-saved-pdfs` era un dominio de **sólo escritura**: cada guardado de
Imprenta subía el PDF ensamblado a Netlify Blobs y el `DELETE` (desde #414) lo
borraba, pero **ningún endpoint lo devolvía**. En Biblioteca esos PDF aparecían
con ícono, sin descarga, sin visor y sin «enviar a Imprenta». Un cajón sin
tirador: lo que se guardaba no se podía volver a abrir.

## Cambios

- **`netlify/functions/pdf-studio-saved-pdfs-file.mts`**: `GET
/api/pdf-studio-saved-pdfs-file/:userId/:key`, espejo de
  `notas-attachments-file`. Autoriza en dos pasos: el key debe estar bajo el
  usuario que pide (sin tocar la base si no) y la fila debe existir viva en
  `pdf_studio_saved_pdfs`. Devuelve el blob con `Content-Disposition` a partir
  del nombre guardado, caché privada inmutable y `Vary: Authorization`.
- **Cliente**: `SERVE_ENDPOINT` en `src/api/biblioteca.ts` gana la entrada del
  dominio. Con eso, sin tocar ninguna pantalla, la card tiene descarga, el
  visor de PDF lo abre y la barra de selección lo ofrece para Imprenta: todo
  colgaba de `libraryItemServeUrl`.
- **Modo prueba**: `demoMedia` sirve un PDF mínimo válido para ese path.
- **Contratos**: entradas en `auth-rls-contracts` y
  `operational-observability-contracts`.
- El pendiente que lo pedía, en la nota de #414, queda marcado como resuelto y
  desaparece del registro.

## Decisiones

- **Un endpoint por dominio, no uno genérico.** Un `/api/blob/:domain/:key`
  habría ahorrado un archivo, pero cada dominio autoriza contra su propia
  tabla y con sus propias columnas; la convención del repo es un handler por
  dominio y los gates de contratos están escritos para eso.
- **Caché inmutable.** Cada guardado sube a un key aleatorio nuevo (el
  `UPSERT` cambia `storage_key`), así que el blob detrás de un key no cambia
  nunca. Mismo criterio que anexos y fotos.
- **El nombre de archivo sale de `name`, no del key.** El key es un hash;
  quien descarga quiere «Carta urgente.pdf».

## Validación

- 3 tests del endpoint (cross-user sin tocar DB ni blob; key propio sin fila;
  camino feliz con query scoped, headers y nombre limpio) y 2 del cliente
  (el dominio se sirve, se descarga y va a Imprenta; los sellos siguen sin
  endpoint).
- `typecheck`, `lint`, `format:check` y los gates del job `lint`, incluidos
  `auth-rls-contracts`, `operational-observability` y `storage-boundaries`.

**No verificado en el navegador**: la demo no tiene PDF guardados de Imprenta.
El endpoint queda cubierto por sus tests y el cliente por los suyos.

## Pendiente

- La miniatura sigue siendo el ícono de tipo: `Thumbnail` solo pide el blob
  para imágenes. Renderizar la primera hoja con pdf.js en la card es posible
  ahora que el blob se sirve, pero pesa y conviene medirlo antes.
- Al re-guardar, el `UPSERT` apunta la fila al key nuevo y el blob viejo queda
  sin fila: es el huérfano por re-guardado, distinto del de #414. Se cierra
  borrando el key anterior en el mismo `POST`.
