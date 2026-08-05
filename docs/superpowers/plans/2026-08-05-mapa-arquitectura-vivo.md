# El mapa de arquitectura, y el gate que lo mantiene honesto

## Problema

`ARCHITECTURE.md` se abre diciendo «documento vivo». Medido contra el repo de
hoy: nombra seis vistas y un solo mundo, y no menciona **ni una vez** Imprenta,
Biblioteca, WhatsApp, R2, Clerk, recortes, Blobs, embeddings ni el concepto de
«mundo». Describe con precisión un sistema que dejó de existir hace tiempo.

Nada lo detectó porque **la prosa no se verifica**. Es la misma familia del
incidente del deploy: todo en verde mientras la realidad se iba a otro lado.

## Diseño

**Dos artefactos, un solo grafo.** `docs/arquitectura/mapa.json` es la fuente
(`{meta, nodes, edges, flows}`); `mapa.html` lleva ese grafo embebido entre
marcadores para abrirse con doble clic, sin servidor ni CDN. `npm run
architecture-map:build` reinyecta el JSON en el HTML y refresca los contadores
de portada — las dos copias no pueden separarse a mano.

**El gate (`scripts/architecture-map.mjs`) es lo que lo vuelve vivo.** No basta
con dibujar bonito: el mapa cita **196 rutas reales**, así que puede
verificarse. En el job `lint` de cada PR comprueba que:

1. cada archivo citado por un nodo o por un paso de flujo **existe** — si un PR
   renombra uno, el mapa pasa a mentir y se entera ese PR, no el lector de
   dentro de seis meses;
2. el grafo tiene integridad: ids únicos, capas declaradas, sin aristas ni pasos
   colgando, sin nodos sueltos;
3. ninguna caja se dibuja encima de otra (el diagrama sigue legible);
4. el HTML no quedó con una copia vieja del JSON;
5. los contadores de portada no son de otra era (banda de ±15 %: un endpoint
   nuevo no rompe el CI de quien lo agrega, pero «103 cuando hay 140» sí).

**El mapa se incluye a sí mismo** como nodo `mapa-vivo` en la capa de entrega,
citando su propio gate: quien lo mire ve que está vigilado.

## Validación

- 16 tests del gate; **mutación**: no mirar si el archivo existe cae, dar la
  sincronía HTML por buena cae, no detectar cajas solapadas cae, y el control
  (tolerancia 0,15 → 0,16) queda verde.
- **Mutación sobre los artefactos reales**, no solo sobre fixtures: ensuciar una
  cita en el JSON y desincronizar el HTML hacen fallar el CLI de verdad.
- Suite completa (5.338), lint, format, knip, registry, docs-drift.
- Navegador: 73 nodos, 142 aristas, resaltado de ruta con animación viva tras
  reconstruir el HTML desde los marcadores.

### Límites declarados

- **El gate verifica que el mapa apunte a cosas que existen, no que lo que dice
  de ellas sea cierto.** Una descripción que envejece sin que su archivo cambie
  pasa igual. La verificación semántica por agentes que lancé para este pack
  murió por límite de sesión, así que las descripciones tienen la revisión
  humana de su autor y nada más.
- La tolerancia del ±15 % deja envejecer los contadores dentro de la banda.
- `ARCHITECTURE.md` **no se reescribió**: se le puso un aviso honesto y el
  enlace al mapa. Ponerlo al día es su propio pack.
