import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para los tests E2E críticos.
 *
 * Estrategia: spin up `vite dev` (frontend only), interceptar TODAS las
 * llamadas a /api/* con mocks dentro de cada test. No usamos `netlify
 * dev` porque eso requiere Neon vivo + functions runtime — costoso para
 * CI y frágil ante cambios infra.
 *
 * Para verificar manualmente con backend real, correr `netlify dev` en
 * paralelo y apuntar baseURL a su puerto. Ese flujo es manual, no CI.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: '',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
