# Momentos: cuatro filas de controles pasan a una

## Problema

Momentos es una vista de fotos, y en móvil las fotos empezaban tarde. A 375px
había **cuatro filas apiladas** de controles antes del contenido:

1. los chips de contenido (Todos · Notas · Recortes · Fotos · Videos),
2. el segmentado Línea / Álbum, que envolvía a su propia fila,
3. `COMPARTIR`, un botón con texto que ocupaba una fila entera para sí,
4. `Tamaño: medio ⌄`, alineado a la derecha en otra fila más.

Medido en el navegador (demo, 375×812): **146px** de controles, con la primera
foto en `y=546`. En una pantalla de 812 eso es casi un quinto del alto gastado
en chrome antes de ver nada.

La cuarta fila era además un problema de estructura, no sólo de espacio: el
menú de tamaño vivía **dentro de `AlbumGrid`**, con su propio estado y su propio
`useLocalStorageState`, aunque es un control de vista igual que los otros tres.
Por vivir ahí, no podía compartir fila con ellos.

## Lo que cambió

**Una sola fila.** Filtros a la izquierda, acciones a la derecha. Los chips van
en el `scroll-rail` del PR #365: en móvil se deslizan en una línea con su
máscara de degradado, y en escritorio el rail se apaga
(`md:[mask-image:none] md:overflow-visible`) y vuelven a envolver.

**El tamaño sube a la barra.** `AlbumGrid` pasa a recibirlo por props y se queda
tonto; el estado vive en `useAlbumTileSize`. Sólo se muestra en álbum: en la
línea de tiempo no hay miniaturas que dimensionar, y un selector de tamaño ahí
sería exactamente el control inerte que este programa viene quitando.

**`compartir` pasa a icono** con nombre accesible, como el resto de acciones
secundarias de la app. Deja de gastar una fila por una palabra.

## Dos extracciones que forzó el ratchet, y acertó

El cambio dejó `MomentosView` en **322/300**. La regla del repo es extraer, no
subir el umbral, y aquí tenía razón:

- **`useAlbumTileSize`** — el tamaño persistido, con su validación.
- **`useMomentoSelection`** — el modo selección completo: estado, `toggleSelect`,
  `exitSelection`, `toggleSelectionMode` y el efecto que limpia al pasar a
  álbum (sin él la barra flotante de fusión queda huérfana, porque el álbum no
  renderiza los `SelectableMomento`).

Queda en **289/300** — por debajo de donde estaba antes del pack.

## Validación

Medido igual en ambos lados (mismo selector, misma sesión demo), no una captura
contra el DOM:

|                                | antes              | después                     |
| ------------------------------ | ------------------ | --------------------------- |
| zona de controles (375px)      | **146px**, 4 filas | **32px**, 1 fila            |
| primera foto                   | `y=546`            | `y=432`                     |
| máscara del rail en escritorio | —                  | `none`, `overflow: visible` |
| desborde horizontal a 375px    | —                  | ninguno                     |

Mutaciones, cada una sobre el fallo real:

| mutación                                     | qué falla                                   |
| -------------------------------------------- | ------------------------------------------- |
| el tamaño reaparece en la línea de tiempo    | «el tamaño no aparece fuera del álbum»      |
| `compartir` recupera su texto                | «compartir es un icono, no una fila propia» |
| `AlbumGrid` ignora el `size` que recibe      | «respeta el tamaño que recibe por props»    |
| alguien vuelve a tocar `window.localStorage` | «nadie toca localStorage a mano»            |

Nota honesta: la tercera mutación **no se aplicó** en el primer intento —busqué
`GRID_BY_SIZE[size]`, que no existe; el símbolo real es `SIZE_GRID_CLASS[size]`.
Un mutante que no se inyecta no prueba nada, así que se rehízo. Y la cuarta
sonda estaba atada a una ruta (`AlbumGrid.tsx` contiene `useLocalStorageState`);
como esa persistencia ya se ha mudado dos veces, se reescribió sobre el
invariante real —nadie del mundo Momentos habla con `localStorage` a mano— y
ahora barre la carpeta entera.

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle y la suite completa.

## Fuera de alcance

- **SecretCard**: 5 controles siempre visibles por tarjeta (100 con 20 claves).
- **El «Ordenar» duplicado por semana** en Tareas: 4-5 menús idénticos que
  controlan un único estado global de la vista.
- **`CopyImportPromptButton`** en Citas: icono incondicional cuyo significado
  necesita una oración entera de tooltip.
- **La barra del documento PDF no tiene cobertura visual.** El guardián de #370
  protege `EditorToolbar`; `PdfStudioDocumentToolbar` —la que #369 rediseñó— no
  entra en su lista de paths. Hueco real, detectado al mergear.
