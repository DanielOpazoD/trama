export function formatExtensionTokenDate(iso: string | null): string {
  if (!iso) return 'nunca'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'nunca'
  return date.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
