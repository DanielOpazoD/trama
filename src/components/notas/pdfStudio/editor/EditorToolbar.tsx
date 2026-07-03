import {
  type PdfFontKind,
  type PdfFormFieldKind,
} from '../../../../lib/pdfStudio/model/model'
import {
  editorToolbarContextCapabilities,
  editorToolbarPrimaryInsertAction,
  isMacLikeUserAgent,
  type EditorToolbarContext,
} from './EditorToolbarModel'
import { type ReactNode } from 'react'
import { type TextStyle, type Tool } from './editorStyle'
import { ToolbarGroup } from './EditorToolbarPrimitives'
import {
  EditorToolbarInsertGroup,
  EditorToolbarObjectGroup,
  EditorToolbarToolsGroup,
} from './EditorToolbarGroups'
import { EditorToolbarStyleMenu } from './EditorToolbarStyleMenu'
import { EditorToolbarZoomControl } from './EditorToolbarZoomControl'

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
  context?: EditorToolbarContext
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
  const isMac = isMacLikeUserAgent(
    typeof navigator === 'undefined' ? undefined : navigator.userAgent,
  )
  const capabilities = editorToolbarContextCapabilities(context)
  const primaryInsert = editorToolbarPrimaryInsertAction(context)

  return (
    <div
      role="toolbar"
      aria-label="Barra de herramientas de edición del PDF"
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-ink-100/70 bg-paper-100/65 px-2 py-1 shadow-sm shadow-ink-900/5 shrink-0"
    >
      <EditorToolbarToolsGroup
        canShowPdfMarkupTools={capabilities.canShowPdfMarkupTools}
        canShowShapeTools={capabilities.canShowShapeTools}
        onAddText={onAddText}
        onAddFormField={onAddFormField}
        onToolChange={onToolChange}
        primaryFieldKind={primaryInsert.fieldKind}
        primaryHint={primaryInsert.hint}
        primaryLabel={primaryInsert.label}
        tool={tool}
        xMarkSize={xMarkSize}
        xMarkStroke={xMarkStroke}
        onXMarkSizeChange={onXMarkSizeChange}
        onXMarkStrokeChange={onXMarkStrokeChange}
      />

      <EditorToolbarInsertGroup
        canStampImage={capabilities.canStampImage}
        onAddImage={onAddImage}
        onInspectForms={onInspectForms}
        onSuggestFormFields={onSuggestFormFields}
        stampAssetMenu={stampAssetMenu}
      />

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
      <EditorToolbarObjectGroup
        duplicateLabel={duplicateLabel}
        hasDuplicableSelection={hasDuplicableSelection}
        hasSelection={hasSelection}
        isMac={isMac}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
      {capabilities.canShowToolbarZoom ? (
        <ToolbarGroup label="Vista" grow>
          <EditorToolbarZoomControl
            zoom={zoom}
            onBeforeChange={onPrepareZoomAnchor}
            onZoomChange={onZoomChange}
          />
        </ToolbarGroup>
      ) : null}
    </div>
  )
}
