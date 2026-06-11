import { useState } from 'react'
import type { MomentoShareRole } from '../../api/momentos'
import {
  useCreateMomentoShareInvitation,
  useMomentoShareAccessQuery,
  useRevokeMomentoShareAccess,
  useToast,
  useUpdateMomentoShareAccessRole,
} from '../../state'
import { CloseIcon } from '../Icons'
import { personInitial, personLabel, shareRoleLabel } from './sharePresentation'

export function MomentoShareModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MomentoShareRole>('viewer')
  const invite = useCreateMomentoShareInvitation()
  const accessQuery = useMomentoShareAccessQuery()
  const revoke = useRevokeMomentoShareAccess()
  const updateRole = useUpdateMomentoShareAccessRole()
  const toast = useToast()
  const acceptedAccess = accessQuery.data?.items ?? []
  const accessSummary = accessQuery.isLoading
    ? 'Cargando accesos...'
    : acceptedAccess.length === 1
      ? '1 persona con acceso'
      : `${acceptedAccess.length} personas con acceso`

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      await invite.mutateAsync({ email, role })
      toast.show({ message: 'Invitación enviada.', tone: 'success' })
      setEmail('')
      setRole('viewer')
      onClose()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo compartir',
        tone: 'error',
      })
    }
  }

  async function handleRevoke(userId: string) {
    try {
      await revoke.mutateAsync(userId)
      toast.show({ message: 'Acceso revocado.', tone: 'success' })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo revocar',
        tone: 'error',
      })
    }
  }

  async function handleRoleChange(
    userId: string,
    nextRole: MomentoShareRole,
    label: string,
  ) {
    try {
      await updateRole.mutateAsync({ userId, role: nextRole })
      toast.show({
        message:
          nextRole === 'editor'
            ? `${label} ahora puede editar.`
            : `${label} queda en solo lectura.`,
        tone: 'success',
      })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo cambiar el permiso',
        tone: 'error',
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-ink-100 bg-paper-50 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-400">
              Espacio compartido
            </p>
            <h3 className="mt-1 font-serif text-xl text-ink-800">Compartir Momentos</h3>
            <p className="mt-1 max-w-md text-sm text-ink-500">
              Compartir todos mis Momentos con este correo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-400 hover:text-ink-700 rounded transition-colors"
            aria-label="Cerrar"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-100 bg-paper-100/45 px-3 py-2.5">
            <p className="text-micro uppercase tracking-eyebrow text-ink-400">
              acceso activo
            </p>
            <p className="mt-1 text-sm font-medium text-ink-700">{accessSummary}</p>
          </div>
          <div className="rounded-lg border border-ink-100 bg-paper-100/45 px-3 py-2.5">
            <p className="text-micro uppercase tracking-eyebrow text-ink-400">alcance</p>
            <p className="mt-1 text-sm font-medium text-ink-700">Todos tus Momentos</p>
          </div>
        </div>

        <section className="rounded-lg border border-ink-100 bg-paper-100/35 p-3">
          <p className="text-micro uppercase tracking-eyebrow text-ink-400">
            nueva invitación
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-micro uppercase tracking-eyebrow text-ink-400">
              correo
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                className="mt-1 w-full rounded-md border border-ink-100 bg-paper-50 px-3 py-2 text-sm normal-case tracking-normal text-ink-700 outline-none focus:border-ink-300"
                placeholder="persona@correo.cl"
              />
            </label>
            <div
              className="grid min-w-40 grid-cols-2 gap-2 self-end"
              role="radiogroup"
              aria-label="Permiso"
            >
              {(['viewer', 'editor'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={role === value}
                  onClick={() => setRole(value)}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    role === value
                      ? 'border-ink-400 bg-ink-900 text-paper-50'
                      : 'border-ink-100 bg-paper-50 text-ink-500 hover:border-ink-200'
                  }`}
                >
                  {value === 'viewer' ? 'Ver' : 'Editar'}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={invite.isPending}
            className="mt-3 w-full rounded-md bg-ink-900 px-3 py-2 text-sm text-paper-50 transition-opacity disabled:opacity-50 sm:w-auto"
          >
            {invite.isPending ? 'Enviando...' : 'Invitar'}
          </button>
        </section>

        <section className="mt-5 border-t border-ink-100 pt-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="text-micro uppercase tracking-eyebrow text-ink-400">
              personas con acceso
            </p>
            <span className="text-caption text-ink-400 tabular-nums">
              {accessSummary}
            </span>
          </div>
          {accessQuery.isLoading ? (
            <p className="text-sm text-ink-400">Cargando...</p>
          ) : acceptedAccess.length ? (
            <ul className="space-y-2">
              {acceptedAccess.map((item) => {
                const label = personLabel({
                  displayName: item.displayName,
                  email: item.email,
                  fallback: item.userId,
                })
                return (
                  <li
                    key={item.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper-100/45 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium text-paper-50"
                        style={{ backgroundColor: 'var(--accent-gold)' }}
                        aria-hidden
                      >
                        {personInitial(label)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-700">
                          {label}
                        </p>
                        {item.email && item.email !== label && (
                          <p className="truncate text-caption text-ink-400">
                            {item.email}
                          </p>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-400">
                          <span>Acceso activo</span>
                          <span className="text-ink-300">·</span>
                          <span>{shareRoleLabel(item.role)}</span>
                          <span className="text-ink-300">·</span>
                          <span>Aceptado {formatAcceptedDate(item.acceptedAt)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        className="grid grid-cols-2 rounded-md border border-ink-100 bg-paper-50 p-0.5"
                        aria-label={`Permiso de ${label}`}
                      >
                        {(['viewer', 'editor'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={updateRole.isPending || item.role === value}
                            onClick={() => handleRoleChange(item.userId, value, label)}
                            aria-label={
                              value === 'editor'
                                ? `Permitir editar a ${label}`
                                : `Dejar solo lectura a ${label}`
                            }
                            className={`rounded px-2 py-1 text-caption transition-colors disabled:cursor-default ${
                              item.role === value
                                ? 'bg-ink-900 text-paper-50'
                                : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-800'
                            }`}
                          >
                            {value === 'viewer' ? 'Ver' : 'Editar'}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={revoke.isPending}
                        onClick={() => handleRevoke(item.userId)}
                        className="rounded-md border border-ink-100 bg-paper-50 px-2.5 py-1.5 text-sm text-ink-500 transition-colors hover:border-ink-200 hover:text-ink-700 disabled:opacity-50"
                        aria-label={`Revocar acceso a ${label}`}
                      >
                        Revocar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-100 bg-paper-100/45 px-3 py-4 text-sm text-ink-400">
              Sin accesos aceptados todavía.
            </p>
          )}
        </section>
      </form>
    </div>
  )
}

function formatAcceptedDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
