# Reglas para trabajar en el libro

«Hechos, inferencias e incertidumbre» (Daniel Opazo). Este archivo reúne lo que antes sólo estaba en las
conversaciones de trabajo: léelo entero antes de tocar las fuentes, las figuras, el lector o los entregables. El estado
del libro y lo pendiente están en `ESTADO.md`; la estructura de carpetas y la construcción, en `README.md`. Las rutas son
relativas a la raíz del libro.

## Dónde vive

El libro es un proyecto aparte de la app Trama. Mientras esté en `libro/` de `DanielOpazoD/trama` (rama
`claude/medical-thinking-book-review-nlnth9`), lo de la raíz de ese repo es de la app y **no aplica aquí**: su
`AGENTS.md` (borrado lógico, migraciones, TypeScript), las skills `pack-workflow` y `bucle-de-evidencia` (presupuesto de
bundle, vitest, CodeRabbit, plan doc) y su CI, que no revisa nada de `libro/` (un verde de esa CI no dice nada del
libro). La decisión del autor es mudarlo a un repo propio; ver `ESTADO.md`.

## Reglas del autor

- **Las citas de Parra no se tocan** (cap. 18: versos y citas, también al partir frases largas o cambiar comillas; el
  único cambio que tuvieron fue el glifo «»). Antes de cada commit, revisa que el diff no las alcance.
- **Terminología hospitalaria chilena**: entrega de turno, visita de sala, sonda a caída libre, dolor en estudio, ITU
  asociada a CUP, llene capilar, ficha clínica (no «historia clínica»). Los términos canónicos y los conceptos vecinos
  que se mantienen separados están en `gestiones/terminos_canonicos.md`; las variantes retiradas, en `RETIRADAS` de
  `fuentes/cotejo_figuras.py` (el lector las marca en su capa).
- **Verificar antes de citar**: toda referencia nueva se coteja con su fuente (texto completo o fuente primaria) antes
  de entrar; lo que no se pudo verificar se declara en la nota metodológica. Cada verificación queda en
  `fuentes/auditoria_evidencia.md`.
- **Voz**: sin plural autorial («yo» para la experiencia, «este libro» para la tesis); comillas angulares en el cuerpo;
  decimales con coma; las citas parentéticas no se pasan a forma narrativa (README, punto 40).
- **Los pasajes en primera persona son composiciones docentes** hasta que el autor los valide (README, «PENDIENTE DEL
  AUTOR»): no se inventan vivencias ni se presentan como reales.
- **Lo reservado al autor no se ejecuta sin su pedido**: los ítems 23, 29, 31, 47 y 52–57 de
  `gestiones/recomendaciones_finales_2026-10-14.md` y lo que `ESTADO.md` lista como pendiente del autor.
- **Sin techo de páginas**: la extensión se juzga por lo que cada página aporta (punto 37; el techo de 140 páginas de
  los puntos 32 y 36 quedó retirado).

## Reglas de trabajo

- Responder y escribir en español de Chile.
- Un commit por bloque de trabajo, **firmado por el autor**: `git -c user.name="Daniel Opazo" -c user.email=<su correo,
  el de los commits anteriores> commit …`, con las líneas de atribución que indique la sesión. El git de los
  contenedores de Claude firma como «Claude» si no se le pasa la firma (62 de los primeros 107 commits de la rama quedaron así).
- Trabajar sólo en la rama que indique la sesión; no abrir pull requests sin que el autor lo pida.
- Los entregables (DOCX, PDF, EPUB) salen de `./construir.sh` y se versionan; no se editan a mano. `fuentes/toc.json`
  lo reescribe la construcción.
- Medir sobre el artefacto, no sobre el resumen: una cifra o una afirmación sobre el libro («cero comillas rectas»,
  «162 páginas de cuerpo») sale del PDF construido o de un guion, no de memoria.
- Lo que se compruebe más de una vez va a un guion del repo (`fuentes/comprobar.py`, `fuentes/cotejo_figuras.py`), no a
  un comando suelto en la conversación.

## Criterio de «listo»

Un cambio en el libro está listo cuando:

1. `./construir.sh` termina sin error: cotejo de las figuras sin derivas, TOC estable entre las dos pasadas y
   `fuentes/comprobar.py` con 0 problemas (cada referencia citada y cada cita con su referencia, figuras numeradas sin
   saltos, TOC completo, cero comillas rectas en el PDF).
2. Lo tocado se revisó en la página del PDF, no sólo en el Markdown.
3. Si cambió el texto: `python3 lector/construir_lector.py` (desde `lector/`) sin «problema:», y la página del lector
   republicada (receta en `README.md`, sección del lector).
4. Si fue un cambio editorial, tiene su punto en el registro del README; si cambió el estado o una decisión,
   `ESTADO.md` está al día.
5. El diff no toca las citas de Parra ni reintroduce variantes retiradas.

## Entorno

- `npm install` (fija `docx` 9.7.1 para `fuentes/build_docx.cjs`) y `pip install -r requirements.txt` (matplotlib y el
  paquete del lector, fijados).
- LibreOffice (`soffice`), poppler (`pdftotext`, `pdfinfo`) y pandoc. Probado con node 22, Python 3.11, LibreOffice
  24.2, pandoc 3.1 y poppler 24.02.
- `./construir.sh` tarda unos 15 segundos; `./construir.sh --figuras` regenera además `figs/*.png`.

## El lector de anotaciones

- La página publicada es https://claude.ai/artifact/RgYKd217CYUELt9Ur56Jgv (privada; capacidades `db`, `user` y
  `downloads`). Sus archivos son `lector/index.html` (copia exacta de `web/index.html` de `DanielOpazoD/lector-anotaciones`
  en el commit fijado en `requirements.txt`), `lector/libro.json` y `figs/*.png`.
- Las anotaciones del autor están en la colección `anotaciones` de su base. Se leen con la acción «list» de
  `ArtifactData` (con `out_dir`) y se responden con escrituras que fusionan sólo los campos de quien edita
  (`respuesta`, `cierre`, `commit`, `respondido`, `estado`); `lector-anotaciones pendientes` y `responder` lo hacen. El
  protocolo completo está en `docs/FORMATO_ANOTACIONES.md` del repo del lector.
- El código del lector se cambia en su propio repo (`DanielOpazoD/lector-anotaciones`, con su CI, sus pruebas y
  `herramientas/mutar.py`); aquí sólo se copia `web/index.html` de una versión y se fija su commit en
  `requirements.txt`.
