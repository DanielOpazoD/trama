/**
 * Texto plano para la TARJETA de un recorte 'html' (capturado como Markdown):
 * quita los marcadores de encabezado/lista/cita, desenvuelve enlaces y énfasis
 * y colapsa los bloques de código. El `text` original se conserva intacto —
 * esto es solo para la previsualización en la bandeja; al promover a nota se
 * usa el Markdown completo.
 */
export function markdownToPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // bloques de código → espacio
    .replace(/^#{1,6}\s+/gm, '') // # encabezados
    .replace(/^>\s?/gm, '') // > citas
    .replace(/^[-*]\s+/gm, '• ') // - listas → viñeta
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [texto](url) → texto
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // **negrita**
    .replace(/(\*|_)(.*?)\1/g, '$2') // *cursiva*
    .replace(/`([^`]+)`/g, '$1') // `código`
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
