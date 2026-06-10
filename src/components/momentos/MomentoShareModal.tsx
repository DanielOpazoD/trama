import { useState } from 'react'
import type { MomentoShareRole } from '../../api/momentos'
import { useCreateMomentoShareInvitation, useToast } from '../../state'
import type { Momento } from '../../types'
import { CloseIcon } from '../Icons'

export function MomentoShareModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MomentoShareRole>('viewer')
  const invite = useCreateMomentoShareInvitation()
  const toast = useToast()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      await invite.mutateAsync({ momentoId: momento.id, email, role })
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-ink-100 bg-paper-50 p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-serif text-lg text-ink-700">Compartir momento</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-400 hover:text-ink-700 rounded transition-colors"
            aria-label="Cerrar"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <label className="block text-micro uppercase tracking-eyebrow text-ink-400">
          correo
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            className="mt-1 w-full rounded-md border border-ink-100 bg-paper-100/50 px-3 py-2 text-sm normal-case tracking-normal text-ink-700 outline-none focus:border-ink-300"
            placeholder="persona@correo.cl"
          />
        </label>
        <div
          className="mt-3 grid grid-cols-2 gap-2"
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
        <button
          type="submit"
          disabled={invite.isPending}
          className="mt-4 w-full rounded-md bg-ink-900 px-3 py-2 text-sm text-paper-50 transition-opacity disabled:opacity-50"
        >
          {invite.isPending ? 'Enviando...' : 'Invitar'}
        </button>
      </form>
    </div>
  )
}
