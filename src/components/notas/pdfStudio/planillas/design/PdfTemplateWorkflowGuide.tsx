/**
 * Guía contextual de una línea para el modo "diseñar planilla". Solo orienta —
 * importar y guardar viven en la barra del documento (`PdfStudioDocumentToolbar`);
 * los casilleros se crean con doble clic en la hoja (ya no hay botón dedicado).
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
      ? 'Doble clic en una hoja para marcar los casilleros; al crear el primero podrás guardar la planilla.'
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
