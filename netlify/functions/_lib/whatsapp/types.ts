/**
 * Tipos compartidos del puente WhatsApp → Trama. Una `CaptureIntent` es lo
 * que un mensaje termina significando: una nota, una cita (con autor → su
 * entidad), una entidad del grafo o un momento del timeline. El parser de
 * prefijos y el clasificador IA producen el MISMO shape, así el webhook
 * tiene un solo camino de escritura.
 */

export type CaptureKind = 'note' | 'quote' | 'entity' | 'momento' | 'task'

export type CaptureIntent =
  | { kind: 'note'; content: string }
  /** author puede venir vacío: el webhook responde pidiéndolo (una cita
   *  necesita una entidad a la cual colgar). */
  | { kind: 'quote'; text: string; author: string }
  | { kind: 'entity'; name: string; entityType: string; description: string | null }
  | { kind: 'momento'; bodyText: string }
  /** Tarea (pendiente) del mundo Notas. `detail` opcional tras un separador. */
  | { kind: 'task'; title: string; detail: string | null }
