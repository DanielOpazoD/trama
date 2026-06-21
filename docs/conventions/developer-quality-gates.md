# Developer Quality Gates

Este contrato agrega dos herramientas de mantenimiento con alcance acotado:

- `npm run check:knip` o `npm run check:dead-code`: inventario de archivos, exports, scripts y dependencias que parecen no usados.
- `npm run check:architecture` o `npm run check:dependency-cruiser`: grafo de imports con dependency-cruiser para fronteras de arquitectura.

El objetivo no es borrar codigo automaticamente. El objetivo es que la deuda nueva
sea visible y que las excepciones vivan documentadas cerca del check.

## Knip

Corre:

```bash
npm run check:knip
# alias compatible:
npm run check:dead-code
```

Knip parte desde entrypoints reales de Trama: Vite, tests, Playwright, Netlify
Functions, scripts operacionales y extension. Si reporta un falso positivo:

1. Confirma que el archivo/export/dependencia se usa en una frontera que Knip no
   puede ver, como Netlify runtime, assets publicos o tooling externo.
2. Prefiere agregar un entrypoint real en `knip.json`.
3. Si el uso es deliberadamente externo, agrega una excepcion pequeña en
   `ignoreFiles`, `ignoreDependencies`, `ignoreBinaries` o `ignoreIssues`.
4. Deja la excepcion lo mas especifica posible; no agregues carpetas completas
   salvo artefactos generados.

No uses `knip --fix` en este repo salvo para cambios revisados manualmente. No
uses `--allow-remove-files` en un PR de calidad gates.

### Baseline inicial

`knip.json` contiene excepciones exactas para deuda historica detectada al
activar el gate: archivos sin uso confirmado, exports/tipos publicos que hoy no
tienen consumidor visible, binarios externos (`psql`) y dependencias usadas por
scripts operacionales (`pg`, `playwright`). Esas excepciones no significan que
la deuda este resuelta; significan que el check bloquea deuda nueva sin mezclar
este PR con una poda funcional.

Cuando limpies una entrada, elimina tambien su excepcion de `knip.json` en el
mismo commit.

## Dependency-Cruiser

Corre:

```bash
npm run check:architecture
# alias compatible:
npm run check:dependency-cruiser
```

Reglas activas:

| Regla                               | Protege                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `no-circular`                       | Evita ciclos nuevos en el grafo de imports versionado.                   |
| `no-client-to-netlify-functions`    | `src/` no puede importar handlers Netlify; debe usar `src/api` o `/api`. |
| `no-client-netlify-blobs`           | El cliente no puede importar `@netlify/blobs`.                           |
| `no-client-server-only-modules`     | Runtime browser no importa APIs Node ni paquetes server-only.            |
| `netlify-wrappers-delegate-to-lib`  | Wrappers `netlify/functions/*.mts` no importan otros wrappers.           |
| `no-lib-to-function-wrapper`        | `_lib` no depende de wrappers runtime con `config.path`.                 |
| `pdf-heavy-imports-through-loaders` | PDF pesado se mantiene detras de loaders, salvo tests/ensambladores.     |

Si una excepcion es legitima, agregala en `.dependency-cruiser.cjs` con
`pathNot` acotado y comentario. Si la excepcion empieza a crecer, probablemente
conviene crear un check especifico como los contratos existentes de PDF o
storage.

El baseline de ciclos debe tender a cero. Hoy
`.dependency-cruiser-known-violations.json` esta vacio: `check:architecture`
falla si aparece una violacion nueva o si alguien intenta mantener una entrada
obsoleta. Si en el futuro aparece una excepcion temporal, debe incluir una razon
especifica, un owner implicito por modulo y un plan de retiro; no uses el
baseline como estacionamiento permanente de ciclos.

## Integracion

Ambos checks viven en el job `lint` porque no requieren build ni base de datos.
Si una regla nueva produce demasiadas violaciones historicas, el PR debe:

1. documentar el baseline o allowlist;
2. bloquear deuda nueva cuando sea posible;
3. dejar la limpieza masiva para un PR dedicado.
