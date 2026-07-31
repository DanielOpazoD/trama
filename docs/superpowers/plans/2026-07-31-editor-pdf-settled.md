# El editor de PDF deja de decir «ya está» antes de tiempo

## Cómo apareció

El CI de `main` se puso rojo tras mergear #374 (Tareas). El fallo estaba en
`e2e/pdf-studio-editor.spec.ts` — la miniatura 8 del editor PDF—, y #374 sólo
tocó `TareasView.tsx`, su test y un plan doc. No podía ser suyo, pero tampoco
se descartó por eso: se reprodujo.

En local, sobre `main`: **3 pasadas verdes y una roja**. Con `--repeat-each=4`,
**3 de 4 rojas**, y con valores distintos cada vez —la página centrada salía 7,
o 5, y en un caso la hoja se había movido 830px—. Un test que falla ~25% de las
veces no es ruido: es un gate que enseña a ignorar el rojo.

## El diagnóstico

El test se sincroniza así:

```ts
await expect(scrollArea).toHaveAttribute('data-pdf-editor-positioning', 'settled')
expect(await centeredEditorPageNumber(page)).toBe(8)
```

Una sonda midió qué pasa **después** de ese `settled`, muestreando la página
centrada 30 veces cada 100ms:

```
[8,8,8,8,8,8,8,8,8,8, …]            ← corrida limpia
[8,8,8,8,8,4,8,8,7,7,8,8,8, …]      ← corrida con transitorio
```

La página **acaba** siendo la 8 siempre. Pero hay una ventana, ya con el
atributo en `settled`, en la que las hojas de arriba se inflan, corren el centro
y lo devuelven. El test mide un instante dentro de esa ventana.

La causa está en `usePdfTextEditorPageNavigation`: `isInitialPagePositioning`
—lo que publicaba el atributo— se apaga en `revealInitial()`, que corre **en
cuanto la hoja está puesta y visible**, con `openingRef.current` todavía vivo.
Es decir, el atributo decía «settled» mientras la colocación seguía ocurriendo.

Dos cosas distintas compartían una bandera:

- **visibilidad** — ocultar la hoja hasta la primera colocación real;
- **colocación terminada** — el pin de apertura ya no recentra.

## Lo que cambió

El hook publica `isOpeningPage`, verdadero mientras el pin vive
(`startOpening` → `stopOpening`). `PdfTextEditorScrollArea` recibe las dos
señales por separado: `positioning` sigue gobernando la opacidad —el usuario no
nota ningún cambio— y el atributo `data-pdf-editor-positioning` (y `aria-busy`)
pasan a responder lo que realmente se les pregunta: _¿puedo medir ya?_

**El test no se tocó.** Su aserción visual sigue exigiendo que la hoja no se
mueva más de 2px; lo que cambió es que ahora mide cuando la colocación de
verdad terminó. Relajar el umbral habría sido escribir un test que defiende el
defecto.

## Resultado

|                                   | antes        | después       |
| --------------------------------- | ------------ | ------------- |
| `--repeat-each=4`                 | 3 de 4 rojas | —             |
| `--repeat-each=6`                 | —            | 6 de 6 verdes |
| `--repeat-each=5` (segunda tanda) | —            | 5 de 5 verdes |

## `usePdfTextEditorDialogShell` extraído

El cambio dejó `PdfTextEditor` en **584/582** del ratchet. Extraer, no subir: el
cascarón del diálogo —`dialogRef`, el inspector portaleado, el focus trap y el
calentado de fuentes— es una responsabilidad entera que no sabe nada de
anotaciones ni de páginas. Queda en **572/582**, sin tocar el umbral.

## Validación

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle, los tests del editor (482) y las e2e del editor, a11y e Imprenta.

Nota de proceso: durante esta sesión varias pasadas locales dieron rojos por
carga —suites solapadas compitiendo por la máquina— con ficheros distintos cada
vez. Los resultados de arriba se tomaron con la máquina libre y se repitieron.
