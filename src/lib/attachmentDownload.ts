export async function prepareAttachmentDownload(
  blob: Blob,
  opts: { fileName: string; mimeType: string },
): Promise<Blob> {
  if (
    blob instanceof File &&
    blob.name === opts.fileName &&
    blob.type === opts.mimeType
  ) {
    return blob
  }
  return new File([blob], opts.fileName, { type: opts.mimeType || blob.type })
}
