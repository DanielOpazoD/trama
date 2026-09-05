import type { BucketCount, ImportPreview } from './dataImportPreviewModel'

export function DataImportPreviewCard({
  fileName,
  preview,
  vaultNotice = null,
  busy,
  onConfirm,
  onCancel,
}: {
  fileName: string
  preview: ImportPreview
  vaultNotice?: string | null
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const {
    entities,
    relationships,
    quotes,
    momentos,
    notes,
    tasks,
    totalNew,
    totalDuplicates,
  } = preview

  return (
    <div
      className="mt-4 card-paper p-4 space-y-3 animate-fade-up"
      role="region"
      aria-label="Vista previa de importación"
    >
      <header className="space-y-1">
        <p className="section-eyebrow">Vista previa · {fileName}</p>
        <p className="text-body text-ink-700 leading-relaxed">
          Esta importación es <strong>aditiva</strong>: agrega lo nuevo a tu trama actual.{' '}
          <strong>No reemplaza</strong> ni borra nada de lo que ya tienes. Las filas con
          el mismo identificador se omiten silenciosas.
        </p>
      </header>

      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-ink-400 text-left">
            <th className="font-normal pb-1">Tipo</th>
            <th className="font-normal pb-1 text-right">En archivo</th>
            <th className="font-normal pb-1 text-right">Nuevas</th>
            <th className="font-normal pb-1 text-right">Duplicadas</th>
          </tr>
        </thead>
        <tbody className="text-ink-700">
          <PreviewRow label="Entidades" stats={entities} />
          <PreviewRow label="Relaciones" stats={relationships} />
          <PreviewRow label="Citas" stats={quotes} />
          <PreviewRow label="Momentos" stats={momentos} />
          <PreviewRow label="Notas" stats={notes} />
          <PreviewRow label="Tareas" stats={tasks} />
          <tr className="border-t border-ink-100/60 font-medium">
            <td className="pt-1.5">Total</td>
            <td className="pt-1.5 text-right">{preview.totalIncoming}</td>
            <td className="pt-1.5 text-right">{totalNew}</td>
            <td className="pt-1.5 text-right text-ink-400">{totalDuplicates}</td>
          </tr>
        </tbody>
      </table>

      {vaultNotice && (
        <p
          className="text-caption text-ink-600 leading-relaxed"
          data-testid="vault-notice"
        >
          {vaultNotice}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 text-xs text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || totalNew === 0}
          className="px-3 py-1.5 text-xs bg-ink-700 text-paper-50 rounded-md hover:bg-ink-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy
            ? 'Agregando…'
            : totalNew === 0
              ? 'No hay nuevas para agregar'
              : `Agregar ${totalNew} nuevas`}
        </button>
      </div>
    </div>
  )
}

function PreviewRow({ label, stats }: { label: string; stats: BucketCount }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right">{stats.incoming}</td>
      <td className="py-1 text-right">{stats.news}</td>
      <td className="py-1 text-right text-ink-400">{stats.duplicates}</td>
    </tr>
  )
}
