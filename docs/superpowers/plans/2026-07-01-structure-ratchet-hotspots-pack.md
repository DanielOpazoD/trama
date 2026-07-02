# Structure Ratchet Hotspots Pack

## Objetivo

Bajar deuda estructural en archivos calientes que estan cerca del limite de
`check:structure-ratchets`, sin cambios funcionales y sin introducir capas
genericas nuevas.

## Guardrails

- Cada split debe extraer una responsabilidad local y nombrable.
- No se cambian contratos publicos, rutas, schemas ni migraciones.
- Los ratchets solo bajan despues de medir lineas reales.
- Los tests nuevos cubren helpers puros cuando el split mueve logica.
- La validacion final incluye `check:structure-ratchets`,
  `check:architecture`, `typecheck`, `build` y `npm test`.

## Bloques

1. PDF Studio workspace: sacar helpers visuales/modelo de
   `WorkspaceTemplateCard`.
2. PDF Studio planillas: extraer helpers de seleccion/nombre desde
   `usePdfTextEditorForms`.
3. PDF Studio shell: adelgazar `PdfStudioView` moviendo ensamblaje de UI a un
   componente local.
4. Notas Feed: sacar seleccion/ventana virtual a hooks enfocados si reducen
   complejidad real.
5. Command Palette/Search: reducir superficie del componente sin tocar
   comportamiento de teclado/foco.
6. LLM dispatch: mover la construccion de cadena de providers a un modulo puro.
7. Ratchets: bajar limites de los archivos efectivamente reducidos y correr
   gates completos.

## Criterio de cierre

El PR queda listo cuando el diff muestra menos presion en hotspots, las nuevas
fronteras tienen nombres obvios, y los gates pasan sin ampliar allowlists.
