# Planillas Cloud Pack — biblioteca de plantillas en cualquier dispositivo

## Problema

La biblioteca de Planillas vivía sólo en IndexedDB del navegador: cambiar de
equipo (o limpiar el navegador) significaba perder las plantillas diseñadas.
El PDF plano ya se subía (`pdf_studio_saved_pdfs`), pero la **estructura
editable** (casilleros, estilos, fuentes) no tenía camino al servidor.

## Decisiones de diseño

- **Sólo plantillas limpias.** Se sincroniza únicamente `kind: 'template'`
  (sin valores de casilleros). Las copias con datos (`filled-template`) pueden
  contener información de pacientes y **nunca salen del dispositivo**;
  `packPdfTemplate` además borra valores por diseño (cinturón y tirantes).
- **Un paquete = un blob.** `PdfTemplatePackage` (versión 1) serializa páginas,
  casilleros y ajustes como JSON y las fuentes (PDF/imágenes) en base64, en un
  solo archivo JSON ≤ 50 MB. Metadatos (nombre, descripción, tags, estado,
  conteos, `savedAt`) van a Postgres para listar sin descargar paquetes.
- **Key determinista** `${userId}/${savedDocId}.json`: cada re-guardado
  sobreescribe el mismo blob (sin huérfanos por versión); `savedDocId` viene
  validado a charset seguro.
- **Merge last-write-wins por `savedAt`** (el reloj del guardado viaja con el
  paquete), con tolerancia de 2 s para no hacer ping-pong. El marcador
  `cloudTemplate` en el `SavedDoc` local distingue "nunca sincronizada" (se
  sube) de "borrada en otro equipo" (se borra localmente).
- **Best-effort silencioso.** Sin sesión (demo/anon) el sync queda apagado;
  sin conexión, la biblioteca local sigue igual que siempre y el próximo merge
  al cargar reintenta.

## Piezas

- Migración `20260703090000_pdf_studio_templates`: tabla con RLS real
  (ENABLE+FORCE+policy `trama_user_isolation`), FK a `users`, soft delete,
  único activo por `(user_id, saved_doc_id)`. Validada dos veces (idempotente)
  contra Postgres efímero.
- Endpoint `netlify/functions/pdf-studio-templates.mts` (patrón
  `pdf-studio-saved-pdfs`): GET lista metadatos, GET `/:id` baja el paquete,
  POST multipart upsert (blob vía storage-adapter + `recordStorageAsset` con
  checksum), DELETE soft + `softDeleteStorageAsset`. Registrado en
  `auth-rls-contracts` y en el union de dominios de `storage_assets`.
- Cliente `src/api/pdfStudioTemplates.ts` (todo por `request<T>`).
- Serialización pura `src/lib/pdfStudio/sync/templatePackage.ts`
  (pack/unpack con base64 chunked, validación de forma y versión).
- Plan puro `workspace/templateCloudPlan.ts` + orquestador
  `useWorkspaceTemplateCloud` (pull-merge al cargar, push en guardar /
  duplicar / renombrar / editar metadatos, delete remoto al borrar).
  `usePdfStudioWorkspace` lo habilita sólo en `studioMode='templates'`.
  Renombrar y editar metadatos ahora actualizan `savedAt` (el reloj del merge).

## Validación

- Focales: paquete (roundtrip de bytes, limpieza de valores, rechazo de formas
  ajenas), endpoint (aislamiento por usuario en las 4 operaciones, key
  determinista, charset de `savedDocId`), plan de merge (LWW, tolerancia,
  borrado propagado, exclusión de copias con datos), hook de nube (merge
  inicial, push con marcador, silencio offline, nunca copias con datos).
- Suite completa (4926 pass), typecheck, build, todos los gates de lint
  (auth-rls, user-id-writes, storage-boundaries, knip, docs-drift, etc.),
  migración aplicada 2× en Postgres efímero, verificación en navegador (demo:
  biblioteca intacta y sync apagado sin sesión).
- Pendiente en deploy preview (requiere backend real): subir desde un
  navegador, abrir desde otro perfil/equipo y ver la plantilla materializada.

## Futuro (fuera de alcance)

- Indicador visual de estado de nube en la tarjeta de plantilla.
- Resolución de conflictos más fina que LWW (diff de casilleros).
- Sincronizar carpetas y PDFs/copias (hoy locales a propósito).
