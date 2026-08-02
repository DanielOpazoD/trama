import { describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../../types/biblioteca'
import {
  canSendLibraryItemToMomentos,
  libraryItemIsVideo,
  libraryItemsToMomentoItems,
} from './libraryItemsToMomentoItems'

/**
 * "Enviar a Momentos" desde la Biblioteca. Dos zonas concentran el riesgo, y
 * ninguna falla de forma visible si se rompe:
 *
 *   - **La guarda anti-duplicado.** La Biblioteca PROYECTA el store de Momentos,
 *     así que sus propias fotos aparecen listadas. Sin excluirlas, "enviar"
 *     crearía un segundo episodio con la misma imagen y el usuario vería la foto
 *     dos veces sin entender por qué.
 *   - **La marca `type: 'video'`.** Es lo único que distingue un clip de una foto
 *     en el payload. Si se pierde, el momento se persiste como imagen y el render
 *     monta un `<img>` con un mp4 adentro: cuadro roto, sin error.
 */
function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:1',
    kind: 'notas-attachment',
    itemId: '1',
    title: 'foto.png',
    fileType: 'image',
    source: 'subido',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'user/foto.png',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...overrides,
  }
}

const clip = (overrides: Partial<LibraryItem> = {}) =>
  item({
    id: 'library-upload:9',
    kind: 'library-upload',
    itemId: '9',
    title: 'clip.mp4',
    fileType: 'video',
    mimeType: 'video/mp4',
    storageKey: 'user/clip.mp4',
    storageDomain: 'library-uploads',
    ...overrides,
  })

/** Opciones por defecto: bajar y subir siempre funcionan, dimensiones fijas y
 *  distintas por familia para poder afirmar QUÉ lector se usó. */
function deps(overrides: Partial<Parameters<typeof libraryItemsToMomentoItems>[1]> = {}) {
  return {
    fetchBlob: vi.fn(async () => new Blob(['x'])),
    uploadMedia: vi.fn(async (file: File) => ({ storageKey: `subido/${file.name}` })),
    readImageDimensions: vi.fn(async () => ({ width: 800, height: 600 })),
    readVideoDimensions: vi.fn(async () => ({ width: 1920, height: 1080 })),
    ...overrides,
  }
}

describe('canSendLibraryItemToMomentos', () => {
  it('acepta imágenes y videos servibles', () => {
    expect(canSendLibraryItemToMomentos(item())).toBe(true)
    expect(canSendLibraryItemToMomentos(clip())).toBe(true)
  })

  /** El invariante que motiva la guarda: la Biblioteca lista lo que ya es de
   *  Momentos, y reenviarlo duplicaría el episodio. */
  it('rechaza una foto que YA es de Momentos', () => {
    expect(
      canSendLibraryItemToMomentos(
        item({
          kind: 'momento-foto',
          storageDomain: 'momentos-media',
          id: 'momento-foto:3',
        }),
      ),
    ).toBe(false)
  })

  it('rechaza lo que no es media visual', () => {
    expect(
      canSendLibraryItemToMomentos(
        item({ fileType: 'pdf', mimeType: 'application/pdf' }),
      ),
    ).toBe(false)
    expect(
      canSendLibraryItemToMomentos(item({ fileType: 'audio', mimeType: 'audio/mpeg' })),
    ).toBe(false)
    expect(
      canSendLibraryItemToMomentos(
        item({ fileType: 'document', mimeType: 'text/plain' }),
      ),
    ).toBe(false)
  })

  /** Sin URL de servir no hay blob que bajar: el envío fallaría igual, pero más
   *  tarde y con peor mensaje. */
  it('rechaza lo que no se puede servir', () => {
    expect(canSendLibraryItemToMomentos(item({ storageKey: null }))).toBe(false)
    expect(
      canSendLibraryItemToMomentos(item({ storageDomain: 'pdf-stamp-assets' })),
    ).toBe(false)
  })

  it('cae al mime cuando fileType no lo dice', () => {
    expect(
      canSendLibraryItemToMomentos(item({ fileType: 'other', mimeType: 'image/avif' })),
    ).toBe(true)
    expect(
      canSendLibraryItemToMomentos(item({ fileType: 'other', mimeType: 'video/webm' })),
    ).toBe(true)
    expect(
      canSendLibraryItemToMomentos(item({ fileType: 'other', mimeType: null })),
    ).toBe(false)
  })
})

describe('libraryItemIsVideo', () => {
  it('distingue clip de foto por fileType y por mime', () => {
    expect(libraryItemIsVideo(clip())).toBe(true)
    expect(libraryItemIsVideo(item())).toBe(false)
    expect(
      libraryItemIsVideo(item({ fileType: 'other', mimeType: 'video/quicktime' })),
    ).toBe(true)
  })
})

