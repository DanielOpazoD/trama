import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    // happy-dom for component tests; node-only tests still work since DOM-less APIs
    // don't depend on the environment.
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'netlify/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'netlify/functions/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
        'src/main.tsx',
        'src/types.ts',
        'src/test-setup.ts',
      ],
    },
  },
})
