---
name: bucle-de-evidencia
description: >-
  Cómo decidir la arquitectura de un trabajo y cómo saber que lo hecho es
  verdad, no sólo verde. Seis preguntas antes de empezar, un presupuesto
  declarado, el bucle ratchet (mutar → evaluar → revertir SIEMPRE), la regla
  anti-métrica-inflada y el catálogo de verdes falsos que ya se han cobrado
  tiempo en este repo. Úsalo ANTES de empezar cualquier trabajo con varias
  piezas, y SIEMPRE que estés a punto de afirmar que algo funciona, mide X o
  quedó cubierto. Complementa a `pack-workflow`: aquélla dice cómo se ENTREGA
  un pack; ésta, cómo se DECIDE y cómo se VERIFICA.
---

# El bucle de evidencia

`pack-workflow` es el proceso: rama, gates, plan doc, PR, CI. Esta skill es lo
otro: **cómo elegir la forma del trabajo** y **cómo distinguir «pasa» de «es
verdad»**.

Todo lo que sigue tiene detrás un fallo real de este repositorio. No es teoría.

---

## 1. Las seis preguntas, antes de escribir código

Contéstalas en voz alta al abordar cualquier trabajo con más de una pieza. La
primera manda sobre las demás.

1. **¿Se puede verificar el éxito?** Si no hay una comprobación, una medición o
   una decisión humana que distinga «hecho» de «no hecho», **no empieces con
   autonomía**. Define primero el criterio.
2. **¿Los pasos son estables?** Si sí, una cadena fija. Si no, hace falta
   planificar sobre la marcha.
3. **¿Las subtareas son independientes?** Sólo entonces paralelizar. Si
   comparten estado, explicita la dependencia y limita las escrituras.
4. **¿Hay alternativas que deban seguir vivas?** Entonces no fuerces todo a una
   sola rama.
5. **¿Los hechos tienen que sobrevivir a la sesión?** Si sí, persístelos en un
   artefacto (plan doc, ADR, test), no en el hilo de la conversación.
6. **¿Cuánto se puede gastar?** Ver el punto 2.

**Corolario que cuesta dinero:** una respuesta a la 1 del tipo «lo veré cuando
lo vea» produce trabajo que parece terminado. En este repo eso ya salió como
dos capturas falsas en verde.

---

## 2. El presupuesto se declara antes, no después

Antes de empezar, di en voz alta el techo: **cuántas mediciones, cuánto reloj,
cuántas pasadas de suite**. Y cuando se agote:

> Devuelve el mejor artefacto que tengas, lo que quedó sin resolver y **el
> motivo de parar**. No escondas un resultado parcial detrás de un resumen
> fluido.

**Por qué existe esta regla aquí:** en una sola sesión se ejecutaron doce
corridas de `test:coverage` a ~7 minutos cada una — unos 84 minutos de reloj
sólo en medir. Varias eran evitables agrupando cambios antes de medir. Un techo
declarado («mido dos veces: una para elegir objetivo y otra para fijar
umbrales») habría ahorrado más de media hora.

**Regla práctica de este repo:** agrupa los cambios y mide **al final de cada
bloque**, no después de cada fichero.

---

## 3. El bucle ratchet: mutar → evaluar → **revertir siempre**

La verificación por mutación de este repo es un bucle ratchet. Su forma:

```
para cada invariante que afirmes:
    romper el código donde el fallo OCURRIRÍA   (no donde el test mira)
    correr sólo los tests afectados
    si NO falla ninguno  → la sonda no mide; arréglala
    si falla el suyo     → la sonda vale
    revertir SIEMPRE, pase lo que pase
```

Las cuatro condiciones que lo hacen fiable —y que hay que comprobar antes de
usarlo— son: **la salida es verificable**, **la acción es reversible**, **el
horizonte es corto** y **el entorno está acotado**. Si alguna falla, el bucle
no es aplicable y hay que verificar de otra forma.

### Tres reglas que ya se pagaron

**a) Muta donde el fallo ocurriría, no donde la aserción mira.** Romper la
clase que el test lee, en vez de la regla CSS, deja el test en verde y da una
falsa tranquilidad.

**b) Un mutante que no se inyecta no prueba nada.** Si buscas un símbolo que no
existe, el fichero no cambia y el verde es vacío. Comprueba que la mutación
**entró** antes de leer el resultado.

