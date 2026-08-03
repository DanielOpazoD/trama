# Póster para los videos de Momentos

## Problema

Cada miniatura de un clip —el álbum, el filmstrip del visor, la grilla del modal
de edición, la portada del timeline— montaba un `<video>`. Y la capa de media
autenticada (`AuthenticatedMedia`) resuelve cada storageKey bajando el blob
**completo** por `requestBlob` antes de montarlo, así que el `preload="metadata"`
no ahorraba nada: pintar un frame de miniatura costaba bajar el video entero.
Un álbum con diez clips de teléfono bajaba cientos de MB para mostrarse.

## Diseño

Al subir un clip, el composer captura un póster en el cliente (canvas, JPEG,
lado mayor 720px, calidad 0.72) y lo sube como imagen aparte por el mismo
`api.momentoUpload`. El item del payload gana `posterStorageKey` opcional. Las
miniaturas montan el póster como `<img>` (componente compartido
`MomentoVideoThumb`); el `<video>` real solo se monta donde se reproduce.

Decisiones:

- **Blob aparte, no data-URL en el payload.** Un póster inline (~30 KB base64)
  engordaría el JSONB de cada momento y viajaría en cada listado; como blob es
  cacheable y pesa solo cuando se mira.
- **Best-effort de punta a punta.** `captureVideoPoster` resuelve `null` ante
  cualquier fallo (codec, canvas, timeout de 8s) y si la SUBIDA del póster
  falla, el clip entra igual: un póster es una mejora, nunca un requisito. El
  render cae al `<video>` de siempre (clips viejos incluidos — cero migración).
- **Timeline con click-to-play.** `MomentoEntry` muestra el póster con el disco
  de play y monta el reproductor recién al click (autoplay mudo: el blob llega
  después del gesto, un autoplay con sonido lo bloquearía el navegador). Sin
  póster, se comporta como hoy (player inline directo).
- **El visor (lightbox principal) no cambia**: ahí el video ES el contenido.
- **Captura a ~0.5s**, no al frame 0 (que en clips de teléfono suele ser negro).

## Los dos puntos del backend que sí conocen el póster

1. **`momentos-orphaned-blobs` → `collectReferencedKeys`**: sin contarlo como
   referenciado, el barrido ofrecería cada póster para «rescatar» y adoptarlo lo
   duplicaría como foto suelta.
2. **`momentos-file` → SQL de referencia compartida**: sin la rama
   `item->>'posterStorageKey'`, el miembro de un espacio compartido vería la
   miniatura en 404 aunque pueda reproducir el video.

Y el punto del frontend donde el póster se perdería en silencio:
**`FotoEditModal` reconstruye `items[]` a mano** al guardar — mismo sitio donde
ya hubo que preservar `type` para no degradar clips a fotos rotas. Ahora
arrastra también `posterStorageKey`, con test que edita y guarda.

## Lo que a propósito NO se tocó

- **«Enviar desde la Biblioteca a Momentos»** (`libraryItemsToMomentoItems`) no
  captura póster: sus videos entran sin él y caen al fallback. Añadirlo es
  inyectarle `captureVideoPoster` como dependencia — pack aparte si el camino
  se usa con videos grandes.
- El panel de huérfanos sigue montando `<video>` para keys sueltas (ahí no hay
  item que traiga póster).
- No hay backfill de clips existentes: quedan como hoy.

## Validación

- Suite completa: **5294 tests / 776 archivos** en verde (sin flakies, con el
  dev server apagado).
- `typecheck`, `lint`, `format:check`, build, budget de bundle y 21 gates OK.
- **Mutación** (7 sondas, todas inyectadas y revertidas):

  | Mutante                                            | Esperado   | Resultado |
  | -------------------------------------------------- | ---------- | --------- |
  | M1 composer no adjunta el póster al item           | cae        | cayó      |
  | M2 `normalizePhotoItems` descarta el póster        | cae        | cayó      |
  | M3 la tile monta `<video>` aunque haya póster      | cae        | cayó      |
  | M4 el modal de edición pierde el póster al guardar | cae        | cayó      |
  | M5 el barrido de huérfanos no referencia el póster | cae        | cayó      |
  | M6 `momentos-file` sin la rama SQL del póster      | cae        | cayó      |
  | CONTROL captura 0.5s → 0.4s                        | **no** cae | verde     |

- **Navegador (la parte que jsdom no puede):** `captureVideoPoster` REAL, servido
  por Vite en el preview, contra un webm real generado con MediaRecorder
  (1280×720, 45 KB): produjo un JPEG de **4.228 bytes** a 720×405 en 50 ms.
  La proporción es el punto: la miniatura pasa de pesar el clip entero a ~4 KB.

### Lo que quedó sin verificar en navegador

El flujo composer→álbum de punta a punta en modo demo: el composer no se abre
con clicks sintéticos y no insistí (presupuesto declarado). Ese cableado está
fijado por los tests de jsdom + las sondas M1/M3, no por una captura.
