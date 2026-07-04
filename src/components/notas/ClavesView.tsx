import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SecretKind } from '../../api'
import { isDemoMode } from '../../lib/demo'
import { useCurrentClientUserId } from '../../lib/clientIdentity'
import { decryptVaultSecret, encryptVaultSecret } from '../../lib/vaultCrypto'
import {
  useCreateSecret,
  useDeleteSecret,
  useMarkSecretCopied,
  useRevealSecret,
  useSecretsQuery,
  useToast,
  useUpdateSecret,
} from '../../state'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { ViewHeader } from '../ViewHeader'
import {
  SECRET_KINDS,
  SecretCard,
  VaultGate,
  type SecretEditInput,
} from './ClavesVaultParts'
import { copyText } from './notasUtils'
import { buildSecretViewModel, normalizeSecretDraft } from './secretViewModel'

const ACCENT = 'var(--accent-sage)'
const VAULT_AUTO_LOCK_MS = 5 * 60 * 1000
const CLIPBOARD_CLEAR_MS = 20_000

export function ClavesView({
  autoLockMs = VAULT_AUTO_LOCK_MS,
  clipboardClearMs = CLIPBOARD_CLEAR_MS,
}: {
  autoLockMs?: number
  clipboardClearMs?: number
} = {}) {
  const currentUserId = useCurrentClientUserId()
  const vaultUserId = isDemoMode() ? 'demo' : (currentUserId ?? 'legacy-single-user')
  const vaultScope = useMemo(() => ({ userId: vaultUserId }), [vaultUserId])
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const secretsQuery = useSecretsQuery({ enabled: vaultKey !== null })
  const createSecret = useCreateSecret()
  const updateSecret = useUpdateSecret()
  const revealSecret = useRevealSecret()
  const markCopied = useMarkSecretCopied()
  const deleteSecret = useDeleteSecret()
  const toast = useToast()

  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [kind, setKind] = useState<SecretKind>('api_key')
  const [service, setService] = useState('')
  const [username, setUsername] = useState('')
  const [notes, setNotes] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [critical, setCritical] = useState(false)
  const [filter, setFilter] = useState<SecretKind | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [decryptedMetadata, setDecryptedMetadata] = useState<
    Record<
      string,
      { service: string | null; username: string | null; notes: string | null }
    >
  >({})

  const lockVault = useCallback(() => {
    setVaultKey(null)
    setRevealed({})
    setDecryptedMetadata({})
  }, [])

  const rawSecrets = secretsQuery.data
  const secrets = useMemo(() => rawSecrets ?? [], [rawSecrets])
  const viewModel = useMemo(
    () => buildSecretViewModel(secrets, filter),
    [filter, secrets],
  )
  const { activeFilter, counts, filtered, stats } = viewModel

  useEffect(() => {
    if (!vaultKey) {
      setDecryptedMetadata({})
      return
    }
    const activeKey = vaultKey
    let cancelled = false
    async function decryptMetadata() {
      const entries = await Promise.all(
        secrets.map(async (item) => {
          async function decryptOptional(value: string | null): Promise<string | null> {
            if (!value) return null
            try {
              return await decryptVaultSecret(value, activeKey)
            } catch {
              return null
            }
          }
          return [
            item.id,
            {
              service: await decryptOptional(item.service),
              username: await decryptOptional(item.username),
              notes: await decryptOptional(item.notes),
            },
          ] as const
        }),
      )
      if (!cancelled) setDecryptedMetadata(Object.fromEntries(entries))
    }
    void decryptMetadata()
    return () => {
      cancelled = true
    }
  }, [secrets, vaultKey])

  useEffect(() => {
    lockVault()
  }, [lockVault, vaultUserId])

  useEffect(() => {
    if (!vaultKey || autoLockMs <= 0) return
    let timer: number | undefined
    const resetTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(lockVault, autoLockMs)
    }
    const lockOnHidden = () => {
      if (document.visibilityState === 'hidden') lockVault()
      else resetTimer()
    }
    const events = ['keydown', 'mousedown', 'mousemove', 'touchstart'] as const
    for (const event of events)
      window.addEventListener(event, resetTimer, {
        passive: true,
      })
    document.addEventListener('visibilitychange', lockOnHidden)
    resetTimer()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, resetTimer)
      document.removeEventListener('visibilitychange', lockOnHidden)
    }
  }, [autoLockMs, lockVault, vaultKey])

  if (!vaultKey) {
    return (
      <>
        <ViewHeader
          title="Claves"
          eyebrow="bajo llave"
          accent={ACCENT}
          spacing="tight"
          density="compact"
          subtitle="Cifradas con tu clave de acceso. Sin ella, nadie puede leerlas — ni siquiera el servidor."
        />
        <VaultGate scope={vaultScope} onUnlock={setVaultKey} />
      </>
    )
  }
  const activeVaultKey = vaultKey

  function scheduleClipboardClear(copiedValue: string) {
    if (clipboardClearMs <= 0) return
    window.setTimeout(() => {
      const clipboard = navigator.clipboard
      if (!clipboard?.writeText) return
      const clear = () => clipboard.writeText('').catch(() => undefined)
      if (clipboard.readText) {
        clipboard
          .readText()
          .then((currentValue) => {
            if (currentValue === copiedValue) void clear()
          })
          .catch(() => undefined)
        return
      }
      void clear()
    }, clipboardClearMs)
  }

  async function save() {
    if (!label.trim() || !secret.trim()) return
    const draft = normalizeSecretDraft({
      label,
      secret,
      service,
      username,
      notes,
      expiresAt,
      critical,
    })
    const encryptedSecret = await encryptVaultSecret(draft.secret, activeVaultKey)
    const encryptedService = draft.service
      ? await encryptVaultSecret(draft.service, activeVaultKey)
      : null
    const encryptedUsername = draft.username
      ? await encryptVaultSecret(draft.username, activeVaultKey)
      : null
    const encryptedNotes = draft.notes
      ? await encryptVaultSecret(draft.notes, activeVaultKey)
      : null
    createSecret.mutate(
      {
        label: draft.label,
        secret: encryptedSecret,
        kind,
        service: encryptedService,
        username: encryptedUsername,
        notes: encryptedNotes,
        expiresAt: draft.expiresAt,
        critical: draft.critical,
      },
      {
        onSuccess: () => {
          setLabel('')
          setSecret('')
          setService('')
          setUsername('')
          setNotes('')
          setExpiresAt('')
          setCritical(false)
        },
      },
    )
  }

  function reveal(id: string) {
    revealSecret.mutate(id, {
      onSuccess: async (value) => {
        try {
          const plainText = await decryptVaultSecret(value, activeVaultKey)
          setRevealed((prev) => ({ ...prev, [id]: plainText }))
          window.setTimeout(() => {
            setRevealed((prev) => {
              const next = { ...prev }
              delete next[id]
              return next
            })
          }, 20_000)
        } catch (err) {
          toast.show({
            message: err instanceof Error ? err.message : 'No se pudo descifrar',
            tone: 'error',
          })
        }
      },
      onError: (err) =>
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo revelar',
          tone: 'error',
        }),
    })
  }

  function copy(id: string) {
    revealSecret.mutate(id, {
      onSuccess: async (value) => {
        try {
          const plainText = await decryptVaultSecret(value, activeVaultKey)
          await copyText(plainText)
          markCopied.mutate(id)
          toast.show({ message: 'Clave copiada.', tone: 'success' })
          scheduleClipboardClear(plainText)
        } catch (err) {
          toast.show({
            message: err instanceof Error ? err.message : 'No se pudo descifrar',
            tone: 'error',
          })
        }
      },
      onError: (err) =>
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo copiar',
          tone: 'error',
        }),
    })
  }

  return (
    <>
      <ViewHeader
        title="Claves"
        eyebrow="bajo llave"
        accent={ACCENT}
        spacing="tight"
        density="compact"
        subtitle="Cifradas con tu clave de acceso. El vault se bloquea solo tras unos minutos sin uso."
        action={
          <button
            onClick={lockVault}
            className="section-eyebrow hover:text-ink-700 transition-colors"
          >
            bloquear vault
          </button>
        }
      />

      {secrets.length > 0 && (
        <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <VaultMetric label="claves" value={stats.total} />
          <VaultMetric label="críticas" value={stats.critical} tone="danger" />
          <VaultMetric label="favoritas" value={stats.favorites} />
          <VaultMetric label="vencidas" value={stats.expired} tone="danger" />
        </section>
      )}

      <section className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <div className="grid sm:grid-cols-[1fr_160px] gap-2 mb-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre de la clave"
            aria-label="Nombre de la clave"
            className="input-paper w-full text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SecretKind)}
            aria-label="Tipo de clave"
            className="input-paper w-full text-sm"
          >
            {SECRET_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Valor secreto"
          type="password"
          aria-label="Valor secreto"
          className="input-paper w-full text-sm mb-2"
        />
        <div className="grid sm:grid-cols-[1fr_1fr_160px_auto] gap-2 items-center">
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Servicio o cuenta"
            aria-label="Servicio o cuenta"
            className="input-paper w-full text-sm"
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario o identificador"
            aria-label="Usuario o identificador"
            className="input-paper w-full text-sm"
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-label="Fecha de vencimiento"
            className="input-paper w-full text-sm"
          />
          <label className="inline-flex items-center gap-2 text-micro uppercase tracking-eyebrow text-ink-400">
            {/* form-control-label-exempt: Checkbox envuelto por <label> con el texto "crítica". */}
            <input
              type="checkbox"
              checked={critical}
              onChange={(e) => setCritical(e.target.checked)}
            />
            crítica
          </label>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notas privadas"
          aria-label="Notas privadas"
          className="input-paper mt-2 w-full resize-y text-body leading-relaxed"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={save}
            disabled={!label.trim() || !secret.trim() || createSecret.isPending}
            className="btn-ink text-xs disabled:opacity-40"
          >
            guardar clave
          </button>
        </div>
      </section>

      {secrets.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border ${
              activeFilter === null
                ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                : 'border-ink-100 text-ink-400'
            }`}
          >
            todas
          </button>
          {SECRET_KINDS.filter((k) => counts.has(k.id)).map((k) => (
            <button
              key={k.id}
              onClick={() => setFilter(activeFilter === k.id ? null : k.id)}
              className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border border-ink-100 text-ink-400 hover:text-ink-700"
              style={
                activeFilter === k.id ? { borderColor: ACCENT, color: ACCENT } : undefined
              }
            >
              {k.label}{' '}
              <span className="tabular-nums opacity-60">{counts.get(k.id)}</span>
            </button>
          ))}
        </div>
      )}

      {secretsQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando claves" size="sm" />
        </div>
      ) : secrets.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Tu llavero aún está vacío."
          body={
            <>Guarda contraseñas, tokens, PINs, licencias o códigos de recuperación.</>
          }
          hint="Los secretos se ocultan en la lista y se revelan temporalmente."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <SecretCard
              key={item.id}
              item={item}
              metadata={
                Object.prototype.hasOwnProperty.call(decryptedMetadata, item.id)
                  ? decryptedMetadata[item.id]
                  : undefined
              }
              value={revealed[item.id] ?? null}
              busy={
                revealSecret.isPending ||
                markCopied.isPending ||
                updateSecret.isPending ||
                deleteSecret.isPending
              }
              onReveal={() => reveal(item.id)}
              onCopy={() => copy(item.id)}
              onFavorite={() =>
                updateSecret.mutate({
                  id: item.id,
                  patch: { favorite: !item.favorite },
                })
              }
              onDelete={() => deleteSecret.mutate(item.id)}
              onSaveEdit={async (input) => {
                const patch = await buildEncryptedSecretPatch(input, activeVaultKey)
                updateSecret.mutate({ id: item.id, patch })
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

async function buildEncryptedSecretPatch(input: SecretEditInput, vaultKey: CryptoKey) {
  return {
    label: input.label,
    kind: input.kind,
    service: input.service ? await encryptVaultSecret(input.service, vaultKey) : null,
    username: input.username ? await encryptVaultSecret(input.username, vaultKey) : null,
    notes: input.notes ? await encryptVaultSecret(input.notes, vaultKey) : null,
    expiresAt: input.expiresAt,
    critical: input.critical,
  }
}

function VaultMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-ink-100/70 bg-paper-50/60 px-3 py-2">
      <div
        className="text-lg font-serif leading-none text-ink-800 tabular-nums"
        style={
          tone === 'danger' && value > 0 ? { color: 'var(--accent-clay)' } : undefined
        }
      >
        {value}
      </div>
      <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-300">
        {label}
      </div>
    </div>
  )
}
