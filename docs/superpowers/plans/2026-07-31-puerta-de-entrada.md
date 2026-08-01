# La puerta de entrada: el README enseña la app en 30 segundos

## Problema

Medido sobre el README anterior: **0 imágenes, 0 badges, 0 enlaces a la app**.
La única URL de producción aparecía como _callback de OAuth de Spotify_.

Y lo más caro: **el modo prueba no se mencionaba en ningún documento de
entrada**. La app trae un backend completo en el navegador —sembrado y
editable, sin cuenta, sin Postgres y sin claves de IA— y quien llega al
repositorio no se entera. Sólo estaba documentado de refilón en
`docs/whatsapp.md`.

Consecuencia práctica: un programador que abre el repositorio tenía que montar
Netlify + Neon + Clerk + un proveedor de LLM **antes de ver una sola pantalla**.
Ese era el techo del proyecto como ejemplo: 37 gates, 96 migraciones y 5.100
tests no impresionan a nadie que nunca vio la aplicación funcionando.

## Lo que cambió

**`?demo=1` abre la app funcionando.** Antes había que descubrir el botón
«explorar sin cuenta» dentro de la pantalla de acceso. Ahora un enlace basta.

El parámetro es **de un solo sentido**: sólo el valor `1` entra, y ningún valor
saca. Salir del modo prueba borra el store, así que un enlace compartido no
puede tirar los datos de nadie — salir es siempre un gesto explícito del
usuario. El parámetro se borra de la barra de direcciones en cuanto cumple.

**Tres capturas reales, generadas por script.** `npm run capturas` las regenera
desde el propio modo prueba, contra la app de verdad. No son fotos congeladas
que se queden mintiendo cuando una pantalla cambie.

**El README abre con lo que importa**: badges de CI y licencia, el enlace de
prueba como llamada principal, las capturas, y una explicación honesta de qué
es el modo prueba (los datos viven en tu navegador y en ningún otro sitio).

## Dos hallazgos del camino

**1. El dominio del README estaba roto.** `tramadaod.netlify.app` responde 200,
pero la aplicación **renderiza una página en blanco**: las claves de Clerk son
de producción y están atadas al dominio `tramahub.app`, así que Clerk falla al
cargar y React nunca monta.

```text
Clerk: Production Keys are only allowed for domain "tramahub.app".
```

El dominio bueno es **`tramahub.app`** —el mismo que declara la CSP de
`netlify.toml`— y ahí la app carga bien. El enlace del README apunta a ése,
comprobado en el navegador.

**Queda una decisión para el dueño del proyecto:** el README sigue indicando
`https://tramadaod.netlify.app/api/spotify/callback` como callback de OAuth de
producción (línea 136). No se tocó: es configuración registrada en el panel de
Spotify que no puedo verificar desde aquí, y cambiarla a ciegas rompería el
login de Spotify. Pero si la app se sirve en `tramahub.app`, probablemente esté
obsoleta.

**2. Dos capturas falsas, cazadas mirándolas.** La primera versión del script
navegaba por `?section=…` y esperaba un temporizador fijo: produjo un **Inicio
lleno de esqueletos de carga** etiquetado como «grafo». Al corregir la
navegación, la espera `svg circle, canvas` seguía siendo falsa — **la cumplía el
propio spinner** de «hilando vista…», y salió otra foto de la pantalla de carga.

La tercera versión espera el `role="application"` del lienzo cargado y **afirma
que el recuento de entidades no es cero**. Ahí sí salió el grafo real: Borges,
Cortázar, Radiohead, _Rayuela_, _Ficciones_ — 6 entidades, 5 relaciones.

Los tres `passed` intermedios eran verdes que no significaban nada. Se cazaron
abriendo las imágenes, no leyendo el resumen de Playwright.

**Imprenta salió del trío**: su estado vacío es correcto, pero una pantalla en
blanco no cuenta nada en un README. La sustituye Momentos, que llega con fotos
sembradas.

## Validación

En el navegador, desde `localStorage` vacío: `?demo=1` entra directo a la app
(sin pantalla de acceso), deja `trama-demo=1` y limpia el parámetro de la URL.

| mutación                            | qué falla                                           |
| ----------------------------------- | --------------------------------------------------- |
| no limpia el parámetro de la URL    | «conserva los demás parámetros al limpiar el suyo»  |
| acepta cualquier valor, no sólo `1` | «sólo entra con =1: cualquier otro valor se ignora» |

Nota honesta: la primera versión de la segunda sonda **no** hacía fallar nada —
comprobaba que `?demo=0` no sacara a alguien que ya estaba dentro, y eso se
cumple por trivialidad. Se reforzó hasta que la mutación muerde: ahora parte de
un estado limpio y recorre cuatro valores que no deben entrar.

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle y la suite completa.

`check:knip` y `check:dead-code` cazaron un `export` de más (`DEMO_URL_PARAM`,
que nadie usa fuera del módulo). Tenían razón: es interna.

## Fuera de alcance

- **Cobertura de ramas 63% → 75%** en dominios críticos (`_lib/llm` está en 59%).
- **Cobertura visual para `PdfStudioDocumentToolbar`** — el guardián de #370
  sólo vigila `EditorToolbar`.
- **ADRs** (`docs/adr/`): por qué Netlify Functions, por qué demo-en-navegador,
  por qué ratchets estructurales. Es lo que otros programadores vienen a leer.
- **`pdf-lib` (1.264 KB) duplicado** en dos chunks del bundle.
