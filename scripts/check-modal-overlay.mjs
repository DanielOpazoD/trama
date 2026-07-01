#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { scannedSourceFiles } from './lib/source-files.mjs'

// Gate de gobernanza de la adopción del primitivo useModalOverlay.
//
// La auditoría marcó "theater of primitive": existe useModalOverlay como hook
// canónico para diálogos modales (backdrop, focus trap, bloqueo de scroll,
// cierre por Escape respetando el stack), pero muchos modales lo reimplementaban
// a mano. Este PR migró 14 modales; el gate BLINDA esa adopción para que no
// entren modales hand-rolled nuevos.
//
// Cada archivo src/**/*.tsx (excluyendo *.test.tsx) con role="dialog" o
// role="alertdialog" cae en exactamente una de tres categorías:
//
//   - ADOPTED: importa/usa useModalOverlay. Es lo esperado, no requiere lista.
//   - EXEMPT:  role=dialog legítimo que NO es un modal overlay (p.ej. popover
//              anclado o confirmación inline). Allowlist explícita con razón.
//   - PENDING: modal aún no migrado (deuda conocida, diferida por riesgo).
//              Es un RATCHET: si un archivo NUEVO con role=dialog no usa el hook
//              y no está exento, el gate FALLA pidiendo migrarlo o clasificarlo.
//
// Igual que hard-delete-allowlist / structure-ratchets, también falla si una
// entrada EXEMPT o PENDING quedó STALE (el archivo ya no existe o ya no tiene
// role=dialog): hay que sacarla de la lista. Cuando un PENDING se migra de
// verdad (pasa a usar el hook), deja de detectarse como pending y el gate avisa
// (sin fallar) que hay que removerlo de PENDING.

// Popovers y confirmaciones inline con role=dialog que LEGÍTIMAMENTE no son
// modales overlay. Cada entrada va con la razón verificada en el componente.
export const MODAL_OVERLAY_EXEMPT = new Map([
  [
    'src/components/momentos/MergeMomentosBar.tsx',
    'Confirmación inline dentro de la barra role="toolbar": sustituye el header ' +
      'de la barra (sin backdrop ni overlay), no es un diálogo modal.',
  ],
  [
    'src/components/notas/pdfStudio/editor/PdfTextEditor.tsx',
    'Modal estructural, pero su Escape es ESCALONADO (cancela edición -> ' +
      'deselecciona -> cierra) vía usePdfTextEditorKeyboard; el Escape ' +
      'incondicional de useModalOverlay lo rompería. Ya usa useFocusTrap propio.',
  ],
])

// Modales todavía hand-rolled, diferidos por riesgo. RATCHET: esta lista solo
// puede ENCOGER. Migrar a useModalOverlay y removerlos de acá; nunca agregar.
export const MODAL_OVERLAY_PENDING = new Map([
  // Vacío: todos los modales hand-rolled migraron a useModalOverlay (Settings,
  // el buscador embebido de NotasWorld) o se reclasificaron como EXEMPT
  // (PdfTextEditor). El ratchet ahora exige el hook para todo role=dialog nuevo
  // que no sea un EXEMPT justificado.
])

