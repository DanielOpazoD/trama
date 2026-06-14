/**
 * Construye el deep link de WhatsApp ("click to chat") que abre el chat con
 * el número de Trama y el mensaje `vincular <código>` ya escrito. El usuario
 * solo aprieta enviar — onboarding de un toque, sin copiar/pegar.
 *
 * wa.me exige el número en dígitos puros (sin `+`, espacios ni signos) y el
 * texto URL-encoded. Devuelve null si no hay número configurado.
 */
export function buildWhatsAppDeepLink(
  rawNumber: string | null | undefined,
  code: string,
): string | null {
  const digits = (rawNumber ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const text = encodeURIComponent(`vincular ${code}`)
  return `https://wa.me/${digits}?text=${text}`
}
