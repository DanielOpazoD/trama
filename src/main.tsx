import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installClientErrorTracking } from './lib/clientErrorTracking'

// DD4: capturar errores de event handlers + promises sin catch + setTimeout
// que el ErrorBoundary de React NO ve (porque ocurren fuera del render tree).
// Los enviamos al mismo /api/error-log → aparecen en Settings → Logs.
installClientErrorTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
