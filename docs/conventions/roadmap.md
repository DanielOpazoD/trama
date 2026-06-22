# Decisiones aplazadas

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Apertura multi-user operativa — RESUELTO (2026-06-21).** Ya NO es una
  decisión aplazada. Producción corre en Clerk estricto: `ALLOW_LEGACY_FALLBACK`
  apagado (anónimo = 401, verificado), llaves de producción puestas, y el
  aislamiento A/B (lectura, mutación y blobs) validado con dos usuarios reales.
  RLS fuerza `app.current_user_id`, el provisioning lazy (`ensureUserRow`) y el
  cost-cap por usuario operan. Estado verificado + procedimiento de cutover en
  [`runbook-multiusuario.md`](../runbook-multiusuario.md); contexto en
  [`migracion-multi-user.md`](../migracion-multi-user.md). Deuda opcional (no
  bloqueante): reasignar la data histórica de `legacy-single-user` al sub real.
- **Migrar grafo a xyflow.** El renderer SVG escala bien hasta ~1k nodos; a partir de ahí ya está sigma.js (commit Q). xyflow es otra opción si se quiere un sistema de nodos más interactivo (drag, conexiones manuales).
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
