import { defineConfig, devices } from '@playwright/test'
import { shouldReusePlaywrightServer } from './src/lib/playwrightServerReuse'

// Playwright forces color in worker output; the user's shell may export
// NO_COLOR globally. Node warns when both are present, so keep E2E logs clean
// by letting Playwright own color handling inside this process only.
delete process.env.NO_COLOR

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
  // La app E2E comparte un Vite dev server y mocks por test. En paralelo,
  // el arranque local puede agotar el evento de carga y producir timeouts
  // falsos en page.goto('/'). CI ya era serial; local debe serlo también.
  workers: 1,
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
      // .env.local puede traer Clerk real; E2E usa backend mockeado.
      VITE_TRAMA_E2E_BYPASS_CLERK: '1',
    },
    // Opt-in only: reusing a local Vite server can leak stale .env.local/Clerk state into E2E.
    reuseExistingServer: shouldReusePlaywrightServer({
      ci: process.env.CI,
      reuseServer: process.env.PLAYWRIGHT_REUSE_SERVER,
    }),
    timeout: 60_000,
  },
})
