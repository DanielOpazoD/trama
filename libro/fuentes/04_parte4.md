# PARTE IV. Una epistemología operativa

Las tres primeras partes construyeron las herramientas; esta las pone a trabajar. Primero frente al espejo nuevo de la inteligencia artificial (capítulo 13) y frente a la responsabilidad que ninguna herramienta puede delegar (capítulo 14). Luego, el método HII-D en forma completa y en versión de sesenta segundos (capítulo 15), un cuaderno de ocho casos para leer metacognitivamente —incluida la resolución de la historia de Carmen—, y el problema de enseñar y organizar todo esto (capítulo 16).

## Capítulo 13. Inteligencia artificial como espejo del razonamiento

Un residente pega la historia de un paciente en un asistente de lenguaje y recibe, en ocho segundos, una evaluación impecablemente redactada: diagnóstico probable, diferenciales ordenados, plan sugerido. Todo suena verosímil. La pregunta que este capítulo propone no es "¿acierta la máquina?", sino una más incómoda: ¿en qué se parece esa prosa fluida y segura a la que escribimos nosotros?

### Lenguaje plausible y verdad

Los grandes modelos de lenguaje generan continuaciones plausibles a partir de patrones aprendidos en enormes corpus. Su fluidez puede producir respuestas clínicamente útiles, pero también afirmaciones falsas presentadas con coherencia. La literatura denomina hallucination a contenido no sustentado o inconsistente con la fuente o el mundo (Ji et al., 2023). El término es metafórico: el modelo no tiene una experiencia perceptiva que se desorganice como en la alucinación humana.

La medicina reconoce el peligro porque también trabaja con narrativas plausibles. Un clínico puede completar huecos, atribuir causalidad o recordar un dato de manera congruente con su hipótesis. La semejanza no implica identidad. El médico posee cuerpo, responsabilidad, acceso al paciente, experiencia situada y capacidad de actuar; el modelo manipula representaciones lingüísticas y depende del contexto que recibe.

### Competencia sin garantía

Estudios han mostrado que modelos avanzados codifican conocimiento médico y alcanzan alto rendimiento en preguntas y casos seleccionados (Singhal et al., 2023). Lee, Bubeck y Petro describieron beneficios potenciales junto con límites y riesgos de GPT-4 en medicina (Lee et al., 2023). El rendimiento promedio no garantiza confiabilidad en un caso individual, especialmente cuando faltan datos, hay ambigüedad o la tarea exige conocimiento local. Y las consecuencias no intencionadas del aprendizaje automático en medicina —desde la automatización de sesgos presentes en los datos hasta la erosión de habilidades por deferencia— han sido advertidas desde antes de los modelos generativos (Cabitza et al., 2017).

La fluidez aumenta el riesgo de automatización: el usuario puede aceptar una respuesta porque está bien estructurada. El problema es metacognitivo. La confianza percibida en el lenguaje no informa necesariamente la probabilidad de corrección. La IA puede parecer mejor calibrada de lo que está.

### Una diferencia central

El clínico responsable puede distinguir "lo vi", "lo infiero" y "no lo sé". Un modelo suele mezclar estas capas si el prompt no exige separación y si no tiene fuentes verificables. Puede transformar ausencia de información en un detalle probable, porque su objetivo generativo favorece continuidad.

La matriz HII-D permite auditar una respuesta de IA:

- ¿qué hechos provienen realmente del caso?;
- ¿qué información agregó el modelo?;
- ¿qué inferencias formula y con qué respaldo?;
- ¿qué incertidumbres omitió?;
- ¿qué decisión propone y cuáles serían sus riesgos?;
- ¿qué fuente primaria permite verificar la afirmación?

El modelo puede servir como generador de alternativas, revisor de coherencia, organizador de información o segundo lector. Su valor aumenta cuando el usuario mantiene la responsabilidad de verificación y disminuye cuando se usa como autoridad final.

### Metacognición artificial

Algunos sistemas pueden expresar confianza, criticar una respuesta o revisar pasos. Eso no demuestra autoconocimiento en el sentido humano. Una salida metacognitiva puede ser otra generación entrenada para imitar evaluación. La pregunta práctica no es si el sistema "sabe que sabe", sino si sus señales de confianza están empíricamente calibradas y si el flujo de trabajo detecta fallas.

Esa pregunta ya tiene datos. La evidencia disponible muestra que la confianza verbalizada de los grandes modelos —el "estoy bastante seguro" que escriben— tiende a la sobreconfianza sistemática y se calibra mal, aun cuando algunas señales internas del modelo discriminan mejor de lo que su prosa deja ver (Kadavath et al., 2022; Xiong et al., 2024). La implicación práctica es idéntica a la del capítulo 5, aplicada ahora a la máquina: preguntarle a un modelo cuán seguro está no sustituye la verificación, igual que la seguridad de un colega no sustituye sus razones. La calibración se demuestra con series de predicciones y desenlaces, no con tono.

La OMS ha recomendado gobernanza, evaluación, transparencia y supervisión para modelos multimodales en salud, atendiendo riesgos de inexactitud, sesgo, privacidad y dependencia excesiva (World Health Organization, 2024). La supervisión humana no debe ser una firma ritual al final. Debe contar con tiempo, datos y autoridad para cuestionar.

### La IA como provocación filosófica

La IA revela que una frase puede conservar la forma externa del razonamiento sin tener acceso directo al evento. Esto obliga a recordar que la coherencia verbal nunca fue garantía suficiente. También muestra el valor del lenguaje como espacio de prueba: pedir alternativas, contraejemplos y explicitar incertidumbre puede mejorar la deliberación humana, aunque no vuelva verdadero al modelo.

> La IA puede ampliar el espacio de hipótesis; no puede asumir por sí sola la responsabilidad de transformar una hipótesis en conducta clínica.

Usada con disciplina, puede ser un instrumento metacognitivo externo. Usada por deferencia, puede reforzar el mismo error que pretendía corregir: convertir plausibilidad en certeza.

**En una frase.** La IA generativa produce exactamente aquello contra lo que este libro entrena: prosa fluida donde hechos, inferencias e incertidumbre llegan mezclados — auditarla con HII-D es el mismo ejercicio que auditar la propia escritura.

**Tres preguntas para la próxima visita.**
1. Si uso IA en este caso, ¿qué dato de su respuesta verifiqué contra una fuente primaria antes de actuar?
2. ¿Qué agregó el modelo que el caso no contenía?
3. ¿Estoy usando la herramienta para ampliar hipótesis o para confirmar rápido la que ya tenía?

## Capítulo 14. Humildad epistémica y responsabilidad clínica

