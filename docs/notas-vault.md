# Mundo Notas — contrato del vault de Claves

Este contrato existe para mantener nítida la frontera de seguridad del Mundo Notas.
Notas, Tareas, Prompts y Anexos son privados por usuario y se protegen con auth,
`user_id`, soft-delete y endpoints backend. El cifrado fuerte local pertenece solo
al submódulo **Claves**.

## Qué protege Claves

- `secret`, `service`, `username` y `notes` se guardan como sobres AES-GCM
  producidos en el cliente.
- La contraseña del vault y la llave física no se envían al backend ni se guardan
  en texto claro.
- La configuración local del vault se namespacea por usuario del navegador
  (`trama.notas.vault.v1:<userId>`), con fallback legacy para sesiones antiguas.
- El vault se bloquea al cambiar de usuario, al ocultar la pestaña y tras
  inactividad.
- El portapapeles se limpia después de copiar una clave si todavía contiene ese
  mismo valor.

## Qué queda visible por diseño

- `label`, `kind`, `favorite`, `critical`, `expires_at`, `last_rotated_at` y
  `copied_at` son metadata visible para listar, filtrar y mostrar salud del vault.
- Los conteos y filtros de la UI se calculan con esa metadata visible; nunca usan
  el valor secreto descifrado.

## Respaldo

La configuración del vault (salt, verificador y si pide llave física) vive solo
en `localStorage`. Los `secrets` cifrados sí están en el servidor y salen en el
export de Ajustes → Datos; sin la configuración, ese archivo restaurado en otro
navegador es una lista de sobres que nadie puede abrir.

Por eso el export **sí incluye** la configuración del vault, y el import la
restaura. Reglas:

- La suma y la separa el cliente (`dataVaultBackup.ts`). El campo `vault` del
  archivo nunca se envía a `/api/import`.
- La contraseña y la llave física no están en el archivo: con la configuración
  sola no se descifra nada.
- Al importar, si este navegador ya tiene un vault distinto, **se conserva el
  local** y se avisa; pisarlo dejaría ilegibles las claves guardadas con él.
- Coste asumido: la salt en el archivo permite fuerza bruta offline contra la
  contraseña. Se acepta porque un respaldo que no se puede abrir no es un
  respaldo, y PBKDF2 con 250 000 iteraciones hace cara esa fuerza bruta.

## Multiusuario

El backend filtra Claves por `user_id`, igual que el resto del Mundo Notas. El
namespace local del vault evita que dos usuarios del mismo navegador reutilicen
sin querer la misma configuración de contraseña. Si no hay usuario Clerk
disponible, se usa `legacy-single-user` para preservar compatibilidad local.

## No prometer

- No describir Notas, Tareas, Prompts o Anexos como E2EE.
- No describir `label`, `kind` o fechas de Claves como cifradas de extremo a
  extremo.
- No llamar a Netlify Blobs desde el cliente para anexos.
