# Decisiones aplazadas

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Multi-user completo (cutover operativo).** La auth con Clerk YA está activa: `@clerk/backend` verifica el Bearer token en `netlify/functions/_lib/auth.ts`; las tablas de dominio tienen `user_id`; provisioning lazy (`ensureUserRow`) existe en endpoints mutadores críticos; Spotify, cost-cap y alertas de costo ya operan por usuario. Lo que falta antes de abrir a la familia es operativo: setear Clerk en Netlify, verificar login E2E, y cerrar `ALLOW_LEGACY_FALLBACK` para que requests sin token den 401. Detalle histórico en [`docs/migracion-multi-user.md`](../migracion-multi-user.md).
- **Migrar grafo a xyflow.** El renderer SVG escala bien hasta ~1k nodos; a partir de ahí ya está sigma.js (commit Q). xyflow es otra opción si se quiere un sistema de nodos más interactivo (drag, conexiones manuales).
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
