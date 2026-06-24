import type { Ref } from 'react'
import type { CaptureItem, Note, Recorte } from '../../api'
import type { RecorteTarget } from '../../api'
import { NoteCard } from './NoteCard'
import { RecorteCard } from '../recortes/RecorteCard'
import { SelectableRecorte } from '../recortes/SelectableRecorte'
import type { LinkMediaSize } from '../recortes/RecorteMediaPreview'
import type { PromoteSeed } from '../recortes/PromoteModal'
import { buildNotasFeedVirtualItemMeta } from './notasFeedViewModel'

type VirtualRow = {
  index: number
  start: number
}

type VirtualizerLike = {
  getTotalSize: () => number
  measureElement: (node: Element | null) => void
  options: { scrollMargin: number }
}

type NoteEditPatch = { content: string; title: string | null }

export function NotasFeedVirtualList({
  listRef,
  items,
  virtualItems,
  virtualizer,
  selectedIndex,
  reducedMotion,
  recorteThumb,
  selectionMode,
  selectedIds,
  noteBusy,
  promotingNoteId,
  onSelectIndex,
  onToggleNotePin,
  onEditNote,
  onDeleteNote,
  onPromoteNote,
  onToggleRecorteSelect,
  onPromoteRecorte,
  onArchiveRecorte,
  onRestoreRecorte,
  onDeleteRecorte,
  onSendImagesToPdf,
}: {
  listRef: Ref<HTMLDivElement>
  items: CaptureItem[]
  virtualItems: VirtualRow[]
  virtualizer: VirtualizerLike
  selectedIndex: number | null
  reducedMotion: boolean
  recorteThumb: LinkMediaSize
  selectionMode: boolean
  selectedIds: ReadonlySet<string>
  noteBusy: boolean
  promotingNoteId?: string
  onSelectIndex: (index: number) => void
  onToggleNotePin: (note: Note) => void
  onEditNote: (id: string, patch: NoteEditPatch) => void
  onDeleteNote: (id: string) => void
  onPromoteNote: (id: string) => void
  onToggleRecorteSelect: (id: string) => void
  onPromoteRecorte: (recorte: Recorte, target: RecorteTarget, seed?: PromoteSeed) => void
  onArchiveRecorte: (id: string) => void
  onRestoreRecorte: (id: string) => void
  onDeleteRecorte: (id: string) => void
  onSendImagesToPdf?: (recortes: Recorte[]) => void
}) {
  return (
    <div
      ref={listRef}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {virtualItems.map((virtualRow) => {
        const item = items[virtualRow.index]
        if (!item) return null
        const i = virtualRow.index
        const isSelected = selectedIndex === i
        const { key, delay } = buildNotasFeedVirtualItemMeta({
          item,
          index: i,
          reducedMotion,
        })
        return (
          <div
            key={key}
            data-index={i}
            ref={virtualizer.measureElement}
            onMouseDown={() => onSelectIndex(i)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: '0.625rem',
            }}
          >
            <div
              className={`${reducedMotion ? '' : 'animate-fade-up'} ${isSelected ? 'selection-ring rounded-xl' : ''}`}
              style={{ animationDelay: delay }}
            >
              {item.type === 'note' ? (
                <NoteCard
                  note={item.note}
                  busy={noteBusy}
                  promoting={promotingNoteId === item.id}
                  onTogglePin={() => onToggleNotePin(item.note)}
                  onEdit={(patch) => onEditNote(item.id, patch)}
                  onDelete={() => onDeleteNote(item.id)}
                  onPromote={() => onPromoteNote(item.id)}
                />
              ) : (
                <SelectableRecorte
                  selectionMode={selectionMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => onToggleRecorteSelect(item.id)}
                  label={`Seleccionar captura: ${
                    item.recorte.sourceTitle ?? item.recorte.text.slice(0, 40)
                  }`}
                >
                  <ul className="contents">
                    <RecorteCard
                      recorte={item.recorte}
                      thumbSize={recorteThumb}
                      onPromote={onPromoteRecorte}
                      onArchive={() => onArchiveRecorte(item.id)}
                      onRestore={() => onRestoreRecorte(item.id)}
                      onDelete={() => onDeleteRecorte(item.id)}
                      onSendImagesToPdf={
                        onSendImagesToPdf
                          ? (recorte) => onSendImagesToPdf([recorte])
                          : undefined
                      }
                    />
                  </ul>
                </SelectableRecorte>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
