# «#» vuelve a encontrar vistas por su alias, y preguntar respeta el PIN de Notas

## Problema

Antes de llevar el buscador ⌘K al mundo Notas, la medición previa destapó tres
fallos que ya están en producción. Ninguno depende de montar el buscador en los
dos mundos, así que van en un PR propio contra `main`, antes que ese.

## Lo que ya estaba roto (medido antes de tocar nada)

Con e2e temporales, en demo, sobre `main` en `36b3f8ce`:

1. **«#mapa» ya no encontraba Grafo.** Con el alias «mapa» puesto a Grafo,
   «mapa» lo encontraba y «#mapa» respondía «solo secciones de Notas · nada
   coincide». Lo rompió #457: `#` pasó a significar solo las secciones de Notas
   y los alias de las vistas quedaron fuera.
2. **Preguntar enseñaba notas protegidas con PIN.** Con `notas:notas`
   protegida, la sección Notas pedía el PIN, pero «?comprar pan» en la paleta
   de Trama enseñaba la nota. El diálogo «Buscar en Notas» también la enseña.
3. **Con el buscador de Notas abierto, la «n» del feed se llevaba el foco.** Con
   el foco en «hecha», dentro del diálogo modal, «n» lo sacaba al compositor.

La primera medición del PIN salió inválida y se rehízo: un almacén de demo
parcial vacía las tablas, y la clave del PIN en Notas es `notas:<sección>`, no
la sección sola.

## Cambios

- **`#` busca vistas y secciones** (`commandSearchModel.ts`). El alcance
  `secciones` suma el grupo `view` después de las secciones de Notas: «#pass»
  sigue abriendo Claves primero y «#mapa» encuentra Grafo. El encabezado pasa a
  «solo secciones» y el modal de atajos lo explica.
- **PIN fuera de la sección** (`useSectionPin.ts`). `isContentHidden(id)`
  esconde el contenido de una sección protegida y también esconde mientras las
  preferencias sean las del espejo local (`isPlaceholderData`), que puede estar
  viejo. `isPinRequired` no cambia: es la de `SectionPinGate`.
- **Preguntar y las consultas guardadas** (`useCommandPaletteQueries.ts`)
  quitan los hits de nota con `withoutHiddenNoteHits` cuando `notas:notas` está
  protegida.
- **Feed de Notas** (`useFeedKeyboardNav.ts`): una tecla que nace dentro de
  `[aria-modal="true"]` es del diálogo.
- **Documentación:** `search-command-palette.md` con el nuevo `#`, la regla del
  PIN y la guarda del feed.

## Decisiones

- **Con `#`, primero las secciones de Notas.** El sigilo nació para revelarlas
  (`#pass`); así no cambia nada de lo que ya funcionaba y las vistas vuelven.
- **Esconder de más, solo fuera de la sección.** En el arranque, el buscador
  prefiere no enseñar una nota a enseñarla con preferencias viejas.
  `SectionPinGate` no cambia en este PR.
- **Filtrar en el cliente.** El PIN es una preferencia de interfaz («que quien
  toma el teléfono no vea el contenido»), no un permiso del backend.
- **E2E con el backend simulado para el alias y el PIN.** Controla exactamente
  qué responde `/api/user-prefs` y `/api/query/nl`, y cada test lleva su
  control (la entidad sí se ve; sin PIN, la nota sí se ve), así que un verde no
  puede venir de una respuesta vacía.
- **La guarda del feed se prueba con localizadores de rol.** El diálogo de Notas
  cambia de nombre cuando ese mundo use el buscador de Trama, y el e2e tiene que
  seguir valiendo.

## Validación

- **Mutaciones: 12 sondas.** Las 11 que deben caer caen, cada una en el test
  pensado para ella, y el control (un filtro equivalente) sobrevive. Tres son
  de e2e: sin las vistas en `#`, sin el filtro de notas y sin la guarda del
  feed, cae el e2e correspondiente.
- **E2E nuevos:** `omnibox-preferencias.spec.ts` (tres casos, con el backend
  simulado) y `buscador-notas.spec.ts` (en demo). Siguen verdes
  `omnibox-teclado.spec.ts`, `sidebar-search.spec.ts` y el axe de la paleta,
  corridos solos.
- Suite completa (5 610 tests en 815 archivos), `typecheck`, `lint`,
  `format:check` y los 40 `check:*` que corren sin Postgres, en verde; los 5
  que lo piden quedan para el CI.
- Build, presupuesto de bundle (la paleta pasa de 8 135 a 8 179 B gzip, dentro
  de sus 8 KB), grafo de chunks sin ciclos, carga perezosa de PDF y humo del
  bundle de producción, en verde.

## Pendiente

- «Buscar en Notas» sigue siendo otro diálogo: no respeta el PIN, no tiene
  teclado ni ⌘K, y no encuentra «edición» si se escribe «edicion». Es el PR
  siguiente, el buscador único de los dos mundos.
- El PIN de las vistas de Trama no esconde entidades, citas, momentos ni chat
  en la paleta: solo las notas, y solo al preguntar.
- `SectionPinGate` no espera las preferencias del servidor, e Inicio de Notas
  enseña notas sin mirar `notas:notas` (leído en `NotasHomeView.tsx`, sin medir).
- El listener de teclado de Imprenta ignora los campos de texto pero no los
  diálogos: con el foco en un botón del buscador, Backspace podría borrar las
  páginas seleccionadas. Hipótesis sin medir.
