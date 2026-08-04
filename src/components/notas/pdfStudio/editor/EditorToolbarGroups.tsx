import { type ReactNode } from 'react'
import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import { type PdfFormFieldKind } from '../../../../lib/pdfStudio/model/model'
import {
  CameraIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  ShieldIcon,
  TextIcon,
  TrashIcon,
} from '../../../Icons'
import { IconButton } from '../../../IconButton'
import { type Tool } from './editorStyle'
import {
  Hint,
  objectAction,
  primaryAction,
  primaryInsertAction,
  segBtnTool,
  segGroup,
  ToolbarGroup,
} from './EditorToolbarPrimitives'
import { EditorToolbarFormMenu } from './EditorToolbarFormMenu'
import { EditorToolbarShapesMenu } from './EditorToolbarShapesMenu'
import { EditorToolbarXMenu } from './EditorToolbarXMenu'

export function EditorToolbarToolsGroup({
  canShowPdfMarkupTools,
  canShowShapeTools,
  onAddText,
  onAddFormField,
  onToolChange,
  primaryFieldKind,
  primaryHint,
  primaryLabel,
  primaryShortLabel,
  tool,
  xMarkSize,
  xMarkStroke,
  onXMarkSizeChange,
  onXMarkStrokeChange,
}: {
  canShowPdfMarkupTools: boolean
  canShowShapeTools: boolean
  onAddText: () => void
  onAddFormField?: (kind: PdfFormFieldKind) => void
  onToolChange: (t: Tool) => void
  primaryFieldKind: PdfFormFieldKind | null
  primaryHint: string
  primaryLabel: string
  primaryShortLabel: string
  tool: Tool
  xMarkSize: number
  xMarkStroke: number
  onXMarkSizeChange: (next: number) => void
  onXMarkStrokeChange: (next: number) => void
}) {
  const handlePrimaryInsert =
    primaryFieldKind === null
      ? onAddText
      : onAddFormField
        ? () => onAddFormField(primaryFieldKind)
        : undefined

  return (
    <ToolbarGroup label="Herramientas">
      <Hint content={primaryHint}>
        <button
          type="button"
          onClick={handlePrimaryInsert}
          disabled={primaryFieldKind !== null && !onAddFormField}
          aria-label={primaryLabel}
          className={primaryInsertAction}
        >
          <TextIcon size={16} />
          {primaryShortLabel}
        </button>
      </Hint>
      <div className={segGroup}>
        <Hint content="Seleccionar y mover">
          <IconButton
            onClick={() => onToolChange('select')}
            className={segBtnTool(tool === 'select')}
            label="Herramienta seleccionar"
            aria-pressed={tool === 'select'}
          >
            <CursorIcon size={16} />
          </IconButton>
        </Hint>
        {canShowPdfMarkupTools ? (
          <Hint content="Marcar redacción segura">
            <IconButton
              onClick={() => onToolChange('redact')}
              className={segBtnTool(tool === 'redact')}
              label="Herramienta redactar"
              aria-pressed={tool === 'redact'}
            >
              <ShieldIcon size={16} />
            </IconButton>
          </Hint>
        ) : null}
        {canShowPdfMarkupTools ? (
          <Hint content="Resaltar texto">
            <IconButton
              onClick={() => onToolChange('highlight')}
              className={segBtnTool(tool === 'highlight')}
              label="Herramienta Resaltar"
              aria-pressed={tool === 'highlight'}
            >
              <HighlighterIcon size={16} />
            </IconButton>
          </Hint>
        ) : null}
      </div>
      {canShowShapeTools ? (
        <EditorToolbarShapesMenu tool={tool} onToolChange={onToolChange} />
      ) : null}
      <Hint content="Marcar casilleros con una X · clic en la X la activa o desactiva">
        <IconButton
          onClick={() => onToolChange('x')}
          className={segBtnTool(tool === 'x')}
          label="Herramienta marca X para casilleros"
          aria-pressed={tool === 'x'}
        >
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect
              x={2.25}
              y={2.25}
              width={11.5}
              height={11.5}
              rx={2.5}
              stroke="currentColor"
              strokeWidth={1.4}
            />
            <path
              d="M5.5 5.5l5 5M10.5 5.5l-5 5"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </Hint>
      {tool === 'x' ? (
        <EditorToolbarXMenu
          xMarkSize={xMarkSize}
          onXMarkSizeChange={onXMarkSizeChange}
          xMarkStroke={xMarkStroke}
          onXMarkStrokeChange={onXMarkStrokeChange}
        />
      ) : null}
    </ToolbarGroup>
  )
}

export function EditorToolbarInsertGroup({
  canStampImage,
  onAddImage,
  onInspectForms,
  onSuggestFormFields,
  stampAssetMenu,
}: {
  canStampImage: boolean
  onAddImage: () => void
  onInspectForms?: () => void
  onSuggestFormFields?: () => void
  stampAssetMenu?: ReactNode
}) {
  return (
    <ToolbarGroup label="Insertar">
      {canStampImage ? stampAssetMenu : null}
      {canStampImage ? (
        <Hint content="Estampar una imagen sobre la página">
          <IconButton
            onClick={onAddImage}
            label="Estampar imagen"
            className={primaryAction}
          >
            <CameraIcon size={16} />
          </IconButton>
        </Hint>
      ) : null}
      <EditorToolbarFormMenu
        onInspectForms={onInspectForms}
        onSuggestFormFields={onSuggestFormFields}
      />
    </ToolbarGroup>
  )
}

export function EditorToolbarObjectGroup({
  duplicateLabel,
  hasDuplicableSelection,
  hasSelection,
  isMac,
  onDelete,
  onDuplicate,
}: {
  duplicateLabel: string
  hasDuplicableSelection: boolean
  hasSelection: boolean
  isMac: boolean
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <ToolbarGroup label="Objeto">
      <Hint
        content={
          hasDuplicableSelection
            ? pdfCommandTooltip('duplicateAnnotation', isMac)
            : 'Selecciona una anotación para duplicarla'
        }
      >
        <IconButton
          onClick={onDuplicate}
          label={duplicateLabel}
          disabled={!hasDuplicableSelection}
          className={objectAction}
        >
          <DuplicateIcon size={16} />
        </IconButton>
      </Hint>
      <Hint
        content={
          hasSelection
            ? pdfCommandTooltip('deleteAnnotation', isMac)
            : 'Selecciona una anotación para eliminarla'
        }
      >
        <IconButton
          onClick={onDelete}
          label="Eliminar"
          disabled={!hasSelection}
          className={`${objectAction} hover:text-[color:var(--accent-clay)]`}
        >
          <TrashIcon size={16} />
        </IconButton>
      </Hint>
    </ToolbarGroup>
  )
}
