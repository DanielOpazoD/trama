/**
 * WhatsApp — cliente de vinculación número ↔ usuario. El código de
 * vinculación se genera acá y se canjea por WhatsApp ("vincular <código>").
 * Transforma snake→camel en la frontera, como el resto de src/api.
 */
import { request } from './request'

export type WhatsAppLink = {
  id: string
  phone: string | null
  label: string | null
  verifiedAt: string | null
  lastMessageAt: string | null
  createdAt: string
}

type WhatsAppLinkRow = {
  id: string
  phone_e164: string | null
  label: string | null
  verified_at: string | null
  last_message_at: string | null
  created_at: string
}

export type WhatsAppLinkCode = {
  id: string
  code: string
  expiresAt: string
  ttlMinutes: number
}

function linkFromRow(r: WhatsAppLinkRow): WhatsAppLink {
  return {
    id: r.id,
    phone: r.phone_e164,
    label: r.label,
    verifiedAt: r.verified_at,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  }
}

export const whatsappApi = {
  async listWhatsAppLinks(): Promise<WhatsAppLink[]> {
    const rows = await request<WhatsAppLinkRow[]>('/api/whatsapp-link')
    return rows.map(linkFromRow)
  },
  async createWhatsAppLinkCode(label?: string): Promise<WhatsAppLinkCode> {
    return request<WhatsAppLinkCode>('/api/whatsapp-link', {
      method: 'POST',
      body: JSON.stringify(label ? { label } : {}),
    })
  },
  async removeWhatsAppLink(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/whatsapp-link/${id}`, { method: 'DELETE' })
  },
}
