# Fuentes embebidas del editor de PDF

WOFF (subset **latino**) de las tipografías reales de la app, usados por
`assemble.ts` para embeber el texto vectorial en el PDF con la fuente exacta del
editor (en vez de las estándar base-14). Se importan con `?url` → Vite los emite
como assets aparte y se bajan por `fetch` recién al ensamblar (mismo origen,
offline-ok, no engordan el bundle `index`). `@pdf-lib/fontkit` los decodifica
(WOFF v1 = `pako`/zlib) y los embebe con **subconjunto** (sólo los glifos usados).

| archivo                          | familia          | peso |
| -------------------------------- | ---------------- | ---- |
| `inter-latin-400-normal.woff`    | Inter (sans)     | 400  |
| `inter-latin-700-normal.woff`    | Inter (sans)     | 700  |
| `spectral-latin-400-normal.woff` | Spectral (serif) | 400  |
| `spectral-latin-700-normal.woff` | Spectral (serif) | 700  |

Mono usa Courier estándar (la app no trae monoespaciada).

## Origen y licencia

Tomados de los paquetes [`@fontsource/inter`](https://www.npmjs.com/package/@fontsource/inter)
y [`@fontsource/spectral`](https://www.npmjs.com/package/@fontsource/spectral).
Ambas fuentes están bajo la **SIL Open Font License 1.1** (ver `inter-OFL.txt` y
`spectral-OFL.txt`). Inter © The Inter Project Authors; Spectral © Productype.

> Para actualizarlos: bajar el mismo archivo `*-latin-{400,700}-normal.woff` de la
> versión correspondiente de `@fontsource/*` y reemplazar (mantener el subset latino).
