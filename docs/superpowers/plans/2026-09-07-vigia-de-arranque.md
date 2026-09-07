# El vigía de arranque: una pantalla en blanco que se explica

## Problema

Producción estuvo servida y blanca (pack `2026-09-06-produccion-en-blanco`):
dos chunks se importaban en ciclo, el módulo de entrada reventaba antes de
montar React y el usuario veía una página vacía. Sin texto, sin botón, sin
pista. La app no podía avisar porque el fallo ocurría **antes de que la app
existiera**: el `ErrorBoundary` de React atiende lo que pasa dentro del árbol,
y ahí no había árbol.

Ese ciclo ya no puede volver (lo vigilan `check:chunk-graph` y el humo del
bundle), pero el blanco tiene más causas: un chunk que no se descarga, un
navegador que bloquea el script, o el proveedor de sesión que no arranca.
Esto último es real hoy: en `tramadaod.netlify.app` —el subdominio de
Netlify, no el dominio canónico— Clerk rechaza sus claves de producción
(«Production Keys are only allowed for domain "tramahub.app"») y la página
queda igual de blanca y de muda.

## Cambios

- **`public/arranque-vigia.js`**: si `#root` sigue sin un solo nodo diez
  segundos después de cargar, pinta «Trama no llegó a abrirse», una línea de
  explicación y un botón «Recargar», y deja rastro en `/api/error-log`. Si la
  app monta —antes o después del plazo— cancela el aviso y retira el panel.
- Va en `public/` **a propósito**: se sirve tal cual, no pasa por el bundler y
  no importa nada, así que sobrevive a un fallo del grafo de módulos de la
  app, que es justo cuando hace falta. En `index.html` se carga **antes** del
  bundle.

## Decisiones

- **Diez segundos.** Con la carga inicial en 194 KB gzip, diez segundos sin un
  nodo dentro de `#root` ya no es «va lento». Y si se equivoca, el observador
  retira el panel en cuanto la app monta: el coste de un falso positivo es un
  parpadeo, no una pantalla rota.
- **No reemplaza al `ErrorBoundary`.** Aquél atiende los fallos de dentro del
  árbol; éste, el caso en que no hay árbol. Son capas distintas.
- **Estilos en línea y sin dependencias.** La CSP permite `style` en línea; un
  archivo que existe para sobrevivir al fallo del bundle no puede depender de
  la hoja de estilos del bundle.

## Validación

- En el navegador, contra el build **roto a propósito** (el reparto de chunks
  anterior al arreglo, el que tumbó producción): donde antes había blanco,
  aparece el panel con su botón. Con el build bueno, no aparece y el humo del
  bundle sigue en verde.
- Unitarios (cuatro casos: vence el plazo, monta a tiempo, monta tarde, no hay
  `#root`), verificados por mutación: sin el observador cae el caso del montaje
  tardío; sin el plazo caen dos.
- `typecheck`, `lint`, `format:check`, los gates del job `lint`, el presupuesto
  de bundle y `check:pdf-lazy-entrypoints` en verde.

## Pendiente

- [alto] En `tramadaod.netlify.app` y en los deploy previews, Clerk rechaza la
  clave de producción por dominio: la sesión no arranca y ahora se ve el panel
  del vigía en vez del blanco. Es configuración, no código —hace falta una
  clave de test para esos contextos, o aceptar que el único dominio válido es
  `tramahub.app`—. Decidirlo, y si toca, poner la clave por contexto de deploy.
