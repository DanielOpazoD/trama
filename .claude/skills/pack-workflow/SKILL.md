---
name: pack-workflow
description: >-
  El playbook de extremo a extremo para entregar un «pack» de mejora en el repo
  Trama: rama desde main → implementación → validación completa (suite + gates +
  build + budget de bundle) → verificación en el navegador → plan doc → PR →
  monitor de CI → hallazgos de CodeRabbit → memoria. Úsalo SIEMPRE que vayas a
  implementar cualquier mejora, feature, refactor o corrección que terminará en
  un PR de Trama —incluso si el usuario solo dice «mejora X», «rediseña Y» o
  «arregla Z» sin nombrar la palabra «pack»— para no saltarte ningún gate
  (sobre todo el budget de bundle, que no corre en `npm test`) ni el orden que
  mantiene el CI verde a la primera.
---

# Pack workflow — cómo se entrega una mejora en Trama

Un «pack» es una unidad de trabajo acotada que empieza en una rama y termina en
un PR con CI verde, listo para que **el usuario** lo mergee. Esta skill captura
el proceso que mantiene la calidad alta y el CI verde a la primera. No es
burocracia: cada paso existe porque saltárselo ya costó un ciclo de CI o una
regresión.

**La fuente de verdad de las convenciones es [AGENTS.md](../../../AGENTS.md).**
Léelo antes de tocar código, migraciones, APIs o documentación. Esta skill es
el *proceso*; AGENTS.md son las *reglas*.

## Filosofía de producto (por qué, no solo qué)

La dirección es **minimalista premium**: lo esencial a la vista, lo poco
frecuente detrás de desplegables sutiles, cero redundancia, movimiento sereno
(90–160ms, respetando `prefers-reduced-motion`), el diseño transmite en vez del
copy, copy honesto. Español: **tuteo neutro siempre**, nunca voseo ni
regionalismos, en respuestas y en artefactos. Cuando dudes entre dos diseños,
elige el que quita, no el que añade.

## El flujo, paso a paso

### 1. Rama desde main fresco

Nunca trabajes sobre una rama vieja: el usuario mergea seguido, así que main se
mueve. Partir desde main actualizado evita conflictos y commits huérfanos.

```bash
git checkout main && git pull
git checkout -b codex/<nombre-del-pack>
```

### 2. Implementación

Sigue AGENTS.md y la filosofía de arriba. Prefiere extraer y compartir (un
«chrome» común) antes que duplicar variantes parecidas — la coherencia entre
piezas es el valor. Escribe código que se lea como el de alrededor: misma
densidad de comentarios, mismos idioms, mismos tokens.

### 3. Validación completa (ANTES de pushear)

El orden importa: un check rojo en CI frena los posteriores, así que corre todo
localmente primero. Desde la raíz del repo:

```bash
# Suite completa — OJO: la ":" en la ruta del repo rompe `npx vitest`.
# Usa SIEMPRE el runner del repo:
node scripts/run-vitest.mjs run

# Typecheck, lint (eslint) y formato
npm run typecheck
npm run lint
npm run format:check          # si falla, formatea los archivos tocados

# Gates de frontend (los que más tocan los packs de UI):
npm run check:design-tokens   # text-sm/xs/base/lg/xl/2xl VETADOS → usar text-body/caption/micro/lead/h1/h2
npm run check:icon-button     # solo-ícono → <IconButton label>; exención `icon-button-exempt:`
npm run check:focus-ring      # ver gotcha del marcador abajo
npm run check:form-control-labels
npm run check:frontend-boundaries
npm run check:structure-ratchets   # extraer nunca subir
npm run check:modal-overlay
npm run check:knip && npm run check:dead-code

# Build...
npm run build

# ...y el BUDGET DE BUNDLE — corre solo tras el build y NO lo cubre `npm test`.
# Este es el gate que más se olvida y el que tumba el job `unit` en CI.
node scripts/check-bundle-size.mjs
```

Para packs que tocan **backend/SQL/migraciones**, además corre los gates de ese
dominio (`check:user-id-writes`, `check:auth-rls-contracts`,
`check:migration-duplicates`, `check:cte-regression`, `check:api-*`…). La lista
canónica y su razón están en AGENTS.md. Ante la duda, corre de más: los gates
que escanean el código fuente atrapan patrones nuevos que los tests no ven.

### 4. Verificación en el navegador (no supongas — mide)

Si el cambio es observable en la UI, verifícalo de verdad; no lo des por bueno
"a ojo". Levanta el preview y entra en modo demo:

- Server: **trama-dev**, puerto **3100** (herramientas `preview_*`).
- Demo sin backend: `localStorage['trama-demo']='1'`,
  `localStorage['trama:world']='notas'`, luego recargar.
- **Mide, no adivines**: usa `preview_inspect` para valores CSS computados
  (colores, tamaños) en vez de fiarte del screenshot. Cuando afirmes que algo
  cambió, respáldalo con el valor (p. ej. borde `rgba(...)`, offset `0px`).
