# Configuración deja de ser inalcanzable en modo prueba

## Problema

Abrir Configuración en modo demo **tumbaba la aplicación entera** al
ErrorBoundary raíz. Y antes de eso, en escritorio, ni siquiera se podía abrir.

**1. El crash.** La respuesta de salud del router de demo no traía `auth` ni
`operational`. El panel los desreferencia en **once sitios** y «Estado» es la
sección por defecto, que carga sola: el crash era inmediato.

Nada avisaba, por tres capas de silencio a la vez:

- El router de demo devuelve `unknown`, así que el tipo declarado —donde ambos
  campos son **obligatorios**— nunca llegaba a comprobarse.
- `HealthPanel.test.tsx` estaba en verde porque sus fixtures **sí** traen
  `auth`: los tests describían un shape que la app no siempre produce.
- Ningún e2e abría Configuración en demo. `settings-data.spec.ts` usa
  `mockBackend`, que devuelve otra cosa.

**2. No se llegaba.** El control de modo prueba vivía en `left-3 bottom-3`,
exactamente encima del botón de Configuración de la barra lateral (pill en
(12, 860), botón en (4–36, 868–900)). Medido: el botón **no recibía su propio
clic**. En el barrido visual del PR anterior lo di por «chrome del arnés»; no lo
era — el modo demo es la vía por la que alguien prueba Trama.

**3. La navegación de Configuración escondía el 69% de sus secciones** en móvil,
sin ninguna señal. Es el mismo defecto que la barra de Notas en el PR #365, y no
se pudo medir entonces porque esta pantalla no abría.

## Cambios

- **`demoRouter`** — la salud pasa a `demoHealth(store): HealthResponse`, con el
  tipo anotado.
- **`AuthGate`** — el control minimizado se va al hueco libre del pie de la
  barra lateral.
- **`SettingsNav`** — reutiliza el carril con desvanecido del PR #365.
- **`e2e/settings-demo.spec.ts`** — el hueco que dejó pasar todo esto.

## Decisiones

**La respuesta de demo va tipada, no sólo completada.** Rellenar los campos
arregla hoy; anotar el tipo impide que vuelva a pasar. Verificado: quitando
`auth` otra vez, `npm run typecheck` responde
`error TS2741: Property 'auth' is missing in type ... but required in
'HealthResponse'`. Rompe donde debe —al compilar— y no en la cara de quien está
probando Trama.

**El pill no cabe en ninguna esquina, y eso hubo que medirlo.** Primero lo mandé
a la derecha; el gate anti-oclusión —el de este mismo repo— lo cazó tapando el
contador «115» del Grafo. Luego resultó que arriba del pie está la navegación y
el área principal del Grafo es lienzo de punta a punta: **no hay hueco libre en
escritorio**. La geometría exacta del pie dio la respuesta: en la fila inferior
el botón ocupa x 4–36 y el texto de versión x 151–235, así que el tramo
**x 40–150 está libre**. Ahí va.

**Sólo se reubica el minimizado.** El expandido dura seis segundos y luego se
minimiza solo; conserva su sitio, que ya pasaba los gates. El que se queda es el
que tenía que moverse.

**Las doce secciones, no sólo la que falló.** Un hueco en la respuesta de demo
no degrada una pantalla: se lleva la aplicación. Conviene saberlo de todas.

## Validación

Cada arreglo verificado **en rojo** por mutación:

| mutación                                | qué falla                                   |
| --------------------------------------- | ------------------------------------------- |
| quitar `auth` de la respuesta de salud  | «ninguna sección se cae» + **no compila**   |
| el pill vuelve a `left-3` en escritorio | los cinco (Configuración no se puede abrir) |
| quitar el carril de la navegación       | «no esconde secciones sin avisar»           |

La segunda es la más elocuente: al volver a poner el pill donde estaba, **los
cinco tests caen** — porque sin poder abrir Configuración no hay nada que
probar. Es la medida exacta de lo bloqueante que era.

### El ciclo que abrió el arreglo

Tipar la respuesta significaba que `demoRouter` importara `HealthResponse` de
`src/api/health`, y eso cerraba un ciclo: `api/health` → `api/request` →
`lib/demo` → `demoRouter`. El gate de arquitectura lo rechazó **en CI, no en
local** — yo había corrido doce gates y el job `lint` corre los **37**.

Los tipos se mudaron a `src/types/health.ts`, un módulo hoja, y `api/health` los
reexporta para quien ya los importaba de ahí. Es la corrección de fondo: un
módulo de tipos no debe arrastrar la capa de red detrás.

### Lo que encontró mi propio gate

Mover el pill a la derecha hizo caer el gate anti-oclusión en dos viewports, por
tapar un contador del Grafo. Lo escribí yo hace cinco PRs y me cazó a mí. Es la
segunda vez en esta serie que una herramienta propia corrige una suposición mía
sobre dónde hay espacio libre.

### Resto

Suite completa (5087 tests), `typecheck`, `lint`, `format:check`, doce gates,
`build`, budget de bundle y 24 e2e con a11y, el gate anti-oclusión completo y
los datos de Configuración. Los **37** gates del job `lint` corridos en local;
los cuatro que piden Postgres quedan al job `migrations`, que es donde corren.

## Lo que queda abierto

**El router de demo devuelve `unknown` en todos sus casos.** Aquí se tipó el de
salud porque es el que reventaba, pero la misma clase de hueco puede existir en
cualquier otra respuesta y no lo vería nadie hasta que alguien abra esa
pantalla. Tiparlos todos es un pack aparte, mecánico y de bastante superficie.