**c) Incluye un mutante que NO deba fallar.** Prueba que la sonda mide en vez de
limitarse a alarmar. Y si ese control tampoco falla cuando debería, has
encontrado un hueco de cobertura real, no una sonda mala.

---

## 4. La métrica sólo mejora lo que puede ver

> Un ratchet mejora la métrica que ve. Puede bajar la pérdida y subir el coste.

**Traducción a este repo:** la cobertura es un detector de regresiones, no un
objetivo. De ahí salen dos prohibiciones:

- **No persigas líneas inalcanzables.** Si el código dice «esto satisface a TS,
  el bucle siempre retorna antes», escribir un test para esa línea sube el
  porcentaje y no verifica nada. Déjala y **dilo en el PR**.
- **No subas el umbral global por cosmética.** Si el logro está concentrado en
  un fichero, ancla un **piso propio** ahí. Un fichero de 400 líneas sobre
  102.000 puede desplomarse sin mover la media: por eso el piso por fichero
  protege y el global no.

Cuando fijes un umbral, **cópialo de una medición real** y deja los números en
el comentario. El propio `vitest.config.ts` lo exige: *«el threshold es una
decisión consciente, no un "que pase CI"»*.

---

## 5. Catálogo de verdes falsos de este repositorio

Cada uno ocurrió. Cuando algo pase, pregúntate cuál de estos es.

| Verde falso | Cómo se detecta |
| --- | --- |
| **La sonda pasa por trivialidad** — el test no ejercita la condición que dice fijar | Mutación: rómpelo y mira si cae |
| **El artefacto es falso** — `3 passed` sobre una captura de la pantalla de carga | **Abre el artefacto**. Nunca fíes de tu propio resumen |
| **La espera es mentirosa** — esperas un `settled` que sólo significa «visible» | Comprueba qué publica esa señal, no cómo se llama |
| **La revisión no ocurrió** — CodeRabbit responde «Review rate limited» | Léelo: es un verde sin revisar. Pídela otra vez |
| **El rojo es tuyo** — suites solapadas compitiendo por CPU | Reejecuta **en aislamiento** antes de diagnosticar |
| **El verde es viejo** — CI pasó antes del rebase | Revalida la **combinación**, no la rama |

**La regla que los cubre a todos:** cuando tú produces el artefacto *y* el
criterio de aceptación, el sesgo es sistemático. Verifica sobre el artefacto
crudo — el PNG, el DOM medido, la salida del gate—, nunca sobre tu narración de
él.

---

## 6. Fragmentar tiene un coste

Repartir un trabajo entre varios lectores en paralelo **crea errores
correlacionados**, y una segunda ronda de verificación sólo ayuda si esos
verificadores tienen otro prompt, otras pruebas u otro papel.

**Dato de este repo:** un barrido de siete lectores dio doce hallazgos, de los
cuales **dos eran falsas alarmas** que sólo se cayeron al releer el código. La
regla que salió de ahí:

> El orquestador no fusiona hallazgos: los **falsa**. Ninguno entra sin releer
> el fichero.

Y hay trabajo que **empeora** al partirse: diseño de arquitectura, una decisión
de producto sutil, un refactor muy acoplado. Ahí un solo contexto coherente
gana.

---

## Lo que este repo NO necesita

Del material sobre ingeniería de grafos, esto queda **descartado a propósito**,
con su propio criterio:

- **Un grafo de conocimiento de claims y fuentes.** Su propia guía dice cuándo
  no hace falta: tareas independientes, sin estado entre sesiones, relaciones
  fijas y simples, una tabla relacional contesta todas las consultas. Es el
  caso de Trama.
- **Un DAG de commits tipo AgentHub.** Git ya es ese DAG, y este repo mergea con
  squash **a propósito**: una historia lineal legible vale más aquí que un
  frontier de ramas vivas.
- **Enjambres de cientos de agentes.** El cuello de botella de este proyecto no
  es la capacidad de generar cambios; es verificarlos.

Introducir cualquiera de esas tres aquí sería añadir maquinaria sin un
problema que la pida — lo contrario de lo que este repo viene haciendo.

---

## Referencia

Destilado de *Graph Engineering — The Karpathy Loop, Improved 1000x by Itself:
The Anthropic Playbook* (síntesis independiente, julio 2026), quedándose sólo
con lo que tiene evidencia de aplicar a **este** repositorio. La frase que
resume el objetivo:

> Todo resultado importante debe poder rastrearse hasta un objetivo, un plan, un
> artefacto, una fuente, una decisión de evaluación y un registro acotado de
> ejecución.
