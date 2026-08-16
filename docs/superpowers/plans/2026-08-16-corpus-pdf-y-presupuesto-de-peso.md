# El peso de exportar deja de ser una sorpresa

## Problema

`docs/pdf-studio.md` declaraba el hueco por escrito: «falta una carpeta curada
de PDFs grandes de usuario para pruebas de memoria extrema». El defecto de las
16 hojas que pesaban 1,8 GB (#404) vivió exactamente ahí y llegó a producción
con 5.354 pruebas en verde, porque **todas operan a escala de demostración**.

Arreglar el defecto no cierra el hueco: nada impide que el próximo cambio en el
ensamblado vuelva a arrastrar el libro entero.

## Piezas

### El corpus (`src/test/factories/pathologicalPdfs.ts`)

Los libros de un usuario no se pueden versionar —pesan, y son suyos—, así que se
reproduce su **forma**: lo que rompe no es el contenido, es cómo el productor
organizó los recursos. Cuatro formas:

| forma                        | qué reproduce                                          |
| ---------------------------- | ------------------------------------------------------ |
| recursos heredados del árbol | el caso del 1,8 GB: `/Resources` colgado del nodo raíz |
| fuente pesada compartida     | lo que la poda no puede quitar y sólo el lote resuelve |
| formularios anidados         | cadena de 6, listada al revés en el diccionario        |
| escaneado                    | **control**: la forma sana, sin nada compartido        |

Cada forma declara `bytesPerPage` (lo propio de una página) y `sharedBytes` (lo
que comparten de verdad y viaja una vez). Sin esos dos números el presupuesto
sería un umbral inventado.

### El presupuesto (`assembleWeightBudget.test.ts`)

Fija una **razón**, no un número:

> Exportar N páginas cuesta lo que pesan N páginas, y no depende de cuántas
> tenga el libro del que salen.

Son dos afirmaciones y hacen falta las dos, porque atrapan defectos distintos:

- **«no depende del tamaño del libro»** atrapa la poda rota. Se exportan las
  mismas 8 páginas de un libro de 40 y de uno de 320, y la deriva entre ambos
  pesos tiene que ser menor al 15%.
- **«cuesta lo que pesan N páginas»** atrapa el `copyPages` por página. Esa
  duplicación escala con lo SELECCIONADO, no con el libro, así que la primera
  afirmación no la ve.

## Hallazgos de revisión (Greptile, ambos corregidos)

1. **Un techo se satisface también borrando de más.** El presupuesto sólo ponía
   cota superior, así que una poda que se pasara dejaría páginas vacías, un
   archivo MÁS chico y el gate en verde. Ahora cada forma declara
   `expectedResources(pagina)` y la exportación se abre para comprobar que cada
   página conserva lo suyo. Un peso por debajo de lo esperado no es una mejora:
   es contenido perdido.
2. **La envolvente de 15 s era decorativa.** El timeout de vitest son 5 s por
   defecto, así que una exportación de 8 s moría por timeout en vez de fallar
   diciendo cuánto tardó. El test declara ahora su propio timeout por encima de
   la envolvente que afirma.

## Decisiones

- **Una razón y no un número absoluto.** Un umbral holgado lo pasaba el mismo
  defecto con un libro chico. Medir la relación entre dos tamaños de fuente es
  lo que convierte «pesa mucho» en «escala con lo que no elegí».
- **El escaneado está en el corpus aunque no sea patológico.** Es el control: si
  esa forma engorda, el problema no está en la poda y el fallo lo dice.
- **Las fábricas tienen su propio test.** Una fixture rota no da error, da un
  verde por la razón equivocada: un libro que saliera con cero páginas haría
  pasar cualquier presupuesto. Se comprueba que carga, que tiene las páginas
  pedidas, que los bytes pesados están, y que las páginas heredadas de verdad no
  tienen `/Resources` propio.
- **pdf-lib entra por `loadPdfLib`, no por import estático.** El gate
  `check:pdf-runtime-boundaries` lo pidió y tiene razón: la frontera vale
  también para las fábricas de prueba.
- **Sin afirmación de memoria.** Se acota el tiempo de exportar 16 de 600
  páginas; la memoria pico depende del GC y saldría inestable en CI. Queda
  declarado como límite en vez de fingir que se mide.

## Validación

- Suite completa: **5370 tests** en verde (788 archivos). El presupuesto entero
  corre en ~2,5 s: es un gate, no un benchmark que nadie va a esperar.
- `typecheck`, `lint`, `format:check` y los gates de estructura, knip,
  fronteras, docs y arquitectura en verde.

**Verificado por mutación** — el gate atrapa los dos defectos originales, y cada
uno por el caso que le corresponde:

- Poda apagada → fallan 5 pruebas; la deriva salta a **6,9×** (87 KB contra
  692 KB) en las formas con recursos heredados. El escaneado y la fuente
  compartida siguen verdes, que es lo correcto.
- Lote apagado → falla la fuente compartida: **805 KB contra un techo de
  155 KB**, la fuente embebida 8 veces en vez de una.
- Poda que NO sigue la cadena de formularios (borra de más) → la hoja exportada
  queda con `['X1', 'F0']` en vez de la cadena entera. Antes de las aserciones
  de contenido, esa mutación producía un archivo más chico y pasaba.

## Pendiente

- La envolvente de memoria sigue sin medirse (ver decisiones).
- El corpus reproduce formas, no archivos reales. Si aparece un libro que rompe
  de otra manera, la forma nueva se agrega acá y el presupuesto la cubre sola.
