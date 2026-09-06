#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { scannedSourceFiles } from './lib/source-files.mjs'

// Ratchet de adopción de `ModalShell`, el primitivo de diálogo modal (portal +
// backdrop + caja + header + foco, sobre useModalOverlay).
//
// `check:modal-overlay` blinda que todo role=dialog use el hook; este gate va
// un paso más allá: que los DIÁLOGOS ESTÁNDAR (caja centrada con backdrop)
// no recopien el cromo a mano. #303 creó el primitivo y migró tres; el PR B
// migró otros tres y dejó esta lista explícita para el resto.
//
// Cada archivo src/**/*.tsx (sin tests) con role="dialog"|"alertdialog" cae en
// una de tres categorías:
//   - ADOPTED: importa ModalShell. Lo esperado, no requiere lista.
//   - EXEMPT:  diálogo que legítimamente NO es una caja centrada estándar
//              (lightbox, lector a pantalla completa, panel anclado, shell).
//   - PENDING: caja estándar aún sin migrar. Deuda conocida y acotada.
// Un archivo NUEVO con role=dialog que no use ModalShell y no esté listado
// hace fallar el gate: hay que migrarlo o clasificarlo con razón. Y una
// entrada que ya no existe, ya no tiene dialog o ya adoptó el primitivo se
// reclama como STALE, para que la lista describa el repo de verdad.

export const MODAL_SHELL_EXEMPT = new Map([
  [
    'src/components/biblioteca/BibliotecaLinkPicker.tsx',
    'Se apila SOBRE BibliotecaViewer (z-[100], la capa max); ModalShell vive en z-modal (60) y quedaría detrás del visor.',
  ],
  ['src/components/Atril.tsx', 'Lector a pantalla completa (cita del día), no una caja.'],
  ['src/components/Careo.tsx', 'Superficie a pantalla completa de dos columnas.'],
  ['src/components/EditorialReader.tsx', 'Lector inmersivo a pantalla completa.'],
  ['src/components/Espejo.tsx', 'Superficie a pantalla completa.'],
  [
    'src/components/MobileMoreSheet.tsx',
    'Hoja inferior móvil, anclada abajo, no centrada.',
  ],
  ['src/components/Onboarding.tsx', 'Secuencia a pantalla completa con pasos propios.'],
  [
    'src/components/Settings.tsx',
    'Diálogo de dos paneles casi a pantalla completa con navegación propia.',
  ],
  [
    'src/components/biblioteca/BibliotecaViewer.tsx',
    'Visor de archivos a pantalla completa con barra propia.',
  ],
  ['src/components/chat/EssayOverlay.tsx', 'Lector de ensayo a pantalla completa.'],
  [
    'src/components/commandPalette/CommandPaletteDialog.tsx',
    'Paleta de comandos: caja anclada arriba con su propio patrón de foco.',
  ],
  [
    'src/components/momentos/MergeMomentosBar.tsx',
    'Confirmación inline dentro de una barra; no es overlay.',
  ],
  [
    'src/components/momentos/MomentoNotificationsCenter.tsx',
    'Panel anclado al botón de notificaciones (arriba a la derecha), no centrado.',
  ],
  ['src/components/momentos/PhotoLightbox.tsx', 'Lightbox a pantalla completa.'],
  ['src/components/notas/AttachmentLightbox.tsx', 'Lightbox a pantalla completa.'],
  ['src/components/notas/FocusedWriting.tsx', 'Modo de escritura a pantalla completa.'],
  [
    'src/components/notas/NotasWorld.tsx',
    'Buscador global: caja anclada arriba con backdrop propio del mundo.',
  ],
  [
    'src/components/notas/pdfStudio/PdfStudioTextEditorOverlay.tsx',
    'Overlay del editor de PDF a pantalla completa.',
  ],
  [
    'src/components/notas/pdfStudio/editor/PdfPreviewModal.tsx',
    'Visor de PDF ensamblado a pantalla completa con su propia barra.',
  ],
  [
    'src/components/notas/pdfStudio/editor/PdfTextEditor.tsx',
    'Editor a pantalla completa con Escape escalonado (ver check:modal-overlay).',
  ],
  [
    'src/components/notas/pdfStudio/planillas/PdfStudioShortcutsHelp.tsx',
    'Diálogo inline dentro del editor de planillas, sin backdrop.',
  ],
  [
    'src/components/notas/pdfStudio/planillas/SignatureCaptureDialog.tsx',
    'Diálogo inline dentro del editor, sin backdrop ni portal.',
  ],
  [
    'src/components/notas/pdfStudio/stamps/StampSignatureDrawDialog.tsx',
    'Diálogo inline dentro del editor, sin backdrop ni portal.',
  ],
  ['src/components/recortes/RecorteLightbox.tsx', 'Lightbox a pantalla completa.'],
  [
    'src/components/imageEditor/ImageEditorModal.tsx',
    'Editor de imagen casi a pantalla completa con lienzo y barra propios.',
  ],
])

