import { useEffect, useMemo, useState } from 'react'
import type { SecretKind } from '../../api'
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

const ACCENT = 'var(--accent-sage)'

export function ClavesView() {
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

  const rawSecrets = secretsQuery.data
  const secrets = useMemo(() => rawSecrets ?? [], [rawSecrets])
  const filtered = useMemo(
    () => (filter ? secrets.filter((s) => s.kind === filter) : secrets),
    [filter, secrets],
  )
  const counts = useMemo(() => {
    const map = new Map<SecretKind, number>()
    for (const s of secrets) map.set(s.kind, (map.get(s.kind) ?? 0) + 1)
    return map
  }, [secrets])

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

  if (!vaultKey) {
    return <VaultGate onUnlock={setVaultKey} />
  }
  const activeVaultKey = vaultKey

  async function save() {
    if (!label.trim() || !secret.trim()) return
    const encryptedSecret = await encryptVaultSecret(secret.trim(), activeVaultKey)
    const encryptedService = service.trim()
      ? await encryptVaultSecret(service.trim(), activeVaultKey)
      : null
    const encryptedUsername = username.trim()
      ? await encryptVaultSecret(username.trim(), activeVaultKey)
      : null
    const encryptedNotes = notes.trim()
      ? await encryptVaultSecret(notes.trim(), activeVaultKey)
      : null
    createSecret.mutate(
      {
        label: label.trim(),
        secret: encryptedSecret,
        kind,
        service: encryptedService,
        username: encryptedUsername,
        notes: encryptedNotes,
        expiresAt: expiresAt || null,
        critical,
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
          window.setTimeout(() => {
            navigator.clipboard.writeText('').catch(() => undefined)
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
          message: err instanceof Error ? err.message : 'No se pudo copiar',
          tone: 'error',
        }),
    })
  }

  return (
    <>
      <ViewHeader title="Claves" eyebrow="vault privado" accent={ACCENT} spacing="wide" />
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => {
            setVaultKey(null)
            setRevealed({})
          }}
          className="section-eyebrow hover:text-ink-700 transition-colors"
        >
          bloquear vault
        </button>
      </div>

      <section className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <div className="grid sm:grid-cols-[1fr_160px] gap-2 mb-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre de la clave"
            className="input-paper w-full text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SecretKind)}
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
          className="input-paper w-full text-sm mb-2"
        />
        <div className="grid sm:grid-cols-[1fr_1fr_160px_auto] gap-2 items-center">
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Servicio o cuenta"
            className="input-paper w-full text-sm"
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario o identificador"
            className="input-paper w-full text-sm"
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="input-paper w-full text-sm"
          />
          <label className="inline-flex items-center gap-2 text-micro uppercase tracking-eyebrow text-ink-400">
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
          className="input-paper mt-2 w-full resize-y text-sm leading-relaxed"
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
              filter === null
                ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                : 'border-ink-100 text-ink-400'
            }`}
          >
            todas
          </button>
          {SECRET_KINDS.filter((k) => counts.has(k.id)).map((k) => (
            <button
              key={k.id}
              onClick={() => setFilter(filter === k.id ? null : k.id)}
              className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border border-ink-100 text-ink-400 hover:text-ink-700"
              style={filter === k.id ? { borderColor: ACCENT, color: ACCENT } : undefined}
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
          title="Tu vault aún está vacío."
          body={<>Guarda API keys, tokens, PINs, licencias o recovery codes.</>}
          hint="Los secretos se ocultan en la lista y se revelan temporalmente."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <SecretCard
              key={item.id}
              item={item}
              metadata={decryptedMetadata[item.id] ?? null}
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