Hay una frase que me costó años aprender a decir delante de una familia: "no lo sé". La primera vez que la dije completa —"no sé todavía por qué empeoró; sé qué descartamos, sé qué vamos a vigilar esta noche y sé cuándo tendremos más información"— esperaba encontrar decepción. Encontré alivio. La familia no necesitaba mi certeza; necesitaba saber que la incertidumbre estaba siendo trabajada. Este capítulo trata de esa diferencia: entre parecer seguro y ser responsable.

### Afirmar es asumir una responsabilidad

Una frase clínica no es moralmente neutra. Puede activar una cirugía, justificar aislamiento, etiquetar a una persona, limitar tratamientos o fijar una interpretación que otros repetirán. Cuando escribimos "rechaza", "no adherente", "funcional", "terminal" o "sin indicación", no sólo describimos. Distribuimos credibilidad, urgencia y recursos. La ética del razonamiento comienza antes de la decisión: comienza en la forma en que se recibe un testimonio y se concede fuerza a una afirmación.

La prudencia aristotélica —phronesis— no es cautela pasiva, sino capacidad de deliberar bien sobre lo que conviene hacer en una situación particular. Pellegrino y Thomasma situaron el juicio clínico en el encuentro entre conocimiento técnico, bien del paciente y obligación moral (Pellegrino & Thomasma, 1981). La decisión médica nunca es únicamente correcta por su coherencia lógica; debe ser justificable para la persona sobre la que actúa.

### Humildad epistémica

La humildad epistémica no consiste en disminuir artificialmente la propia competencia ni en presentar todas las hipótesis como equivalentes. Consiste en conocer el alcance y los límites de las razones disponibles, reconocer dependencia de otros y mantener apertura real a corrección. Es compatible con decisiones firmes. Un cirujano puede afirmar que una intervención es urgente y, al mismo tiempo, distinguir qué mecanismo está demostrado, qué riesgo se estima y qué desenlace sigue siendo incierto.

La falsa seguridad daña porque cierra la revisión y puede engañar al paciente. La duda indiscriminada también daña: transfiere carga, paraliza decisiones o abandona a la persona bajo una apariencia de neutralidad. La virtud está en calibrar. Decir "no lo sé" es profesional cuando se acompaña de qué sí se sabe, qué se hará, qué riesgo se vigila y cuándo se reevaluará.

### Credibilidad y experiencia del paciente

Miranda Fricker denominó injusticia epistémica al daño cometido contra alguien en su capacidad de sujeto de conocimiento (Fricker, 2007). En salud, Carel y Kidd mostraron cómo el testimonio de pacientes puede recibir menor credibilidad o carecer de categorías interpretativas adecuadas, y cómo la propia experiencia de enfermar agudiza esa vulnerabilidad epistémica (Carel & Kidd, 2014; Kidd & Carel, 2017). El enfermo posee un conocimiento de primera persona sobre dolor, cambio funcional, tolerancia, valores y trayectoria cotidiana que no puede ser sustituido por mediciones externas. Ese conocimiento tampoco es infalible, pero merece evaluación y no descarte reflejo.

La filosofía del testimonio ayuda a precisar qué significa "evaluar sin descartar". Contra la sospecha heredada del empirismo —que creerle a otro es siempre conocimiento de segunda categoría—, Coady mostró que el testimonio es una fuente básica de conocimiento, tan constitutiva como la percepción o la memoria: sin una confianza por defecto en lo que otros informan, ni la ciencia ni la vida cotidiana serían posibles (Coady, 1992). Lackey corrigió el exceso opuesto: la confianza por defecto no es un cheque en blanco; el oyente responsable mantiene una sensibilidad activa a las señales de error o engaño, y el conocimiento testimonial se logra cuando ambas condiciones —decir fiable y escuchar vigilante— se cumplen a la vez (Lackey, 2008). La anamnesis es exactamente ese contrato epistémico: el paciente aporta un informe que el médico no puede obtener por ninguna otra vía, y el médico aporta el examen de consistencia, forma temporal y relación con otros hallazgos. Ni credulidad ni auditoría hostil: recepción con estándares. La injusticia testimonial es, en estos términos, un fallo del segundo contratante: aplicar a ciertos hablantes un estándar de vigilancia que no se aplica a otros, por razones que nada tienen que ver con la fiabilidad de su informe.

La injusticia testimonial aparece cuando prejuicios sobre edad, género, origen, diagnóstico psiquiátrico, discapacidad o estilo comunicativo reducen injustificadamente la credibilidad. La injusticia hermenéutica surge cuando faltan conceptos compartidos para expresar una experiencia o cuando la institución sólo admite aquello que cabe en sus formularios. En ambos casos, el problema no es cortesía: se pierde evidencia clínicamente relevante.

Escuchar de manera epistémica implica preguntar qué sabe esta persona que el equipo no puede observar, qué interpretación atribuye a sus síntomas y qué experiencias anteriores modifican su decisión. También exige distinguir desacuerdo de incapacidad. Un paciente puede comprender la evidencia y valorar de manera diferente los desenlaces. Cuando Carmen dijo "esta vez el dolor era otro", estaba entregando el dato pronóstico más importante del ingreso; la nota que lo hubiera omitido habría cometido, además de una injusticia, un error técnico.

### La ética de la incertidumbre

Comunicar incertidumbre es una obligación de veracidad, pero la forma importa. Entregar una lista de posibilidades sin jerarquía puede aumentar angustia sin mejorar autonomía. Ocultar la duda para preservar confianza produce una alianza frágil. La comunicación responsable estructura: qué explicación es más probable, qué alternativas relevantes permanecen, qué riesgos justifican actuar, qué señales deben motivar consulta y qué aspectos dependen de preferencias.

La decisión compartida no significa que médico y paciente aporten lo mismo. El profesional ofrece conocimiento técnico, estimación de consecuencias y recomendación; el paciente aporta experiencia, objetivos y tolerancia al riesgo (Elwyn et al., 2012).

Existe además una ética de la revisión. Una hipótesis provisional que se documenta sin plan de seguimiento puede transformarse en daño por inercia. Quien decide bajo incertidumbre adquiere la obligación de definir cómo se reconocerá el error. Los criterios de alarma, controles, responsable y plazo no son tareas administrativas agregadas: completan la racionalidad moral de la decisión.

### Autoridad sin opacidad

La relación clínica es asimétrica: el profesional posee conocimientos, acceso institucional y capacidad de activar intervenciones que el paciente no controla. Esa asimetría hace necesaria la recomendación experta, pero también exige que la autoridad sea explicable. "Yo haría esto" tiene valor cuando resume razones; se vuelve problemática cuando sustituye su examen.