- Gotcha de estados que solo se calculan en el montaje (p. ej. un
  `overflowing` medido en `useLayoutEffect`): NO se recalculan al cambiar el
  tamaño del viewport — recarga YA en el viewport objetivo (mobile) para
  reproducir el estado.
- `focus()` sintético no dispara `focusin` sin foco real del SO → despacha un
  `FocusEvent` manual si necesitas simular foco.

Cierra con evidencia: un `preview_screenshot` para cambios visuales, o la
medición numérica para lo fino.

### 5. Plan doc

Deja constancia del qué y el porqué en:

```
docs/superpowers/plans/AAAA-MM-DD-<nombre-del-pack>.md
```

Estructura útil: **Problema** → **Piezas/Cambios** → **Decisiones** (con el
porqué, incluidas las cosas que a propósito NO se tocaron) → **Validación**. Es
breve pero honesto: si algo quedó pendiente de verificar en producción, dilo.

### 6. Commit, push, PR

Commits en español, cuerpo que explique el porqué. Termina el mensaje con la
línea de atribución que pida el entorno. Luego:

```bash
git add -A && git commit -m "<título claro>

<cuerpo: qué y por qué>"
git push -u origin codex/<nombre-del-pack>
gh pr create --title "<título>" --body "<qué hace + validación>"
```

El cuerpo del PR debe incluir la sección de validación (tests, gates, build,
budget en verde) y el link al plan doc.

### 7. Monitor de CI

No te quedes mirando: lanza un monitor que sondee `gh pr checks <N>` y avise
cuando cierre. Los checks del repo: `secrets`, `migrations`, `lint` (incluye
todos los `check:*`), `unit` (tests + coverage + build + **budget de bundle**),
`e2e`, `CodeRabbit`. Si `unit` cae con un `document is not defined` u otros
síntomas de runner inestable (ECONNREFUSED, 503, socket hang up) pese a que
`test:coverage` local pasa (exit 0), es **flaky de infraestructura**: un nuevo
push reintenta.

### 8. Hallazgos de CodeRabbit

Cuando CodeRabbit comente, léelos y aplica los que valgan la pena (los reales:
fugas de listeners, a11y, casos borde). Ignora con criterio los cosméticos.
Recomóntalo todo por la misma validación del paso 3 antes de re-pushear.

### 9. Memoria

Actualiza el archivo de programa relevante en la memoria persistente (p. ej.
`ui-polish-global-program.md`) y su línea en `MEMORY.md`. Guarda lo NO obvio:
decisiones, gotchas nuevos, el estado del programa — no lo que el repo ya
registra por sí mismo.

## Reglas de oro

- **El usuario hace TODOS los merges. Tú nunca mergeas.** Entregas el PR con CI
  verde y avisas; el merge es decisión suya.
- **Una rama por pack**, siempre desde main fresco.
- **Verde local antes de pushear.** El CI no es tu linter — es la última red.
- Si el usuario mergeó antes de tu push y quedó un commit huérfano:
  cherry-pick a una rama nueva y abre un PR de rescate.

## Gotchas que ya costaron un ciclo (memorízalos)

1. **La `:` en la ruta del repo rompe `npx`.** `npx vitest` falla → usa
   `node scripts/run-vitest.mjs run`. Aplica a cualquier binario vía npx.
2. **El budget de bundle NO corre en `npm test`.** Vive en el job `unit` de CI,
   tras el build. Córrelo con `node scripts/check-bundle-size.mjs` siempre que
   agregues código a un chunk con presupuesto (p. ej. `NotasWorld`). El arreglo
   típico cuando excede: pasar a lazy la pieza pesada (Suspense + prefetch por
   intención), no subir el presupuesto.
3. **`focus-ring` gate — el marcador es posicional y literal.** El comentario
   `// focus-ring-exempt: <razón>` debe ir en la línea **inmediatamente
   superior** al código exento. Y NO menciones la frase `focus-ring-exempt` en
   comentarios explicativos de prosa: el gate la lee como un marcador huérfano y
   falla. (Igual con `icon-button-exempt`.)
4. **`design-tokens`**: `text-sm/xs/base/lg/xl/2xl` están vetados; usa los
   semánticos (`text-body/caption/micro/lead/h1/h2`; `text-3xl/4xl` permitidos).
   El ratchet de aliases legacy solo baja, nunca sube.
5. **HMR y hooks**: reordenar hooks dentro de un hook custom crashea la sesión
   HMR («change in the order of Hooks») — es solo HMR; una carga fresca va bien.
6. **Flakies conocidos bajo carga**: `PdfStudioView.test` (timeout) y algún e2e
   de sidebar/búsqueda — reconfírmalos en aislamiento antes de dar por real un
   fallo.

## Escala el esfuerzo a la petición

«Arregla este detalle» → cambio quirúrgico + validación. «Rediseña de cero» o
«sorpréndeme» → libertad creativa, pero el mismo proceso de validación y PR.
Cuando el usuario pida una autoevaluación (nota 1–7) y que ejecutes las
mejoras, hazlo de principio a fin sin volver a preguntar.
