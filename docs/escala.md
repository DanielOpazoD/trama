# Escala: cuándo activar qué

## Cuándo abrir esto

- La trama tiene 2000+ entidades y siento la app más lenta.
- El grafo se cuelga al abrirse.
- La búsqueda tarda en cargar.
- "Cuánto puede aguantar esto antes de tener que migrar?"

## Lo que hace cada escalón

Trama tiene escalones de escalabilidad que se activan a distintos tamaños:

| Tamaño      | Qué tienes                                        | Qué se activa solo                                        | Qué tienes que decidir tú                                                 |
| ----------- | ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0-500       | Modo "completo" del grafo va sobrado, sin pensar  | —                                                         | —                                                                         |
| 500-2000    | Listas (Citas/Entidades/Relaciones) virtualizadas | Cursor pagination activa cuando llegues a las 60 primeras | —                                                                         |
| 2000-5000   | Grafo completo empieza a notarse                  | Banner sugiere modo explorar                              | Decidir si pasar al modo explorar                                         |
| 5000-15000  | Necesitás explorar obligatorio                    | Hard caps en /api/entities y /api/relationships           | Migrar al modo explorar del grafo si no lo hiciste                        |
| 15000-50000 | HNSW empieza a ser indispensable                  | (Ya está activo)                                          | Modo exploratorio obligatorio; revisar workers si el layout bloquea la UI |
| 50000+      | Particionar logs                                  | Indices BRIN siguen ágiles                                | Implementar el plan de partition de F                                     |

## GraphView va lento

### A 2000-5000 entidades

Síntoma: el grafo tarda 2-5 seg en arrancar. Pan/zoom va lento.

Solución: en la toolbar del grafo, cambiar de "completo" a **"explorar"**. El grafo arranca en la última entidad seleccionada y solo pinta sus vecinos directos. Mucho más liviano.

El banner debería sugerirlo automáticamente cuando crucés las 2k.

### A 5000+ entidades

Modo "completo" probablemente esté inutilizable. Mantente en "explorar" siempre.

Si querés ver el grafo completo en alguna ocasión (rara), aceptá los 10-30 seg de carga y no esperes pan/zoom suave.

### A 15000+

GraphView ya cambia a WebGL con sigma.js en el modo completo grande. Si aun así
se siente pesado, el siguiente cuello probable no es el renderer sino el tamaño
del dataset, el cálculo de layout o la carga wholesale; usa modo explorar antes
de pedir más fidelidad visual al canvas.

## Quotes / Citas

QuotesView ya tiene paginación por cursor + virtualización. Aguanta 100k+ sin problemas.
La portada no descarga todas las citas: `HomeView` consume `GET /api/home`, que
devuelve una cita destacada, actividad breve y counts desde el servidor.

## Entidades / Relaciones (listas)

Ya paginadas e virtualizadas (commit D). Sin acciones.

El formulario de "añadir relación manualmente" usa autocomplete. La lista de
relaciones consume `/api/relationships?limit=...`, y cada fila ya viene con
`from_name/to_name` desde el backend paginado; no necesita cargar todas las
entidades solo para resolver nombres.

## Búsqueda en la sidebar

Ya server-only (commit J). A cualquier escala, una búsqueda son ~2 queries SQL con índices. Sub-segundo.

Si va lento:

1. ¿Tenés muchas entidades sin embedding? Settings → "Indexar lo pendiente".
2. ¿La query es muy específica + cero matches lexicales? Debería degradar limpio. Ver consola del browser por errores.

### Benchmark local 10k/50k

Para medir el punto real de quiebre antes de agregar índices vectoriales o subir
budgets, corre el benchmark lexical sobre una DB local migrada:

```bash
npm run db:up
npm run bench:search-scale
```

Por defecto mide 10k y 50k entidades/citas sintéticas bajo
`user_id = trama-benchmark-search`, ejecuta `EXPLAIN ANALYZE` de las ramas
léxicas de `/api/search` y termina con `ROLLBACK`, sin dejar fixtures. Para
tamaños específicos:

```bash
SEARCH_BENCHMARK_SIZES=1000,10000 npm run bench:search-scale
```

Solo conserva fixtures si necesitas inspección manual:

```bash
SEARCH_BENCHMARK_KEEP_FIXTURES=1 npm run bench:search-scale
```

## Chat / ask: ventana de contexto

Los prompts de `ask` (barra universal) y `chat` inyectan un volcado de la trama
(entidades + relaciones + citas) como contexto. Antes se cortaba con un
`.slice(0, 80)` ciego — a escala, una entidad con descripción larga podía hacer
que el prompt excediera la ventana del modelo y el provider **truncara en
silencio**.

Ahora el contexto se acota por **tokens estimados** (`_lib/token-budget.ts`):

- Presupuesto total `DEFAULT_CONTEXT_TOKEN_BUDGET = 6000` tokens, repartido
  50% entidades / 30% relaciones / 20% citas.
- Estimación barata (~4 chars/token). No exacta, pero suficiente para acotar.
- Si se omite algo, se loguea `context_truncated` en los logs de Netlify
  Functions (visible, no silencioso).
- 6000 tokens deja amplio margen en modelos de 32k-128k de contexto. Si subís a
  decenas de miles de entidades y querés más/menos contexto, ajustá la constante
  (o promovela a env var). El chat ya viene acotado por RAG aguas arriba; este
  presupuesto es la red de seguridad.

## Costo de Neon (DB)

Plan free de Neon: 0.5 GB de storage + 191 horas de compute al mes.

| Tamaño                                | Storage estimado | ¿Plan free aguanta?                 |
| ------------------------------------- | ---------------- | ----------------------------------- |
| 1k entidades + 5k quotes + embeddings | ~50 MB           | sí                                  |
| 10k + 50k + embeddings                | ~500 MB          | al límite                           |
| 100k + 500k + embeddings              | ~5 GB            | no, necesitás plan Launch ($19/mes) |

Embeddings 1536d × 8 bytes = 12 KB por entidad o quote. Es lo que más pesa.

Cuando se acerque el límite del plan free, considerá:

- Plan Launch de Neon ($19/mes, 10 GB).
- O archivar embeddings de quotes muy antiguas (las que no sea probable buscar).

## Costo de Netlify (functions + ancho de banda)

Plan free: 125k function invocations / mes, 100 GB de bandwidth.

A uso típico personal (no compartido) estás 100x debajo. Solo te preocuparías si compartís Trama públicamente.

## "Quiero medir cuánto tarda algo"

Settings → Health muestra latencias agregadas de las llamadas IA. Para queries SQL, mirar directamente:

```sql
EXPLAIN ANALYZE
SELECT * FROM entities WHERE name ILIKE 'borges%' AND deleted_at IS NULL;
```

en Neon Console. Te dice cuánto tarda y qué índices usa.

## Contexto técnico

- Los caps duros de wholesale (5000 entities, 10000 relationships) están en `entities.mts` y `relationships.mts`. Se loguean en `console.warn` cuando se alcanzan.
- El umbral del banner de "modo explorar" es `EXPLORE_HINT_THRESHOLD = 2000` en `GraphView.tsx`.
- El page size de las listas paginadas: 60 (entities/relationships) y 50 (quotes). Configurable en cada hook.
