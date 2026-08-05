# Canario de deploy + protección de main

## Problema

El incidente de julio 2026: producción un mes clavada en un commit viejo por
un `locked: true` silencioso en Netlify. CI verde, deploys `ready`, cero
síntomas — 27 PRs mergeados que nunca llegaron a estar en línea. Ningún check
del repo miraba lo único que importa: **qué commit está realmente servido**.
Y `main` no tenía protección: nada impedía (por accidente) un push directo o
un merge sin CI.

## Diseño

**Emisor (`write-version.mjs`)** — el build de Netlify publica
`dist/version.json` con `COMMIT_REF` (fallback `git rev-parse HEAD` en builds
locales). La declaración viene de adentro del artefacto publicado: si el CDN
lo sirve, ese ES el commit en línea. `no-store` vía netlify.toml — un canario
que pueda leer caché no prueba nada. El ruteo de la app es por hash (sin SPA
fallback), así que un `version.json` ausente es un 404 honesto, no un
index.html disfrazado.

**Sonda (`deploy-canary.mjs`)** — lógica pura `evaluateDeploy()` (testeable,
sin red ni git) + CLI. Cinco verdicts: `ok`, `esperando` (diferencia con main
reciente, <45 min de gracia: deploy en vuelo), `desfase` (sha viejo de main
con gracia vencida — la clase del incidente), `sin-version` (404/JSON
inválido pasada la gracia), `desconocido` (sha que no pertenece a main:
rollback manual — alarma inmediata, el tiempo no lo arregla). Sin secretos ni
API de Netlify: conducta observable del CDN, la única prueba que el incidente
validó como fiable (la arqueología de bundles y la API mintieron).

**Workflow (`deploy-canary.yml`)** — cada 6 h + manual. `fetch-depth: 0`
(la sonda necesita la historia para `merge-base --is-ancestor`). Sin `npm ci`
(node puro). En alarma: falla y abre UN issue `deploy-canary` (no duplica).

**Protección de main** — aplicada tras el merge vía API: checks requeridos
`unit`, `lint`, `e2e`, `secrets`, `migrations`; rama al día (`strict`);
`enforce_admins`; sin force-push ni borrado; sin required reviews (repo de
una persona: no puede aprobarse a sí misma). Excluidos a propósito:
`pdf-visual` (path-filtered — en PRs que no tocan PDF nunca reporta y
bloquearía todo) y CodeRabbit (verdes vacíos por rate-limit).

## Validación

- 7 tests del evaluador; **mutación**: igualdad de sha invertida cae (5),
  gracia eterna cae (3), rollback sin alarma cae (1), control (45→40 min)
  verde.
- CLI real contra producción: `esperando` con exit 0 (404 en prod + main
  reciente) — el bootstrap diseñado: al deployar este pack pasa a `ok`; si el
  deploy no publica, alarma sola cuando venza la gracia.
- `write-version`: verificado con y sin `COMMIT_REF`; registry contract OK
  (entradas en SCRIPT_REGISTRY + QUALITY_GATES para el comando del workflow).

### Límites declarados

- El canario corre cada 6 h: un deploy clavado se detecta en horas, no en
  minutos (el incidente se midió en semanas).
- Detecta _staleness_ del front servido; no valida migraciones ni functions
  por separado (van en el mismo deploy atómico de Netlify).
- El primer run tras el merge puede alarmar si Netlify tarda más de 45 min en
  publicar — falso positivo benigno que se cierra solo en el run siguiente.
- La protección de rama exige branch al día: PRs viejos piden "Update branch"
  antes de mergear (costo aceptado a cambio de no repetir el desync de #388).
