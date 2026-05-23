import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  define: {
    // Exponemos la versión del package.json al bundle como
    // `import.meta.env.VITE_APP_VERSION`. Single source of truth — el
    // sidebar lee de acá en vez de hardcodear "v0.x.0" en JSX.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
})
