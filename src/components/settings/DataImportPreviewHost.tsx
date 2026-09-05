import { DataImportPreviewCard } from './DataImportPreviewCard'
import type { ParsedImportFile } from './dataImportPreviewModel'
import { useDataPanelImportPreview } from './useDataPanelImportPreview'

export function DataImportPreviewHost({
  parsed,
  vaultNotice,
  busy,
  onConfirm,
  onCancel,
}: {
  parsed: ParsedImportFile
  vaultNotice: string | null
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const preview = useDataPanelImportPreview(parsed)

  if (!preview) return null

  return (
    <DataImportPreviewCard
      fileName={parsed.fileName}
      preview={preview}
      vaultNotice={vaultNotice}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
