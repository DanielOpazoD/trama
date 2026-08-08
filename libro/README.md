# Hechos, inferencias e incertidumbre — edición de trabajo revisada

Manuscrito revisado del libro de Daniel Opazo con las mejoras de prioridad alta del informe editorial aplicadas. Esta carpeta es autocontenida y no toca el código de la app Trama.

## Entregables

- `Hechos_inferencias_incertidumbre_edicion_revisada.docx` — Word completo (portada, legal, TOC con páginas, 4 partes / 16 capítulos, 8 figuras, tablas, apéndices, glosario, índice analítico, referencias).
- `Hechos_inferencias_incertidumbre_edicion_revisada.pdf` — mismo contenido, 103 páginas A4.

## Qué cambió respecto de la edición de trabajo original (~17.200 palabras → ~30.100)

1. **Voz del autor**: prefacio en primera persona y pasajes personales en caps. 5, 7 y 14.
2. **Hilo narrativo**: el caso de Carmen (hernia incisional) abre la introducción, cierra cada parte con un interludio y se resuelve en el Cuaderno de casos.
3. **Estructura**: 4 partes explícitas; fusiones 9+10 (evidencia y umbrales) y 13+14 (equipos y comunicación); 19 → 16 capítulos.
4. **Material aplicado**: 12 talleres con solución comentada, cierres «En una frase» + «Tres preguntas» en todos los capítulos, «HII-D en 60 segundos», 4 viñetas nuevas (urgencia, APS, fin de vida, error consumado) y guía de implementación en servicio (Apéndice C).
5. **Aparato didáctico**: 8 figuras, léxico de certeza como tabla con usos correctos/incorrectos, glosario e índice analítico.
6. **Aparato crítico depurado**: las 11 referencias huérfanas ahora se citan donde corresponde; Peirce corregido («Deduction, Induction, and Hypothesis», 1878; término «abducción» de 1903); Montgomery 2005→2006; numeraciones de listas reparadas.

## PENDIENTE DEL AUTOR (importante)

Los pasajes en primera persona son **composiciones docentes redactadas como borrador** (así se declara en la página legal). Antes de publicar, reemplazarlos o validarlos con vivencias reales propias:

- Prefacio: el caso de la frase «neumonía aspirativa» heredada.
- Cap. 5: el cólico renal que era un aneurisma.
- Cap. 7: el error de la «ITU» que era colecistitis.
- Cap. 14: el primer «no lo sé» completo ante una familia.

También revisar el nombre «Carmen» y los detalles del caso longitudinal.

## Fuentes (`fuentes/`)

- `00_preliminares.md` … `05_cierre.md` — texto fuente por partes.
- `figuras.py` — genera las 8 figuras (matplotlib) en `../figs/`.
- `build_docx.js` — construye el .docx (docx-js). Uso: `node build_docx.js --toc toc.json`; el PDF sale de LibreOffice (`soffice --headless --convert-to pdf`). El TOC usa dos pasadas: construir sin `--toc`, convertir a PDF, extraer páginas reales, reconstruir con `--toc`.
