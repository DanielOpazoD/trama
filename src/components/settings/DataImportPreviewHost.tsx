import { DataImportPreviewCard } from './DataImportPreviewCard'
import type { ParsedImportFile } from './dataImportPreviewModel'
import { useDataPanelImportPreview } from './useDataPanelImportPreview'

export function DataImportPreviewHost({
  parsed,
  busy,
  onConfirm,
  onCancel,
}: {
  parsed: ParsedImportFile
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
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
