import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import pkg from './package.json'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const projectPathNeedsRelaxedFs = projectRoot.includes(':')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Vite 7 compara el request id de index.html de forma más estricta; en
      // este checkout local ("Citas : Notas") termina bloqueando su propio root
      // por el ":" del path. Solo relajamos fs.strict en ese caso local; no
      // afecta al build/Netlify.
      strict: !projectPathNeedsRelaxedFs,
    },
  },
  resolve: {
    // G1: alias `@/*` → `./src/*` para que el código frontend pueda usar
    // imports absolutos en vez de `../../../`. Refleja el `paths` en
    // tsconfig.app.json. Netlify Functions NO usan este alias (tienen
    // resolución propia); para shared code entre client/server seguimos
    // con relativos de ../../../src.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    // Exponemos la versión del package.json al bundle como
    // `import.meta.env.VITE_APP_VERSION`. Single source of truth — el
    // sidebar lee de acá en vez de hardcodear "v0.x.0" en JSX.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    // DD2: manualChunks separa los vendors del código de aplicación.
    // Beneficio: los vendors casi nunca cambian entre deploys (versión
    // de react, tanstack, etc. cambia 1-2 veces al año), pero el código
    // de la app cambia constantemente. Al ponerlos en chunks separados,
    // el browser cachea los vendors entre deploys.
    //
    // Antes: 1 bundle único hasheaba con cada deploy → browser tenía que
    // re-descargar 558KB de React + Query + nuestro código.
    // Ahora: vendor-react.[hash].js + vendor-query.[hash].js queda en cache,
    // solo se re-descarga index.[hash].js (~280KB).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) {
            return 'vendor-react'
          }
          if (id.includes('@tanstack')) {
            return 'vendor-query'
          }
          // sigma y graphology van juntas — y ya están en su lazy chunk
          // GraphCanvasSigma (cargado solo al entrar al grafo grande).
          // Si Vite vuelve a meterlas en el principal, las separamos acá.
          if (id.includes('sigma') || id.includes('graphology')) {
            return 'vendor-graph'
          }
          // pdf-lib (editor de PDF, lazy): su entry es `index.js`, así que sin
          // esto Vite nombra el chunk `index-*.js` y colisiona con el budget del
          // bundle principal `index`. Nombrarlo lo deja como chunk lazy propio.
          if (id.includes('pdf-lib') || id.includes('@pdf-lib')) {
            return 'vendor-pdf-lib'
          }
          return undefined
        },
      },
    },
  },
})
