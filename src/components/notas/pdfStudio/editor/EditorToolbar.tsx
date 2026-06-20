import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import {
  type PdfFontKind,
  type PdfFormFieldKind,
} from '../../../../lib/pdfStudio/model/model'
import {
  CameraIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  ShieldIcon,
  TextIcon,
  TrashIcon,
} from '../../../Icons'
import { type ReactNode } from 'react'
import { type TextStyle, type Tool } from './editorStyle'
import {
  Hint,
  objectAction,
  primaryAction,
  segBtnTool,
  segGroup,
  ToolbarGroup,
} from './EditorToolbarPrimitives'
import { EditorToolbarFormMenu } from './EditorToolbarFormMenu'
import { EditorToolbarShapesMenu } from './EditorToolbarShapesMenu'
import { EditorToolbarStyleMenu } from './EditorToolbarStyleMenu'
import { EditorToolbarXMenu } from './EditorToolbarXMenu'
import { EditorToolbarZoomControl } from './EditorToolbarZoomControl'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function EditorToolbar({
  context = 'editor',
  tool,
  onToolChange,
  xMarkSize,
  onXMarkSizeChange,
  xMarkStroke,
  onXMarkStrokeChange,
  onAddText,
  onAddImage,
  stampAssetMenu,
  onAddFormField,
  onInspectForms,
  onSuggestFormFields,
  activeFont,
  activeSize,
  activeBold,
  activeItalic,
  activeColor,
  activeOpacity,
  activeRotation,
  onApplyStyle,
  hasDuplicableSelection,
  duplicateLabel = 'Duplicar texto',
  onDuplicate,
  hasSelection,
  onDelete,
  zoom,
  onPrepareZoomAnchor,
  onZoomChange,
}: {
  context?: 'editor' | 'templateDesign'
  tool: Tool
  onToolChange: (t: Tool) => void
  xMarkSize: number
  onXMarkSizeChange: (next: number) => void
  xMarkStroke: number
  onXMarkStrokeChange: (next: number) => void
  onAddText: () => void
  onAddImage: () => void
  stampAssetMenu?: ReactNode
  onAddFormField?: (kind: PdfFormFieldKind) => void
  onInspectForms?: () => void
  onSuggestFormFields?: () => void
  activeFont: PdfFontKind
  activeSize: number
  activeBold: boolean
  activeItalic: boolean
  activeColor: string
  activeOpacity: number
  activeRotation: number
  onApplyStyle: (patch: Partial<TextStyle>) => void
  hasDuplicableSelection: boolean
  duplicateLabel?: string
  onDuplicate: () => void
  hasSelection: boolean
  onDelete: () => void
  zoom: number
  onPrepareZoomAnchor?: () => void
  onZoomChange: (z: number) => void
}) {
  const isMac = isMacLike()
  const isTemplateDesign = context === 'templateDesign'
  const primaryInsertLabel = isTemplateDesign
    ? 'Crear casillero de texto'
    : 'Agregar cuadro de texto'
  const primaryInsertHint = isTemplateDesign
    ? 'Crear un casillero rellenable'
    : 'Agregar un cuadro editable'
  const handlePrimaryInsert =
    isTemplateDesign && onAddFormField ? () => onAddFormField('text') : onAddText

  return (
    <div
      role="toolbar"
      aria-label="Barra de herramientas de edición del PDF"
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-ink-100/70 bg-paper-100/65 px-2 py-1 shadow-sm shadow-ink-900/5 shrink-0"
    >
      <ToolbarGroup label="Herramientas">
        <Hint content={primaryInsertHint}>
          <button
            type="button"
            onClick={handlePrimaryInsert}
            aria-label={primaryInsertLabel}
            className={primaryAction}
          >
            <TextIcon size={14} />
          </button>
        </Hint>
        <div className={segGroup}>
          <Hint content="Seleccionar y mover">
            <button
              type="button"
              onClick={() => onToolChange('select')}
              className={segBtnTool(tool === 'select')}
              aria-label="Herramienta seleccionar"
              aria-pressed={tool === 'select'}
            >
              <CursorIcon size={14} />
            </button>
          </Hint>
          {!isTemplateDesign ? (
            <Hint content="Marcar redacción segura">
              <button
                type="button"
                onClick={() => onToolChange('redact')}
                className={segBtnTool(tool === 'redact')}
                aria-label="Herramienta redactar"
                aria-pressed={tool === 'redact'}
              >
                <ShieldIcon size={14} />
              </button>
            </Hint>
          ) : null}
          {!isTemplateDesign ? (
            <Hint content="Resaltar texto">
              <button
                type="button"
                onClick={() => onToolChange('highlight')}
                className={segBtnTool(tool === 'highlight')}
                aria-label="Herramienta Resaltar"
                aria-pressed={tool === 'highlight'}
              >
                <HighlighterIcon size={14} />
              </button>
            </Hint>
          ) : null}
        </div>
        {!isTemplateDesign ? (
          <EditorToolbarShapesMenu tool={tool} onToolChange={onToolChange} />
        ) : null}
        <Hint content="Marcar casilleros con una X · clic en la X la activa o desactiva">
          <button
            type="button"
            onClick={() => onToolChange('x')}
            className={segBtnTool(tool === 'x')}
            aria-label="Herramienta marca X para casilleros"
            aria-pressed={tool === 'x'}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
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
          </button>
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

      <ToolbarGroup label="Insertar">
        {!isTemplateDesign ? stampAssetMenu : null}
        {!isTemplateDesign ? (
          <Hint content="Estampar una imagen sobre la página">
            <button
              type="button"
              onClick={onAddImage}
              aria-label="Estampar imagen"
              className={primaryAction}
            >
              <CameraIcon size={14} />
            </button>
          </Hint>
        ) : null}
        <EditorToolbarFormMenu
          onAddFormField={onAddFormField}
          onInspectForms={onInspectForms}
          onSuggestFormFields={onSuggestFormFields}
        />
      </ToolbarGroup>

      <ToolbarGroup label="Estilo">
        <EditorToolbarStyleMenu
          activeFont={activeFont}
          activeSize={activeSize}
          activeBold={activeBold}
          activeItalic={activeItalic}
          activeColor={activeColor}
          activeOpacity={activeOpacity}
          activeRotation={activeRotation}
          onApplyStyle={onApplyStyle}
        />
      </ToolbarGroup>
      <ToolbarGroup label="Objeto">
        <Hint
          content={
            hasDuplicableSelection
              ? pdfCommandTooltip('duplicateAnnotation', isMac)
              : 'Selecciona una anotación para duplicarla'
          }
        >
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={duplicateLabel}
            disabled={!hasDuplicableSelection}
            className={objectAction}
          >
            <DuplicateIcon size={14} />
          </button>
        </Hint>
        <Hint
          content={
            hasSelection
              ? pdfCommandTooltip('deleteAnnotation', isMac)
              : 'Selecciona una anotación para eliminarla'
          }
        >
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar"
            disabled={!hasSelection}
            className={`${objectAction} hover:text-[color:var(--accent-clay)]`}
          >
            <TrashIcon size={14} />
          </button>
        </Hint>
      </ToolbarGroup>
      <ToolbarGroup label="Vista" grow>
        <EditorToolbarZoomControl
          zoom={zoom}
          onBeforeChange={onPrepareZoomAnchor}
          onZoomChange={onZoomChange}
        />
      </ToolbarGroup>
    </div>
  )
}
