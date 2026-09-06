import { requestBlob } from '../../api/request'
import { handOffFilesToImprenta } from '../../lib/imprentaHandoff'
import { useToast } from '../../state'
import type { Momento } from '../../types'
import {
  momentoHasPhotosForImprenta,
  momentoPhotosToPdfFiles,
} from './momentoPhotosToPdfFiles'

/**
 * «Fotos a Imprenta» desde cualquier superficie de Momentos (la Línea y el
 * Álbum). Momentos vive en el otro mundo: las fotos viajan por
 * `imprentaHandoff` y el shell cambia a Notas → Imprenta. El toast de
 * «enviadas» lo da NotasWorld, que sabe si había un documento en curso; aquí
 * solo se avisa el fallo.
 */
export function useSendMomentoToImprenta(momento: Momento): {
  canSend: boolean
  send: () => Promise<void>
} {
  const toast = useToast()
  const canSend = momentoHasPhotosForImprenta(momento)
  async function send() {
    const { files, failures } = await momentoPhotosToPdfFiles(momento, {
      fetchBlob: requestBlob,
    })
    if (files.length === 0) {
      toast.show({
        message:
          failures.length > 0
            ? 'No se pudo enviar ninguna foto a Imprenta'
            : 'Este momento no tiene fotos para Imprenta',
        tone: 'error',
      })
      return
    }
    handOffFilesToImprenta(files)
  }
  return { canSend, send }
}
