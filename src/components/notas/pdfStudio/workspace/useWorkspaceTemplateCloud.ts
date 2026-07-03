import { useRef, type Dispatch, type SetStateAction } from 'react'
import {
  deletePdfStudioTemplate,
  downloadPdfStudioTemplatePackage,
  downloadPdfStudioTemplateVersion,
  listPdfStudioTemplates,
  listPdfStudioTemplateVersions,
  uploadPdfStudioTemplate,
  type PdfStudioTemplateRemote,
  type PdfStudioTemplateVersion,
} from '../../../../api/pdfStudioTemplates'
import {
  packPdfTemplate,
  unpackPdfTemplate,
} from '../../../../lib/pdfStudio/sync/templatePackage'
import {
  deleteSavedDoc,
  putSavedDoc,
  savedTemplateStatus,
  type SavedDoc,
} from '../../../../lib/pdfStudio/render/persistence'
import { planTemplateCloudSync } from './templateCloudPlan'

export type WorkspaceTemplateCloud = {
  /** Merge inicial biblioteca local ↔ nube (tras listSavedDocs). */
  syncTemplates: (local: SavedDoc[]) => void
  /** Sube (best-effort) una plantilla recién guardada/duplicada/editada. */
  pushTemplate: (saved: SavedDoc) => void
  /** Baja (best-effort) la fila remota de una plantilla borrada localmente. */
  removeRemoteTemplate: (saved: SavedDoc) => void
  /** Historial retenido en el servidor (vacío si la plantilla no está en la nube). */
  listTemplateVersions: (saved: SavedDoc) => Promise<PdfStudioTemplateVersion[]>
  /** Restaura una versión: la materializa como estado actual y la re-sube. */
  restoreTemplateVersion: (saved: SavedDoc, versionId: string) => Promise<boolean>
}

/**
 * Sincronización de PLANTILLAS con el servidor, para que la biblioteca esté en
 * cualquier dispositivo. Todo es best-effort y silencioso: sin backend (demo,
 * offline) la biblioteca local sigue funcionando igual que siempre.
 *
 * Sólo viajan plantillas limpias (kind template). Las copias con datos pueden
 * contener información de pacientes y NUNCA se suben.
 */
export function useWorkspaceTemplateCloud({
  enabled,
  setSaved,
  userKey,
}: {
  enabled: boolean
  setSaved: Dispatch<SetStateAction<SavedDoc[]>>
  userKey: string
}): WorkspaceTemplateCloud {
  // La identidad del hook devuelto no importa (se consume vía ref en el
  // workspace); los refs evitan closures viejos en los callbacks async.
  const userKeyRef = useRef(userKey)
  userKeyRef.current = userKey
  const active = enabled && userKey !== 'anon'

  function upsertLocal(saved: SavedDoc) {
    setSaved((list) => {
      const exists = list.some((item) => item.id === saved.id)
      return exists
        ? list.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...list]
    })
    void putSavedDoc(userKeyRef.current, saved)
  }

  async function uploadTemplate(saved: SavedDoc): Promise<void> {
    const pkg = await packPdfTemplate(saved.doc)
    const remote = await uploadPdfStudioTemplate({
      packageJson: JSON.stringify(pkg),
      savedDocId: saved.id,
      name: saved.name,
      description: saved.description,
      tags: saved.tags,
      status: savedTemplateStatus(saved),
      savedAt: saved.savedAt,
      pageCount: pkg.pages.length,
      fieldCount: pkg.formFields.length,
    })
    upsertLocal({
      ...saved,
      cloudTemplate: { id: remote.id, savedAt: remote.savedAt },
    })
  }

  async function downloadTemplate(remote: PdfStudioTemplateRemote): Promise<void> {
    const pkg = await downloadPdfStudioTemplatePackage(remote.id)
    const doc = unpackPdfTemplate(pkg)
    if (!doc) return
    upsertLocal({
      id: remote.savedDocId,
      name: remote.name,
      doc,
      savedAt: Date.parse(remote.savedAt),
      kind: 'template',
      ...(remote.description ? { description: remote.description } : null),
      ...(remote.tags.length ? { tags: remote.tags } : null),
      status: remote.status,
      cloudTemplate: { id: remote.id, savedAt: remote.savedAt },
    })
  }

  function syncTemplates(local: SavedDoc[]) {
    if (!active) return
    void (async () => {
      try {
        const remote = await listPdfStudioTemplates()
        const plan = planTemplateCloudSync(local, remote)
        for (const saved of plan.uploads) await uploadTemplate(saved)
        for (const item of plan.downloads) await downloadTemplate(item)
        for (const saved of plan.deleteLocals) {
          setSaved((list) => list.filter((item) => item.id !== saved.id))
          await deleteSavedDoc(userKeyRef.current, saved.id)
        }
        for (const { saved, remote: match } of plan.links) {
          upsertLocal({
            ...saved,
            cloudTemplate: { id: match.id, savedAt: match.savedAt },
          })
        }
      } catch {
        // Sin conexión o sin sesión: la biblioteca local basta.
      }
    })()
  }

  function pushTemplate(saved: SavedDoc) {
    if (!active || saved.kind !== 'template') return
    void uploadTemplate(saved).catch(() => {
      // best-effort: el próximo merge al cargar lo reintenta (savedAt manda).
    })
  }

  function removeRemoteTemplate(saved: SavedDoc) {
    if (!active || saved.kind !== 'template') return
    const remoteId = saved.cloudTemplate?.id
    if (!remoteId) return
    void deletePdfStudioTemplate(remoteId).catch(() => {
      // best-effort: si falla, el merge la re-materializa y se puede reintentar.
    })
  }

  async function listTemplateVersions(
    saved: SavedDoc,
  ): Promise<PdfStudioTemplateVersion[]> {
    if (!active || !saved.cloudTemplate) return []
    return listPdfStudioTemplateVersions(saved.cloudTemplate.id)
  }

  async function restoreTemplateVersion(
    saved: SavedDoc,
    versionId: string,
  ): Promise<boolean> {
    if (!active || !saved.cloudTemplate) return false
    const pkg = await downloadPdfStudioTemplateVersion(saved.cloudTemplate.id, versionId)
    const doc = unpackPdfTemplate(pkg)
    if (!doc) return false
    // La versión restaurada pasa a ser el estado actual (savedAt nuevo):
    // el push la convierte en cabeza y el estado anterior queda en el historial.
    const restored: SavedDoc = { ...saved, doc, savedAt: Date.now() }
    upsertLocal(restored)
    await uploadTemplate(restored).catch(() => {
      // Sin conexión: quedó restaurada localmente; el merge la subirá después.
    })
    return true
  }

  return {
    syncTemplates,
    pushTemplate,
    removeRemoteTemplate,
    listTemplateVersions,
    restoreTemplateVersion,
  }
}
