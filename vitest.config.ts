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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'netlify/**/*.test.ts'],
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
      ],
      // N8: thresholds calibrados al baseline medido. El objetivo NO es
      // alcanzar 100% — es detectar REGRESIONES: si alguien mergea código
      // sin cubrir y el % global baja, el CI grita.
      //
      // H1: baseline global medido tras cubrir smokes críticos de auth,
      // export/import parcial, Momentos media y cost-cap LLM:
      // statements/lines 79.89%, functions 70.47%, branches 75.12%.
      // Dejamos el piso bajo el decimal medido para que bloquee regresiones
      // reales sin volver flaky el CI por pequeñas variaciones de V8.
      //
      // Si subiste el piso porque agregaste tests, actualizá estos
      // números acá explícitamente — el threshold es una decisión
      // consciente, no un "que pase CI".
      thresholds: {
        lines: 79,
        functions: 70,
        branches: 75,
        statements: 79,
      },
    },
  },
})
