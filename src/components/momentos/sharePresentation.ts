import type { MomentoShareRole } from '../../api/momentos'

export function personLabel(input: {
  displayName?: string
  email?: string
  fallback?: string
}): string {
  const displayName = input.displayName?.trim()
  if (displayName) return displayName
  const emailName = nameFromEmail(input.email)
  if (emailName) return emailName
  const fallback = input.fallback?.trim()
  return fallback || 'otro usuario'
}

function nameFromEmail(email?: string): string | undefined {
  const localPart = email?.split('@')[0]?.trim()
  if (!localPart) return undefined
  const words = localPart
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLocaleLowerCase('es')
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
    })
    .filter(Boolean)
  return words.length ? words.join(' ') : undefined
}

export function personInitial(label: string): string {
  const first = label.trim().charAt(0)
  return first ? first.toLocaleUpperCase('es') : 'U'
}

export function shareRoleLabel(role?: MomentoShareRole | 'owner'): string {
  if (role === 'editor') return 'puede editar'
  if (role === 'viewer') return 'solo lectura'
  if (role === 'owner') return 'propietario'
  return 'compartido'
}
