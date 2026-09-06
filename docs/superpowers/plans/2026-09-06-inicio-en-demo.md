# Inicio en modo prueba mostraba un error

## Problema

Al abrir la demo en el mundo Trama, Inicio mostraba «No se pudo cargar tu
portada» con un botón «Reintentar» que no arreglaba nada. El router de demo
no tenía ruta para `/api/home`; una lectura desconocida devuelve `[]`, y
`homeApi.readHome` hace `res.entities.map` sobre eso. La portada es la
primera pantalla que ve cualquiera que prueba Trama, y ningún test la miraba
en demo: la e2e de Inicio usa el backend simulado, y las de demo abrían
Configuración, Momentos o Notas.

Se encontró de paso, en una captura de Playwright para verificar otra cosa
(los diálogos de Citas migrados a `ModalShell`).

## Cambios

- **Ruta `home` en `demoRouter`**: misma forma que `netlify/functions/home.mts`
  (tres listas acotadas a 80, ordenadas como allá; `counts` con los totales
  vivos).
- **Test de contrato** en `demo.test.ts`, igual que el que fijó `/api/x/status`
  tras el mismo tipo de caída: falla sin la ruta (verificado antes de
  escribirla) y fija la forma que `homeApi` espera.
- **E2E `inicio-demo.spec.ts`**: Inicio en demo (mundo Trama) muestra la cita
  del día y no el estado de error.

## Decisiones

- **No se blinda `homeApi` contra `[]`.** El contrato es del backend, y la
  demo es un backend más: debe cumplirlo. Poner defensas en el cliente
  taparía el próximo agujero del router.
- **El registro dice por qué la e2e existe.** Es la tercera caída de la demo
  por una ruta sin forma (`health.auth`, `x/status.counts`, ahora `home`). El
  patrón es el mismo: el router devuelve `unknown` y nada lo compara con el
  tipo del cliente. Queda anotado abajo como pendiente de fondo.

## Validación

- `demo.test.ts` en verde con el test nuevo (y en rojo sin la ruta).
- `inicio-demo.spec.ts` en verde contra el dev server.
- `typecheck`, `lint`, `format:check` y los gates del job `lint`.

## Pendiente

- [alto] Un gate que compare las respuestas del router de demo con los tipos
  del cliente (`HomeResponse`, `HealthResponse`, `XStatus`…): tres caídas de
  la demo salieron del mismo agujero. Podría ser un test que recorra las rutas
  GET conocidas de `api/*.ts` y verifique que `routeDemoRequest` no devuelve
  la lista vacía por defecto.
