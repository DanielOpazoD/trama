import {
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FilePdfIcon,
  FileSheetIcon,
  FileSlidesIcon,
} from '../Icons'
import type { LibraryFileType } from '../../types/biblioteca'

/**
 * Glifo por tipo de archivo para la celda Nombre de la lista. PDF lleva un
 * terracota cálido (`--type-idea`) — reconocible sin gritar y sin usar el rojo
 * destructivo (`--accent-clay`, reservado para borrar); el resto va en tinta
 * apagada (`text-ink-400`) para que el nombre del archivo sea el protagonista.
 *
 * El JSON (mime `application/json`) usa el glifo de llaves `{}` aunque su
 * `file_type` sea 'other' — es la convención universal para datos estructurados.
 */
export function FileTypeIcon({
  fileType,
  mimeType,
  size = 16,
}: {
  fileType: LibraryFileType
  mimeType?: string | null
  size?: number
}) {
  // Normaliza el mime (sin parámetros tipo `; charset=utf-8`) y reconoce
  // variantes `+json` (p. ej. application/ld+json), no solo el exacto.
  const baseMime = mimeType?.toLowerCase().split(';', 1)[0]?.trim()
  const isJson =
    baseMime === 'application/json' ||
    baseMime === 'text/json' ||
    baseMime?.endsWith('+json') === true

  if (fileType === 'pdf') {
    return <FilePdfIcon size={size} className="text-[color:var(--type-idea)] shrink-0" />
  }
  if (isJson) {
    return <FileCodeIcon size={size} className="text-ink-400 shrink-0" />
  }
  if (fileType === 'image') {
    return <FileImageIcon size={size} className="text-ink-400 shrink-0" />
  }
  if (fileType === 'spreadsheet') {
    return <FileSheetIcon size={size} className="text-ink-400 shrink-0" />
  }
  if (fileType === 'presentation') {
    return <FileSlidesIcon size={size} className="text-ink-400 shrink-0" />
  }
  // document, audio, video, other → glifo genérico de documento.
  return <FileIcon size={size} className="text-ink-400 shrink-0" />
}
