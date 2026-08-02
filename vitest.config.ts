import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    // Activa el fallback legacy para que los unit tests no necesiten token
    // Clerk real. En producción esta var no está seteada (enforcement real).
    env: { ALLOW_LEGACY_FALLBACK: 'true' },
    // happy-dom for component tests; node-only tests still work since DOM-less APIs
    // don't depend on the environment.
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'netlify/**/*.test.ts',
      'scripts/**/*.test.mjs',
      // Extensión de Chrome (JS plano): extractores puros + lógica de cola.
      'extension/**/*.test.js',
    ],
    coverage: {
      provider: 'v8',
      // N8: lcov para tooling externo (codecov, sonar) si en algún momento
      // los enchufamos; text para output legible en local; html para que
      // `open coverage/index.html` muestre los archivos sin cobertura.
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'netlify/functions/**/*.{ts,mts}'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
        'src/main.tsx',
        'src/types.ts',
        'src/test-setup.ts',
        // index files que solo re-exportan no aportan al coverage real.
        'src/state/index.ts',
        'src/types/index.ts',
        // Utilidades 100% browser-API (createImageBitmap/canvas/jsPDF/Blob
        // download): no se pueden ejercitar en node/happy-dom (loadImage cuelga,
        // canvas/toBlob no existen). Se verifican en el navegador; el componente
        // que las usa las mockea. Medirlas acá solo daría 0% engañoso.
        'src/lib/imageCompression.ts',
        'src/lib/photoExport.ts',
        // Editor de imágenes: la matemática pura (transforms.ts) SÍ se testea;
        // el resto es canvas/createImageBitmap/createRoot/Pointer Events
        // (browser-only, verificado en navegador).
        'src/lib/imageEditor/raster.ts',
        'src/lib/imageEditor/mount.tsx',
        'src/lib/imageEditor/index.ts',
        'src/components/imageEditor/**',
        // Editor de PDF: el modelo puro (`pdfStudio/model.ts`) SÍ se testea; el
        // render (pdf.js: DOMMatrix/canvas/Worker), el ensamblado (pdf-lib +
        // canvas), la descarga (anchor/object URL) y la UI (file input/DnD) son
        // browser-only — verificados en el navegador y mockeados en los tests.
        // (2026-06-08) La reorganización por subcarpetas movió estos archivos
        // browser-only; las rutas del exclude se actualizan para que sigan fuera
        // del coverage (si no, vuelven a contar como 0% y hunden el umbral).
        'src/lib/pdfStudio/render/pdfRender.ts',
        'src/lib/pdfStudio/assemble/assemble.ts',
        'src/lib/pdfStudio/render/persistence.ts',
        'src/lib/pdfStudio/export/printPdf.ts',
        'src/lib/downloadBlob.ts',
        'src/components/notas/pdfStudio/**',
      ],
      // N8: thresholds calibrados al baseline medido. El objetivo NO es
      // alcanzar 100% — es detectar REGRESIONES: si alguien mergea código
      // sin cubrir y el % global baja, el CI grita.
      //
      // 2026-06-04: baseline recalibrado después de subir a Vitest 4 + Vite 7.
      // V8 cambió la instrumentación efectiva (especialmente branches/statements),
      // así que el piso queda bajo el nuevo decimal medido:
      // 2026-06-04 follow-up: al cubrir el endpoint de prompts el baseline
      // subió a statements 74.45%, lines 77.11%, functions 72.30%,
      // branches 63.70%.
      // El bloque Notas quedó reforzado con tests de deep link, filtros,
      // métricas, navegación y mutaciones; este umbral refleja el instrumento
      // nuevo, no una reducción deliberada de cobertura funcional.
      //
      // Si subiste el piso porque agregaste tests, actualizá estos
      // números acá explícitamente — el threshold es una decisión
      // consciente, no un "que pase CI".
      //
      // 2026-07-27: además del piso global, tres archivos llevan piso propio.
      // El umbral global es una media: un archivo donde un fallo silencioso
      // cuesta mucho (quién sos, cuánto podés gastar, qué filas podés ver)
      // puede desplomarse sin mover la aguja del total. Los números salen de
      // una corrida real (`npm run test:coverage`) y se dejan un par de puntos
      // por debajo de lo medido para absorber el jitter de v8:
      //   _lib/auth.ts      82.71 / 70.31 / 87.5 / 87.5
      //   _lib/cost-cap.ts  94.11 / 92.85 /  100 /  100
      //   _lib/user-rls.ts  93.87 / 78.57 /  100 / 95.45
      // Ojo: Vitest saca del cómputo global a los archivos con umbral propio.
      //
      // 2026-07-31: cubiertos `llm/retry.ts` y `llm/transcription.ts`, que
      // estaban SIN un solo test. Medido tras esos tests:
      //   statements 77.76 · branches 68.71 · functions 76.65 · lines 80.10
      // Los pisos quedan ~2 puntos por debajo, como el resto: margen para el
      // jitter de v8, no un objetivo. Branches sube de 63 a 66 — el salto
      // viene de que `transcription.ts` estaba en 0/0/0 y `retry.ts` tenía
      // ocho ramas sin tocar.
      thresholds: {
        lines: 78,
        functions: 74,
        branches: 66,
        statements: 75,
        '**/netlify/functions/_lib/auth.ts': {
          statements: 80,
          branches: 68,
          functions: 85,
          lines: 85,
        },
        '**/netlify/functions/_lib/cost-cap.ts': {
          statements: 90,
          branches: 88,
          functions: 95,
          lines: 95,
        },
        // Los dos módulos que deciden GASTO. Un desplome aquí no movería la
        // aguja del total (124 líneas sobre ~102.000), que es justo el motivo
        // por el que llevan piso propio: `retry.ts` decide cuántas veces se
        // factura una llamada, y `transcription.ts` estima lo que el tope
        // mensual descuenta por cada nota de voz. Ambos medidos al 100%; el
        // piso queda en 95 para absorber jitter.
        // 2026-07-31 · la capa que decide si se PAGA o se sirve de caché, y
        // la que traduce tokens a dinero. Medido tras cubrirlas:
        //   cache.ts     100 / 90    / 100 / 100   (era 76,19 / 60)
        //   config.ts    100 / 92,06 / 100 / 100   (era 72,54 / 61,9)
        //   db-cache.ts  100 / 100   / 100 / 100   (era 51,85 / 40)
        // Piso propio por lo de siempre: son pocas líneas sobre ~102.000 y
        // podrían desplomarse sin mover el total.
        '**/netlify/functions/_lib/llm/cache.ts': {
          statements: 95,
          branches: 85,
          functions: 95,
          lines: 95,
        },
        '**/netlify/functions/_lib/llm/config.ts': {
          statements: 95,
          branches: 88,
          functions: 95,
          lines: 95,
        },
        '**/netlify/functions/_lib/llm/db-cache.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        // Los proveedores. `gemini.ts` tiene rarezas de protocolo (clave en la
        // URL, system aparte, rol assistant→model) y `openai-compatible.ts`
        // decide desde el NOMBRE del modelo si manda `max_tokens` o
        // `max_completion_tokens`: equivocarse falla el 100 % de las llamadas
        // a la familia gpt-5/o. Medido: 96,15 y 76,19 de ramas (eran 46 y 50).
        '**/netlify/functions/_lib/llm/providers/gemini.ts': {
          statements: 92,
          branches: 92,
          functions: 95,
          lines: 95,
        },
        '**/netlify/functions/_lib/llm/providers/openai-compatible.ts': {
          statements: 85,
          branches: 72,
          functions: 95,
          lines: 85,
        },
        '**/netlify/functions/_lib/llm/retry.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        '**/netlify/functions/_lib/llm/transcription.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        '**/netlify/functions/_lib/user-rls.ts': {
          statements: 90,
          branches: 75,
          functions: 95,
          lines: 92,
        },
        // 2026-07-27: los dos OAuth entran al grupo con piso propio. Venían de
        // 30.43% (spotify) y 2.17% (x): el flujo entero de identidad de X
        // corría sin una sola aserción. Medido tras cubrirlos:
        //   spotify/auth.ts  76.08 / 77.77 /   75 / 76.74
        //   x/auth.ts        71.73 / 63.63 /   75 / 72.50
        // Un fallo aquí no da error visible — el sync deja de traer nada y la
        // app sigue diciendo "conectado", así que el piso importa más que el
        // promedio global.
        '**/netlify/functions/_lib/spotify/auth.ts': {
          statements: 72,
          branches: 72,
          functions: 70,
          lines: 72,
        },
        '**/netlify/functions/_lib/x/auth.ts': {
          statements: 68,
          branches: 58,
          functions: 70,
          lines: 68,
        },
      },
    },
  },
})
