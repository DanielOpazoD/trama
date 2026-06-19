export function requireDeletedAt(
  value: string | null | undefined,
  operation: string,
): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  throw new Error(`${operation} did not return deletedAt`)
}
