# Momentos: álbum familiar/editorial multiusuario

## Objetivo

Convertir el sharing existente de Momentos en un álbum compartido con vida editorial mínima: quien tiene acceso puede leer, reaccionar y comentar; solo editores/propietarios siguen editando el contenido del Momento.

## Alcance de esta PR

- Mantener el modelo actual de invitaciones y roles (`viewer`, `editor`).
- Agregar feedback por Momento:
  - comentarios breves con autoría;
  - reacción simple tipo corazón;
  - lectura disponible para cualquier usuario con acceso al Momento.
- Hacer visible el feedback en timeline y álbum sin añadir nuevos paneles de configuración.
- Preservar soft-delete, RLS y transform snake_case/camelCase.

## Fuera de alcance

- Workspaces, equipos, canales o permisos por foto individual.
- Tiempo real/CRDT.
- Comentarios anidados, menciones, notificaciones y edición de comentarios.
- Export compartido avanzado; queda como siguiente bloque después de estabilizar interacción familiar.

## Guardrails

- Tests de endpoint antes de implementación.
- Nueva migración SQL; no editar migraciones aplicadas.
- Sin `DELETE FROM` para comentarios/reacciones.
- `viewer` puede comentar/reaccionar, pero no editar ni eliminar el Momento.
- Usuario sin acceso recibe `404` para no filtrar existencia.