describe('libraryItemsToMomentoItems', () => {
  it('baja, sube y devuelve la storageKey nueva', async () => {
    const d = deps()
    const { items, failures } = await libraryItemsToMomentoItems([item()], d)

    expect(failures).toEqual([])
    expect(items).toEqual([{ storageKey: 'subido/foto.png', width: 800, height: 600 }])
    // Se re-sube: el momento NO apunta al blob de la Biblioteca.
    expect(d.uploadMedia).toHaveBeenCalledTimes(1)
    expect(items[0]?.storageKey).not.toBe('user/foto.png')
  })

  it('marca los videos con type y usa SU lector de dimensiones', async () => {
    const d = deps()
    const { items } = await libraryItemsToMomentoItems([clip()], d)

    expect(items).toEqual([
      { storageKey: 'subido/clip.mp4', width: 1920, height: 1080, type: 'video' },
    ])
    expect(d.readVideoDimensions).toHaveBeenCalledTimes(1)
    expect(d.readImageDimensions).not.toHaveBeenCalled()
  })

  /** Una foto no debe llevar `type`: el schema lo trata como ausente = imagen, y
   *  escribir `type:'image'` de más rompería la back-compat de los ya guardados. */
  it('una imagen no lleva la marca type', async () => {
    const { items } = await libraryItemsToMomentoItems([item()], deps())
    expect(items[0]).not.toHaveProperty('type')
  })

  it('omite en silencio lo no ingerible, sin contarlo como fallo', async () => {
    const d = deps()
    const { items, failures } = await libraryItemsToMomentoItems(
      [item({ fileType: 'pdf', mimeType: 'application/pdf' })],
      d,
    )

    expect(items).toEqual([])
    expect(failures).toEqual([])
    expect(d.fetchBlob).not.toHaveBeenCalled()
  })

  it('un fallo de subida no arrastra al resto (éxito parcial)', async () => {
    const d = deps({
      uploadMedia: vi.fn(async (file: File) => {
        if (file.name === 'clip.mp4') throw new Error('Archivo > 10 MB')
        return { storageKey: `subido/${file.name}` }
      }),
    })

    const { items, failures } = await libraryItemsToMomentoItems([item(), clip()], d)

    expect(items).toHaveLength(1)
    expect(items[0]?.storageKey).toBe('subido/foto.png')
    expect(failures).toEqual([{ id: 'library-upload:9', reason: 'Archivo > 10 MB' }])
  })

  /** Un codec que el navegador no decodifica devolvería 0×0 o lanzaría; eso no
   *  puede costar la subida entera — el render tiene fallback sin dimensiones. */
  it('si no se pueden leer las dimensiones, sube igual y las omite', async () => {
    const d = deps({
      readVideoDimensions: vi.fn(async () => {
        throw new Error('codec no soportado')
      }),
    })

    const { items, failures } = await libraryItemsToMomentoItems([clip()], d)

    expect(failures).toEqual([])
    expect(items).toEqual([{ storageKey: 'subido/clip.mp4', type: 'video' }])
  })

  /**
   * Hallazgo de revisión (CodeRabbit, #384): el `type` describe lo ALMACENADO,
   * no el origen. En modo prueba el store devuelve un placeholder de imagen; si
   * el item heredara el `video` del archivo de origen, el render montaría un
   * `<video>` sobre un SVG y el reproductor quedaría en blanco sin ningún error.
   */
  it('si el store guardó una imagen, el item NO se marca como video', async () => {
    const d = deps({
      uploadMedia: vi.fn(async (file: File) => ({
        storageKey: `subido/${file.name}`,
        mime: 'image/svg+xml',
      })),
    })

    const { items } = await libraryItemsToMomentoItems([clip()], d)

    expect(items[0]).not.toHaveProperty('type')
  })

  it('si el store confirma video, el item sí se marca', async () => {
    const d = deps({
      uploadMedia: vi.fn(async (file: File) => ({
        storageKey: `subido/${file.name}`,
        mime: 'video/mp4',
      })),
    })

    const { items } = await libraryItemsToMomentoItems([clip()], d)

    expect(items[0]?.type).toBe('video')
  })

  /** Sin mime informado no podemos hacer nada mejor que creerle al origen. */
  it('sin mime del servidor, cae a la clasificación del item', async () => {
    const { items } = await libraryItemsToMomentoItems([clip()], deps())
    expect(items[0]?.type).toBe('video')
  })

  it('conserva el orden de la selección', async () => {
    const { items } = await libraryItemsToMomentoItems([clip(), item()], deps())
    expect(items.map((i) => i.storageKey)).toEqual(['subido/clip.mp4', 'subido/foto.png'])
  })
})
