import { useRef, useState } from 'react'
import {
  STAMP_ASSET_ACCEPT,
  type PdfStudioStampAsset,
  type PdfStudioStampKind,
} from '../../../../lib/pdfStudio/stamps/stampAssets'
import { ChevronDownIcon, PencilIcon, TrashIcon, UploadIcon } from '../../../Icons'
import { OverflowMenu } from '../../../OverflowMenu'
import {
  editorMenuLayer,
  focusRing,
  menuTrigger,
} from '../editor/EditorToolbarPrimitives'
import { StampSignatureDrawDialog } from './StampSignatureDrawDialog'
import type { PdfStudioStampSyncStatus } from './usePdfStudioStampAssets'

type StampTab = PdfStudioStampKind | 'recent'

export function StampAssetMenu({
  assets,
  onCreateFromFile,
  onCreateSignatureFromDataUrl,
  onDelete,
  onRename,
  syncStatus,
  onUse,
}: {
  assets: PdfStudioStampAsset[]
  syncStatus: PdfStudioStampSyncStatus
  onCreateFromFile: (
    kind: PdfStudioStampKind,
    file: File,
  ) => Promise<PdfStudioStampAsset | null>
  onCreateSignatureFromDataUrl: (input: {
    name: string
    src: string
    width: number
    height: number
  }) => Promise<PdfStudioStampAsset>
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onUse: (asset: PdfStudioStampAsset) => void
}) {
  const [tab, setTab] = useState<StampTab>('signature')
  const [drawing, setDrawing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadKindRef = useRef<PdfStudioStampKind>('signature')

  async function onFile(file: File | undefined) {
    if (!file) return
    const asset = await onCreateFromFile(uploadKindRef.current, file)
    if (asset) onUse(asset)
  }

  return (
    <>
      <OverflowMenu
        label="Firma y timbre"
        width="w-80"
        menuLayerClassName={editorMenuLayer}
        triggerClassName={menuTrigger}
        triggerContent={
          <>
            <span className="text-caption font-semibold" aria-hidden>
              ✒
            </span>
            <ChevronDownIcon size={12} className="text-ink-300" />
          </>
        }
      >
        {(close) => {
          const visible = visibleAssets(assets, tab)
          return (
            <div className="space-y-2">
              <div
                role="tablist"
                aria-label="Biblioteca de firma y timbre"
                className="grid grid-cols-3 gap-1 rounded-md bg-ink-100/45 p-0.5"
              >
                <StampTabButton
                  active={tab === 'signature'}
                  onClick={() => setTab('signature')}
                >
                  Firmas
                </StampTabButton>
                <StampTabButton active={tab === 'stamp'} onClick={() => setTab('stamp')}>
                  Timbres
                </StampTabButton>
                <StampTabButton
                  active={tab === 'recent'}
                  onClick={() => setTab('recent')}
                >
                  Recientes
                </StampTabButton>
              </div>

              <div className="flex items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <span className="block text-micro uppercase tracking-wide text-ink-400">
                    {tabLabel(tab)}
                  </span>
                  <span
                    className="block truncate text-micro text-ink-300"
                    title={syncStatusLabel(syncStatus)}
                  >
                    {syncStatusLabel(syncStatus)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      uploadKindRef.current = tab === 'stamp' ? 'stamp' : 'signature'
                      fileInputRef.current?.click()
                    }}
                    className={`${focusRing} inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-ink-600 hover:bg-ink-100/60`}
                  >
                    <UploadIcon size={12} />
                    {tab === 'stamp' ? 'Subir timbre' : 'Subir firma'}
                  </button>
                  {tab !== 'stamp' ? (
                    <button
                      type="button"
                      onClick={() => setDrawing(true)}
                      className={`${focusRing} inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-ink-600 hover:bg-ink-100/60`}
                    >
                      <PencilIcon size={12} />
                      Dibujar firma
                    </button>
                  ) : null}
                </div>
              </div>

              {visible.length > 0 ? (
                <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
                  {visible.map((asset) => (
                    <StampAssetTile
                      key={asset.id}
                      asset={asset}
                      onDelete={() => {
                        onDelete(asset.id)
                        close()
                      }}
                      onRename={() => {
                        const next =
                          typeof window.prompt === 'function'
                            ? window.prompt('Renombrar firma/timbre', asset.name)
                            : asset.name
                        if (next != null) onRename(asset.id, next)
                        close()
                      }}
                      onUse={() => {
                        onUse(asset)
                        close()
                      }}
                    />
                  ))}
                </div>
              ) : (
                <StampEmptyState tab={tab} />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={STAMP_ASSET_ACCEPT}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  void onFile(file)
                  close()
                }}
              />
            </div>
          )
        }}
      </OverflowMenu>
      {drawing ? (
        <StampSignatureDrawDialog
          onCancel={() => setDrawing(false)}
          onSave={(input) => {
            void onCreateSignatureFromDataUrl(input).then((asset) => {
              onUse(asset)
              setDrawing(false)
            })
          }}
        />
      ) : null}
    </>
  )
}

function StampTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`${focusRing} rounded px-2 py-1 text-caption font-semibold ${
        active
          ? 'bg-paper-50 text-[color:var(--accent-sage)] shadow-sm'
          : 'text-ink-500 hover:text-ink-800'
      }`}
    >
      {children}
    </button>
  )
}

function StampAssetTile({
  asset,
  onDelete,
  onRename,
  onUse,
}: {
  asset: PdfStudioStampAsset
  onDelete: () => void
  onRename: () => void
  onUse: () => void
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-paper-50 p-1 shadow-sm shadow-ink-900/5">
      <button
        type="button"
        aria-label={`Insertar ${asset.name}`}
        onClick={onUse}
        className={`${focusRing} block w-full rounded text-left`}
      >
        <span className="stamp-checker flex h-16 items-center justify-center overflow-hidden rounded border border-ink-100/70 bg-paper-100">
          <img
            src={asset.src}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        </span>
        <span className="mt-1 block truncate px-0.5 text-caption font-medium text-ink-700">
          {asset.name}
        </span>
      </button>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate px-0.5 text-micro text-ink-400">
          {asset.kind === 'signature' ? 'Firma' : 'Timbre'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Renombrar ${asset.name}`}
            onClick={onRename}
            className={`${focusRing} inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-100/60 hover:text-ink-700`}
          >
            <PencilIcon size={12} />
          </button>
          <button
            type="button"
            aria-label={`Eliminar ${asset.name}`}
            onClick={onDelete}
            className={`${focusRing} inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-[color:var(--accent-clay-soft)] hover:text-[color:var(--accent-clay)]`}
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

function StampEmptyState({ tab }: { tab: StampTab }) {
  const copy =
    tab === 'stamp'
      ? 'Aún no guardas timbres.'
      : tab === 'recent'
        ? 'Aún no hay firmas o timbres usados.'
        : 'Aún no guardas firmas.'
  return (
    <div className="rounded-md border border-dashed border-ink-100 bg-paper-100/60 px-3 py-5 text-center">
      <p className="text-caption font-medium text-ink-700">{copy}</p>
      <p className="mt-1 text-micro text-ink-400">
        Se guardan para este usuario y quedan disponibles al reabrir.
      </p>
    </div>
  )
}

function visibleAssets(assets: PdfStudioStampAsset[], tab: StampTab) {
  const filtered =
    tab === 'recent' ? assets : assets.filter((asset) => asset.kind === tab)
  return [...filtered].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

function tabLabel(tab: StampTab): string {
  if (tab === 'stamp') return 'Timbres guardados'
  if (tab === 'recent') return 'Últimos usados'
  return 'Firmas guardadas'
}

function syncStatusLabel(status: PdfStudioStampSyncStatus): string {
  if (status === 'syncing') return 'Sincronizando'
  if (status === 'local') return 'Guardado local'
  return 'Guardado en nube'
}
