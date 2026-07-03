import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'

// Misma tolerancia que el plan de sync: dentro de ella, local y nube son lo mismo.
const CLOUD_SYNC_EPSILON_MS = 2000

export type TemplateCloudBadge = {
  label: string
  tone: 'cloud' | 'pending' | 'local'
}

/** Estado de nube de una plantilla para la tarjeta de biblioteca. */
export function templateCloudBadge(
  saved: Pick<SavedDoc, 'savedAt' | 'cloudTemplate'>,
): TemplateCloudBadge {
  if (!saved.cloudTemplate) return { label: 'Solo en este equipo', tone: 'local' }
  const drift = saved.savedAt - Date.parse(saved.cloudTemplate.savedAt)
  return drift > CLOUD_SYNC_EPSILON_MS
    ? { label: 'Cambios sin subir', tone: 'pending' }
    : { label: 'En la nube', tone: 'cloud' }
}

export function workspaceTemplateSavedAtLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function workspaceTemplateFieldCountLabel(doc: PdfDoc) {
  const count = doc.formFields?.length ?? 0
  return `${count} ${count === 1 ? 'campo' : 'campos'}`
}
