# Pauta de edición final — versión operativa

Versión mejorada de la pauta de cierre editorial (12 puntos). Conserva todas sus decisiones de fondo y les añade lo que le faltaba para ser ejecutable sin daños: orden con dependencias, dueño de cada tarea, criterio de verificación por ítem, sitios exactos en el manuscrito, y la corrección de cuatro errores u omisiones de la propia pauta (§F1, §F4, §A2, §Protocolo DOCX).

**Principio rector (sin cambios):** el proyecto no necesita otra reinvención conceptual. Necesita una edición final que haga con el libro lo que el libro exige a una frase clínica: conservar procedencia, graduar afirmaciones, declarar límites y permitir revisión.

---

## Reglas del proceso (nuevas — la pauta original no las tenía)

- **R1. Fuente de verdad única.** El manuscrito vive en `libro/fuentes/*.md` y el DOCX/PDF se *regeneran* con el pipeline de dos pasadas. Nadie edita el DOCX a mano: un DOCX editado bifurca el libro y pierde el TOC verificado, las figuras y la trazabilidad. Ver «Protocolo DOCX ↔ fuentes» al final.
- **R2. Toda tanda de ediciones termina igual:** rebuild de dos pasadas → verificación TOC (36/36) → barrido de consistencia (greps del checklist final). Ninguna fase se declara cerrada sin esto.
- **R3. Nada entra sin fuente verificada** (regla vigente desde la 3.ª ronda de este proyecto: toda cita nueva se verifica contra fuente primaria antes de escribirse).
- **R4. Registro de auditoría.** La fase E deja constancia por escrito en `fuentes/auditoria_evidencia.md`: afirmación → fuente → población → magnitud → dirección → año → DOI → veredicto → acción.
- **R5. Versionado.** Tag del estado previo (`pre-edicion-final`) antes de empezar; tag `v1.0-evaluacion-externa` al cerrar las fases A–E.

**Dueños:** [C] = ejecutable por Claude ahora. [A] = decisión o gestión del autor. [E] = editorial / profesional externo.

---

## Fase A — Correcciones de consistencia [C] (riesgo bajo, hacer primero)

**A1. Figura 8 duplicada.** Confirmado en el manuscrito actual: dos leyendas «Figura 8.» y ninguna «Figura 9». Corrección: la figura HII-D en una página (archivo `fig08_hiid.png`, cap. 15) pasa a «Figura 9»; revisar referencias en texto e índice analítico.
*Criterio de cierre:* `grep` de leyendas devuelve Figuras 1–9, una sola vez cada una.

**A2. Pregunta de daño unificada.** Fórmula única: **«¿Qué daño importante podría producir si estoy equivocado?»**. Sitios exactos (3, no 2 como decía la pauta):
1. Cap. 15, caja «HII-D en 60 segundos» («¿Qué me mataría al paciente…?»).
2. Apéndice A, versión de 60 segundos («¿Qué le haría daño…?»).
3. Viñeta 5 del Cuaderno («*¿Qué me mataría al paciente si me equivoco?*») — también se adapta: el libro no debe enseñar dos fórmulas.

*Corrección a la pauta:* su versión de la pregunta 4 introducía una variación nueva («antes de la próxima evaluación») donde ambos sitios ya coinciden en «antes del próximo control». Se mantiene «próximo control»; no crear inconsistencias al corregir una.

**A3. «Persona real».** En «Cómo leer este libro», reemplazar «…deciden cosas reales sobre una persona real» por «…permiten observar cómo esas capas producen consecuencias clínicas reales en una persona concreta dentro del relato docente».

**A4. Generalizaciones docentes sin estatuto.** Sitios identificados:
1. Taller 10 (solución): «La mayoría de los clínicos estima intuitivamente 70–90%» — **primero intentar anclarla**: la literatura de neglect de la probabilidad basal (Casscells 1978; Eddy 1982; la propia Hoffrage & Gigerenzer 1998) puede sostenerla; verificar antes de reformular. Si no hay respaldo directo: «En ejercicios docentes es habitual que la estimación intuitiva supere largamente el 33% calculado».
2. Taller 10B (solución): «El ejercicio produce dos hallazgos con regularidad» → «El ejercicio suele producir dos hallazgos».
3. Taller 17 (solución): «Tres hallazgos son casi constantes» → «Tres hallazgos aparecen una y otra vez en ejercicios docentes».
4. Barrido final por patrones equivalentes («patrones típicos que emergen», «casi siempre», «con regularidad») en todas las soluciones comentadas.

