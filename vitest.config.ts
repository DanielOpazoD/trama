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
      thresholds: {
        lines: 77,
        functions: 72,
        branches: 63,
        statements: 74,
      },
    },
  },
})
