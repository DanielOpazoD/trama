import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App'
import './index.css'
import { installClientErrorTracking } from './lib/clientErrorTracking'
import { initWebVitals } from './lib/webVitals'

// DD4: capturar errores de event handlers + promises sin catch + setTimeout
// que el ErrorBoundary de React NO ve (porque ocurren fuera del render tree).
// Los enviamos al mismo /api/error-log → aparecen en Settings → Logs.
installClientErrorTracking()

// N6: Core Web Vitals (LCP, INP, CLS, FCP, TTFB) → /api/web-vitals.
// Activo solo en producción (en dev no spammea el endpoint).
initWebVitals()

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root')!)

// Durante desarrollo sin clave configurada, permite que la app cargue.
// En producción con VITE_CLERK_PUBLISHABLE_KEY vacío, Clerk no inicializa
// pero la app sigue funcionando (antes de enforcement).
root.render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    ) : (
      // Sin key de Clerk configurada — modo legacy/desarrollo
      <App />
    )}
  </StrictMode>,
)
