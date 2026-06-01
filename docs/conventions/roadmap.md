# Decisiones aplazadas

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Apertura multi-user operativa.** La auth con Clerk ya está activa:
  `@clerk/backend` verifica Bearer tokens; las tablas privadas tienen
  `user_id`; RLS fuerza `app.current_user_id`; provisioning lazy
  (`ensureUserRow`) existe en endpoints mutadores críticos; Spotify,
  cost-cap y alertas de costo operan por usuario. Antes de invitar familia:
  confirmar Clerk production en Netlify, correr el smoke
  `e2e/multi-user-isolation.spec.ts` con dos usuarios reales y mantener
  `ALLOW_LEGACY_FALLBACK=false` en producción. Detalle histórico en
  [`docs/migracion-multi-user.md`](../migracion-multi-user.md).
- **Migrar grafo a xyflow.** El renderer SVG escala bien hasta ~1k nodos; a partir de ahí ya está sigma.js (commit Q). xyflow es otra opción si se quiere un sistema de nodos más interactivo (drag, conexiones manuales).
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