Recomendar no es imponer ni retirarse. El médico debe señalar qué opción considera preferible, qué hechos sostienen esa preferencia, qué incertidumbres podrían modificarla y qué valores del paciente son decisivos. La neutralidad aparente puede abandonar a una persona precisamente cuando necesita orientación. La autoridad bien ejercida reduce complejidad sin ocultar desacuerdos razonables. La respuesta de la cirujana a Carmen —"yo le recomiendo operarse, y le digo por qué"— es la forma completa del gesto: recomendación, razones, límites y devolución de la decisión.

También existe responsabilidad sobre las palabras que permanecen. Un diagnóstico inscrito en la ficha puede condicionar futuras interpretaciones incluso después de perder sustento. Corregir, fechar y explicar cambios de hipótesis es una obligación epistémica. No basta con pensar de nuevo; el sistema debe poder reconocer que se pensó de nuevo.

> La humildad clínica no consiste en afirmar menos, sino en no afirmar más de lo que permiten los hechos y no decidir menos de lo que exige el riesgo.

La lucidez une epistemología y ética. Sobreestimar la certeza puede conducir a intervenciones injustificadas; subestimar la gravedad puede negar protección; desacreditar un relato puede borrar el dato decisivo. Por ello, hechos, inferencias e incertidumbre no son sólo categorías del conocimiento. Son también una disciplina de respeto: permiten que el paciente sepa qué sostiene nuestra recomendación, dónde están sus límites y cómo responderemos si la realidad contradice lo esperado.

La confianza profesional más robusta no depende de parecer infalible. Se construye cuando el paciente y el equipo pueden reconocer una pauta: afirmaciones proporcionadas, revisión ante nueva evidencia y responsabilidad sobre las consecuencias de la decisión.

**En una frase.** Afirmar, dudar y recomendar son actos morales: la humildad epistémica bien entendida produce decisiones más firmes, no más tibias, porque cada afirmación carga exactamente el peso que puede sostener.

**Tres preguntas para la próxima visita.**
1. ¿A qué paciente le estoy creyendo menos de lo que su testimonio merece, y por qué?
2. Mi última recomendación firme: ¿podría explicar qué hechos la sostienen, qué incertidumbres la modificarían y qué valores del paciente pesan?
3. ¿Hay en mis fichas una etiqueta ("funcional", "no adherente", "poco colaborador") que esté distribuyendo credibilidad en lugar de información?

## Capítulo 15. El método HII-D: una epistemología operativa

Todo lo anterior cabe en una hoja. Esa es, deliberadamente, la ambición de este capítulo: condensar el libro en un método que pueda usarse en una discusión de caso, en una nota difícil, en una auditoría de IA o en los sesenta segundos previos a una decisión nocturna. La condensación tiene un precio —ningún método piensa por nadie— y una condición: saber cuándo usarlo y cuándo no.

### Una heurística, no una escala

HII-D organiza el razonamiento en cuatro dominios: hechos, inferencias, incertidumbre y decisión. No pretende describir toda la cognición médica ni asignar puntajes. Es una heurística para casos en que la representación se ha vuelto confusa, la conducta es controvertida, existe alto riesgo o se necesita una comunicación especialmente trazable.

Su principio es simple: cada afirmación importante debe poder ubicarse en una capa, y cada decisión debe mostrar cómo se relaciona con las otras. El método agrega un quinto movimiento transversal: reevaluación. Toda formulación es temporal.

[FIGURA: fig08_hiid.png | Figura 8. El método HII-D en una página: cinco pasos, cuatro capas y un movimiento transversal de reevaluación que devuelve al mundo la capacidad de corregirnos.]

### Paso 1. Definir la pregunta

Antes de ordenar datos, conviene precisar qué decisión está en juego. "¿Cuál es el diagnóstico?" puede ser demasiado amplio. Preguntas más útiles son: ¿existe infección que justifique antibiótico?, ¿hay una complicación anatómica que exige cirugía urgente?, ¿el riesgo de recurrencia modifica la oportunidad de reparación?, ¿qué explicación del síntoma requiere excluirse antes de un manejo funcional?

La misma información adquiere distinta relevancia según la pregunta. Definirla evita estudiar todo sin jerarquía.

### Paso 2. Inventariar hechos y procedencia

Se seleccionan hechos capaces de modificar la respuesta. Cada uno conserva fuente, fecha, tendencia y limitación. Debe distinguirse dato presente, hallazgo negativo, dato ausente y dato no evaluable.

Una técnica útil es escribir primero sin diagnósticos: edad y contexto; temporalidad; fisiología; examen; microbiología; imagen; respuesta; antecedentes que modifican prior. Esta suspensión breve impide que la etiqueta ordene retroactivamente los datos.

### Paso 3. Formular inferencias graduadas

Se propone una representación principal y, si importa, alternativas. Cada inferencia se acompaña de una fuerza verbal proporcional: demostrado, altamente probable, probable, posible o no sustentado. Deben explicitarse los enlaces causales no observados.

Una inferencia clínica útil explica por qué los hechos se agrupan y qué predice. Si no cambia comprensión, conducta o vigilancia, quizá sea sólo un nombre.

### Paso 4. Mapear incertidumbre

Se pregunta qué parte del modelo puede estar equivocada, qué prueba reduciría la duda, qué sólo aclarará la evolución y qué permanecerá incierto. Luego se prioriza por consecuencias: ¿cuál incertidumbre es peligrosa?, ¿cuál es tolerable?, ¿cuál no cambia el manejo?

Aquí se reconoce la diferencia entre "no sé la etiología exacta" y "no sé si existe una amenaza inmediata". La segunda suele dominar la acción.

### Paso 5. Decidir por umbral y consecuencias

La decisión integra probabilidad, gravedad, tiempo, reversibilidad, capacidad de monitorización y valores. Debe poder formularse: "aunque X no está demostrado, actúo porque…" o "aunque X es posible, no actúo todavía porque…". Esta frase obliga a distinguir compromiso práctico de certeza epistémica.

Toda decisión incluye un plan de reapertura: criterio clínico, examen pendiente, plazo o evento. Sin él, HII-D queda incompleto.

### Plantilla condensada

- Pregunta operativa:
- Hechos decisivos:
- Inferencia principal y grado:
- Alternativa que cambiaría conducta:
- Incertidumbre crítica:
- Decisión y razón:
- Criterio de reevaluación:

#### Caja de herramientas. HII-D en 60 segundos

La versión completa es para casos difíciles. Para el resto —el ingreso número doce de la noche, la reevaluación entre dos urgencias— existe una versión mínima de cuatro preguntas, pensada para decirse mentalmente en el pasillo:

