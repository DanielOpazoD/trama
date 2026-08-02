# ADR-0016: Los ficheros grandes llevan un tope que sólo puede bajar

- **Status**: Accepted
- **Date**: 2026-07-31
- **Deciders**: @DanielOpazoD

## Context

Los ficheros de interfaz crecen sin que nadie lo decida. Cada cambio añade
veinte líneas razonables, y un año después hay un componente de novecientas
líneas que nadie quiso escribir. Ninguna revisión individual detecta eso: cada
PR por separado es defendible.

Un límite genérico —«ningún fichero pasa de N líneas»— no sirve en este
repositorio: hay ficheros legítimamente grandes (el router del modo prueba, el
editor de PDF) y otros donde 200 líneas ya son demasiadas. Un número único
obligaría a poner el listón donde no molesta, que es donde no protege.

## Decision

`scripts/structure-ratchets.mjs` fija un **tope por fichero**, no global, con el
valor **medido en el momento de fijarlo**. `npm run check:structure-ratchets`
falla si el fichero lo supera.

La regla que lo hace útil: **cuando un tope estorba, se extrae; no se sube.**
El número no es un objetivo de calidad, es un trinquete: registra dónde estaba
el fichero y no le deja empeorar.

## Consequences

### Positive

- El crecimiento se detecta **cuando ocurre**, no en una auditoría posterior.
- Fuerza extracciones en el momento en que hay contexto para hacerlas bien.
  Ejemplos reales: al añadir una guarda a `TwitterView` el fichero quedó en
  579/575 y salió `XFilterPanels` (los tres paneles a demanda); al tocar
  `MomentosView` quedó en 322/300 y salieron `useAlbumTileSize` y
  `useMomentoSelection` — este último con el efecto que limpia la selección al
  pasar a álbum, que era una unidad real escondida.
- El tope **suele quedar más bajo que antes** del cambio. En los dos casos de
  arriba: 519/575 y 289/300.

### Negative

- **Puede forzar una extracción en mal momento.** Si el tope salta a mitad de un
  cambio urgente, hay que partir el fichero entonces, no cuando convenga.
- **Invita a extracciones de conveniencia**: mover cien líneas a un fichero
  nuevo que no es una responsabilidad, sólo un vertedero con nombre. El gate no
  distingue una cosa de la otra; eso lo tiene que ver quien revisa.
- El valor inicial es **arbitrario**: es el tamaño que tenía el fichero ese día,
  no un juicio sobre cuánto debería medir.

### Neutral

- Cuenta líneas, no complejidad. Un fichero de 200 líneas ilegibles pasa; uno de
  600 líneas claras falla.

## Alternatives considered

- **Un límite global de líneas por fichero.** Habría que ponerlo tan alto que no
  protegería nada, o tan bajo que rompería los ficheros legítimamente grandes.
- **Umbrales de complejidad ciclomática (ESLint).** Miden otra cosa —lo
  enrevesado, no lo acumulado— y son ruidosos en componentes de React, donde
  el JSX infla el número sin que haya complejidad real.
- **Revisión humana sin gate.** Es lo que había, y es exactamente lo que falla:
  cada PR es razonable por separado.
- **Permitir subir el tope con justificación en el PR.** Se descartó porque el
  camino de menor resistencia sería siempre subirlo, y el trinquete dejaría de
  ser un trinquete.

## References

- `scripts/structure-ratchets.mjs`, `scripts/check-structure-ratchets.mjs`
- PR #372 — `XFilterPanels` extraído al saltar el tope de `TwitterView`.
- PR #373 — `useAlbumTileSize` y `useMomentoSelection` extraídos de `MomentosView`.
- PR #375 — `usePdfTextEditorDialogShell` extraído de `PdfTextEditor`.
