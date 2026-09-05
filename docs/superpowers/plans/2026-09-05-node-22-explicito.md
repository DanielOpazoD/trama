# Node 22, escrito y no heredado

## Problema

`@netlify/database` 2.0 (PR #419, de Dependabot) trae un solo cambio
rompiente: exige Node 22.12 o más nuevo. El CI ya corría en Node 22 y los
cinco jobs pasaron, pero `netlify.toml` no fijaba `NODE_VERSION`: la versión de
build y de Functions en producción era la que la plataforma diera por defecto.
Un requisito que sólo se cumple por defecto ajeno no está garantizado.

## Cambio

`NODE_VERSION = "22"` en `[build.environment]`, con el motivo al lado. Netlify
elige con eso la línea de Node del build y el runtime de Functions; «22»
resuelve a la última 22.x, por encima de 22.12.

## Validación

- Es configuración de plataforma: no la ejercita ningún test local. La
  prueba real es el deploy de este commit y el canario (`deploy-canary`), que
  compara `/version.json` con main.
- `format:check`, `lint` y los gates del job `lint` no cambian: `netlify.toml`
  no entra en ninguno.
