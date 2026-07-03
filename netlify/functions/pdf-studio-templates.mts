import type { Config } from '@netlify/functions'

import handler from './_lib/pdf-studio-templates-endpoint.js'

export const config: Config = {
  path: [
    '/api/pdf-studio-templates',
    '/api/pdf-studio-templates/:id',
    '/api/pdf-studio-templates/:id/versions',
    '/api/pdf-studio-templates/:id/versions/:versionId',
  ],
}

export default handler