*Regla de transformación (de la pauta, correcta):* sin respaldo directo, la afirmación general se vuelve formulación ilustrativa («el ejercicio puede revelar…», «en experiencias docentes suele observarse…», «a modo de ejemplo…»).

---

## Fase B — Estatuto de los casos y nota metodológica [C]

**B1. Nota sobre las escenas clínicas y la primera persona.** Texto definitivo (de la pauta, bueno):

> Las escenas narradas en primera persona condensan experiencias reales del autor y situaciones clínicas compuestas. Conservan el conflicto cognitivo y moral que las originó, pero no reproducen literalmente un único episodio ni permiten identificar pacientes, familiares, profesionales o instituciones. Los datos, circunstancias y trayectorias fueron modificados y combinados con fines docentes. Carmen es un personaje clínico compuesto, construido para acompañar el argumento del libro; no corresponde a una paciente identificable.

*Precisión que faltaba — dónde va:* sustituye la frase equivalente de la **página legal** (una sola sede canónica). El prefacio ya contiene su propia declaración en primera persona («los he reconstruido como composiciones docentes…») y se conserva; «Cómo leer» queda cubierto por A3. Evitar una cuarta repetición.

**B2. Nota metodológica (1 página).** Nuevo apartado «Nota metodológica y estatuto de las afirmaciones», ubicado antes de las Referencias. Contenido (de la pauta, completo y correcto): naturaleza de la obra; estrategia bibliográfica **con fecha de cierre (agosto 2026)** y la regla de verificación de fuentes aplicada durante la redacción; taxonomía del estatuto de las afirmaciones (evidencia empírica / síntesis bibliográfica / argumento filosófico / experiencia autoral / ejemplo docente / propuesta original); estatuto de los casos (remite a B1); uso declarado de IA (búsqueda, organización, comparación bibliográfica, apoyo en redacción y edición; no sustituye verificación, juicio clínico, autoría ni responsabilidad); HII-D como heurística no validada con programa de evaluación pendiente.

---

## Fase C — Adiciones acotadas [C] (+4–6 pp, compensadas por C4)

**C1. Tabla comparativa con modelos existentes.** Cap. 15, antes de «Paso 1». Las 9 filas de la pauta.
*Mejora que la pauta omitió:* cada fila se ancla a fuentes **ya citadas en el libro** — SOAP/registro por problemas (Weed 1968a, 1968b), representación del problema (Bordage 1994), illness scripts (Charlin 2007; Custers 2015), doble proceso (Evans & Stanovich 2013), reflexión deliberada (Mamede 2008), modelo metacognitivo (Nelson & Narens 1990; Fleming & Lau 2014), seguridad diagnóstica (NASEM 2015). Cero referencias nuevas; el aparato no crece.
Con la aclaración obligatoria: *HII-D no reemplaza estos modelos; opera como capa de auditoría utilizable dentro de cualquiera de ellos.*

**C2. Seis dimensiones de densidad epistémica.** Cap. 4, inmediatamente después de la definición. Tabla de la pauta (dimensión / pregunta de auditoría / pérdida frecuente) + cierre textual: «La densidad epistémica es un ideal regulativo de escritura y razonamiento. No constituye todavía una escala validada ni una propiedad cuantificada de manera reproducible.»
*Precisión:* remitir explícitamente a las 12 preguntas del Apéndice B para no duplicar instrumentos.

**C3. Caja Austin/Toulmin (recomendada; la pauta final la dejó caer y era la mejor sugerencia de contenido de la evaluación).** Caja de ~2 páginas en el cap. 4: Austin — la frase clínica que *hace* cosas (dar de alta, autorizar, etiquetar, suspender vigilancia); Toulmin — dato, garantía, respaldo, calificador modal, refutación como anatomía de la afirmación clínica. Bonus de coherencia: Toulmin coescribió *The Abuse of Casuistry* con Jonsen, ya citado en el cap. 10. Requiere verificación previa de las dos obras (R3) e implica 2 referencias nuevas — si se decide no crecer el aparato, C3 es el único ítem prescindible de la fase.

**C4. Recortes compensatorios (−4–6 pp).** Candidatos concretos a proponer en lista antes de cortar: redundancias entre cierres «En una frase» y párrafos finales de capítulo; soluciones comentadas más largas que su taller; reiteraciones certeza/reevaluación entre caps. 4, 12 y 15; ejemplos secundarios del cap. 17. Regla: ningún corte se aplica sin lista previa aprobada por el autor.

