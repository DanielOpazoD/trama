# ADR 0013: Storage Provider Migration Sequencing

## Estado

Aceptado.

## Contexto

Trama ya guarda binarios privados en Netlify Blobs y guarda firmas/timbres PDF
como data URL en Postgres. La app esta avanzando a multiusuario real, por lo que
storage deja de ser solo una comodidad tecnica: pasa a ser una frontera de
privacidad, auditoria y costo.

Supabase Storage, S3 o R2 son alternativas plausibles para el futuro, pero una
migracion directa hoy mezclaria cuatro riesgos en un solo PR:

- cambiar provider;
- copiar bytes existentes;
- ajustar ownership;
- depurar fallos productivos sin un manifest confiable.

## Decision

La secuencia aceptada es:

1. **Adapter primero**: todo acceso productivo a Netlify Blobs pasa por
   `StorageAdapter`.
2. **Manifest despues**: cada asset nuevo queda en `storage_assets` con owner,
   dominio, provider, key/logical locator, MIME, tamano, checksum y soft-delete.
3. **Reporte read-only**: `npm run storage-assets:report` estima cobertura por
   dominio sin escribir datos.
4. **Provider futuro**: solo cuando el manifest tenga cobertura suficiente se
   agrega un segundo provider.
5. **Dual-read temporal**: una migracion futura puede leer nuevo provider primero
   y fallback al provider anterior hasta verificar checksum/cobertura.

No se agrega Supabase Storage, Sentry Session Replay ni migracion masiva de
blobs en este PR.

## Consecuencias Positivas

- El cambio actual es deployable y reversible.
- Los endpoints dejan de depender de imports directos de `@netlify/blobs`.
- La migracion futura puede ser medida antes de copiar bytes.
- `pdf_stamp_assets` queda visible en inventario aunque siga viviendo en
  Postgres como data URL.

## Consecuencias Negativas

- Hay una tabla adicional que debe mantenerse sincronizada con escrituras nuevas.
- El manifest no prueba cobertura historica hasta correr reportes y backfill
  futuro.
- `postgres-data-url` es un provider transicional, no un destino final ideal para
  assets grandes.

## Alternativas Consideradas

### Migrar directamente a Supabase Storage

Rechazado por ahora. Mezcla provider, data migration y permisos en un solo
cambio, aumentando riesgo de fugas o perdida de blobs.

### Mantener solo Netlify Blobs sin manifest

Rechazado. No da una vista relacional de ownership, checksum, soft-delete ni
cobertura por dominio.

### Guardar todos los assets en Postgres

Rechazado para binarios generales. Postgres conserva metadata y algunos data URL
pequenos existentes, pero no debe convertirse en storage binario universal.

## Criterios de Exito

- `npm run check:storage-boundaries` pasa en CI.
- `npm run storage-assets:report` produce un reporte read-only.
- Los providers en `storage_assets` representan ubicaciones reales o logicas
  documentadas.
- Ningun log operacional imprime storage keys completas.