1. **¿Qué vi y qué me contaron?** (un hecho decisivo, con su fuente)
2. **¿Qué creo y cuánto derecho tengo a creerlo?** (la inferencia principal, con su grado)
3. **¿Qué me mataría al paciente si estoy equivocado?** (la incertidumbre peligrosa, no todas)
4. **¿Qué hago, y qué me haría cambiar antes del próximo control?** (decisión con criterio de reapertura)

Sesenta segundos no producen una epistemología; producen algo más modesto y a veces suficiente: impiden que la frase "cuadro habitual, manejo habitual" se escriba sola. Si alguna de las cuatro respuestas incomoda —el hecho decisivo resulta heredado, la confianza no tiene fuente, la incertidumbre peligrosa no tiene vigilancia—, esa incomodidad es la indicación para la versión completa.

### Uso en equipo

En una ronda, cada integrante puede desafiar una capa distinta. Enfermería aporta evolución y respuesta; radiología delimita lo que la imagen muestra y lo que no; microbiología precisa relevancia y contaminación; cirugía integra anatomía y oportunidad; el paciente aporta síntomas, preferencias y desenlaces que valora. El método no centraliza el conocimiento en una sola voz.

También puede usarse para revisar una nota, un informe de alta o una respuesta de IA. La pregunta siempre es la misma: ¿la fuerza del lenguaje corresponde a la fuerza de la evidencia y la decisión corresponde a las consecuencias?

### Calibración y auditoría del método

HII-D puede usarse retrospectivamente para examinar decisiones. La pregunta no es sólo si el diagnóstico final coincidió, sino si los hechos fueron representados con fidelidad, si las inferencias recibieron una fuerza proporcional, si la incertidumbre relevante fue identificada y si la decisión era defendible con la información disponible. Este análisis evita confundir calidad del proceso con fortuna del desenlace.

La calibración requiere comparar predicciones con resultados. Cuando sea posible, conviene registrar no sólo una hipótesis, sino un grado verbal o numérico de confianza y una expectativa temporal. Más tarde puede revisarse: ¿la certeza fue excesiva?, ¿la alternativa descartada ocurrió con frecuencia?, ¿el criterio de alarma fue sensible?, ¿la conducta se modificó cuando debía? Sin retorno de información, la experiencia puede acumular años sin transformarse en pericia.

### Qué evidencia me haría abandonar este método

Un libro que exige compromisos observables a cada hipótesis clínica debe formular los suyos. Estos son los míos.

Primero: si clínicos entrenados no logran un acuerdo razonable al clasificar las frases de una nota en hechos, inferencias e incertidumbre, la distinción central del método es subjetiva en la práctica, y HII-D debe reformularse o abandonarse. La trazabilidad que promete depende de que las capas sean reconocibles entre lectores, no sólo para quien escribe.

Segundo: si las notas escritas con esta disciplina no difieren de las convencionales en instrumentos estándar de calidad de registro, ni en la capacidad de otro clínico para reconstruir el razonamiento a partir de ellas, el método es cosmética con nombre propio.

Tercero: si un servicio que adopta el léxico de certeza no modifica en algunos meses ninguna conducta medible —ningún "se descarta" reconvertido, ningún criterio de reapertura agregado, ninguna vigilancia activada que antes no existía—, el léxico es un póster, no una herramienta.

Cuarto: si el tiempo que consume la versión completa supera de forma sostenida el beneficio detectable, la respuesta racional no es la fe sino la poda: quedarse con la versión de sesenta segundos, o con nada.

Formular estas condiciones no es un gesto retórico de modestia. Es la diferencia entre proponer una hipótesis y fundar una escuela. Prefiero lo primero: que el método quede expuesto a la misma reevaluación que le exige a cada diagnóstico, y que el mundo conserve, también aquí, la capacidad de corregirnos.

### Límites

HII-D no sustituye protocolos, guías, probabilidades cuantitativas ni experiencia. Puede generar falsa prolijidad si se aplica mecánicamente. No todo caso necesita cuatro subtítulos. En urgencias, la acción puede preceder a la formulación completa; aun así, la reevaluación posterior debe reconstruirla. Debe decirse con la misma claridad: HII-D no ha sido validado como instrumento —no existen aún estudios de fiabilidad ni de impacto—, y este libro lo presenta como heurística de escritura y deliberación, no como tecnología probada. El método debe permanecer liviano. La extensión apropiada depende del riesgo, novedad y reversibilidad. Una decisión rutinaria puede requerir una línea; una situación de alto impacto merece una representación más desplegada. La profundidad debe ser selectiva y proporcional.

> Hechos sin inferencia son inventario; inferencias sin incertidumbre son dogma; incertidumbre sin decisión es parálisis; decisión sin reevaluación es inercia.

El valor del método depende de una actitud: aceptar que la claridad no consiste en eliminar la complejidad, sino en ordenar qué tipo de conocimiento representa cada afirmación.

#### Taller 15. Su paciente, esta semana

Elija el caso más incómodo de su lista actual —el que genera discusión en cada ronda o el que nadie discute hace días— y complete la plantilla condensada por escrito. Después compárela con la última evolución de la ficha: ¿qué contiene la plantilla que la ficha no registra?

*Solución comentada.* No hay solución única, pero hay un patrón casi universal al comparar: la ficha suele contener los hechos y la decisión, y omitir las dos capas intermedias —el grado de la inferencia ("neumonía" sin "probable/demostrada") y la incertidumbre crítica con su vigilancia—. Es decir: registra qué se piensa y qué se hace, pero no cuánto derecho hay a pensarlo ni qué lo haría cambiar. Si su plantilla y su ficha coinciden, este libro le debe una disculpa por las horas invertidas. Si no coinciden, la plantilla acaba de mostrarle qué escribir mañana.

**En una frase.** HII-D es el libro entero plegado en una hoja: pregunta, hechos con procedencia, inferencias graduadas, incertidumbre priorizada, decisión por umbral y reapertura programada.

**Tres preguntas para la próxima visita.**
1. ¿Cuál es la pregunta operativa de mi caso más difícil —la decisión real en juego, no "el diagnóstico"?
2. ¿Mi nota de hoy permite a otro médico reconstruir mis cuatro capas, o sólo mi conclusión?
3. ¿Qué decisión de esta semana tomé sin criterio de reapertura, y todavía estoy a tiempo de escribirlo?

## Cuaderno de casos. Ocho viñetas para una lectura metacognitiva

Las viñetas siguientes son composiciones docentes. Cada una se presenta con la estructura HII-D y una frase medular. No son casos "resueltos": son casos representados. La invitación es leer cada uno dos veces —primero como clínico, buscando la conducta; después como lector metacognitivo, observando qué hace cada capa.

