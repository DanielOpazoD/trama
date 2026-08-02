# El video de Momentos deja de topar en 10 MB

## Problema

"Momentos no deja subir videos" era una lectura razonable pero equivocada. El
composer ya declaraba `video/mp4,video/webm,video/quicktime`, el esquema ya tenía
`type: 'image' | 'video'`, el backend ya los aceptaba y se renderizaban en la
entrada, el álbum y el lightbox.

Lo que fallaba era el **tamaño**: 10 MB, porque el archivo atravesaba una Netlify
Function y ese es el tope de su body. Un video de teléfono lo supera en segundos,
así que "acepta video" era cierto solo para clips diminutos.

La solución ya vivía en la casa: la Biblioteca sube **directo a R2 con URL
firmada** (200 MB) desde su PR de archivos grandes. Esto porta ese camino.

## Piezas

**`_lib/momentos-media-mime.ts`** (nuevo). La lista blanca de mimes y las
extensiones salen de `momentos-upload.mts`, donde eran privadas, para que los DOS
caminos de subida no puedan divergir. Aloja además el marcador `r2-` y su
predicado.

**`momentos-uploads-presign.mts`** (nuevo). Firma un PUT contra R2. La key la
elige el servidor, namespaceada por `userId`.

**`momentos-uploads-complete.mts`** (nuevo). Verifica con un HEAD firmado que el
objeto llegó y lo registra en `storage_assets` con `provider='r2'`.

**`momentos-file.mts`**. Si la key lleva el marcador, firma un GET y redirige
(302) en vez de pasar cientos de MB por la función.

**`src/api/momentos.ts`**. `momentoUpload` enruta por tamaño.

**Cliente**: `MAX_MEDIA_BYTES` 10 MB → 200 MB, y los mensajes que lo anuncian.

## Decisiones

**El enrutado vive en `momentoUpload`, no en cada llamador.** Composer, edición y
"enviar desde la Biblioteca" ganan el tope alto sin tener que acordarse de elegir
camino. Un llamador nuevo tampoco puede equivocarse.

**Se conserva el camino multipart para los archivos chicos.** Para una foto ya
comprimida, los dos round-trips del presign no compensan. El umbral son 4 MB,
igual que en la Biblioteca.

**El origen se marca en la propia key (`r2-`), no en la base.** La Biblioteca
puede permitirse una columna `provider` porque tiene tabla de manifiestos; en
Momentos la storageKey vive suelta dentro del JSON del momento y el endpoint que
sirve recibe SOLO la clave. Marcarla la hace autodescriptiva y evita una consulta
por cada miniatura del álbum, que es camino caliente.

Es inequívoco porque el resto de la key es hexadecimal y el hex no contiene `r`:
ninguna clave ya persistida puede confundirse. Y no puede ser un segmento aparte
(`${userId}/r2/${hash}`) porque la ruta declarada admite dos segmentos, no tres.

**El `complete` existe aunque no cree ninguna fila de dominio.** Hace las dos
cosas que el cliente no puede: comprobar que el objeto llegó de verdad —sin eso,
un PUT fallido a medias dejaría un momento apuntando a un blob inexistente, foto
rota y sin error en ningún lado— y registrar el asset, que es de donde salen la
contabilidad y el barrido.

**Sin checksum en el camino R2.** El archivo nunca pasa por la función, así que
resumirlo exigiría volver a bajarlo entero desde el bucket.

## Lo que queda pendiente, y se dice

**El barrido de huérfanos no ve R2.** `momentos-orphaned-blobs.mts` lista contra
Netlify Blobs, así que un video que se sube pero cuyo momento nunca se crea queda
sin detectar. La exposición es acotada (hace falta que el PUT salga bien y la
creación falle) pero real, y son justo los archivos que más pesan. Queda una
tarea aparte con los dos enfoques posibles evaluados.

**El modo prueba no toca R2.** El enrutado manda todo por multipart en demo, así
que las rutas nuevas no necesitan handler en `demoRouter`.

## Validación

- Suite completa: **5256 pasan**, 17 skipped, 0 fallan.
- 13 tests nuevos (discriminador de keys + enrutado del cliente), **verificados
  por mutación**: invertir el umbral rompe 4; ignorar el modo demo rompe 1; no
  comprobar el PUT rompe 1; anular el discriminador de R2 rompe 2. Un **control**
  que cambia un texto irrelevante deja los 13 en verde.
- El test del composer que defendía el límite viejo se reescribió para defender
  el nuevo, y se sumó el caso que antes no existía: **un video de 40 MB ahora se
  acepta** (antes se rechazaba).
- Gates: runtime-api-routes, auth-rls-contracts, user-id-writes,
  operational-observability, knip, dead-code, structure-ratchets. Typecheck,
  lint, formato, build y budget de bundle.
- **En el navegador**: el composer anuncia "videos MP4 / WebM / MOV hasta
  200 MB".

El camino R2 completo (PUT real contra el bucket) **no se pudo probar de punta a
punta en local**: las credenciales de R2 solo existen en el entorno desplegado.
Lo cubierto son el enrutado, el contrato de los endpoints y la decisión de
origen; la subida real habrá que confirmarla en producción.
