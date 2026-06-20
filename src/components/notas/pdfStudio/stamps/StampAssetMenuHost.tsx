import type { ImageAnnotation } from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { createImageAnnotationFromStampAsset } from '../../../../lib/pdfStudio/stamps/stampAssets'
import { StampAssetMenu } from './StampAssetMenu'
import { usePdfStudioStampAssets } from './usePdfStudioStampAssets'

export function StampAssetMenuHost({
  layout,
  opacity,
  onInsert,
  userKey,
}: {
  layout: PageLayout | null
  opacity: number
  onInsert: (annotation: ImageAnnotation) => void
  userKey: string
}) {
  const stampAssets = usePdfStudioStampAssets(userKey)

  function insertAsset(asset: (typeof stampAssets.assets)[number]) {
    stampAssets.touch(asset.id)
    onInsert(
      createImageAnnotationFromStampAsset({
        asset,
        layout,
        opacity,
      }),
    )
  }

  return (
    <StampAssetMenu
      assets={stampAssets.assets}
      onCreateFromFile={stampAssets.createFromFile}
      onCreateSignatureFromDataUrl={stampAssets.createSignatureFromDataUrl}
      onDelete={stampAssets.remove}
      onRename={stampAssets.rename}
      onUse={insertAsset}
    />
  )
}
