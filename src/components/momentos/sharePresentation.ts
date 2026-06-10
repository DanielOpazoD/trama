import type { MomentoShareRole } from '../../api/momentos'

export function personLabel(input: {
  displayName?: string
  email?: string
  fallback?: string
}): string {
  return input.displayName || input.email || input.fallback || 'otro usuario'
}

export function personInitial(label: string): string {
  const first = label.trim().charAt(0)
  return first ? first.toLocaleUpperCase('es') : 'U'
}

export function shareRoleLabel(role?: MomentoShareRole | 'owner'): string {
  if (role === 'editor') return 'puede editar'
  if (role === 'viewer') return 'solo lectura'
  if (role === 'owner') return 'tuyo'
  return 'compartido'
}
