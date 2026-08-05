# Arquitectura: la prosa al día con el código

**Fecha**: 2026-08-05 · **Rama**: `codex/arquitectura-prosa-al-dia`

## Problema

`ARCHITECTURE.md` se abría con «Documento vivo de decisiones», pero medido
contra el código no mencionaba ni una vez: Imprenta/PDF Studio, Biblioteca,
WhatsApp, R2/Cloudflare, Clerk, recortes, Netlify Blobs, embeddings/pgvector,
ni el concepto de «mundo». Nombraba seis vistas cuando hay 11 en Trama y 8
secciones en Notas. Envejeció sin aviso porque la prosa no tiene gate; desde
el pack #400 el mapa (`docs/arquitectura/mapa.json`, gateado por
`check:architecture-map`) es el inventario fiable, y la cabecera cargaba un
aviso temporal reconociendo la deriva.

## Piezas / Cambios

Un solo archivo de producto: `ARCHITECTURE.md` (más este plan doc).

- **Cabecera**: se quitó el aviso temporal y se dejó explícita la división de
  trabajo: el mapa enumera (con gate), la prosa explica decisiones.
- **Visión**: incorpora los dos mundos, la captura (WhatsApp, extensión) y el
  matiz honesto del pilar «humano como curador» (en WhatsApp mandar el
  mensaje ES la aprobación — así está diseñado en `docs/whatsapp.md`).
- **Sección nueva «Los dos mundos»**: primera documentación del porqué. No
  existía ADR ni plan doc (verificado: el commit `e98a2b3f` de 2026-05-29 es
  anterior al directorio de planes); el racional declarado vivía en los
  docblocks de `src/types/world.ts`.
- **Stack técnico**: sigma.js como presente (no futuro), y entradas nuevas:
  Clerk, R2/`aws4fetch`, Twilio, embeddings/pgvector, streaming, entrega con
  branch protection + canario.
- **Modelo de datos**: se reemplazó el detalle tabla-por-tabla (duplicaba a
  las migraciones y estaba viejo: sin `user_id`, sin momentos/notas/etc.) por
  las convenciones de columnas + cascada CTE, remitiendo a
  `netlify/database/migrations/` y al mapa.
- **Caminos de la IA**: de «cinco caminos» a la regla que los unifica +
  excepciones deliberadas; `_lib/llm.ts` → directorio `_lib/llm/` con su
  superficie real (`askLLMForJson/Text/TextStreaming/Vision/Transcription`),
  selección por usuario y tarea, cadena opt-in, caché en dos niveles,
  cost-cap.
- **Decisiones nuevas**: dos mundos, PDF Studio lazy, R2 además de Blobs,
  RLS en dos capas, auth en tres niveles, canario de deploy. Actualizadas:
  SSE (solo `chat-messages` streamea), `getSql()` (ahora RLS-aware), layouts
  (worker), localStorage fallback (distinción con el modo prueba).
- **Desplegar/Testing/CI**: branch protection existe (el doc decía lo
  contrario), cinco jobs + `pdf-visual` path-filtered, Testing Library ya se
  usa (el doc decía que faltaba). La tabla «qué se testea» (9 filas contra
  ~800 archivos de test reales) se eliminó por inventario inviable.
- **Aplazadas**: remite a `docs/conventions/roadmap.md` (la lista canónica y
  fresca — p. ej. multi-user ya figura resuelto ahí) en vez de duplicar una
  lista que ya tenía tres items obsoletos (búsqueda en chat: hecha vía ⌘K;
  UI del extraction log: existe en Configuración; RTL: en uso).

## Decisiones (incluye lo que a propósito NO se tocó)

- **Verificación antes de prosa.** Cada afirmación nueva se contrastó contra
  el código (tres barridos de lectura: mundos, LLM/embeddings,
  storage/auth/RLS + verificación directa de CI/deploy/grafo). Correcciones
  que evitaron prosa falsa: el corte cliente chico/grande es **4 MB**
  (`src/api/momentos.ts`, `src/api/biblioteca.ts`) y los ~6 MB son el límite
  de plataforma que lo motiva; el gate de Blobs permite **dos** importadores
  (adapter + script de reasignación legacy); `user-id-write-contracts`
  verifica **INSERTs**, no WHEREs (el lado de lectura lo cubren el
  isolation-guardrail y `auth-rls-contracts`).
- **Los tres diagramas mermaid se conservaron tal cual**: son recientes y sus
  números se re-verificaron (21 rutas del demoRouter, 38 gates `kind:
'check'` en el registry, umbral 1000 del grafo).
- **No se agregó gate para la prosa.** El equilibrio elegido: las rutas entre
  backticks sí están gateadas (`check:docs-drift` las valida contra el
  árbol), y el inventario vive solo en el mapa gateado. Gatear afirmaciones
  semánticas de prosa no tiene un verificador razonable.
- **No se tocó `docs/conventions/dominios.md`** pese a que afirma «Inicio
  nunca ocultable» y el código dice lo contrario
  (`src/hooks/useModuleVisibility.ts`): la intención vigente la tiene que
  decidir el usuario — quedó como tarea aparte.
- **Hallazgo fuera de alcance, derivado a tarea aparte**: el dominio
  `pdf-studio-templates` se inserta en `storage_assets` pero el CHECK vigente
  de la tabla no lo incluye (última ampliación en
  `20260621180000_storage_assets_library_uploads`); ese INSERT debería estar
  violando el constraint en producción.

## Validación

- `npm run check:docs-drift` ✓ (toda ruta citada existe; sin patrones
  prohibidos)
- `npm run check:architecture-map` ✓ (73 nodos, 142 aristas, 196 rutas)
- `prettier --check ARCHITECTURE.md` ✓
- Suite completa, typecheck, lint, build + budget de bundle: ver el PR (el
  cambio es solo documentación, pero la validación corre entera igual).
- Gates que piden Postgres local: no corridos acá (sin Docker en el entorno);
  los cubre el job `migrations` de CI.
