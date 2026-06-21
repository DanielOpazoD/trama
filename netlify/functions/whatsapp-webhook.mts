import type { Config } from '@netlify/functions'
import whatsappWebhookHandler from './_lib/whatsapp/webhook-endpoint.js'

export default whatsappWebhookHandler

export const config: Config = {
  path: ['/api/whatsapp-webhook', '/.netlify/functions/whatsapp-webhook'],
}
