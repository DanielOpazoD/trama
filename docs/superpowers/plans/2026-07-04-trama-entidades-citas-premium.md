# Mundo Trama premium — Entidades y Citas

## Problema

Las dos secciones más «de catálogo» del mundo Trama (Entidades y Citas)
funcionaban bien pero se habían quedado un paso atrás del lenguaje premium
que el mundo Notas ya adoptó: hero grande en vez de compacto, títulos en
sans donde deberían cantar en serif, tipografía legacy (`text-sm/base/lg/
xl`) mezclada, chips de filtro con clases inline duplicadas entre las dos
barras, y —lo más notable— **desaprovechaban piezas propias que ya
existían en el código pero no se veían**.

## Piezas

### Entidades — el sello da cara a cada nodo

- **`EntitySigil` traído a la lista**: el repo ya tenía el monograma de dos
  letras determinístico (un «ex libris» mínimo, Spectral en el color del
  tipo) pensado para las filas, pero no se usaba. Ahora ancla cada
  `EntityRow`: reemplaza la vieja barra lateral plana y le da identidad
  única a cada entidad de un vistazo.
- **Título en serif** (`font-serif text-lead`) — antes era sans; el nombre
  ahora tiene el carácter editorial del resto de Trama.
- **Jerarquía limpia**: sello · nombre serif · año (caption) · tipo (micro
  en color) · descripción · meta. Layout en fila con el sello a la
  izquierda y el chevron a la derecha.

### Citas — la cita se siente impresa, no listada

- **Comilla ornamental en oro** (el acento de la sección) flotando sobre
  cada cita como apertura de epígrafe. Sustituye a los guillemets inline.
- **La cita destacada como epígrafe** (`text-h2`), el resto en `text-lead`,
  compacto en `text-body` — jerarquía por peso, no por adorno.
- La atribución baja a `text-caption`: firma discreta bajo la cita. La
  reflexión del usuario sigue en la letra manuscrita (`marginalia-script`).

### Chrome compartido

- **`FilterChip` (nuevo)**: las dos barras (`EntitiesFiltersBar`,
  `QuotesFiltersBar`) repetían las mismas clases inline y el mismo cálculo
  de color activo — se desincronizaban con facilidad. Una sola pieza, con
  transición suave del fondo al activar (antes era un salto seco).
- **Hero compacto** (`density="compact"`, `spacing="tight"`) en ambas
  vistas — menos scroll antes del contenido, como el resto del mundo.

## Decisiones

- El sello lleva ahora el color del tipo, así que la fila pierde su barra
  lateral: un solo portador cromático, no dos. Coherencia sobre redundancia.
- Toda la tipografía legacy tocada migró a tokens semánticos
  (`text-caption/body/lead/h2`) — el ratchet de aliases baja, no sube.
- NO se tocó la lógica de datos, la virtualización, ni los menús de
  IA/Imprenta: esto es puramente la piel.
- La comilla ornamental se omite en modo compacto (recargaría la densidad).

## Validación

- Suite completa 4964 pass, typecheck, lint, prettier, gates
  (design-tokens con menos aliases, knip, dead-code, ratchets, icon-button,
  focus-ring, form-control-labels, boundaries), build y budget de bundle.
- Navegador (demo, mundo Trama): Entidades con sellos por tipo (FI/RA/LA…)
  y títulos serif; hero compacto; Citas con la comilla en oro, el epígrafe
  destacado y la reflexión manuscrita. Chips unificados con transición.
- Los 15 tests de EntitiesView/QuotesView intactos (contratos de heading,
  chips y estados vacíos sin cambios).