### Viñeta 1. Carmen: obstrucción recurrente y cambio cualitativo de riesgo

La historia completa atraviesa este libro; aquí queda su forma condensada, la que cabría en una discusión de caso.

Mujer de 61 años con hernia incisional y tres ingresos por suboclusión resueltos sin cirugía. Cuarto episodio con íleo, shock, hiperlactatemia, perfusión periférica alterada y hemocultivos con bacilos gramnegativos. Mejora con reposo digestivo, antibióticos y noradrenalina. La tomografía no muestra perforación, isquemia ni estrangulación.

*Hechos:* recurrencia documentada y acelerada; episodio actual fisiológicamente grave; bacteriemia; respuesta favorable; ausencia de complicación anatómica visible en la imagen.

*Inferencia:* foco abdominal y relación con el evento obstructivo son probables, pero el mecanismo exacto no está demostrado. La ausencia de estrangulación reduce la indicación de emergencia, no el riesgo futuro.

*Incertidumbre:* probabilidad y momento de recurrencia; causalidad microbiológica exacta; aptitud y riesgo operatorio una vez recuperada.

*Decisión:* valoración quirúrgica temprana para reparación electiva una vez optimizada, con decisión compartida documentada. El argumento no es "fracasó todo manejo médico", sino que la gravedad actual cambia el costo esperado de una nueva estrategia expectante.

*Frase medular:* "Obstrucción recurrente por hernia incisional, por primera vez asociada a shock y bacteriemia, sin complicación anatómica aguda en tomografía; el cambio cualitativo de gravedad justifica priorizar resolución electiva tras recuperación fisiológica."

*Epílogo.* Carmen fue operada seis semanas después, en forma programada. La cirugía encontró adherencias firmes y un anillo herniario estrecho; no hubo complicaciones mayores. Nada de eso demuestra que la decisión fue correcta —un desenlace no valida un proceso—, pero el proceso era defendible antes de conocer el desenlace, que es lo único que puede pedírsele a una decisión clínica. La frase de su ingreso, "cuadro habitual, manejo habitual", quedó en la ficha como lo que era: la hipótesis rápida que el trabajo de tres semanas convirtió en otra cosa.

### Viñeta 2. Bacteriuria en paciente con sonda permanente

Un paciente con lesión medular completa, vejiga neurogénica, sonda Foley y neoplasia avanzada presenta orina turbia, piuria y urocultivo positivo después de recambio de sonda. Está afebril, estable y sin otro cambio clínico. Los marcadores inflamatorios están elevados, sin valor basal y con explicación tumoral posible. Tiene antecedente de enterobacteria productora de BLEE.

*Hechos:* colonización de alto riesgo basal; cultivo positivo; piuria; ausencia de fiebre o inestabilidad; síntomas urinarios clásicos no evaluables; costo alto de antibiótico amplio.

*Inferencia:* bacteriuria asociada a catéter es más probable que infección sintomática con la información actual. Piuria y turbidez no distinguen por sí solas colonización de infección.

*Incertidumbre:* la lesión medular modifica la expresión clínica; se requiere vigilancia de signos autonómicos, espasticidad, malestar nuevo o deterioro sistémico.

*Decisión:* no tratar de inmediato; establecer criterios explícitos de reevaluación. El antecedente de BLEE no es argumento para tratar antes, sino una razón adicional para exigir umbral clínico suficiente.

*Frase medular:* "Urocultivo positivo y piuria en usuario crónico de Foley, sin manifestaciones sistémicas nuevas que sostengan CAUTI; cuadro más compatible con bacteriuria asociada a catéter, con vigilancia reforzada por expresión sintomática limitada y antecedente de resistencia."

### Viñeta 3. Globus y necesidad de una explicación no reductiva

Una paciente refiere sensación persistente de cuerpo extraño faríngeo, sin disfagia progresiva, odinofagia, pérdida de peso ni alteración estructural en evaluación inicial. Los síntomas fluctúan con estrés y atención corporal. Solicita "un examen que muestre qué tiene".

*Hechos:* sensación localizada; ausencia de signos de alarma; evaluación estructural no reveladora; variabilidad contextual.

*Inferencia:* globus funcional es probable después de una evaluación apropiada. "Funcional" no significa inventado; describe alteración de percepción, atención, sensibilidad y regulación sin lesión estructural suficiente para explicarla.

*Incertidumbre:* ningún examen elimina todo riesgo futuro; la conducta depende de evolución y aparición de banderas rojas. Puede coexistir reflujo, tensión muscular o factores afectivos sin causalidad única.

*Decisión:* explicar el diagnóstico positivo, evitar escalamiento indiscriminado de pruebas, tratar factores contribuyentes seleccionados y usar estrategias cognitivo-conductuales orientadas a atención, interpretación y respuesta al síntoma.

*Frase medular:* "Sensación de globus sin disfagia verdadera ni signos de alarma y con evaluación estructural negativa, compatible con trastorno funcional de percepción faríngea; se propone manejo positivo y seguimiento, no una búsqueda indefinida de lesión oculta."

### Viñeta 4. Infiltrados pulmonares y causalidad múltiple

Una persona mayor presenta insuficiencia respiratoria con infiltrados multifocales, derrame pequeño y signología obstructiva. Existe posibilidad de infección, congestión, aspiración y reacción inflamatoria farmacológica. Mejora con soporte, antibióticos, broncodilatación y ajuste terapéutico.

*Hechos:* insuficiencia respiratoria; hallazgos radiológicos mixtos; marcadores inflamatorios; respuesta bajo intervenciones simultáneas.

*Inferencia:* neumopatía multifactorial es una representación más fiel que atribuir todo a una causa. La mejoría no permite identificar qué intervención fue específica.

*Incertidumbre:* peso relativo de infección, inflamación y congestión; causalidad farmacológica; riesgo de recurrencia.

*Decisión:* completar una duración antibiótica proporcionada si la probabilidad inicial lo justifica, retirar la exposición sospechosa cuando el balance favorece hacerlo y documentar que la causalidad no está demostrada. El seguimiento debe buscar recurrencia tras reexposición y evolución radiológica.

*Frase medular:* "Insuficiencia respiratoria por neumopatía multifocal probablemente mixta, con componentes infeccioso-inflamatorio y posible contribución farmacológica; evolución favorable bajo medidas concomitantes, sin posibilidad de atribución causal única."

### Viñeta 5. Tres de la mañana: decidir con el reloj en contra

