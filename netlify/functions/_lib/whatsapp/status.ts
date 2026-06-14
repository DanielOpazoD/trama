/**
 * Comando `estado`: arma un resumen legible del vínculo de WhatsApp para que el
 * usuario sepa, desde el teléfono, que todo está conectado y qué fue lo último
 * que capturó. Puro y testeable: el webhook le pasa los datos ya leídos de la
 * base; acá no se toca SQL.
 */

export type StatusData = {
  /** verified_at del vínculo (null = no verificado, no debería pasar acá). */
  verifiedAt: string | null
  /** Etiqueta del dispositivo (multidispositivo), o null. */
  deviceLabel?: string | null
  /** Última captura recordada (para "deshacer"), o null si no hay. */
  lastCaptureKind: string | null
  lastCaptureAt: string | null
  /** Mensajes procesados este mes (idempotencia los registra todos). */
  monthCount: number
}

const NOUN_BY_KIND: Record<string, string> = {
  note: 'nota',
  quote: 'cita',
  entity: 'entidad',
  momento: 'momento',
  recorte: 'recorte',
}

/** Distancia humana entre dos fechas: "recién", "hace 5 min", "hace 3 h", "hace 2 d". */
export function relativeTime(fromISO: string, now: Date = new Date()): string {
  const then = new Date(fromISO).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Math.max(0, now.getTime() - then)
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  return `hace ${days} d`
}

export function formatStatus(d: StatusData, now: Date = new Date()): string {
  const lines: string[] = ['📊 Tu Trama por WhatsApp']
  lines.push(d.verifiedAt ? '• Conexión: activa ✅' : '• Conexión: pendiente ⏳')
  if (d.deviceLabel && d.deviceLabel.trim()) {
    lines.push(`• Dispositivo: «${d.deviceLabel.trim()}»`)
  }

  if (d.lastCaptureKind && d.lastCaptureAt) {
    const noun = NOUN_BY_KIND[d.lastCaptureKind] ?? 'captura'
    const when = relativeTime(d.lastCaptureAt, now)
    lines.push(`• Última captura: ${noun}${when ? ` (${when})` : ''}`)
    lines.push('   ↩️ Puedes revertirla respondiendo «deshacer».')
  } else {
    lines.push('• Última captura: todavía nada')
  }

  lines.push(`• Mensajes este mes: ${d.monthCount}`)
  lines.push('Escribe «ayuda» para ver todos los comandos.')
  return lines.join('\n')
}
