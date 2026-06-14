import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import type { WhatsAppLinkCode } from '../../api'
import { queryKeys } from '../../state/queryClient'
import { useToast } from '../../state/toast'
import { buildWhatsAppDeepLink } from '../../lib/whatsappLink'
import { PanelHeader } from './_shared'

/**
 * Conectar WhatsApp — vincular un número para capturar notas, citas,
 * entidades y momentos por mensaje. Se genera un código de un solo uso y se
 * canjea enviando "vincular <código>" por WhatsApp. El número queda atado a
 * tu cuenta; el webhook escribe en tu nombre solo después del canje.
 *
 * Onboarding de un toque: si está configurado el número de Trama
 * (`VITE_WHATSAPP_NUMBER`), mostramos un QR + botón "Abrir WhatsApp" con el
 * mensaje `vincular <código>` ya escrito — el usuario solo aprieta enviar.
 * Sin número configurado, degrada al copiar/pegar manual.
 */
const TRAMA_WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER

export function WhatsAppPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [fresh, setFresh] = useState<WhatsAppLinkCode | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)

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

  const deepLink = fresh ? buildWhatsAppDeepLink(TRAMA_WHATSAPP_NUMBER, fresh.code) : null

  // QR del deep link — solo cuando hay código fresco y número configurado.
  // `qrcode` (~30kb) se importa perezoso, igual que en MomentoQRModal.
  useEffect(() => {
    if (!deepLink) {
      setQrSvg(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const QR = await import('qrcode')
        const svg = await QR.toString(deepLink, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 1,
          color: { dark: '#262626', light: '#00000000' },
        })
        if (!cancelled) setQrSvg(svg)
      } catch {
        if (!cancelled) setQrSvg(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deepLink])

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
        hint="Captura notas, citas, entidades y momentos desde WhatsApp. Genera un código y conecta tu número con un toque. Después escribe «nota: …», «cita: … — autor», «entidad: nombre (tipo)», «momento: …» o texto libre (lo clasifico solo). Tras guardar puedes responder «título …», «etiqueta …» o reclasificar con «nota»/«momento»/«entidad»."
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
          <div className="rounded-lg border border-ink-100 bg-paper-100/50 p-4">
            {deepLink ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-micro uppercase tracking-eyebrow text-ink-300 self-start">
                  conecta tu número — vence en {fresh.ttlMinutes} min
                </p>

                {/* QR: escanear desde OTRO celular (estás en desktop). */}
                {qrSvg && (
                  <div className="bg-paper-100/40 border border-ink-100/60 rounded-lg p-3 w-44 h-44 flex items-center justify-center">
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      aria-label="Código QR para vincular WhatsApp"
                      // El QR encodea SOLO el deep link wa.me que armamos con
                      // nuestro número (env) + el código generado en el server.
                      // Sin texto libre del usuario → no hay inyección. La lib
                      // qrcode emite <svg>/<path> puros (pinned ^1.5.4).
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                  </div>
                )}

                {/* Botón directo: útil si ya estás en el celular. */}
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-accent text-xs w-full text-center"
                >
                  Abrir WhatsApp y enviar
                </a>

                <p className="text-micro text-ink-400 leading-relaxed text-center">
                  Escanea el QR desde el teléfono donde tienes WhatsApp, o toca el botón
                  si ya estás en él. Se abre con el mensaje listo — solo envíalo.
                </p>

                <button
                  onClick={() => setFresh(null)}
                  className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
                >
                  listo
                </button>
              </div>
            ) : (
              // Sin número configurado: copiar/pegar manual.
              <>
                <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                  envía esto por WhatsApp — vence en {fresh.ttlMinutes} min
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
                <p className="mt-2 text-micro text-ink-300 leading-relaxed">
                  Para el QR y el botón de un toque, configurá el número de Trama en
                  <code className="mx-1">VITE_WHATSAPP_NUMBER</code>.
                </p>
              </>
            )}
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
