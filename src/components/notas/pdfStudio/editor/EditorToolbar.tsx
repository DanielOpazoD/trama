import { pdfCommandTooltip } from '../../../../lib/pdfStudio/model/commands'
import {
  previewFontFamily,
  type PdfFontKind,
  type PdfFormFieldKind,
} from '../../../../lib/pdfStudio/model/model'
import {
  BoldIcon,
  CameraIcon,
  ChevronDownIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  OpacityIcon,
  PlusIcon,
  RotateIcon,
  ShieldIcon,
  TextIcon,
  TextSizeIcon,
  TrashIcon,
} from '../../../Icons'
import { OverflowMenu } from '../../../OverflowMenu'
import {
  clamp,
  stepBtn,
  X_SIZE_MAX,
  X_SIZE_MIN,
  X_SIZE_STEP,
  type TextStyle,
  type Tool,
} from './editorStyle'
import {
  activeMenuItem,
  COLORS,
  editorMenuLayer,
  focusRing,
  FONTS,
  Hint,
  menuTrigger,
  objectAction,
  primaryAction,
  segBtnTool,
  segGroup,
  Stepper,
  ToolbarGroup,
} from './EditorToolbarPrimitives'
import { EditorToolbarFormMenu } from './EditorToolbarFormMenu'
import { EditorToolbarShapesMenu } from './EditorToolbarShapesMenu'
import { EditorToolbarZoomControl } from './EditorToolbarZoomControl'

const SIZE_MIN = 0.012
const SIZE_MAX = 0.14
const SIZE_STEP = 0.004

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
  onAddText,
  onAddImage,
  onAddFormField,
  onInspectForms,
  onSuggestFormFields,
  activeFont,
  activeSize,
  activeBold,
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
  onAddText: () => void
  onAddImage: () => void
  onAddFormField?: (kind: PdfFormFieldKind) => void
  onInspectForms?: () => void
  onSuggestFormFields?: () => void
  activeFont: PdfFontKind
  activeSize: number
  activeBold: boolean
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
  const activeFontLabel = FONTS.find((f) => f.key === activeFont)?.label ?? 'Fuente'
  const activeColorLabel = COLORS.find((c) => c.hex === activeColor)?.label ?? 'Color'
  const stepSize = (delta: number) =>
    onApplyStyle({ sizeRatio: clamp(activeSize + delta, SIZE_MIN, SIZE_MAX) })
  const stepOpacity = (delta: number) =>
    onApplyStyle({ opacity: clamp(activeOpacity + delta, 0.1, 1) })
  const stepRotation = (delta: number) =>
    onApplyStyle({ rotation: (((activeRotation + delta) % 360) + 360) % 360 })
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
          <div
            className={segGroup}
            role="group"
            aria-label="Tamaño de la marca X (aplica a todas)"
          >
            <Hint content="Achicar todas las X">
              <button
                type="button"
                onClick={() => onXMarkSizeChange(xMarkSize - X_SIZE_STEP)}
                disabled={xMarkSize <= X_SIZE_MIN + 1e-6}
                className={stepBtn}
                aria-label="Achicar la marca X"
              >
                -
              </button>
            </Hint>
            <span
              className="min-w-[2.5rem] text-center text-micro tabular-nums text-ink-500"
              aria-live="polite"
            >
              X {Math.round((xMarkSize / X_SIZE_MAX) * 100)}%
            </span>
            <Hint content="Agrandar todas las X">
              <button
                type="button"
                onClick={() => onXMarkSizeChange(xMarkSize + X_SIZE_STEP)}
                disabled={xMarkSize >= X_SIZE_MAX - 1e-6}
                className={stepBtn}
                aria-label="Agrandar la marca X"
              >
                +
              </button>
            </Hint>
          </div>
        ) : null}
      </ToolbarGroup>

      <ToolbarGroup label="Insertar">
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
        <OverflowMenu
          label="Fuente"
          width="w-40"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={
            <>
              <span
                className="text-caption font-semibold"
                style={{ fontFamily: previewFontFamily(activeFont) }}
              >
                Aa
              </span>
              <span className="sr-only">{activeFontLabel}</span>
              <ChevronDownIcon size={12} className="text-ink-300" />
            </>
          }
        >
          {(close) => (
            <>
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeFont === f.key}
                  aria-label={`Fuente ${f.label}`}
                  onClick={() => {
                    onApplyStyle({ font: f.key })
                    close()
                  }}
                  className={activeMenuItem(activeFont === f.key)}
                  style={{ fontFamily: previewFontFamily(f.key) }}
                >
                  <span>{f.label}</span>
                </button>
              ))}
            </>
          )}
        </OverflowMenu>
        <Stepper
          icon={<TextSizeIcon size={14} />}
          label="Tamaño de letra"
          value={String(Math.round(activeSize * 792))}
          valueClass="w-7"
          onDec={() => stepSize(-SIZE_STEP)}
          onInc={() => stepSize(SIZE_STEP)}
          decDisabled={activeSize <= SIZE_MIN + 1e-6}
          incDisabled={activeSize >= SIZE_MAX - 1e-6}
        />
        <Hint content="Negrita">
          <button
            type="button"
            onClick={() => onApplyStyle({ bold: !activeBold })}
            aria-pressed={activeBold}
            aria-label="Negrita"
            className={`shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${focusRing} ${
              activeBold
                ? 'bg-ink-100/60 text-ink-800'
                : 'text-ink-400 hover:bg-ink-100/50 hover:text-ink-700'
            }`}
          >
            <BoldIcon size={14} />
          </button>
        </Hint>
        <OverflowMenu
          label="Color"
          width="w-44"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={
            <>
              <span
                className="h-4 w-4 rounded-full border border-ink-900/15"
                style={{ backgroundColor: activeColor }}
                aria-hidden
              />
              <span className="sr-only">{activeColorLabel}</span>
              <ChevronDownIcon size={12} className="text-ink-300" />
            </>
          }
        >
          {(close) => (
            <>
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeColor === c.hex}
                  aria-label={`Color ${c.label}`}
                  onClick={() => {
                    onApplyStyle({ color: c.hex })
                    close()
                  }}
                  className={activeMenuItem(activeColor === c.hex)}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-ink-900/15"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden
                  />
                  <span>{c.label}</span>
                </button>
              ))}
            </>
          )}
        </OverflowMenu>
        <OverflowMenu
          label="Más funciones"
          width="w-64"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={<PlusIcon size={14} />}
        >
          {(close) => (
            <div className="space-y-1.5">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={tool === 'highlight'}
                aria-label="Herramienta Resaltar"
                onClick={() => {
                  onToolChange('highlight')
                  close()
                }}
                className={activeMenuItem(tool === 'highlight')}
              >
                <HighlighterIcon size={14} />
                <span>Resaltar</span>
              </button>
              <Stepper
                icon={<OpacityIcon size={14} />}
                label="Opacidad"
                value={`${Math.round(activeOpacity * 100)}%`}
                valueClass="w-9"
                onDec={() => stepOpacity(-0.1)}
                onInc={() => stepOpacity(0.1)}
                decDisabled={activeOpacity <= 0.1 + 1e-6}
                incDisabled={activeOpacity >= 1 - 1e-6}
              />
              <Stepper
                icon={<RotateIcon size={14} />}
                label="Rotación del texto"
                value={`${activeRotation}°`}
                valueClass="w-8"
                onDec={() => stepRotation(-15)}
                onInc={() => stepRotation(15)}
              />
            </div>
          )}
        </OverflowMenu>
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
