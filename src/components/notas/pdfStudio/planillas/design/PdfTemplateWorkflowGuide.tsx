/**
 * Guía contextual de una línea para el modo "diseñar planilla". Solo orienta —
 * NO repite acciones: importar, agregar casilleros y guardar viven en la barra de
 * herramientas del documento (`PdfStudioDocumentToolbar`), que ya es adaptativa.
 */
export function PdfTemplateWorkflowGuide({
  fieldCount,
  pageCount,
}: {
  fieldCount: number
  pageCount: number
}) {
  const hasBase = pageCount > 0
  const hasFields = fieldCount > 0
  const hint = !hasBase
    ? 'Sube un PDF o imagen para empezar la planilla.'
    : !hasFields
      ? 'Marca en el documento los espacios donde se escribirá, luego guarda la planilla.'
      : `${fieldCount} ${fieldCount === 1 ? 'campo marcado' : 'campos marcados'} · guárdala como plantilla para reutilizarla.`

  return (
    <p
      aria-label="Guía de plantilla"
      className="rounded-md border border-ink-100 bg-paper-50/70 px-3 py-2 text-caption text-ink-500"
    >
      {hint}
    </p>
  )
}
