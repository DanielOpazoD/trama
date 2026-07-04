# Login «El telar» — rediseño de la pantalla de inicio de sesión

## Problema

El login era un póster centrado: logo con caja blanca pegada, tarjeta de
Clerk con doble marco translúcido desalineado, la mascota flotando sin
ancla y mucho vacío. Correcto, pero ni moderno ni memorable.

## Concepto

**«El telar»**: split-screen. La izquierda es un panel de TINTA donde la
trama vive — los hilos del canvas (`LoginThreadField`, ahora con paleta de
papel sobre tinta y curvas acento más presentes) se tejen detrás de la
marca; una frase serif del telar rota por día; tres pilares de confianza
con viñeta dorada (privado por diseño · tus datos son solo tuyos · sin
anuncios, sin rastreo); la mascota asoma en su sello en la esquina. La
derecha es PAPEL limpio: saludo por hora en eyebrow («buenas noches»),
título serif según el modo («Retoma el hilo.» / «Empieza tu trama.»), UNA
sola tarjeta de entrada, «explorar sin cuenta» discreto y una línea de
privacidad honesta con candado.

## Decisiones

- La marca (favicon) se presenta como app-icon (esquinas redondeadas +
  anillo sutil) sobre la tinta: su fondo claro propio deja de ser una caja
  pegada y pasa a ser intencional.
- **Una sola tarjeta**: `clerkAppearance` deja `card` y `cardBox` desnudos
  (sin borde/fondo/sombra) y el marco lo pone `.trama-login-panel::before`
  — se acabó el doble vidrio desalineado.
- **Copy honesto**: «Privado por diseño: tu contenido es solo tuyo» — nada
  de «ni siquiera nosotros» (solo Claves es E2E).
- Móvil (<860px): apilado — el telar como franja superior (~17rem) con la
  cita; los pilares se ocultan; el formulario debajo.
- `prefers-reduced-motion` apaga entradas y anima el canvas estático.
- Contrato de tests intacto: testids (`login-brand-mark`, wordmark, mascot
  seal, thread-field), clases (`trama-login-wordmark`,
  `trama-mascot--loginAwake`), «tu archivo vivo» y «explorar sin cuenta».

## Validación

- Suite completa 4958 pass (los 7 de AuthGate sin tocar), lint, format,
  gates (design-tokens, focus-ring, icon-button, knip, ratchets), build.
- Navegador: verificado el split de escritorio (1440px) y el apilado
  angosto; el saludo por hora y la cita del día renderizan; una sola
  tarjeta (la franja «Development mode» es solo del entorno dev de Clerk).
