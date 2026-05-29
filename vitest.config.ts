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
      ],
      // N8: thresholds calibrados al baseline medido. El objetivo NO es
      // alcanzar 100% — es detectar REGRESIONES: si alguien mergea código
      // sin cubrir y el % global baja, el CI grita.
      //
      // C1: al sumar los handlers `.mts` al `include` (antes solo medíamos
      // los `_lib/*.ts`), el denominador creció con un montón de código de
      // endpoint que los unit tests no ejercitan — el baseline honesto bajó.
      // Medido global con `.mts` incluidos: lines/statements 39.99%,
      // functions 56.53%, branches 72.53%. Recalibramos hacia abajo con
      // ~1 punto de colchón bajo el piso medido para absorber la varianza
      // run-to-run sin volver flaky el CI. Esto NO es una regresión de
      // tests — es honestidad: ahora el % refleja TODO el backend, no solo
      // las libs. Bajamos desde 47/58/73/47 (que medían un subconjunto).
      //
      // Si subiste el piso porque agregaste tests, actualizá estos
      // números acá explícitamente — el threshold es una decisión
      // consciente, no un "que pase CI".
      thresholds: {
        lines: 39,
        functions: 55,
        branches: 71,
        statements: 39,
      },
    },
  },
})
