import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys } from '../../state/queryClient'
import { useToast } from '../../state/toast'
import { PanelHeader } from './_shared'
import { formatExtensionTokenDate } from './extensionPanelModel'

/**
 * Conectar extensión — tokens personales para la extensión de Chrome.
 * El token en claro aparece UNA sola vez al generarlo (después solo
 * existe su hash en el servidor); el listado muestra creación y último
 * uso para reconocer y revocar un token filtrado.
 */
export function ExtensionPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [freshToken, setFreshToken] = useState<string | null>(null)

  const tokens = useQuery({
    queryKey: queryKeys.apiTokens,
    queryFn: () => api.listApiTokens(),
  })

  const create = useMutation({
    mutationFn: () => api.createApiToken(),
    onSuccess: (t) => {
      setFreshToken(t.token ?? null)
      qc.invalidateQueries({ queryKey: queryKeys.apiTokens })
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiTokens })
      toast.show({ message: 'Token revocado', tone: 'success' })
    },
  })

  async function copyFresh() {
    if (!freshToken) return
    try {
      await navigator.clipboard.writeText(freshToken)
      toast.show({ message: 'Token copiado', tone: 'success' })
    } catch {
      /* clipboard bloqueado: queda visible para copiar a mano */
    }
  }

  return (
    <section>
      <PanelHeader
        title="Conectar extensión"
        hint="La extensión de Chrome guarda capturas en tu bandeja de Recortes. Genera un token, pégalo en la extensión (icono → conexión) y listo. Cada token se puede revocar sin afectar al resto."
      />

      <div className="max-w-md space-y-4">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="btn-accent text-xs"
        >
          {create.isPending ? 'generando…' : 'generar token'}
        </button>

        {freshToken && (
          <div className="rounded-lg border border-ink-100 bg-paper-100/50 p-3">
            <p className="text-micro uppercase tracking-eyebrow text-ink-300">
              tu token — se muestra una sola vez
            </p>
            <code className="mt-1.5 block break-all rounded bg-paper-50 border border-ink-100/70 px-2 py-1.5 text-caption text-ink-700">
              {freshToken}
            </code>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={copyFresh}
                className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                copiar
              </button>
              <button
                onClick={() => setFreshToken(null)}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                listo, lo guardé
              </button>
            </div>
          </div>
        )}

        {tokens.data && tokens.data.length > 0 && (
          <ul className="divide-y divide-ink-100/60 rounded-lg border border-ink-100/70">
            {tokens.data.map((t) => (
              <li key={t.id} className="flex items-baseline gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-caption text-ink-700">{t.label}</p>
                  <p className="text-micro text-ink-300">
                    creado {formatExtensionTokenDate(t.createdAt)} · último uso{' '}
                    {formatExtensionTokenDate(t.lastUsedAt)}
                  </p>
                </div>
                <button
                  onClick={() => revoke.mutate(t.id)}
                  disabled={revoke.isPending}
                  className="ml-auto shrink-0 text-micro uppercase tracking-eyebrow text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
                >
                  revocar
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-micro text-ink-400 leading-relaxed">
          La extensión vive en la carpeta <code>extension/</code> del repositorio
          (instalación: chrome://extensions → Load unpacked). El token viaja como Bearer y
          en el servidor solo se guarda su hash.
        </p>
      </div>
    </section>
  )
}
