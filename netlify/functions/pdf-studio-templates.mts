import type { Config, Context } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { handlePdfStudioTemplates } from './_lib/pdf-studio-templates-endpoint.js'

export default withObservability(
  'pdf-studio-templates',
  async (req: Request, context: Context, { requestId }) =>
    handlePdfStudioTemplates(req, context, requestId),
)

export const config: Config = {
  path: [
    '/api/pdf-studio-templates',
    '/api/pdf-studio-templates/:id',
    '/api/pdf-studio-templates/:id/versions',
    '/api/pdf-studio-templates/:id/versions/:versionId',
  ],
}
