/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versión del package.json inyectada via vite.config.ts define. */
  readonly VITE_APP_VERSION: string
  /** Número de WhatsApp de Trama (E164) para el deep link/QR de vinculación. */
  readonly VITE_WHATSAPP_NUMBER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
