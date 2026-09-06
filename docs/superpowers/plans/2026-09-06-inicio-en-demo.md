# Inicio en modo prueba mostraba un error (y el router no sabía qué le faltaba)

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
- **Contrato cliente ↔ router de demo** (`demoRoutes.contract.test.ts`): el
  `default` del router anota cada GET que cae ahí; el test recorre todas las
  rutas `/api/...` que nombran los módulos de `src/api`, las pide con el seed
  cargado y exige que ninguna termine en el default salvo las exentas con
  motivo (URLs de medios que sirve `demoMediaResponse`, rutas solo de
  escritura). Exención obsoleta también falla: es un trinquete.
- **Doce lecturas más que caían al default** ganan caso en el router:
  `counts` y `entities-refs-count` (objetos: reventaban al consumidor),
  `momentos-orphaned-blobs`, `momentos-url-preview`, `saved-queries`,
  `momentos-share-invitations` (objetos con forma), y las listas
  `entity-types`, `relationship-types`, `whatsapp-link`,
  `pdf-studio-templates` (con `/:id/versions`) y `pdf-studio-saved-pdfs`,
  declaradas vacías a propósito.

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
- Contrato: en verde con las exenciones; por mutación, quitar el caso
  `counts` lo hace fallar nombrando `/api/counts`.
- `inicio-demo.spec.ts` en verde contra el dev server.
- `typecheck`, `lint`, `format:check` y los gates del job `lint`.

## Pendiente

- El contrato comprueba que cada ruta GET del cliente tenga caso en el router,
  no que la FORMA coincida con el tipo del cliente (eso solo lo fijan los
  tests puntuales de `demo.test.ts`: health, x/status, home). Comparar formas
  pediría tipos en runtime (zod o similar) en `src/api`; es otro pack.
