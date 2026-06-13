import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import type { WhatsAppLinkCode } from '../../api'
import { queryKeys } from '../../state/queryClient'
import { useToast } from '../../state/toast'
import { PanelHeader } from './_shared'

/**
 * Conectar WhatsApp — vincular un número para capturar notas, citas,
 * entidades y momentos por mensaje. Se genera un código de un solo uso y se
 * canjea enviando "vincular <código>" por WhatsApp. El número queda atado a
 * tu cuenta; el webhook escribe en tu nombre solo después del canje.
 */
export function WhatsAppPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [fresh, setFresh] = useState<WhatsAppLinkCode | null>(null)

  const links = useQuery({
    queryKey: queryKeys.whatsappLinks,
    queryFn: () => api.listWhatsAppLinks(),
  })

  const create = useMutation({
    mutationFn: () => api.createWhatsAppLinkCode(),
    onSuccess: (c) => {
      setFresh(c)
      qc.invalidateQueries({ queryKey: queryKeys.whatsappLinks })
    },
  })

  const unlink = useMutation({
    mutationFn: (id: string) => api.removeWhatsAppLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappLinks })
      toast.show({ message: 'Número desvinculado', tone: 'success' })
    },
  })

  async function copyCmd() {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(`vincular ${fresh.code}`)
      toast.show({ message: 'Comando copiado', tone: 'success' })
    } catch {
      /* clipboard bloqueado: queda visible para copiar a mano */
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'nunca'
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? 'nunca'
      : d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <section>
      <PanelHeader
        title="Conectar WhatsApp"
        hint="Mandá notas, citas, entidades y momentos desde WhatsApp. Generá un código, envialo por WhatsApp al número de Trama como «vincular CÓDIGO», y listo. Después escribí «nota: …», «cita: … — autor», «entidad: nombre (tipo)», «momento: …» o texto libre (lo clasifico solo)."
      />

      <div className="max-w-md space-y-4">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="btn-accent text-xs"
        >
          {create.isPending ? 'generando…' : 'generar código de vinculación'}
        </button>

        {fresh && (
          <div className="rounded-lg border border-ink-100 bg-paper-100/50 p-3">
            <p className="text-micro uppercase tracking-eyebrow text-ink-300">
              enviá esto por WhatsApp — vence en {fresh.ttlMinutes} min
            </p>
            <code className="mt-1.5 block break-all rounded bg-paper-50 border border-ink-100/70 px-2 py-1.5 text-caption text-ink-700">
              vincular {fresh.code}
            </code>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={copyCmd}
                className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                copiar
              </button>
              <button
                onClick={() => setFresh(null)}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                listo
              </button>
            </div>
          </div>
        )}

        {links.data && links.data.length > 0 && (
          <ul className="divide-y divide-ink-100/60 rounded-lg border border-ink-100/70">
            {links.data.map((l) => (
              <li key={l.id} className="flex items-baseline gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-caption text-ink-700">
                    {l.phone ?? 'número pendiente'}
                    {l.label ? ` · ${l.label}` : ''}
                  </p>
                  <p className="text-micro text-ink-300">
                    vinculado {formatDate(l.verifiedAt)} · último mensaje{' '}
                    {formatDate(l.lastMessageAt)}
                  </p>
                </div>
                <button
                  onClick={() => unlink.mutate(l.id)}
                  disabled={unlink.isPending}
                  className="ml-auto shrink-0 text-micro uppercase tracking-eyebrow text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
                >
                  desvincular
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-micro text-ink-400 leading-relaxed">
          El número se conecta vía Twilio. Solo los números vinculados pueden escribir, y
          cada mensaje queda bajo tu cuenta. Podés desvincular cuando quieras.
        </p>
      </div>
    </section>
  )
}
