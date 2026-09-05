# Los pendientes en un solo lugar

## Problema

Cada pack termina con una nota en `docs/superpowers/plans/` y la nota cierra
con «## Pendiente»: la deuda que el autor conocía y decidió no pagar en ese
PR. Es la lista más honesta de trabajo abierto que tiene el repo. Y estaba
repartida en quince archivos que nadie vuelve a abrir: cero issues la
recogían, y cada evaluación la redescubría a mano con `grep`.

## Cambios

- **`scripts/pendientes.mjs`** lee la sección «## Pendiente» de cada plan
  (ítems con sus líneas de continuación, hasta la siguiente cabecera) y
  escribe **`docs/pendientes.md`**: del plan más reciente al más viejo, con
  enlace a cada nota y el total arriba. Un ítem que el autor marcó como
  resuelto, cerrado o hecho se omite.
- **`npm run pendientes`** regenera; **`npm run check:pendientes`** falla si
  el archivo no coincide con lo que dicen los planes. El gate entra al job
  `lint` y al registro `QUALITY_GATES`.

## Decisiones

- **Generado, no editado.** La fuente de verdad sigue siendo cada plan; el
  registro es una vista. Cerrar un pendiente es editar la nota de origen y
  regenerar, así el plan y el registro no pueden contarse historias distintas.
- **Sin issues de GitHub.** Abrir un issue por pendiente habría duplicado la
  fuente y pedido mantenimiento en dos sitios. Si algún pendiente merece
  seguimiento propio, ese issue puede enlazar al registro.
- **La raíz es el cwd**, como en el resto de scripts: `run-vitest` copia el
  repo a un directorio temporal y ahí `import.meta.url` no es una URL de
  archivo. Primera versión lo hacía y el test decía «no tests».

## Validación

- 5 tests del parser y del render, más uno que lee los planes reales y
  comprueba orden y que ningún plan sin ítems aparezca.
- `docs/pendientes.md` generado: **20 pendientes en 13 planes**. Menos de los
  46 que estimé al evaluar, porque aquel conteo sumaba líneas de
  continuación; el registro cuenta ítems.
- `check:pendientes`, `check:script-registry`, `check:docs-drift`,
  `check:knip` y `format:check` en verde.

## Pendiente

- El registro no distingue urgencias: cada pendiente pesa lo mismo. Si crece,
  una marca en el plan («[alto]») que el script respete sería suficiente.