// role="dialog" / role="alertdialog" con comillas simples o dobles. Hoy todos
// los usos son strings literales en el JSX; si aparece un role dinámico habrá
// que extender esto (y probablemente clasificar el archivo a mano).
const DIALOG_ROLE_RE = /\brole=(["'])(?:dialog|alertdialog)\1/
const HOOK_RE = /\buseModalOverlay\b/

export function collectModalOverlayUsage(root = process.cwd()) {
  const projectRoot = resolve(root)
  const dialogs = []

  for (const file of scannedSourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    if (!DIALOG_ROLE_RE.test(source)) continue
    dialogs.push({
      file: relative(projectRoot, file),
      usesHook: HOOK_RE.test(source),
    })
  }

  dialogs.sort((a, b) => a.file.localeCompare(b.file))
  return dialogs
}

export function checkModalOverlay({
  root = process.cwd(),
  exempt = MODAL_OVERLAY_EXEMPT,
  pending = MODAL_OVERLAY_PENDING,
} = {}) {
  const dialogs = collectModalOverlayUsage(root)
  const byFile = new Map(dialogs.map((entry) => [entry.file, entry]))

  const adopted = []
  const exemptHits = []
  const pendingHits = []
  const unclassified = []

  for (const entry of dialogs) {
    if (entry.usesHook) {
      adopted.push(entry.file)
    } else if (exempt.has(entry.file)) {
      exemptHits.push(entry.file)
    } else if (pending.has(entry.file)) {
      pendingHits.push(entry.file)
    } else {
      unclassified.push(entry.file)
    }
  }

  // Entradas stale: la allowlist apunta a un archivo que ya no existe o ya no
  // tiene role=dialog. Hay que removerlas (como hard-delete-allowlist).
  const staleExempt = [...exempt.keys()].filter((file) => !byFile.has(file))
  const stalePending = [...pending.keys()].filter((file) => !byFile.has(file))

  // PENDING que ya migró: el archivo sigue teniendo role=dialog pero ahora usa
  // el hook. No falla (es lo deseado) pero avisa para limpiar la lista.
  const migratedPending = [...pending.keys()].filter((file) => {
    const entry = byFile.get(file)
    return entry && entry.usesHook
  })

  const failures = []
  if (unclassified.length > 0)
    failures.push({ kind: 'unclassified', files: unclassified })
  if (staleExempt.length > 0) failures.push({ kind: 'staleExempt', files: staleExempt })
  if (stalePending.length > 0)
    failures.push({ kind: 'stalePending', files: stalePending })

  return {
    ok: failures.length === 0,
    dialogs,
    adopted,
    exempt: exemptHits,
    pending: pendingHits,
    unclassified,
    staleExempt,
    stalePending,
    migratedPending,
    failures,
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const result = checkModalOverlay()

  console.log('\nModal overlay adoption gate:')
  console.log('-'.repeat(72))
  console.log(`  ADOPTED (useModalOverlay) ${String(result.adopted.length).padStart(4)}`)
  console.log(`  EXEMPT  (popover/inline)  ${String(result.exempt.length).padStart(4)}`)
  console.log(`  PENDING (deuda conocida)  ${String(result.pending.length).padStart(4)}`)
  console.log('-'.repeat(72))

  if (!result.ok) {
    if (result.unclassified.length > 0) {
      console.error(
        '\nHay role="dialog"/"alertdialog" sin clasificar. Usá useModalOverlay ' +
          '(src/hooks/useModalOverlay.ts), o agregá el archivo a EXEMPT/PENDING en ' +
          'scripts/check-modal-overlay.mjs con razón:',
      )
      for (const file of result.unclassified) console.error(`  - ${file}`)
    }
    if (result.staleExempt.length > 0) {
      console.error(
        '\nEntradas EXEMPT que ya no existen o ya no tienen role=dialog ' +
          '(removelas de MODAL_OVERLAY_EXEMPT):',
      )
      for (const file of result.staleExempt) console.error(`  - ${file}`)
    }
    if (result.stalePending.length > 0) {
      console.error(
        '\nEntradas PENDING que ya no existen o ya no tienen role=dialog ' +
          '(removelas de MODAL_OVERLAY_PENDING):',
      )
      for (const file of result.stalePending) console.error(`  - ${file}`)
    }
    console.error('')
    process.exit(1)
  }

  for (const file of result.migratedPending) {
    console.log(
      `\n${file} ya usa useModalOverlay: removelo de MODAL_OVERLAY_PENDING en ` +
        'scripts/check-modal-overlay.mjs para bajar el ratchet.',
    )
  }

  console.log('\nmodal overlay adoption ok\n')
}
