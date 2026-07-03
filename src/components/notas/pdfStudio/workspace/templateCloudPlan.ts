/**
 * Plan puro del merge biblioteca local ↔ nube para PLANTILLAS (kind template).
 * Last-write-wins por `savedAt` con tolerancia: el reloj del guardado viaja con
 * el paquete, así el mismo documento no hace ping-pong entre dispositivos.
 *
 * El marcador `cloudTemplate` (dejado por un push/pull previo) distingue lo
 * nunca sincronizado de lo borrado en otro dispositivo:
 * - local sin remoto y SIN marcador → subir (plantilla nueva de este equipo);
 * - local sin remoto y CON marcador → borrar local (se eliminó en otro equipo);
 * - remoto sin local → bajar y materializar;
 * - ambos → gana el `savedAt` más nuevo; empate: sólo refrescar el marcador.
 *
 * Las copias con datos (filled-template) no entran nunca al plan.
 */
import type { PdfStudioTemplateRemote } from '../../../../api/pdfStudioTemplates'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'

const SYNC_EPSILON_MS = 2000

export type TemplateCloudPlan = {
  uploads: SavedDoc[]
  downloads: PdfStudioTemplateRemote[]
  deleteLocals: SavedDoc[]
  /** Pares ya en sincronía cuyo marcador local falta o quedó viejo. */
  links: { saved: SavedDoc; remote: PdfStudioTemplateRemote }[]
}

export function planTemplateCloudSync(
  local: SavedDoc[],
  remote: PdfStudioTemplateRemote[],
): TemplateCloudPlan {
  const templates = local.filter((saved) => saved.kind === 'template')
  const remoteByDocId = new Map(remote.map((item) => [item.savedDocId, item]))
  const localByDocId = new Map(templates.map((saved) => [saved.id, saved]))

  const plan: TemplateCloudPlan = {
    uploads: [],
    downloads: [],
    deleteLocals: [],
    links: [],
  }

  for (const saved of templates) {
    const match = remoteByDocId.get(saved.id)
    if (!match) {
      if (saved.cloudTemplate) plan.deleteLocals.push(saved)
      else plan.uploads.push(saved)
      continue
    }
    const drift = saved.savedAt - Date.parse(match.savedAt)
    if (drift > SYNC_EPSILON_MS) plan.uploads.push(saved)
    else if (drift < -SYNC_EPSILON_MS) plan.downloads.push(match)
    else if (saved.cloudTemplate?.id !== match.id) {
      plan.links.push({ saved, remote: match })
    }
  }

  for (const item of remote) {
    if (!localByDocId.has(item.savedDocId)) plan.downloads.push(item)
  }

  return plan
}
