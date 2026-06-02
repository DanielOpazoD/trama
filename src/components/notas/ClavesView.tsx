import { useEffect, useMemo, useState } from 'react'
import type { Secret, SecretKind } from '../../api'
import {
  createVault,
  decryptVaultSecret,
  encryptVaultSecret,
  generatePhysicalKey,
  hasVaultConfig,
  unlockVault,
  vaultRequiresPhysicalKey,
} from '../../lib/vaultCrypto'
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
import { ClipboardIcon, KeyIcon, PencilIcon, ShieldIcon, TrashIcon } from '../Icons'
import { ViewHeader } from '../ViewHeader'
import { copyText, formatShortDate, secretHealth } from './notasUtils'

const ACCENT = 'var(--accent-sage)'
const KINDS: Array<{ id: SecretKind; label: string }> = [
  { id: 'api_key', label: 'API key' },
  { id: 'token', label: 'token' },
  { id: 'pin', label: 'PIN' },
  { id: 'license', label: 'licencia' },
  { id: 'recovery_code', label: 'recovery' },
  { id: 'password', label: 'password' },
  { id: 'other', label: 'otra' },
]

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
            {KINDS.map((k) => (
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
          {KINDS.filter((k) => counts.has(k.id)).map((k) => (
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
            />
          ))}
        </div>
      )}
    </>
  )
}

function VaultGate({ onUnlock }: { onUnlock: (key: CryptoKey) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [physicalKey, setPhysicalKey] = useState('')
  const [usePhysicalKey, setUsePhysicalKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasVault = hasVaultConfig()
  const needsPhysicalKey = vaultRequiresPhysicalKey()
  const showPhysicalKey = needsPhysicalKey || usePhysicalKey

  async function submit() {
    const pass = password.trim()
    if (pass.length < 8) {
      setError('Usa al menos 8 caracteres.')
      return
    }
    if (!hasVault && pass !== confirm.trim()) {
      setError('La confirmación no coincide.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const key = hasVault
        ? await unlockVault(pass, physicalKey)
        : await createVault(pass, usePhysicalKey ? physicalKey : undefined)
      onUnlock(key)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el vault')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ViewHeader
        title="Claves"
        eyebrow="vault bloqueado"
        accent={ACCENT}
        spacing="wide"
      />
      <section className="card-paper-soft rounded-xl border border-ink-100/70 p-4 max-w-xl">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg bg-paper-50 border border-ink-100"
            style={{ color: ACCENT }}
          >
            <ShieldIcon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-ink-800">
              {hasVault ? 'Abrir vault' : 'Crear clave de acceso'}
            </h3>
            <div className="mt-4 space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder="Clave de acceso"
                className="input-paper w-full text-sm"
              />
              {!hasVault && (
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                  placeholder="Confirmar clave"
                  className="input-paper w-full text-sm"
                />
              )}
              {!hasVault && (
                <label className="flex items-center justify-between gap-3 rounded-md border border-ink-100/70 bg-paper-50/50 px-3 py-2 text-caption text-ink-500">
                  <span>Llave física</span>
                  <input
                    type="checkbox"
                    checked={usePhysicalKey}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setUsePhysicalKey(checked)
                      if (checked && !physicalKey) setPhysicalKey(generatePhysicalKey())
                    }}
                  />
                </label>
              )}
              {showPhysicalKey && (
                <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={physicalKey}
                    onChange={(e) => setPhysicalKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submit()
                    }}
                    placeholder="Llave física"
                    className="input-paper w-full text-sm font-mono tracking-wider"
                  />
                  {!hasVault && (
                    <button
                      type="button"
                      onClick={() => setPhysicalKey(generatePhysicalKey())}
                      className="section-eyebrow hover:text-ink-700 px-2"
                    >
                      generar
                    </button>
                  )}
                </div>
              )}
            </div>
            {error && (
              <p className="mt-2 text-caption text-[color:var(--accent-clay)]">{error}</p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="btn-ink text-xs disabled:opacity-50"
              >
                {busy ? 'abriendo...' : hasVault ? 'abrir vault' : 'crear vault'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function SecretCard({
  item,
  metadata,
  value,
  busy,
  onReveal,
  onCopy,
  onFavorite,
  onDelete,
}: {
  item: Secret
  metadata: {
    service: string | null
    username: string | null
    notes: string | null
  } | null
  value: string | null
  busy: boolean
  onReveal: () => void
  onCopy: () => void
  onFavorite: () => void
  onDelete: () => void
}) {
  const health = secretHealth(item)
  const tone =
    health.level === 'high'
      ? 'var(--accent-clay)'
      : health.level === 'watch'
        ? 'var(--accent-gold)'
        : 'var(--accent-sage)'

  return (
    <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex size-8 items-center justify-center rounded-lg bg-paper-50 border border-ink-100"
          style={{ color: tone }}
        >
          <KeyIcon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-ink-800 truncate">{item.label}</h3>
            <span className="text-micro uppercase tracking-eyebrow text-ink-300">
              {item.kind.replace('_', ' ')}
            </span>
            {item.favorite && (
              <span className="section-eyebrow" style={{ color: ACCENT }}>
                favorita
              </span>
            )}
          </div>
          <div className="mt-2 grid sm:grid-cols-[1fr_auto] gap-2">
            <code className="min-w-0 truncate rounded-md border border-ink-100/70 bg-paper-50 px-2 py-1.5 text-sm text-ink-500">
              {value ?? '••••••••••••••••••••'}
            </code>
            <div className="flex items-center gap-1">
              <button
                onClick={onReveal}
                disabled={busy}
                className="section-eyebrow hover:text-ink-700 px-1.5"
              >
                revelar
              </button>
              <button
                onClick={onCopy}
                disabled={busy}
                title="Copiar"
                aria-label="Copiar clave"
                className="p-1 text-ink-300 hover:text-ink-700"
              >
                <ClipboardIcon size={13} />
              </button>
              <button
                disabled
                title="Editar metadatos próximamente"
                aria-label="Editar clave"
                className="p-1 text-ink-200"
              >
                <PencilIcon size={13} />
              </button>
              <button
                onClick={onDelete}
                disabled={busy}
                title="Borrar"
                aria-label="Borrar clave"
                className="p-1 text-ink-300 hover:text-[color:var(--accent-clay)]"
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>
          <footer className="mt-3 flex items-center gap-3 flex-wrap text-micro text-ink-300">
            <span className="inline-flex items-center gap-1" style={{ color: tone }}>
              <ShieldIcon size={12} />
              {health.score}/100
            </span>
            {metadata?.service && <span>{metadata.service}</span>}
            {metadata?.username && (
              <span className="font-mono text-[11px]">{metadata.username}</span>
            )}
            {metadata?.notes && <span className="basis-full">{metadata.notes}</span>}
            {item.expiresAt && <span>vence {formatShortDate(item.expiresAt)}</span>}
            {health.flags.length > 0 && (
              <span className="uppercase tracking-eyebrow">
                {health.flags.join(' · ')}
              </span>
            )}
            <span className="flex-1" />
            <button
              onClick={onFavorite}
              disabled={busy}
              className="uppercase tracking-eyebrow hover:text-ink-700"
            >
              {item.favorite ? 'soltar' : 'favorita'}
            </button>
          </footer>
        </div>
      </div>
    </article>
  )
}
