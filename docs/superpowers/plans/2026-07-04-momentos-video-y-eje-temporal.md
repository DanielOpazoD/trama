# Momentos: subir videos + el eje temporal del timeline

## Problema

La sección Momentos solo aceptaba fotos: el composer filtraba `image/`, el
endpoint de subida rechazaba cualquier mime que no fuera imagen, y no había
render para reproducir clips. El usuario pidió **poder subir videos** y, de
paso, **mejorar la estética global** de la sección con libertad creativa.

## Piezas

### Video (la función)

- **Modelo polimórfico, sin migración.** `MomentoPayload.items[]` gana un
  `type?: 'image' | 'video'`. Los items ya persistidos no traen el campo → se
  leen como imagen, así que sumar video no altera ningún momento existente. El
  video es un _tipo de item_ dentro del episodio foto, no un `kind` nuevo:
  reutiliza todo el flujo (upload, storage, RLS, sharing, álbum) sin tocarlo.
  (`types/momento.ts`, `schemas/momento.ts`, `momentos/helpers.ts` con
  `isVideoItem`.)
- **Backend.** `momentos-upload.mts` amplía la lista blanca a `video/mp4`,
  `video/webm`, `video/quicktime`, derivándola de un mapa de extensiones para
  que mime y ext no se desincronicen. El clip comparte store (`momentos-media`)
  y `recordStorageAsset` con las fotos.
- **`AuthenticatedMomentoVideo`.** Hermano de `AuthenticatedMomentoImage`:
  resuelve el mismo blob autenticado a un object-URL (vía
  `useAuthenticatedMediaState`) y lo monta en un `<video>`, con caja papel que
  late mientras carga y aviso "video no disponible" en error.
- **Captura.** El composer acepta y arrastra video; valida el tamaño
  client-side (los clips no se comprimen) y avisa claro si excede; el submit se
  bifurca (imágenes comprimen; videos suben tal cual, con `readVideoDimensions`
  para el aspect-ratio). El preview usa `<video>` + disco de play y oculta el
  editor de imagen. (`useMomentoComposer.ts`, `MomentoComposer.tsx`.)
- **Render en las tres vistas.** Timeline (`MomentoEntry` — video inline
  reproducible; si el episodio trae más piezas, el contador "+N" abre el
  visor), lightbox (`PhotoLightbox` — controles nativos, sin zoom; filmstrip
  con póster + play) y álbum (`AlbumGrid` — tile con póster + play). El modal de
  edición (`FotoEditModal` / `FotoPhotoTile`) muestra el clip y **preserva el
  `type` al re-guardar**.
- **Primitivos compartidos.** `VideoPlayBadge` (disco con play, reusado en
  preview/álbum/filmstrip) y `PlayIcon` en el set de íconos.

### Estética

- **El eje temporal del timeline.** El borde derecho fragmentado de cada hora
  se reemplaza por un _hilo_: un nodo en color de acento a la altura de la hora
  y un filete que desciende desvaneciéndose hacia la entrada siguiente. Encadena
  los momentos del día como cuentas de un hilo — coherente con "la trama" — y es
  puramente ornamental (`aria-hidden`, `absolute`): no altera el layout.
- **Copy honesto.** El contador de la grilla pasa de "N fotos" a
  "N elemento(s)" en cuanto hay un video: no se le llama "foto" a un clip.

## Decisiones

- **Límite de 10 MB, honesto.** Netlify Functions rechaza bodies mayores en el
  plan estándar (ya era el tope de las fotos). Alcanza para clips cortos; los
  videos largos exigirían upload directo al store con URL firmada — otro
  trabajo, anotado en el código y aquí. La validación client-side da el aviso
  antes de intentar subir.
- **Los videos no se comprimen en el cliente.** Transcodificar exigiría una lib
  pesada (ffmpeg.wasm); se suben tal cual y se valida el tamaño primero.
- **`items[]` polimórfico en vez de un `kind` nuevo.** Cero migración y cero
  riesgo para los datos existentes; el render prefiere `items[]` y cae al
  legacy foto-única cuando no hay.
- **Preservar `type` en la edición fue crítico.** Sin ello, re-guardar un
  momento con video (aunque solo se cambiara el caption) reconstruía `items[]`
  sin el marcador y degradaba el clip a una foto rota.
- **No se sembró un video en el modo demo.** El demo no puede servir un `.mp4`
  reproducible (fabricar un contenedor válido a mano no es viable); un seed solo
  mostraría el placeholder de error y ensuciaría el demo. El render de video se
  cubre por tests unitarios; en navegador se verificó el eje temporal y el
  composer.

## Validación

- Suite completa **4970 pass** (0 fail; el "socket hang up" del runner es flaky
  de infraestructura), typecheck, lint, prettier.
- Gates de frontend (design-tokens con el ratchet a la baja, icon-button,
  focus-ring, form-control-labels, frontend-boundaries, structure-ratchets,
  modal-overlay, knip, dead-code) y de backend por tocar el endpoint
  (storage-boundaries, legacy-media-fallbacks, runtime-api-routes,
  api-request-contracts, api-error-shape, user-id-writes, auth-rls-contracts,
  migration-duplicates, architecture, dependency-cruiser, docs-drift,
  script-registry). Build y budget de bundle en verde.
- Navegador (demo, mundo Trama): el eje temporal medido con `preview_inspect`
  —nodo de acento centrado (x≈76) sobre el hilo con gradiente, alineado con la
  hora—; el composer con `accept` de video, el copy "fotos o videos … MP4 /
  WebM / MOV hasta 10 MB", el preview `<video>` + disco de play, el editor de
  imagen oculto y el contador "1 elemento".
- Tests nuevos: preview de video y `accept` en el composer, rechazo por tamaño y
  draft `isVideo` en el hook, render inline y contador "+N" del video en el
  timeline.