// Cajas centradas estándar que todavía copian el cromo a mano. Cada una es
// candidata directa a ModalShell; se migran de a pocas para no mezclar
// riesgo visual en un solo PR.
export const MODAL_SHELL_PENDING = new Map([
  // Vacío hoy: los cuatro que quedaban migraron en el PR C. Un modal nuevo
  // que no pueda migrar de inmediato entra acá con su motivo.
])

const DIALOG_ROLE_RE = /\brole=(["'])(?:dialog|alertdialog)\1/
const SHELL_RE = /\bModalShell\b/

export function collectModalShellUsage(root = process.cwd()) {
  const projectRoot = resolve(root)
  const dialogs = []
  for (const file of scannedSourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    if (!DIALOG_ROLE_RE.test(source) && !SHELL_RE.test(source)) continue
    dialogs.push({
      file: relative(projectRoot, file),
      hasDialogRole: DIALOG_ROLE_RE.test(source),
      usesShell: SHELL_RE.test(source),
    })
  }
  dialogs.sort((a, b) => a.file.localeCompare(b.file))
  return dialogs
}

export function checkModalShell({
  root = process.cwd(),
  exempt = MODAL_SHELL_EXEMPT,
  pending = MODAL_SHELL_PENDING,
} = {}) {
  const entries = collectModalShellUsage(root).filter(
    (entry) => entry.file !== 'src/components/ModalShell.tsx',
  )
  const byFile = new Map(entries.map((entry) => [entry.file, entry]))
  const adopted = []
  const exemptHits = []
  const pendingHits = []
  const unclassified = []
  for (const entry of entries) {
    if (entry.usesShell) adopted.push(entry.file)
    else if (exempt.has(entry.file)) exemptHits.push(entry.file)
    else if (pending.has(entry.file)) pendingHits.push(entry.file)
    else unclassified.push(entry.file)
  }
  const isStale = (file) => {
    const entry = byFile.get(file)
    return !entry || !entry.hasDialogRole || entry.usesShell
  }
  const staleExempt = [...exempt.keys()].filter(isStale)
  const stalePending = [...pending.keys()].filter(isStale)
  const failures = []
  if (unclassified.length > 0)
    failures.push({ kind: 'unclassified', files: unclassified })
  if (staleExempt.length > 0) failures.push({ kind: 'staleExempt', files: staleExempt })
  if (stalePending.length > 0)
    failures.push({ kind: 'stalePending', files: stalePending })
  return {
    ok: failures.length === 0,
    adopted,
    exempt: exemptHits,
    pending: pendingHits,
    unclassified,
    staleExempt,
    stalePending,
    failures,
  }
}

function main() {
  const result = checkModalShell()
  console.log('\nModalShell adoption gate:')
  console.log('─'.repeat(72))
  console.log(
    `  ADOPTED (ModalShell)        ${String(result.adopted.length).padStart(3)}`,
  )
  console.log(
    `  EXEMPT  (no es caja estándar) ${String(result.exempt.length).padStart(3)}`,
  )
  console.log(
    `  PENDING (deuda conocida)     ${String(result.pending.length).padStart(3)}`,
  )
  console.log('─'.repeat(72))
  if (result.ok) {
    console.log('\nmodal shell adoption ok')
    return
  }
  for (const failure of result.failures) {
    if (failure.kind === 'unclassified') {
      console.error(
        '\nDiálogos con role=dialog que ni usan ModalShell ni están clasificados:',
      )
      for (const file of failure.files) console.error(`  - ${file}`)
      console.error(
        '\nMigra la caja a ModalShell, o clasifícala en MODAL_SHELL_EXEMPT (con la ' +
          'razón) o MODAL_SHELL_PENDING en scripts/check-modal-shell.mjs.',
      )
    } else {
      console.error(
        `\nEntradas ${failure.kind} (ya no existen, ya no tienen dialog o ya adoptaron ModalShell):`,
      )
      for (const file of failure.files) console.error(`  - ${file}`)
      console.error('\nSácalas de la lista: debe describir el repo de verdad.')
    }
  }
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
