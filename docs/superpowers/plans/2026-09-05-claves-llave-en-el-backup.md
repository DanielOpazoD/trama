# La llave del vault viaja en el respaldo

## Problema

El vault de Claves cifra `secret`, `service`, `username` y `notes` en el
cliente con una clave derivada de la contraseña (PBKDF2, 250 000 iteraciones)
y una salt. Los sobres cifrados viven en el servidor y salen en el export de
Ajustes → Datos. La salt y el verificador viven **solo en `localStorage`**, y
ni `export.mts` ni `DataPanel.tsx` los mencionaban.

Consecuencia: un respaldo restaurado en otro navegador (o en el mismo tras
limpiar datos del sitio) trae todas las claves y ninguna forma de abrirlas.
Era el único hallazgo de las tres evaluaciones con **pérdida irreversible**:
no hay camino de recuperación, ni siquiera sabiendo la contraseña.

## Cambios

- **Export**: `attachVaultToExport` suma la configuración del vault
  (`salt`, `verifierIv`, `verifierData`, `requiresPhysicalKey`) al JSON justo
  antes de descargarlo. El servidor no participa: `/api/export` devuelve lo
  de siempre y el campo `vault` nace en el cliente.
- **Import**: `splitVaultFromImport` separa el campo antes de llamar a
  `/api/import`, y `applyVaultFromImport` lo instala en `localStorage` **solo
  si este navegador no tiene vault**. La vista previa anticipa qué va a pasar
  (`vaultImportNotice`) antes de que el usuario confirme.
- **Un solo ámbito**: `useVaultScope()` en `src/lib/vaultScope.ts`, compartido
  por la vista de Claves y el panel de Datos. Antes la vista lo calculaba
  inline; si el panel lo hubiera calculado por su cuenta, un respaldo podría
  guardarse bajo una clave y buscarse bajo otra.
- **Copy**: el panel de Datos dice que el archivo incluye la configuración del
  vault y no la contraseña. El formulario de crear vault avisa que, si ya se
  tenía uno en otro navegador, conviene restaurar la copia antes de crear
  otro.
- **Contrato**: sección «Respaldo» en `docs/notas-vault.md`.

## Decisiones

- **No pisar un vault local existente.** Si el archivo trae otro vault, se
  conserva el de este navegador y se dice en la vista previa que las claves
  del archivo cifradas con aquel no se abrirán aquí. Pisarlo dejaría
  ilegibles las claves guardadas con el local, que es exactamente el daño que
  un respaldo existe para evitar. Re-cifrar de un vault a otro sería otro
  pack.
- **La salt en el archivo permite fuerza bruta offline.** Es un coste real y
  se asume: un respaldo que no se puede abrir no es un respaldo, y 250 000
  iteraciones de PBKDF2-SHA-256 hacen cara cada prueba. La contraseña y la
  llave física siguen sin salir del navegador.
- **Cliente y no servidor.** Guardar la configuración en la base habría sido
  más cómodo, pero cruza la frontera que el contrato del vault fija: el
  backend no conoce nada del material de clave. Que viaje en el archivo
  respeta esa línea.

## Validación

- Suite: `vaultCrypto` (7), `dataVaultBackup` (4) y `DataPanel` (16) en
  verde, con 11 pruebas nuevas.
- `typecheck`, `lint`, `format:check`, ratchets estructurales (DataPanel queda
  en 192/200) y los gates del job `lint` en verde.

**Verificado por mutación**, una guarda cada vez:

- Quitar la guarda de «no pisar» en `restoreVaultConfig` → fallan las pruebas
  de `kept-local` en los tres archivos.
- Quitar `attachVaultToExport` del export → falla «el export lleva la
  configuración del vault local».
- Enviar `parsed.payload` entero a `doImport` → falla «NO se envía al
  servidor».

## Pendiente

- Re-cifrar las claves de un vault a otro (para fusionar dos respaldos con
  contraseñas distintas) no existe. Hoy el aviso es honesto: se conservan las
  locales y las ajenas no se abren.
- El export sigue sin incluir `prompts` ni `secrets` en el tipo
  `ExportPayload` aunque el servidor los envía y el import los acepta. El
  tipo es más estrecho que el archivo real; no afecta a este cambio, pero
  conviene alinearlo.
