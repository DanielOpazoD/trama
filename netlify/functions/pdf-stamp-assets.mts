import type { Config } from '@netlify/functions'

import handler from './_lib/pdf-stamp-assets-endpoint.js'

export const config: Config = {
  path: [
    '/api/pdf-stamp-assets',
    '/api/pdf-stamp-assets/:id',
    '/api/pdf-stamp-assets/:id/touch',
  ],
}

export default handler
