# Estado del libro

Al 16 de octubre de 2026. Para retomar el trabajo sin la conversación en que se hizo: qué hay, qué funciona, qué
espera al autor y qué quedó decidido. Las reglas para trabajar están en `AGENTS.md`. Actualiza este archivo cuando
cambie el estado o se tome una decisión.

## Qué hay

- **El libro**: fuentes en `fuentes/0*.md`; entregables en la raíz: PDF de 166 páginas (162 de cuerpo), DOCX y EPUB
  (44 capítulos). 15 figuras, 160 referencias, 18 capítulos, 18 talleres, TOC de 40 entradas; 57.927 palabras en las
  fuentes (54.410 sin las referencias). Cifras de la construcción y de las fuentes del 16 de octubre.
- **Dónde vive hoy**: `libro/` de `DanielOpazoD/trama`, rama `claude/medical-thinking-book-review-nlnth9`, PR #465
  abierto. El `main` de trama nunca tuvo `libro/`.
- **Decisión tomada: el libro se muda a un repo propio, privado** (`DanielOpazoD/hechos-inferencias-incertidumbre`
  propuesto). La sesión no pudo crearlo (GitHub respondió 403 a la integración); falta que el autor lo cree vacío y lo
  dé acceso a Claude. Después: importar `libro/` como raíz del repo nuevo en un commit que diga de qué commit de trama
  viene, cerrar el PR #465 sin fusionar y dejar la rama de trama como archivo (los hashes del registro del README
  apuntan ahí).

## Qué funciona

- **Construcción**: `./construir.sh` reproduce los entregables versionados (mismo texto del PDF, `toc.json` idéntico,
  el EPUB con los mismos archivos), con el TOC estable entre pasadas. `fuentes/comprobar.py` da 0 problemas y
  `fuentes/cotejo_figuras.py`, cero derivas.
- **Edición**: las recomendaciones A–G (`gestiones/recomendaciones_finales_2026-10-14.md`) están ejecutadas, y también
  las pasadas de coherencia (registro en `README.md`, puntos 25–42).
- **Lector de anotaciones**: el repo `DanielOpazoD/lector-anotaciones` está en la 0.6.1 (`main` en 1df5ff8), con la CI
  verde, 151 pruebas de navegador y cobertura de 97 % en Python, 71 % en el núcleo y 92,9 % en la página. Los 52
  mutantes de `herramientas/mutar.py` hacen lo que esperan. `lector/index.html` es su `web/index.html` del commit
  7b079b7 (fijado en `requirements.txt`). `lector/libro.json` (42 secciones, 1063 bloques) está al día con las fuentes;
  reconstruirlo con la 0.6.1 da los mismos bloques y huellas, y sólo reinicia las marcas de «qué cambió» (hoy, 4
  bloques).
- **Página publicada**: https://claude.ai/artifact/RgYKd217CYUELt9Ur56Jgv, versión 27. Su base tiene una sola anotación
  (Prefacio), resuelta y respondida: no hay anotaciones del autor esperando.

## Pendiente del autor

- Validar o reemplazar los pasajes en primera persona, que hoy son composiciones docentes: Prefacio, cap. 5 (el cólico
  renal que era un aneurisma), cap. 7 (la «ITU» que era colecistitis) y cap. 14 (el primer «no lo sé»). Revisar el
  nombre «Carmen» y los detalles del caso longitudinal.
- Final de la viñeta 6, viñetas 7 y 8, pasajes 38 y 39; los ítems 23, 29, 31, 47 y 52–57 de las recomendaciones.
- Piloto del método, revisión externa, permisos, ortotipografía, prueba del EPUB en Kindle Previewer y la carta de
  prólogo, que está como borrador en el Gmail del autor (`gestiones/prologo_*`).
- Decisiones de entorno abiertas: crear el repo del libro (arriba); una CI para él que corra `fuentes/comprobar.py` y
  `fuentes/cotejo_figuras.py`; etiquetas de versión en `lector-anotaciones` (hoy se fija por commit) y borrar sus ramas
  `v0.5` y `v0.6`; un hook de inicio de sesión que deje la firma de git configurada.

## Decisiones tomadas

- Las citas de Parra no se tocan. Terminología hospitalaria chilena y términos canónicos
  (`gestiones/terminos_canonicos.md`). Toda referencia se verifica antes de citarse (`fuentes/auditoria_evidencia.md`).
- No hay techo de páginas (punto 37); las citas parentéticas no pasan a narrativa (punto 40).
- El lector es un repo aparte y genérico; este libro sólo copia su página y fija su versión. En el lector: sin framework
  ni empaquetador, sin unificar el código repetido entre Python y JS; se aceptan dos límites conocidos (un documento
  armado a propósito para romper la página; `mypy` no ve una clave mal escrita del JSON). Que la página tenga un índice
  plegable se publicó como 0.6.1, aunque por SemVer, como función nueva, habría sido 0.7.0.
- La evaluación vigente es `gestiones/evaluacion_multiparametrica_2026-10-14.md` (nota 6,4);
  `evaluacion_multiparametrica_2026-10.md` es la anterior.

## Para retomar

1. Abrir la sesión con el repo del libro (mientras no exista, con trama y la rama de arriba) y leer `AGENTS.md`.
2. `npm install && pip install -r requirements.txt && ./construir.sh`: si termina con 0 problemas, el entorno está bien.
3. Antes de editar, leer las anotaciones nuevas de la página (colección `anotaciones`) y lo pendiente del autor.
4. Un cambio en el lector se hace en su repo; aquí se copia su `web/index.html`, se fija su commit en
   `requirements.txt` y se republica la página.
