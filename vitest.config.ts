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
      thresholds: {
        lines: 77,
        functions: 72,
        branches: 63,
        statements: 74,
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