---

## Fase D — Figuras [C]

**D1. Figura 1 (HII-D).** Rediseño en `figuras.py`: se conservan los cuatro dominios (H→I→I→D), se añade franja transversal de incertidumbre que atraviesa hechos, inferencias y decisión, reevaluación como circuito que vuelve a la pregunta operativa, y la nota: «La separación es funcional y gradual; no representa compartimentos ontológicos puros».

**D2. Figura 2 (gradiente de facticidad).** El eje «mayor solidez» se corrige — la objeción es válida (tensiona con la epistemología del testimonio del cap. 14). *Decisión de formato que la pauta no consideró:* una matriz de 5 filas × 4 columnas es ilegible como PNG en esta maqueta A4; el libro ya tiene el patrón correcto para eso (tabla de texto, como el léxico del Ap. B). Dos opciones, en orden de preferencia:
   a) **Figura 2 conservada y corregida** (eje renombrado a «mayor verificabilidad externa directa») **+ la matriz completa como tabla del cap. 1** (fuente / acceso privilegiado / vulnerabilidad principal / escritura recomendada). Sin renumeración de figuras.
   b) Eliminar la figura y dejar sólo la tabla — obliga a renumerar las figuras 3–9 y sus referencias; sólo si el autor lo prefiere.

**D3. Verificación visual.** Cada PNG regenerado se renderiza y se revisa (protocolo ya usado en este proyecto: colisiones de texto, flechas, contraste).

---

## Fase E — Auditoría de evidencia [C] (la más laboriosa)

Afirmación por afirmación, no referencia por referencia. Registro en `fuentes/auditoria_evidencia.md` (R4). Prioridad 1 — cifras y direcciones ya presentes en el texto:

| # | Afirmación en el libro | Verificar contra |
|---|---|---|
| 1 | ANDROMEDA-SHOCK: −8,5 puntos absolutos, p=0,06, «negativo» | Hernández 2019, JAMA 321(7) |
| 2 | Reanálisis bayesiano: >90% de probabilidad de superioridad bajo cualquier prior razonable | Zampieri 2020, AJRCCM 201(4) |
| 3 | ANDROMEDA-SHOCK-2: 86 centros, 19 países, superioridad de la estrategia personalizada | Hernández 2025, JAMA 334(22) |
| 4 | Deskilling: −6,0 puntos absolutos de ADR (28,4%→22,4%) | Budzyń 2025, Lancet Gastroenterol Hepatol 10:896–903 (+ corrección publicada) |
| 5 | Sesgo de automatización: −14 puntos pese a 20 h de alfabetización | Qazi 2026, NEJM AI 3(5) |
| 6 | Goh: médicos+LLM ≈ médicos solos; LLM solo superior a ambos | Goh 2024, JAMA Netw Open 7(10) |
| 7 | Predictor de sepsis: «cientos de hospitales», mala discriminación y calibración, fatiga de alertas | Wong 2021, JAMA Intern Med 181(8) |
| 8 | Obermeyer: mecanismo del proxy de gasto y magnitud | Obermeyer 2019, Science 366 |
| 9 | Brecha de mortalidad en salud mental: «15 a 20 años» (viñeta 10) | Thornicroft 2011, BJP 199 |
| 10 | Gut feeling pediátrico (viñeta 9): dirección y contexto | Van den Bruel 2012, BMJ 345 |
| 11 | Taller 10: 33% postest y la sobreestimación intuitiva típica | Hoffrage & Gigerenzer 1998 (+ Casscells/Eddy si se cita la estimación intuitiva) |
| 12 | Meta-d′/M-ratio y dominio-generalidad (recuadro cap. 5) | Maniscalco & Lau 2012; Rouault 2018 |
| 13 | Fragilidad predice desenlaces con independencia del diagnóstico | Rockwood 2005, CMAJ 173(5) |
| 14 | Calibración verbalizada de LLMs: sobreconfianza sistemática | Kadavath 2022; Xiong 2024 |
| 15 | Afirmaciones sobre metacognición entrenable y debiasing (caps. 5, 8, 16) | Lambe 2016; Graber 2012; Norman 2017; Monteiro 2020 |

Además: clasificar **toda** afirmación empírica restante con la taxonomía de B2, y aplicar la regla de transformación de A4 a las que queden sin respaldo. Criterio de cierre: cada fila del registro con veredicto («exacta» / «ajustar» / «reformular») y acción aplicada.

---

## Fase F — Decisiones del autor y gestiones externas [A]/[E]

