/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versión del package.json inyectada via vite.config.ts define. */
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
