# WhatsApp: el álbum partido se junta solo

## El pedido, contra el mapa real

«Si se envían muchas imágenes juntas por WhatsApp, que puedan juntarse todas
en una entrada de Notas o Momentos.» El mapeo mostró que el mecanismo ya
existía entero:

- Varias imágenes en UN mensaje → ya se agrupan (recorte-evento con
  `recorte_images`, o episodio de Momentos con `payload.items[]`).
- Álbum partido en mensajes (el caso real: un webhook por foto, solo el
  primero con caption) → la maquinaria de anexado (`album.ts`, con sus 4 ramas
  cross-store y rollback) existía pero estaba **apagada por política**: exigía
  la palabra `juntar` por foto, y un interceptor de «media pendiente» atrapaba
  antes a las fotos sin caption para preguntar destino una por una.

El trabajo fue de política, no de maquinaria (~15 líneas de pipeline).

## La política nueva

**Auto-continuación**: una foto **sin caption** que llega dentro de la ventana
de álbum (20 s deslizante) tras una captura de media del mismo número se anexa
sola — esa combinación (mismo remitente, segundos, sin caption) es la firma
inequívoca del álbum que WhatsApp/Twilio partió. Con caption, la intención es
propia → captura nueva, como siempre.

Mitigaciones para los riesgos que el propio repo había documentado al apagar
el auto-anexado («uniones accidentales»):

- **Escapes intactos**: `nuevo`, `no juntar`, `separado`, `otra escena`,
  cualquier caption, o `Fecha:` → captura aparte.
- **Tope `MAX_ALBUM_PHOTOS` (30)**: la ventana deslizante sin tope fusionaría
  un goteo de fotos sin fin; al llegar al tope se deja de extender y el
  siguiente lote arranca captura nueva por el flujo de pendientes.
- **Sin captura reciente** → pendiente + pregunta, exactamente como antes.
- **`deshacer` tras anexar borra el álbum entero** (la fila fusionada): era
  así también con `juntar` explícito; ahora está documentado en el contrato.

Una simplificación que salió de la mutación: la guardia «no preguntar
pendientes si el álbum consumió las fotos» era redundante — `appendSplitAlbum`
vacía las keys al confirmar y el prompt exige keys no vacías. Se quitó la
guardia muerta en vez de defenderla con un test.

## Validación

- Suite completa: **5305 tests / 779 archivos** en verde; lint, format y 7
  gates de backend OK. Sin build de cliente: no se tocó ni un archivo de `src/`
  (el cambio vive en el webhook).
- Los dos tests de «pendientes» existentes pasaban tras el cambio **con las
  secuencias mock desalineadas** (el harness tolera pushes de menos): se
  realinearon para que documenten el flujo real, además de los tests nuevos
  (auto-anexado sin caption; tope alcanzado → la ventana no se extiende, con su
  par diferencial bajo el tope).
- **Mutación** (5 sondas): apagar la auto-continuación cae; permitirla CON
  caption cae; quitar el tope cae; la guardia redundante quedó eliminada tras
  no caer; el control (tope 30→29) queda verde.
- `docs/whatsapp.md` actualizado (contrato de álbum partido) — `check:docs-drift`
  en verde.

## Límites declarados

- Sin verificación de navegador ni de Twilio real: el webhook no es ejercitable
  en local (firma + media de Twilio). La verificación es de tests + contrato.
- El integration test de Postgres sigue sin cubrir episodio/evento/append (ya
  era así); el CTE de `appendImagesToRecorteEvent` se ejercita mockeado.
- Riesgo pre-existente anotado como tarea aparte: el claim de idempotencia
  corre antes del trabajo pesado; un timeout con álbum grande + reintento de
  Twilio puede perder fotos en silencio.