Urgencias, 3:10. Hombre de 54 años, dolor torácico opresivo de 40 minutos, sudoroso, con antecedente de tabaquismo. Electrocardiograma: alteraciones inespecíficas de la repolarización. Primera troponina: pendiente. Hay otros nueve pacientes esperando y una sola reanimación disponible. No hay tiempo para la plantilla completa; hay tiempo para los sesenta segundos.

*¿Qué vi y qué me contaron?* Dolor opresivo con descarga adrenérgica, observado; ECG no diagnóstico pero anormal, medido ahora.

*¿Qué creo y cuánto derecho tengo?* Síndrome coronario agudo: posible-probable; el patrón clínico pesa más que el ECG inespecífico. No demostrado.

*¿Qué me mataría al paciente si me equivoco?* Tratarlo como "dolor inespecífico, espera troponina en sala" y que sea una oclusión en evolución. La incertidumbre peligrosa no es la etiqueta; es el tiempo.

*¿Qué hago y qué me haría cambiar?* Monitor, acceso, antiagregación según protocolo, ECG seriado en 15 minutos, troponina acelerada; escala a activación de hemodinamia si nuevo ECG cambia o el dolor persiste. Queda escrito: "SCA no demostrado; conducta por umbral dada gravedad del error de omisión".

*Frase medular:* "Dolor torácico de perfil isquémico con ECG no diagnóstico: se maneja como SCA probable por asimetría de consecuencias mientras la seriación confirma o degrada la hipótesis."

*Lectura metacognitiva.* La decisión correcta a las 3:10 no fue diagnóstica sino estratégica: comprar tiempo de vigilancia con intervenciones de bajo riesgo. El error clásico en este escenario no es intelectual, es logístico: la hipótesis correcta ("probable SCA") sin sistema de reevaluación (¿quién repite el ECG si la sala explota?). El criterio de reapertura con responsable es la mitad de la decisión.

### Viñeta 6. La consulta ambulatoria y el chequeo reciente

Atención primaria. Mujer de 47 años consulta por fatiga de tres meses. Trae exámenes "normales de hace poco": hemograma y perfil realizados cinco meses atrás, cuando la fatiga no existía. Refiere además sudoración nocturna ocasional que atribuye a "premenopausia" y ha perdido "dos o tres kilos, por comer menos". Agenda llena, doce minutos por paciente.

*Hechos:* fatiga nueva de tres meses (relato consistente); exámenes normales previos al síntoma (dato real, pero anterior al problema); sudoración y baja de peso referidas con explicación alternativa plausible; examen físico de hoy sin adenopatías palpables ni visceromegalia (búsqueda dirigida, limitada por tiempo).

*Inferencia:* la mayoría de las fatigas en este contexto son benignas o funcionales: probable. Pero el conjunto fatiga + sudoración + baja de peso configura una tríada que no debe cerrarse contra exámenes previos al síntoma: los "normales de hace poco" no cubren el período de la enfermedad actual.

*Incertidumbre:* la peligrosa no es "¿qué causa la fatiga?" sino "¿hay un proceso sistémico en curso que estos doce minutos no pueden excluir?". Reducible con laboratorio actual dirigido y un control programado, no con más preguntas hoy.

*Decisión:* laboratorio actualizado (hemograma, VHS/PCR, TSH, glicemia, perfil hepático), control con resultados en dos semanas con la misma profesional, y safety-netting explícito por escrito: reconsultar antes si fiebre, adenopatías, dolor óseo o baja de peso mayor. No se tranquiliza con los exámenes viejos ni se alarma sin datos: se convierte el tiempo en prueba diagnóstica con red de seguridad.

*Frase medular:* "Fatiga de tres meses con sudoración y baja de peso leves; exámenes normales previos al inicio del cuadro no excluyen proceso actual: se actualiza estudio y se programa control con criterios explícitos de reconsulta."

*Lectura metacognitiva.* El riesgo ambulatorio típico es el cierre por evidencia caducada: "tiene exámenes normales" es un hecho cuya fecha lo vuelve casi irrelevante. La herramienta central de la atención primaria —el tiempo longitudinal— sólo funciona como prueba si tiene control programado y red de seguridad; sin ellos, es una espera que confía en la suerte.

### Viñeta 7. Pronóstico incierto al final de la vida

Hombre de 78 años con cáncer de páncreas metastásico, en tercera línea de tratamiento, ingresa por deterioro funcional rápido y una neumonía. La familia pregunta cuánto tiempo queda; una hija pide "que se haga todo"; el equipo de oncología sugiere que "podría haber una ventana para otra línea". El paciente, lúcido a ratos, dice que está cansado.

*Hechos:* enfermedad oncológica avanzada en progresión bajo tratamiento (documentado); deterioro funcional acelerado en semanas (trayectoria observada por la familia y objetivable); infección aguda potencialmente reversible; voluntad expresada por el paciente en momentos de lucidez, consistente en dos conversaciones separadas.

*Inferencia:* la neumonía es tratable; la trayectoria de fondo es de final de vida próximo. Pronóstico en semanas a pocos meses: probable, con imprecisión irreductible en el caso individual. "Podría responder a otra línea" es una posibilidad no cuantificada, no una expectativa fundada en la evolución observada.

*Incertidumbre:* el plazo exacto es incognoscible; lo comunicable es la dirección de la trayectoria y los escenarios. La incertidumbre que domina no es pronóstica sino de metas: ¿qué quiere este hombre para el tiempo que queda? Esa no se resuelve con exámenes sino con conversación.

*Decisión:* tratar la neumonía con objetivo de confort y posible retorno a casa (intervención reversible, proporcionada); pausar la discusión de nueva línea hasta ver respuesta funcional; conversación estructurada de metas con paciente y familia: qué sabemos (la enfermedad progresa), qué creemos (el tiempo se mide probablemente en semanas a meses), qué no sabemos (el plazo exacto; si esta infección marcará un descenso definitivo), qué proponemos (priorizar lo que él declaró importante). Criterio de reevaluación: respuesta funcional a 72 horas.

*Frase medular:* "Neumonía potencialmente reversible sobre cáncer avanzado en progresión con deterioro funcional acelerado: se trata la parte reversible con metas de confort, se comunica la trayectoria sin fingir precisión de plazo, y las decisiones mayores se subordinan a las metas del paciente, no a la disponibilidad de otra línea."

*Lectura metacognitiva.* El final de la vida concentra todos los temas del libro: la tentación de responder "¿cuánto queda?" con una cifra falsa (certeza retórica), la de esconderse en "no se puede saber" (abandono), y la confusión entre lo técnicamente posible y lo indicado. Comunicar dirección y escenarios en vez de plazos, y anclar la decisión en las metas del enfermo, es la forma que toma aquí la incertidumbre bien gobernada.

