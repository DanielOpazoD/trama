import { defineConfig, devices } from '@playwright/test'

/**
 * Humo contra el BUILD de producción (`vite preview` sobre `dist/`), no contra
 * el dev server. La suite e2e normal corre sobre Vite en desarrollo, donde
 * los módulos no se trocean: un ciclo entre chunks del build (lo que dejó
 * producción en blanco con el CI en verde) no se puede ver ahí. Esto sí lo ve:
 * arranca el bundle real en un navegador real y exige que monte sin errores.
 *
 * Requiere `npm run build` antes. `npm run e2e:preview`.
 */
export default defineConfig({
  testDir: './e2e-preview',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node_modules/.bin/vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
