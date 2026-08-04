# Media: miniaturas derivadas + caching honesto

## Problema (los dos números que lo definen)

1. Toda miniatura de FOTO baja el original completo por la capa autenticada:
   una grilla de 20 fotos de teléfono = 20 × 3–8 MB para tiles de ~300px.
2. Todo iba `Cache-Control: private, no-store`: cada visita re-bajaba cada
   blob aunque no hubiera cambiado — el costo de red más grande de la app,
   pagado en cada navegación.

## Parte A — Caching inmutable (los 4 endpoints de media)

La invariante que lo hace seguro, auditada antes de tocar nada: **toda
storageKey nace de `crypto.getRandomValues` en el servidor y nunca se
reescribe** (subir de nuevo crea key nueva; borrar es soft-delete). Bajo eso,
`private, max-age=31536000, immutable` no puede servir contenido viejo.

- Constante compartida `_lib/media-cache.ts` (con el razonamiento) aplicada a
  los blobs de `momentos-file`, `notas-attachments-file`, `recortes-image` y
  `library-uploads-file`.
- **Los 302 a R2 conservan `no-store` a propósito**: la URL firmada vence en
  ~15 min; cachear el redirect serviría enlaces muertos. Con test nuevo en
  momentos (a library ya lo tenía).
- `private` + `Vary: Authorization`: caché del navegador sí, compartidas no.

## Parte B — Miniaturas derivadas para fotos de Momentos

Gemela del póster de video (mismo patrón, mismas costuras):

- `src/lib/imageThumbnail.ts`: `createImageThumbnail(file)` → JPEG ~480px de
  lado mayor, q0.72. Contrato tolerante: `null` ante fallo **y también si la
  foto ya es chica** (un derivado igual de grande sería puro costo).
- El composer deriva y sube la miniatura junto al original (best-effort de
  punta a punta); el item gana `thumbStorageKey`.
- `momentoItemThumbKey(item)` en helpers: la key que montan las GRILLAS
  (miniatura si hay, original si no). Aplicado en AlbumGrid, filmstrip del
  visor, tile del modal de edición y portada del timeline. **El visor
  principal usa siempre el original.**
- Las tres costuras donde se perdería en silencio, cubiertas como con el
  póster: `normalizePhotoItems`, la reconstrucción de `FotoEditModal`, y el
  backend (`collectReferencedKeys` del barrido de huérfanos + la rama SQL de
  lectura compartida en `momentos-file`).

## Alcance declarado: anexos de Notas SIN miniatura derivada

Evaluado y descartado de este pack con razón: exigiría tocar subida (campo
extra), borrado (limpiar el derivado), servido y una cadena de fallback 404 en
el cliente — medio pack propio. El caching de la Parte A ya elimina las
re-descargas de anexos, y sus fotos suben comprimidas (~max 2400px), así que
el dolor restante es solo primera carga. Queda como candidato futuro.

## Validación

- Suite completa: **5310 tests / 779 archivos** — verde. `typecheck`, `lint`,
  `format`, build, budget y 12 gates OK.
- **Mutación** (7 sondas, inyectadas y revertidas): composer sin adjuntar la
  miniatura cae; selector ignorándola cae; normalize descartándola cae;
  edición perdiéndola cae; barrido sin referenciarla cae; blob de vuelta a
  `no-store` cae; control (480→460) verde.
- **Navegador (lo que jsdom no puede)**: `createImageThumbnail` REAL servido
  por Vite: 3000×2000 → **480×320 de 11 KB** en ~1s, y una foto de 400px
  devuelve `null`. (El JPEG sintético comprime mejor que una foto real; en
  fotos de teléfono la proporción es aún mayor: MB → decenas de KB.)

### Límites declarados

- El flujo composer→payload completo no se pudo ejercitar en demo (el composer
  no se expande con eventos sintéticos — mismo muro documentado en el pack de
  pósters). Ese cableado lo fijan los tests de jsdom + la sonda M1.
- Los headers de caching no son observables en demo (demoRouter intercepta):
  quedan fijados por los tests de endpoint y verificables en producción con
  las DevTools (Network → segunda visita debe decir "disk cache").
- Sin backfill: fotos existentes no ganan miniatura (caen al original, como
  siempre); la ganancia aplica a fotos nuevas.