### Viñeta 8. Anatomía de un error consumado

Esta viñeta analiza un error completo, con la disciplina del capítulo 8: sin usar nombres de sesgos y sin dejar que el desenlace conocido juzgue lo que era razonable saber en cada momento.

*El caso.* Mujer de 82 años, traída de su casa por "compromiso del estado general". Nota de ingreso nocturno: "ITU en anciana, frecuente en ella según hija; orina de mal olor. Se inicia ceftriaxona". Día 2: "afebril, sigue decaída, ITU en tratamiento". Día 3: "evolución lenta, propia de la edad". Noche del día 3: hipotensión, abdomen agudo; laparotomía: colecistitis gangrenosa. Sobrevive tras UCI prolongada.

*Reconstrucción por capas.* **Hechos disponibles el día 1:** compromiso general inespecífico (relato); "ITU frecuente" (dato heredado de la hija, nunca verificado en registros); orina de mal olor (observación de baja especificidad); sin fiebre documentada; abdomen "blando" en un examen nocturno no dirigido; sin laboratorio hepático solicitado. **Inferencia del día 1:** "ITU" —formulada como hecho, no como hipótesis; fuerza real: posible, apoyada sobre todo en la frecuencia de la etiqueta en ancianas y en el dato heredado. **Incertidumbre nunca escrita:** ¿qué explica el compromiso general si la orina no lo explica? (una anciana decaída "por ITU" sin fiebre ni sepsis urinaria es una historia que se cuenta mejor de lo que se sostiene). **Decisión del día 1:** antibiótico razonable como apuesta empírica; el error no fue tratarla, fue tratarla *sin criterio de reapertura*: ninguna nota decía qué evolución obligaría a reexaminar.

*Dónde estuvo la oportunidad.* El día 2, "afebril pero sigue decaída" era una discordancia informativa: el tratamiento correcto de la hipótesis correcta debía producir mejoría del estado general, no sólo apirexia. La reinterpretación ("evolución lenta, propia de la edad") inmunizó la hipótesis justo cuando la evolución la estaba degradando. Un examen abdominal dirigido, un perfil hepático o la simple pregunta de pase de visita —"¿qué no explica la ITU?"— tenían, ese día, su máximo valor. El día 3 la pregunta ya era innecesaria: el abdomen la respondió solo.

*Lo que no debe concluirse.* El desenlace no demuestra que el equipo fuera incompetente, ni que toda "ITU en anciana" esconda una colecistitis. Con la información del día 1, la ITU era una apuesta empírica defendible. Lo indefendible era la arquitectura: un dato heredado con autoridad de hecho, una etiqueta que absorbió el caso, ninguna incertidumbre registrada, ninguna condición de reapertura. El mismo proceso, con desenlace benigno (una ITU real que respondía), habría dejado la misma vulnerabilidad instalada para la próxima paciente.

*Frase medular (la que faltó el día 1):* "Compromiso del estado general no explicado en mujer de 82 años; bacteriuria posible como causa, no demostrada —tratamiento empírico iniciado. El decaimiento no tiene aún explicación suficiente: reexaminar abdomen y ampliar estudio si no hay mejoría global en 48 horas."

*Lectura metacognitiva.* Nótese que la frase que faltó no requería más conocimiento médico, más tiempo ni más exámenes esa noche. Requería una disciplina de escritura: separar el hecho (decaimiento no explicado) de la inferencia (bacteriuria posible), conservar la incertidumbre (explicación insuficiente) y programar la revisión (48 horas, criterio global). Es la demostración más dura de la tesis de este libro: la epistemología de una frase puede ser la diferencia entre un susto y una laparotomía de madrugada.

### Lo común a las ocho viñetas

En cada caso, la buena formulación evita dos extremos: describir sin interpretar o interpretar como si se hubiera observado directamente. El hecho guía la hipótesis; la incertidumbre modula su fuerza; la consecuencia define la decisión; la evolución conserva el derecho a corregir. Y en todas —de la urgencia de las 3:00 al final de la vida— la decisión termina con la misma cláusula: qué la haría cambiar, quién lo detectará y cuándo.

## Capítulo 16. Enseñar y organizar la metacognición clínica

Una jefa de servicio que quiera "instalar metacognición" en su equipo no puede indicarla como se indica un antibiótico. Puede, en cambio, cambiar tres cosas que ve todas las semanas: qué se pregunta en la ronda, qué estructura tiene la ficha y qué pasa después de un error. Este capítulo trata de esas palancas.

### De la virtud individual al diseño institucional

La metacognición suele presentarse como una habilidad personal: el médico debe ser humilde, reflexivo y consciente de sus sesgos. Esa expectativa es insuficiente si el sistema oculta resultados, interrumpe el trabajo, fragmenta información y castiga la duda. La lucidez necesita infraestructura.

La National Academies recomendó educación diagnóstica, trabajo en equipo, tecnologías que apoyen el proceso y mecanismos de feedback y aprendizaje (National Academies of Sciences, Engineering, and Medicine, 2015). Una institución metacognitiva no sólo registra errores; hace visible cómo se piensa y crea momentos para revisar.

### Enseñar representaciones, no sólo respuestas

En formación, pedir "el diagnóstico" prematuramente favorece la adivinación. Es más útil solicitar primero una representación del problema y preguntar qué datos fueron transformados en calificadores. Bowen y Eva han destacado la enseñanza explícita del razonamiento, mientras la teoría de illness scripts explica por qué el conocimiento debe organizarse alrededor de condiciones, mecanismos y consecuencias (Eva, 2005; Bowen, 2006).

El docente puede pedir al aprendiz que marque cada frase como hecho, inferencia o incertidumbre. Luego puede comparar la versión inicial con una formulación experta, no para imponer estilo, sino para mostrar qué relaciones fueron seleccionadas. El feedback debe ser específico: "presentaste la bacteriuria como infección", "omitiste que la imagen sólo excluye complicación actual", "tu plan no indica qué te haría cambiar".

### Un debate honesto: ¿se puede enseñar a pensar mejor?

Este libro toma posición en una controversia real de la educación médica, y conviene declararla. De un lado, Croskerry y su tradición sostienen que conocer los sesgos y entrenar estrategias de debiasing mejora el diagnóstico (Croskerry, 2003; Croskerry et al., 2013a, 2013b). Del otro, Norman, Monteiro y colegas han acumulado evidencia incómoda: la mayoría de los errores diagnósticos se asocia a déficits de conocimiento más que a fallas puras de proceso, los cursos de "pensamiento crítico" generalizable transfieren poco, y obligar a reflexionar sistemáticamente sobre casos fáciles no mejora la precisión y consume tiempo (Norman et al., 2017; Monteiro & Norman, 2013; Monteiro et al., 2020).

