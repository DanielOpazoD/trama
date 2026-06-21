# Legacy Data Reassignment Dry Run v1

## Objetivo

Preparar el siguiente PR estructural después de `Legacy Identity Cutover v1`:
medir y simular la reasignación de datos históricos desde
`legacy-single-user` hacia el `sub` real de Clerk del dueño, sin mover datos ni
blobs todavía.

## Principios

- No modificar datos en este PR.
- No reescribir storage keys todavía.
- No mezclar con cambios de UI.
- Producir evidencia operativa: conteos, tablas afectadas, blobs legacy y
  riesgos de rollback.

## Bloques Propuestos

1. Inventario SQL read-only de filas `user_id = 'legacy-single-user'` por tabla
   privada.
2. Inventario read-only de blobs legacy sin prefijo por store (`momentos-media`,
   `recortes-media`, `notas-attachments`).
3. Script `legacy-data-reassignment:dry-run` que emite JSON y Markdown.
4. Tests de evaluadores puros: conteos, warnings y casos de tablas vacías.
5. Runbook con estrategia futura de migración reversible por lotes.

## Criterio De Exito

- El dry-run corre sin escribir en Postgres ni Netlify Blobs.
- El reporte deja claro qué se movería, qué quedaría legacy y qué requiere
  intervención manual.
- El PR siguiente puede decidir si conviene migrar datos reales o mantener
  compatibilidad histórica indefinidamente.

## No Objetivos

- No actualizar `user_id` en tablas productivas.
- No mover blobs entre claves.
- No revocar ni cambiar usuarios Clerk.
- No eliminar `legacy-single-user`.
