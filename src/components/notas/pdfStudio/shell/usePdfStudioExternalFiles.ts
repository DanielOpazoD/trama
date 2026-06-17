import { useEffect, useRef } from 'react'

export function usePdfStudioExternalFiles({
  addFiles,
  externalFiles,
  onConsumed,
}: {
  addFiles: (files: File[] | FileList | null) => Promise<void>
  externalFiles: File[]
  onConsumed?: () => void
}) {
  const consumedExternalFilesRef = useRef<File[] | null>(null)

  useEffect(() => {
    if (externalFiles.length === 0 || consumedExternalFilesRef.current === externalFiles)
      return
    consumedExternalFilesRef.current = externalFiles
    void addFiles(externalFiles).finally(() => onConsumed?.())
  }, [addFiles, externalFiles, onConsumed])
}
