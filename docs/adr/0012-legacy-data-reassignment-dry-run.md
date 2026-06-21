# ADR 0012: Legacy Data Reassignment Dry Run

Fecha: 2026-06-21

Estado: Aceptado

## Contexto

Despues de quitar `legacy-single-user` como default operativo de `user_id`, la
aplicacion sigue conservando datos historicos bajo esa identidad. Ese estado es
deliberado: permite que el dueno original siga viendo datos pre-Clerk mediante
el alias `LEGACY_OWNER_CLERK_ID`.

El siguiente impulso natural seria mover todos esos datos al `sub` real de
Clerk. El problema es que no todas las superficies tienen el mismo riesgo:

- Algunas tablas son owner-scoped simples.
- Otras incluyen sharing, feedback, tokens, attachments o media.
- Netlify Blobs puede tener keys antiguas sin prefijo de usuario.
- Mover DB sin mover storage, o al reves, puede romper descargas y feed.

## Decisión

Antes de cualquier migracion real, Trama debe tener un dry-run read-only que
genere inventario de:

- Filas con `user_id = 'legacy-single-user'` por tabla privada.
- Blob keys legacy sin prefijo en stores de Momentos, Recortes y Notas.
- Clasificacion de automigrable vs requiere revision.
- Riesgo de rollback por recurso.

El dry-run puede emitir Markdown para revision humana y JSON para artifacts,
pero no puede escribir en Postgres ni Netlify Blobs.

## Invariantes

### 1. Read-only primero

El script `legacy-data-reassignment:dry-run` no debe contener caminos de
escritura. No actualiza `user_id`, no reescribe `storage_key`, no copia blobs y
no borra claves legacy.

### 2. Tabla privada viene del contrato vivo

La fuente de verdad para inventario SQL es `PRIVATE_TABLE_CONTRACTS`. Si se
agrega una tabla privada nueva con `user_id`, el dry-run la incorpora al quedar
registrada en el contrato Auth/RLS.

### 3. Blob sin prefijo no es automigrable

Una key sin prefijo puede ser del espacio historico, pero no basta con asumir
destino. Primero debe mapearse a una referencia DB, un owner aprobado y una
estrategia de rollback.

### 4. Target owner es explicito

El dry-run puede mostrar `LEGACY_REASSIGNMENT_TARGET_USER_ID`, pero no lo
infiere desde Clerk ni desde envs de produccion. La decision de destino es
operacional y debe quedar revisada.

## Consecuencias

Positivas:

- Reduce el riesgo de una migracion masiva a ciegas.
- Separa diagnostico de ejecucion.
- Hace visible la deuda real por tabla y store.
- Permite revisar tokens, sharing y attachments antes de tocar datos.

Costos:

- Todavia no elimina la compatibilidad legacy.
- Agrega un script operacional mas que debe mantenerse en el registry.
- Requiere correr con acceso a DB/Blobs reales para obtener evidencia completa.

## Alternativas Consideradas

### Migrar todo en un solo PR

Rechazada. Mezcla lectura, escritura, rollback y validacion multiusuario en una
sola operacion. El blast radius es demasiado alto.

### Mantener legacy indefinidamente sin inventario

Rechazada. Es aceptable conservar compatibilidad, pero no seguir sin medir
cuanta data depende de ella.

### Reasignar solo SQL y dejar blobs legacy

Rechazada como estrategia por defecto. Puede dejar referencias inconsistentes y
descargas rotas para Notas, Recortes o Momentos.

## Rollback

Este PR no requiere rollback de datos porque no escribe. Si el script reporta
mal una superficie, se corrige el clasificador o el contrato y se vuelve a
correr el dry-run.

Un PR futuro de ejecucion debe definir su propio rollback transaccional,
incluyendo conteos antes/despues, mapping de owner, copy de blobs previo a
rewrite y retencion temporal de keys legacy.
