# Storage and Observability Boundary v1

## Objetivo

Preparar Trama para multiusuario serio, debugging productivo y una futura
migracion de storage sin cambiar de provider ahora.

## Bloques

### 1. Storage adapter

- Crear `StorageAdapter`.
- Implementar provider actual con Netlify Blobs.
- Migrar escrituras/lecturas criticas para no importar `@netlify/blobs` directo.
- Agregar guardrail `check:storage-boundaries`.

### 2. Blob/File manifest

- Agregar tabla `storage_assets` con `user_id`, dominio, owner logico, provider,
  key, MIME, tamano, checksum y soft-delete.
- Registrar nuevas subidas en attachments, recortes, momentos y PDF Studio.
- Soft-deletear manifest cuando el dominio borra un recurso.
- Mantener RLS y contrato Auth/RLS.

### 3. Observabilidad privacy-first

- Mantener sink interno actual (`logEvent`, `persistError`).
- Endurecer redaccion para storage keys por nombre de campo.
- Documentar path Sentry-ready sin agregar dependencia.

### 4. Runbooks

- Documentar frontera de storage.
- Documentar protocolo DevTools AI sin copiar datos privados.
- Actualizar scripts operacionales y convenciones de datos.

## Fuera de alcance

- No migrar a Supabase Storage.
- No implementar dual-read.
- No migrar blobs existentes.
- No agregar Sentry ni Session Replay como dependencia.
- No cambiar modelo de datos funcional de Notas/Recortes/Momentos.

## Validacion esperada

```bash
npm run check:storage-boundaries
npx vitest run netlify/functions/_lib/storage-adapter.test.ts netlify/functions/_lib/storage-assets.test.ts scripts/storage-boundaries.test.mjs
npx vitest run netlify/functions/_lib/notas-attachments-upload-endpoint.test.ts netlify/functions/_lib/momentos-upload-endpoint.test.ts netlify/functions/_lib/recortes-image-endpoint.test.ts
npm run check:auth-rls-contracts
npm run check:script-registry
npm run lint
npm run typecheck
npm test
npm run build
```