La posición de este libro es intermedia, pero no equidistante. Con los escépticos: no existe una habilidad general de "pensar bien" que flote por encima del conocimiento; la representación rica del problema —illness scripts, experiencia con feedback— es la condición de todo lo demás, y ningún método, HII-D incluido, compensa no saber medicina. Contra el escepticismo total: de esa evidencia no se sigue que la única intervención posible sea enseñar más contenido. Lo que este libro propone no es vigilancia interna permanente ni listas universales —las versiones que la evidencia ha desinflado—, sino artefactos externos y selectivos: un lenguaje que obliga a graduar afirmaciones, una estructura de nota que conserva las capas, pausas activadas por disparadores definidos y circuitos de feedback que conviertan experiencia en calibración. Es una apuesta con compromisos observables (véase el capítulo 15): si estas herramientas no cambian conductas medibles, deben abandonarse como cualquier hipótesis mimada. Entre tanto, la controversia se enseña mejor de lo que se oculta: un residente que conoce el debate sabrá desconfiar por igual del catálogo de sesgos como solución universal y del nihilismo pedagógico como coartada.

### Rondas y pases de turno

Una ronda puede incorporar una pausa breve en casos seleccionados:

- ¿cuál es la pregunta operativa de hoy?;
- ¿qué hecho nuevo cambió la representación?;
- ¿qué inferencia estamos tratando como si fuera dato?;
- ¿qué incertidumbre podría producir mayor daño?;
- ¿quién verificará el resultado pendiente?

El pase de turno debe transmitir tareas epistémicas, no sólo tratamientos. "Pendiente observar si…" y "si ocurre X, reabrir Y" son componentes de seguridad.

### Conferencias de aprendizaje

La morbimortalidad tradicional puede centrarse en quién se equivocó o en una secuencia factual sin análisis cognitivo. Una revisión más útil reconstruye la evolución de la representación: qué se pensó en cada punto, qué señales estaban disponibles, qué información faltó, qué condiciones favorecieron la inercia y qué barrera podría permitir corrección futura. La viñeta 8 del cuaderno de casos es un ejemplo del formato: capas, oportunidades y barreras, sin moralismo retrospectivo.

Debe evitarse el hindsight bias. El desenlace no convierte automáticamente en obvia una alternativa que tenía baja probabilidad inicial. El aprendizaje surge al identificar oportunidades razonables de actualización, no al exigir omnisciencia retrospectiva.

### Feedback diagnóstico

Los médicos necesitan saber qué ocurrió con pacientes derivados, dados de alta o transferidos. Sistemas simples pueden devolver diagnósticos finales, resultados discrepantes, reconsultas y cambios terapéuticos. La calibración requiere series, no recuerdos aislados.

Un portafolio privado puede registrar: hipótesis principal, confianza aproximada, alternativa relevante, desenlace y aprendizaje. No busca puntuar moralmente; busca detectar patrones: exceso de confianza en un dominio, subestimación de recurrencias, tendencia a tratar cultivos sin síndrome o dificultad para reconocer diagnósticos funcionales. El Taller 5 de este libro es su versión mínima.

### Lenguaje institucional

Las plantillas de ficha pueden apoyar o degradar el pensamiento. Campos obligatorios interminables producen copia; campos demasiado libres ocultan información crítica. Una plantilla equilibrada incluye problema, hechos nuevos, evaluación con grado de certeza, plan y criterios de reevaluación. La tecnología debería facilitar comparación temporal y procedencia de datos, no sólo acumular texto.

La cultura importa. Un residente debe poder decir "no entiendo este dato" sin perder legitimidad; una enfermera debe poder señalar que la evolución no coincide con el diagnóstico; un especialista debe explicitar límites; un jefe debe corregirse en público. La revisabilidad se aprende por modelamiento.

### Evaluar el razonamiento, no sólo la respuesta

La educación clínica suele premiar el diagnóstico correcto, aunque haya sido obtenido por un proceso frágil, y castigar el diagnóstico incorrecto incluso cuando la incertidumbre estaba bien calibrada. Este patrón enseña a ocultar dudas y reconstruir narrativas retrospectivas. Una evaluación metacognitiva debe observar también representación del problema, calidad de alternativas, uso de evidencia contradictoria, confianza y plan de revisión.

Los docentes pueden pedir al aprendiz que marque cada afirmación como hecho, inferencia o incertidumbre; que identifique el dato de mayor peso; que señale qué cambio modificaría la conducta; y que estime su confianza antes de conocer la respuesta. El objetivo no es ralentizar todas las decisiones, sino construir un repertorio de pausas transferibles a casos reales.

Las instituciones aprenden cuando conservan no sólo resultados, sino trayectorias de decisión. Auditorías, reuniones clínicas y sistemas de reporte deberían reconstruir qué información estaba disponible en cada momento y cómo circuló. Esa memoria protege contra el sesgo retrospectivo y permite transformar errores en cambios concretos de representación, coordinación o umbral.

### Una competencia profesional

La metacognición no reemplaza conocimiento, técnica ni ética. Los coordina. Puede enseñarse mediante casos contrastados, reflexión estructurada, práctica deliberada y feedback, pero no como asignatura aislada de la clínica (Sandars, 2009; Schmidt & Mamede, 2015).

> Una organización clínica aprende cuando convierte las discrepancias entre lo pensado y lo ocurrido en información accesible, no en culpa silenciosa ni en relato retrospectivo perfecto.

La medicina del futuro necesitará profesionales capaces de trabajar con información creciente, equipos complejos e inteligencia artificial. La competencia decisiva no será sólo producir más respuestas, sino reconocer qué tipo de respuesta se está produciendo y qué evidencia le da derecho a orientar una acción.

Enseñar metacognición es enseñar una relación con el conocimiento: suficiente confianza para actuar, suficiente humildad para revisar y suficiente precisión para explicar por qué.

**En una frase.** La metacognición clínica se enseña con representaciones y feedback, y se organiza con rondas, fichas y revisiones diseñadas para hacer visible el pensamiento — no se decreta.

**Tres preguntas para la próxima visita.**
1. La última vez que enseñé un caso, ¿pedí el diagnóstico o pedí primero la representación del problema?
2. ¿Qué pasó con el último paciente que derivé o di de alta con diagnóstico incierto — y cómo podría enterarme sistemáticamente?
3. Si mañana dirigiera mi servicio, ¿cuál de las tres palancas (ronda, ficha, revisión de errores) cambiaría primero, y qué costaría?
