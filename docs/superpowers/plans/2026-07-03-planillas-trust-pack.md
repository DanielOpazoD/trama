# Planillas Trust Pack — estado de nube visible y versiones restaurables

## Problema

La sincronización del Cloud Pack era invisible ("¿se guardó en la nube o
no?") y cada push sobreescribía el paquete anterior: un error al editar una
plantilla no tenía vuelta atrás entre dispositivos. La confianza hay que
mostrarla, no solo tenerla.

Nota de alcance: el tercer candidato del pack ("export con fuente
embebida") ya estaba resuelto desde el pack 3 (`createPdfFontResolver` +
`updateAppearances`), así que este pack son dos piezas.

## Piezas

### 1. Historial de versiones en el servidor

- Migración `20260703200000_pdf_studio_template_versions`: RLS forzado,
  soft delete, FK a `users` y a la tabla principal, índice por
  (user, template, saved_at). Validada 2× (idempotente) en Postgres efímero.
- El POST ahora usa una **key de blob nueva por guardado** y el paquete
  anterior queda como versión en el MISMO statement (CTE `head` →
  `versioned` → upsert): sin ventana donde el paquete viejo quede huérfano.
  Retención: últimas 10 por plantilla (`pruneVersions` baja fila + blob +
  manifiesto). Borrar la plantilla baja su historial junto (CTE).
- `GET /:id/versions` (metadatos) y `GET /:id/versions/:versionId`
  (paquete), ambos scopeados por owner.
- El `.mts` quedó thin (patrón god-endpoint): la lógica vive en
  `_lib/pdf-studio-templates-endpoint.ts` con **import default** — el
  guardrail de aislamiento sigue al helper sólo con esa forma (gotcha).
- Warning `insert_select_manual_review` de `check:user-id-writes` aceptado
  con justificación: el user_id del snapshot viene de la CTE `head`, ya
  filtrada por el owner autenticado.

### 2. Estado de nube visible + restaurar

- `templateCloudBadge` (puro): punto de estado en cada tarjeta — «En la
  nube» (verde), «Cambios sin subir» (arcilla), «Solo en este equipo»
  (gris) — con la misma tolerancia de 2 s del merge.
- Menú «Versiones…» (sólo plantillas sincronizadas):
  `WorkspaceTemplateVersionsDialog` (useModalOverlay) lista el historial y
  restaura — la versión elegida se materializa como estado actual
  (`savedAt` nuevo) y se re-sube; lo reemplazado queda a su vez en el
  historial. `useWorkspaceTemplateCloud` ganó `listTemplateVersions` y
  `restoreTemplateVersion`; el workspace expone `templateCloud`.

## Validación

- Focales: endpoint (6, incl. snapshot CTE, prune con OFFSET, versiones con
  scoping), cloud hook (7, incl. restaurar materializa + re-sube y sin
  marcador no consulta), badge (1×3 estados), diálogo (2). Suite completa
  **4953 pass**, typecheck, build, la batería completa de gates.
- Navegador (demo/anon): las tarjetas muestran «Solo en este equipo» y el
  menú omite «Versiones…» sin marcador de nube — el flujo real con
  historial requiere backend (deploy preview).

## Pendiente de verificar en deploy preview

- Ciclo completo con sesión real: guardar → editar → «Versiones…» muestra
  la versión anterior → restaurar → aparece la restaurada en otro navegador.
