import { lazy, Suspense } from 'react'
import type { ImageAnnotation } from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'

const StampAssetMenuHost = lazy(() =>
  import('../stamps/StampAssetMenuHost').then((module) => ({
    default: module.StampAssetMenuHost,
  })),
)

export function PdfTextEditorStampAssetSlot({
  layout,
  opacity,
  onInsert,
  userKey,
}: {
  layout: PageLayout | null
  opacity: number
  onInsert: (annotation: ImageAnnotation) => void
  userKey?: string
}) {
  if (!userKey) return null

  return (
    <Suspense
      fallback={
        <button
          type="button"
          aria-label="Firma y timbre"
          disabled
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2 text-caption text-ink-300"
        >
          ...
        </button>
      }
    >
      <StampAssetMenuHost
        layout={layout}
        opacity={opacity}
        onInsert={onInsert}
        userKey={userKey}
      />
    </Suspense>
  )
}
