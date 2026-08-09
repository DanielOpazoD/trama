# Hechos, inferencias e incertidumbre — edición de trabajo revisada

Manuscrito revisado del libro de Daniel Opazo con las mejoras de prioridad alta del informe editorial aplicadas. Esta carpeta es autocontenida y no toca el código de la app Trama.

## Entregables

- `Hechos_inferencias_incertidumbre_edicion_revisada.docx` — Word completo (portada, legal, TOC con páginas, 4 partes / 16 capítulos, 8 figuras, tablas, apéndices, glosario, índice analítico, referencias).
- `Hechos_inferencias_incertidumbre_edicion_revisada.pdf` — mismo contenido, 103 páginas A4.

## Qué cambió respecto de la edición de trabajo original (~17.200 palabras → ~32.400)

1. **Voz del autor**: prefacio en primera persona y pasajes personales en caps. 5, 7 y 14.
2. **Hilo narrativo**: el caso de Carmen (hernia incisional) abre la introducción, cierra cada parte con un interludio y se resuelve en el Cuaderno de casos.
3. **Estructura**: 4 partes explícitas; fusiones 9+10 (evidencia y umbrales) y 13+14 (equipos y comunicación); 19 → 16 capítulos.
4. **Material aplicado**: 12 talleres con solución comentada, cierres «En una frase» + «Tres preguntas» en todos los capítulos, «HII-D en 60 segundos», 4 viñetas nuevas (urgencia, APS, fin de vida, error consumado) y guía de implementación en servicio (Apéndice C).
5. **Aparato didáctico**: 8 figuras, léxico de certeza como tabla con usos correctos/incorrectos, glosario e índice analítico.
6. **Interlocutores filosóficos que trabajan** (2ª ronda): riesgo inductivo de Rudner/Douglas como fundamento de los umbrales (cap. 9), Foucault operativo en la ficha como dispositivo (cap. 11), Popper con pruebas severas (cap. 2), epistemología del testimonio Coady/Lackey (cap. 14).
7. **Literatura 2015–2025** (2ª ronda): recuadro meta-d′/M-ratio y dominio-generalidad (cap. 5), posición explícita en el debate Croskerry vs. Norman/Monteiro (cap. 16), calibración de confianza verbalizada en LLMs (cap. 13).
8. **Falsabilidad del propio método**: sección «Qué evidencia me haría abandonar este método» (cap. 15) con cuatro compromisos observables.
9. **Posicionamiento**: párrafo en el prefacio que sitúa el libro frente a Groopman, Croskerry y Montgomery. Pendientes del autor: prólogo invitado y test A/B del título («Medicina lúcida») con ~20 lectores médicos.
10. **Diálogo hispanohablante y clínico** (3ª ronda): ocho autores verificados citados donde hacen trabajo real — Lifshitz (introducción), Hernández/ANDROMEDA-SHOCK (cap. 1), Gérvas & Pérez Fernández (cap. 3), Tajer (cap. 5), Mamede et al. 2010 (cap. 8), Novoa (cap. 9), Alves de Lima y Riquelme et al. (cap. 16). Utili sin cita: no se halló publicación formal pertinente.
11. **Aparato crítico depurado**: las 11 referencias huérfanas ahora se citan donde corresponde; Peirce corregido («Deduction, Induction, and Hypothesis», 1878; término «abducción» de 1903); Montgomery 2005→2006; numeraciones de listas reparadas.

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

## Gestiones externas (`gestiones/`)

- **Prólogo invitado**: `prologo_candidatos.md` (9 candidatos en 3 niveles, con racional, canales y estrategia secuencial de abordaje — verificar vigencia y correos antes de escribir), `prologo_carta.md` (plantilla de solicitud; ya cargada como borrador en el Gmail del autor) y `prologo_dossier.pdf` (dossier de 2 páginas para adjuntar).
- **Test A/B del título**: `titulo_test_protocolo.md/.pdf` (protocolo pre-registrado: diseño, cuestionario listo para Google Forms, regla de decisión pre-especificada, predicción del autor y mensaje de reclutamiento) + `portada_A.png` / `portada_B.png` (maquetas idénticas salvo título, generadas con `portadas.py`).
