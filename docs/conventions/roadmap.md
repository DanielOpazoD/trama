# Decisiones aplazadas

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Multi-user completo (provisioning + cierre del fallback).** La auth con Clerk YA está activa: `@clerk/backend` verifica el Bearer token en `netlify/functions/_lib/auth.ts` y todas las tablas YA tienen `user_id`. El dueño entra con Clerk y un alias (`LEGACY_OWNER_CLERK_ID`) mapea su sub a `legacy-single-user`, así ve toda su data pre-Clerk sin migrar tablas ni blobs. Lo que falta antes de abrir a la familia: (1) **provisioning** — crear la fila en `users` al primer login (webhook de Clerk o upsert lazy); (2) **cerrar `ALLOW_LEGACY_FALLBACK`** — hoy en `true` deja pasar requests sin token como el dueño; (3) **tests de aislamiento** por `user_id`; (4) **Spotify y cost-cap por persona**. Detalle histórico (varios pasos ya hechos) en [`docs/migracion-multi-user.md`](../migracion-multi-user.md).
- **Migrar grafo a xyflow.** El renderer SVG escala bien hasta ~1k nodos; a partir de ahí ya está sigma.js (commit Q). xyflow es otra opción si se quiere un sistema de nodos más interactivo (drag, conexiones manuales).
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
