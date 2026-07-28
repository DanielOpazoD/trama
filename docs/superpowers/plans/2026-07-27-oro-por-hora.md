# El oro que respira con la hora — y que ganaba a los tres temas

## Problema

`useTimeOfDayAccent` (δ6) hace que el acento dorado cambie con la hora local:
cobre por la mañana, oro al mediodía, ámbar al atardecer, lavanda de noche. La
idea es de las buenas de este proyecto — la app se siente distinta según cuándo
la abres.

La implementación escribía el hex **en el style inline del `<html>`**:

```ts
document.documentElement.style.setProperty('--accent-gold', '#a86f3c')
```

Un inline le gana a `:root`, a `html.dark` y a `html.dark.theme-vela`. Así que
los cuatro colores —afinados los cuatro para papel blanco— se aplicaban también
sobre el papel casi negro de noche (`#09090b`) y sobre el café profundo de vela
(`#1A140E`), pisando los oros que cada tema tenía calculados.

Contraste medido sobre `.section-eyebrow-serif` (12px):

| tema  | oro propio del tema | mañana | mediodía | atardecer | noche |
| ----- | ------------------- | ------ | -------- | --------- | ----- |
| día   | 4.02                | 4.20   | 4.02     | 5.42      | 4.82  |
| noche | **8.71**            | 4.74   | 4.95     | 3.67      | 4.13  |
| vela  | **9.74**            | 4.35   | 4.55     | **3.37**  | 3.79  |

Vela caía de 9.74:1 a **3.37:1** — bajo el mínimo AA de 4.5:1 para ese tamaño —
y en día mañana y mediodía ya estaban en 4.20 y 4.02, también por debajo. Peor:
**el valor depende de la hora a la que mires**, así que una revisión visual o
una pasada de axe podían dar verde a las 15:00 y estar rojas a las 19:00.

Además rompía la convención del propio repo, la que dice que los temas viven en
las CSS vars de `:root` / `html.dark` / `html.dark.theme-vela`.

Superficies afectadas: `.section-eyebrow-serif`, `.chip[data-tone='gold']`, los
CTA de IA en `aria-busy`, `PreviewBanner`, y los eyebrow de `ModalShell`,
`QuotesView`, `TwitterView`, `RelationshipsView` y `HomeProjects`.

## El arreglo

La hora mueve el **tono** (el ánimo); el tema decide la **luminosidad** (la
legibilidad sobre su papel). Las dos intenciones dejan de pelearse.

El hook ya no publica un color, publica **cuándo**:

```ts
document.documentElement.dataset.accentHour = pickAccentHour(new Date().getHours())
```

Y la paleta vive en `index.css`, doce valores, junto al resto de tokens de cada
tema. La especificidad ya ordena sola lo que hace falta: `:root[attr]` (0,2,0) <
`html.dark[attr]` (0,2,1) < `html.dark.theme-vela[attr]` (0,3,1).

## Decisiones

**Los tonos son los del diseño original** (deriva medida de 0–1°). Lo único que
cambia por tema es la luminosidad. No era una excusa para redecorar: el ánimo
horario que alguien eligió se conserva entero, sólo se vuelve legible.

**El objetivo de contraste se fijó contra el par difícil, no el fácil.** Los
chips y `PreviewBanner` pintan el oro sobre su propio `--accent-gold-soft`, que
acerca el fondo al texto y baja el contraste unos 0.7 puntos. Una primera
versión de la paleta apuntaba a oro-sobre-papel y dejaba ese par real en 4.58 en
día: cumple, pero con el margen justo. Los valores finales se resolvieron contra
el par compuesto:

|           | día (papel / relleno) | noche       | vela        |
| --------- | --------------------- | ----------- | ----------- |
| mañana    | 5.71 / 5.00           | 7.69 / 6.42 | 8.60 / 6.38 |
| mediodía  | 5.76 / 5.01           | 7.58 / 6.38 | 8.62 / 6.42 |
| atardecer | 5.74 / 4.99           | 7.62 / 6.40 | 8.66 / 6.40 |
| noche     | 5.71 / 5.00           | 7.73 / 6.43 | 8.65 / 6.42 |

**Lo que a propósito NO se tocó.** Al fijar la luminosidad por contraste, mañana
y atardecer quedan más parecidos entre sí que en el original (distancia RGB ~10
frente a ~29): el original los separaba por luminosidad y aquí la luminosidad la
manda el papel. Se dejó así porque los cuatro valores **nunca coexisten en
pantalla** — son horas del día, no muestras de una paleta. Nadie compara la
mañana con el atardecer, así que optimizar esa separación es gastar complejidad
en algo que el usuario no puede percibir.

## El test que había, y por qué era peor que no tener ninguno

`useTimeOfDayAccent.test.tsx` existía y estaba en verde. Afirmaba esto:

```ts
expect(document.documentElement.style.getPropertyValue('--accent-gold')).toBe('#a86f3c')
```

Es decir: **fijaba como contrato exactamente el mecanismo que causaba el bug.**
Cualquiera que arreglase la accesibilidad habría visto el test ponerse rojo y
habría podido concluir que el arreglo estaba mal. Un test así no sólo no protege
—defiende el defecto.

Reescrito, ahora comprueba el negativo de forma explícita («el hook no toca el
style inline») además de la clasificación horaria y la limpieza del intervalo.

## Validación

La paleta se lee **del CSS de verdad**, no de una copia en el test: una tabla
duplicada se quedaría obsoleta en silencio, que es justo la clase de fallo que
esto existe para impedir. Cuatro comprobaciones: contraste sobre papel,
contraste sobre el relleno, ninguna hora sin entrada, ningún acento sin relleno.

Cada una se verificó **en rojo** antes de darla por buena:

| mutación                                 | resultado                                       |
| ---------------------------------------- | ----------------------------------------------- |
| vela/atardecer al oro original `#9a5a2e` | rojo — `3.37:1`, el número exacto del bug       |
| día/mediodía al oro original `#a07900`   | rojo — `4.02` sobre papel, `3.59` sobre relleno |
| borrar la paleta de vela entera          | rojo en tres tests                              |
| quitar un `--accent-gold-soft`           | rojo en dos                                     |
| el hook vuelve a escribir el hex inline  | rojo                                            |

La segunda mutación es la que justifica haber medido el par compuesto: la
comprobación sobre papel decía 4.02 y la del relleno 3.59 — es estrictamente más
estricta.

También se probó una mutación que **no** debía fallar (un valor en 4.58, que
cumple AA): pasó. La sonda mide, no se limita a alarmar.

Medido además en el navegador con `getComputedStyle` sobre los tres temas y las
cuatro horas: las 24 cifras coinciden con la tabla y el style inline queda vacío.

Resto: suite completa (5037 tests), `typecheck`, `lint`, `format:check`, los
gates de frontend (`design-tokens`, `focus-ring`, `icon-button`,
`form-control-labels`, `frontend-boundaries`, `structure-ratchets`,
`modal-overlay`, `knip`, `dead-code`, `script-registry`), `build`, budget de
bundle y el gate anti-oclusión con su calibración.
