import { useState } from 'react'
import type { Secret, SecretKind } from '../../api'
import {
  createVault,
  generatePhysicalKey,
  hasVaultConfig,
  unlockVault,
  vaultRequiresPhysicalKey,
} from '../../lib/vaultCrypto'
import { ClipboardIcon, KeyIcon, PencilIcon, ShieldIcon, TrashIcon } from '../Icons'
import { ViewHeader } from '../ViewHeader'
import { formatShortDate, secretHealth } from './notasUtils'

const ACCENT = 'var(--accent-sage)'

export const SECRET_KINDS: Array<{ id: SecretKind; label: string }> = [
  { id: 'api_key', label: 'API key' },
  { id: 'token', label: 'token' },
  { id: 'pin', label: 'PIN' },
  { id: 'license', label: 'licencia' },
  { id: 'recovery_code', label: 'recovery' },
  { id: 'password', label: 'password' },
  { id: 'other', label: 'otra' },
]

export type SecretMetadata = {
  service: string | null
  username: string | null
  notes: string | null
}

export type SecretEditInput = {
  label: string
  kind: SecretKind
  service: string | null
  username: string | null
  notes: string | null
  expiresAt: string | null
  critical: boolean
}

export function VaultGate({ onUnlock }: { onUnlock: (key: CryptoKey) => void }) {
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

export function SecretCard({
  item,
  metadata,
  value,
  busy,
  onReveal,
  onCopy,
  onFavorite,
  onDelete,
  onSaveEdit,
}: {
  item: Secret
  metadata: SecretMetadata | null
  value: string | null
  busy: boolean
  onReveal: () => void
  onCopy: () => void
  onFavorite: () => void
  onDelete: () => void
  onSaveEdit: (input: SecretEditInput) => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [kind, setKind] = useState<SecretKind>(item.kind)
  const [service, setService] = useState(metadata?.service ?? '')
  const [username, setUsername] = useState(metadata?.username ?? '')
  const [notes, setNotes] = useState(metadata?.notes ?? '')
  const [expiresAt, setExpiresAt] = useState(item.expiresAt ?? '')
  const [critical, setCritical] = useState(item.critical)
  const health = secretHealth(item)
  const tone =
    health.level === 'high'
      ? 'var(--accent-clay)'
      : health.level === 'watch'
        ? 'var(--accent-gold)'
        : 'var(--accent-sage)'

  function beginEdit() {
    setLabel(item.label)
    setKind(item.kind)
    setService(metadata?.service ?? '')
    setUsername(metadata?.username ?? '')
    setNotes(metadata?.notes ?? '')
    setExpiresAt(item.expiresAt ?? '')
    setCritical(item.critical)
    setEditing(true)
  }

  if (editing) {
    return (
      <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
        <div className="grid sm:grid-cols-[1fr_160px] gap-2 mb-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
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
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn-ghost text-xs"
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSaveEdit({
                label: label.trim(),
                kind,
                service: service.trim() || null,
                username: username.trim() || null,
                notes: notes.trim() || null,
                expiresAt: expiresAt || null,
                critical,
              })
              setEditing(false)
            }}
            disabled={!label.trim() || busy}
            className="btn-ink text-xs disabled:opacity-50"
          >
            guardar cambios
          </button>
        </div>
      </article>
    )
  }

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
                onClick={beginEdit}
                disabled={busy}
                title="Editar"
                aria-label="Editar clave"
                className="p-1 text-ink-300 hover:text-ink-700"
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
