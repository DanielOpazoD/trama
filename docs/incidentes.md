# Incidentes comunes

## Cuándo abrir esto

- La app no carga / pantalla en blanco / loading infinito.
- Una funcionalidad específica está rota.
- "Algo se siente raro" pero no sé qué.

## Triage rápido (5 min)

Antes de entrar al detalle, hacé los 5 chequeos:

1. **¿La URL responde?** Abrí Trama en una incógnita. Si no abre, es problema de Netlify/DNS.
2. **¿Hay deploy reciente?** https://app.netlify.com/sites/trama/deploys → ¿el último es rojo o amarillo?
3. **¿Hay errores en Settings → Health?** Mira los últimos.
4. **¿Estoy offline o con red inestable?** En la sidebar, ¿aparece el punto ámbar de "modo local"?
5. **¿Es solo en mi browser?** Abrir en otro browser/incógnita o desde el móvil.

Si pasan los 5 → es bug específico. Si no, ya tenés la causa.

## Síntomas específicos

### A: la app no carga, pantalla blanca

- **Network tab del browser** → ¿el HTML carga? ¿el JS principal carga (index-XXX.js)? Si algo da 404 → deploy roto, ver [deploy.md](deploy.md).
- Si todo carga pero JS error: ver consola del browser. Suele ser:
  - Un error en App.tsx que rompe el render entero → revert al deploy anterior.
  - localStorage en estado inválido → en consola del browser: `localStorage.clear()` y recargar.

### B: aparece pero los datos no cargan ("cargando…" forever)

- ¿Functions de Netlify respondiendo? `curl https://tu-trama/api/entities` → ¿devuelve JSON?
- Si devuelve 500: ver Settings → Health para el error. Suele ser:
  - DB connection rota → ver [datos.md](datos.md), sección "Neon backups".
  - Migración a medio aplicar → ver [migraciones.md](migraciones.md), sección "Recuperación".
- Si devuelve 200 con `[]`: la DB está OK pero está vacía. ¿Borraste algo? Ver "Recuperar algo que borraste" en [datos.md](datos.md).

### C: el chat no responde

Ver [ai.md](ai.md), sección "La IA responde lento" y "La IA no funciona".

### D: las propuestas IA traen entidades duplicadas

Esto NO debería pasar — el dup detection las atrapa en alta. Si pasa:

1. Verificar que las migraciones de embeddings se aplicaron: en Neon Console:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'entities' AND column_name LIKE 'embedding%';
   ```
   Debería listar `embedding`, `embedding_model`, `embedding_at`.
2. Si están: verificar que las entidades existentes tienen embeddings:
   ```sql
   SELECT COUNT(*) FROM entities WHERE embedding IS NULL AND deleted_at IS NULL;
   ```
   Si > 0: ir a Settings → Búsqueda semántica → "Indexar lo pendiente".
3. Si todas tienen embedding y aún hay dups: el umbral de cosine 0.20 puede no ser suficiente para tu caso. Editar en `netlify/functions/entities.mts` (busca `< 0.20`) → bajar a `0.15` para ser más agresivo.

### E: el grafo va lento / se cuelga

Ver [escala.md](escala.md), sección "GraphView va lento".

### F: aparecen errores random en consola pero todo "funciona"

Anotar el error exacto en un commit message o nota. Si no es crítico (la app funciona), es deuda técnica. Puedes seguir, pero al final del día revisar Settings → Health para ver si se acumulan.

### G: olvidé qué env vars tengo configuradas

https://app.netlify.com/sites/trama/configuration/env

Lista de las que importan:

| Env var                                      | Default              | Notas                                     |
| -------------------------------------------- | -------------------- | ----------------------------------------- |
| `NETLIFY_DB_URL`                             | —                    | Auto-generado por Netlify. No tocar.      |
| `AI_PROVIDER`                                | `deepseek`           | Provider global default.                  |
| `AI_API_KEY`                                 | —                    | Key de DeepSeek (legacy name).            |
| `OPENAI_API_KEY`                             | —                    | Key de OpenAI. Necesaria para embeddings. |
| `ANTHROPIC_API_KEY`                          | —                    | Key de Anthropic. Opcional.               |
| `GEMINI_API_KEY`                             | —                    | Key de Gemini. Opcional.                  |
| `AI_VISION_PROVIDER`                         | `(fallback al main)` | Override para extracción desde imagen.    |
| `AI_VISION_API_KEY`                          | —                    | Key para vision.                          |
| `AI_MAX_TOKENS`                              | `4096`               | Tope de tokens por respuesta.             |
| `AI_CACHE_TTL_SECONDS`                       | `600`                | Cache de respuestas LLM.                  |
| `AI_MONTHLY_BUDGET_CENTS`                    | `5000`               | Cap mensual en centavos.                  |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | —                    | Para integración Spotify.                 |

## Si nada de lo anterior aplica

1. Mirá Settings → Health buscando algo que no entiendas.
2. Buscá ese mensaje exacto en https://github.com/DanielOpazoD/trama/issues (puede haber un issue ya abierto).
3. Si no hay issue, abrí uno nuevo con: timestamp, lo que estabas haciendo, error exacto.

## Cuándo es "el sistema está mal" vs "yo lo rompí"

- Después de hacer push reciente → probable cambio que vos hiciste. Rollback al deploy anterior y mirá tranquilo.
- Sin cambios recientes y antes funcionaba → puede ser un cambio de un provider externo (OpenAI, Spotify), o de Netlify, o de Neon. Esperar 10 min suele resolverlo.