**F1. Título y subtítulo — corrección a la pauta.** La pauta *decide* el subtítulo («Metacognición, lenguaje y decisión clínica») por juicio propio, pero existe un **protocolo A/B pre-registrado con regla de decisión** (`gestiones/titulo_test_protocolo.md`). Decidir por opinión de una IA contradice el protocolo propio del proyecto. Opciones legítimas, a elección del autor:
   a) correr el test añadiéndole la pregunta del subtítulo (recomendado; el cuestionario ya está listo para Google Forms), o
   b) decisión soberana del autor y archivo del test, dejándolo constar como decisión (no como default).
   Lo que sí queda decidido ya, porque no depende del test: **la portada lleva un solo subtítulo**; «Una epistemología operativa» pasa a contraportada / Parte IV / presentación editorial.

**F2. Revisión externa real (6 perfiles).** No se simula ni se atribuye a una IA; la revisión interna multiperspectiva puede anticipar observaciones pero no se denomina externa. Perfiles y pauta común según la pauta original (correctos). *Añadido operativo:* [C] prepara el paquete completo — carta de invitación, pauta de revisión de 9 preguntas, PDF numerado y plazo sugerido de 4–6 semanas; los candidatos del dossier de prólogo (`gestiones/prologo_candidatos.md`) sirven como primera lista para los perfiles clínico, docente y de seguridad diagnóstica. [A] elige y contacta.

**F3. Corrección ortotipográfica profesional.** Dos niveles y dos momentos:
   - Ahora [C]: hoja de estilo única + barrido mecánico de consistencia (comillas, rayas, cursivas en extranjerismos —*feedback*, *illness scripts*, *safety-netting*—, TC/angio-TC, decimales con coma, %, «reevaluación/reapertura/revisión», «paciente/persona/enfermo») con informe de hallazgos.
   - Al final [E]: profesional humano, **después** de F2 (no antes: la revisión externa va a cambiar texto). Viudas, huérfanas, silabación y títulos colgados pertenecen a la etapa de maqueta editorial, no al manuscrito — no gastar esfuerzo en el DOCX.

**F4. Derechos de citas — asimetría que la pauta no registra.** Huidobro murió en 1948: su obra estaría en dominio público en Chile (70 años *post mortem*) — confirmar con la editorial según el país de edición. **Parra murió en 2018: derechos vigentes por décadas; todo el riesgo está concentrado ahí.**

*Decisión del autor (9-8-2026): las citas de Parra no se cambian.* Quedan tal como están en el cap. 18 — ya son breves y el análisis supera largamente a la reproducción, que es la posición defendible ante cualquier editorial. No se prepara versión parafraseada. La gestión formal de permisos sigue siendo [E] (editorial o profesional competente); si esa gestión algún día exigiera modificar una cita, la decisión vuelve al autor — no se anticipa.

---

## Definición de terminado (fases A–E)

- Leyendas Figura 1–9 únicas y referencias cruzadas coherentes.
- Una sola fórmula de daño en los tres sitios; «próximo control» uniforme.
- Cero apariciones de «persona real»; nota B1 en la página legal; nota metodológica presente.
- Cero generalizaciones docentes sin estatuto (barrido A4 ejecutado).
- Tabla comparativa (C1) y seis dimensiones (C2) presentes y ancladas a referencias existentes.
- `auditoria_evidencia.md` completo: toda fila con veredicto y acción.
- Rebuild dos pasadas, TOC 36/36, extensión final 128–136 páginas.
- README actualizado y tag `v1.0-evaluacion-externa`.

---

## Protocolo DOCX ↔ fuentes (corrige el pedido final de la pauta)

La pauta pedía «el DOCX editable» como base de trabajo. Eso bifurcaría el libro: el DOCX de este proyecto es un **artefacto generado** (markdown → docx-js → PDF con TOC verificado en dos pasadas), no la fuente. Protocolo correcto:

1. Las fases A–E se ejecutan sobre `fuentes/*.md`; DOCX y PDF se regeneran y quedan siempre en `libro/`.
2. Para revisores externos y corrección profesional: se entrega el DOCX regenerado, se recibe con control de cambios, y cada cambio aceptado se **reconcilia de vuelta al markdown** antes del rebuild siguiente.
3. El PDF es la referencia visual de control de cada versión, como pedía la pauta.

El DOCX de la versión vigente (131 páginas, TOC verificado) ya está en `libro/Hechos_inferencias_incertidumbre_edicion_revisada.docx`.
