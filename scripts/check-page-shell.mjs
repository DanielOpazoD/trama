#!/usr/bin/env node
/**
 * Trinquete de la columna de página.
 *
 * POR QUÉ EXISTE
 *
 * Una medición de nueve superficies encontró hasta 588 px muertos bajo el
 * contenido (Imprenta), 487 en Cronología y 327 en Atlas, y DOCE valores
 * verticales distintos donde debería haber una escala. La causa no era
 * descuido: no había dónde declarar la columna, así que cada vista la
 * improvisaba con `mx-auto max-w-* px-* py-*` sueltos.
 *
 * `src/components/Page.tsx` es ese sitio. Este gate impide que la lista de
 * columnas a mano crezca mientras se migran las que quedan.
 *
 * TRES CATEGORÍAS, igual que check-modal-shell.mjs:
 *   - ADOPTADO: el archivo monta `Page`. Lo esperado, no requiere lista.
 *   - EXENTO:   declara una columna centrada que NO es la de una vista
 *               (overlays a pantalla completa, bloques dentro de una columna
 *               ya existente). Requiere motivo por línea.
 *   - PENDIENTE: sí debería migrar, pero todavía no. Requiere motivo.
 *
 * Es un RATCHET en los dos sentidos: un archivo nuevo sin clasificar falla, y
 * una entrada que ya no existe —o que ya migró— también, para que la lista no
 * se vuelva letra muerta.
 *
 * USO: node scripts/check-page-shell.mjs
 */
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { scannedSourceFiles } from './lib/source-files.mjs'

/** Columnas centradas que NO son la columna de una vista. */
export const PAGE_SHELL_EXEMPT = new Map([
  [
    'src/components/EditorialReader.tsx',
    'Lector a pantalla completa; es un overlay, no una vista.',
  ],
  ['src/components/Careo.tsx', 'Bloque de texto centrado DENTRO de un overlay.'],
  [
    'src/components/ErrorState.tsx',
    'Bloque de estado que vive dentro de una columna ya existente.',
  ],
  [
    'src/components/ChatView.tsx',
    'El compositor del chat: barra inferior anclada, no columna de página.',
  ],
  ['src/components/chat/EmptyChatHint.tsx', 'Bloque centrado dentro del riel del chat.'],
  ['src/components/chat/EssayOverlay.tsx', 'Overlay a pantalla completa.'],
  [
    'src/components/biblioteca/BibliotecaOfficeViewer.tsx',
    'Prosa del documento renderizado: su ancho de lectura es del documento, no de la vista.',
  ],
  [
    'src/components/biblioteca/BibliotecaViewer.tsx',
    'Visor a pantalla completa; no lo monta el router.',
  ],
  ['src/components/notas/FocusedWriting.tsx', 'Escritura enfocada a pantalla completa.'],
  [
    'src/components/notas/pdfStudio/shell/PdfDropzone.tsx',
    'La zona de arrastre: es hija de la columna de Imprenta, no la columna.',
  ],
])

/** Columnas de vista que todavía no migraron. Cada PR debería bajar esta lista. */
export const PAGE_SHELL_PENDING = new Map([
  ['src/components/ViewRouter.tsx', 'La columna de las once vistas del mundo Trama.'],
  [
    'src/components/HomeSkeleton.tsx',
    'El esqueleto de Inicio; migra con ViewRouter o el ritmo salta al cargar.',
  ],
  [
    'src/components/notas/NotasWorld.tsx',
    'La columna de las siete secciones del mundo Notas.',
  ],
  [
    'src/components/notas/SectionSkeleton.tsx',
    'El esqueleto de Notas; migra con NotasWorld.',
  ],
])

const CLASSNAME_RE = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g
const VERTICAL_PADDING_RE = /\b(?:py-|pt-)/
/** Importa la primitiva desde su módulo, no una palabra suelta llamada Page. */
const IMPORTA_PAGE_RE = /import\s*\{[^}]*\bPage\b[^}]*\}\s*from\s*['"][^'"]*\/Page['"]/
/**
 * Y la MONTA. El delimitador importa: `includes('<Page')` daba por adoptado un
 * archivo que solo montaba `<PageFill>`, y con eso una vuelta atrás a la
 * columna a mano pasaba el gate sin protestar (lo delató una mutación).
 */
const MONTA_PAGE_RE = /<Page[\s/>]/

/**
 * Dos listas, y hace falta separarlas: adoptar `Page` BORRA el patrón de la
 * columna a mano, así que un archivo migrado desaparece del primer escaneo y
 * el contador de ADOPTADO sería siempre cero. Los adoptantes se cuentan aparte.
 */
export function collectPageColumns(root = process.cwd()) {
  const projectRoot = resolve(root)
  const files = []
  const adoptantes = []
  for (const file of scannedSourceFiles(root)) {
    if (!file.endsWith('.tsx')) continue
    const source = readFileSync(file, 'utf8')
    let declara = false
    for (const match of source.matchAll(CLASSNAME_RE)) {
      const clases = match[1] ?? match[2] ?? ''
      if (
        clases.includes('mx-auto') &&
        clases.includes('max-w-') &&
        VERTICAL_PADDING_RE.test(clases)
      ) {
        declara = true
        break
      }
    }
    const rel = relative(projectRoot, file)
    const adopta = IMPORTA_PAGE_RE.test(source) && MONTA_PAGE_RE.test(source)
    if (adopta) adoptantes.push(rel)
    if (!declara) continue
    files.push({ file: rel, adopta })
  }
  files.sort((a, b) => a.file.localeCompare(b.file))
  adoptantes.sort()
  return { aMano: files, adoptantes }
}

export function checkPageShell({
  root = process.cwd(),
  exempt = PAGE_SHELL_EXEMPT,
  pending = PAGE_SHELL_PENDING,
} = {}) {
  const { aMano: columnas, adoptantes } = collectPageColumns(root)
  const presentes = new Set(columnas.map((c) => c.file))

  const adopted = [...adoptantes]
  const exemptHits = []
  const pendingHits = []
  const unclassified = []
  for (const entry of columnas) {
    // Un archivo a medio migrar (monta Page y todavía declara otra columna a
    // mano) ya cuenta como adoptado; no se lo delata dos veces.
    if (entry.adopta) continue
    else if (exempt.has(entry.file)) exemptHits.push(entry.file)
    else if (pending.has(entry.file)) pendingHits.push(entry.file)
    else unclassified.push(entry.file)
  }

  // Entradas rancias: el archivo ya no existe, ya no declara columna, o migró.
  const staleExempt = [...exempt.keys()].filter((f) => !presentes.has(f))
  const stalePending = [...pending.keys()].filter(
    (f) => !presentes.has(f) || adoptantes.includes(f),
  )

  return {
    adopted,
    exempt: exemptHits,
    pending: pendingHits,
    unclassified,
    staleExempt,
    stalePending,
    failures:
      unclassified.length + staleExempt.length + stalePending.length > 0
        ? { unclassified, staleExempt, stalePending }
        : null,
  }
}

function main() {
  const r = checkPageShell()
  console.log(`  ADOPTADO  (Page)              ${String(r.adopted.length).padStart(4)}`)
  console.log(`  EXENTO    (no es una vista)   ${String(r.exempt.length).padStart(4)}`)
  console.log(`  PENDIENTE (deuda conocida)    ${String(r.pending.length).padStart(4)}`)
  if (!r.failures) {
    console.log('\npage shell ok')
    return
  }
  if (r.unclassified.length > 0) {
    console.error(
      '\nColumnas de página sin clasificar. Usá `Page` (src/components/Page.tsx), o\n' +
        'agregá el archivo a EXEMPT/PENDING en scripts/check-page-shell.mjs con su motivo:',
    )
    for (const f of r.unclassified) console.error(`  - ${f}`)
  }
  if (r.staleExempt.length > 0) {
    console.error('\nEntradas EXEMPT que ya no declaran columna (removelas):')
    for (const f of r.staleExempt) console.error(`  - ${f}`)
  }
  if (r.stalePending.length > 0) {
    console.error('\nEntradas PENDING que ya migraron o desaparecieron (removelas):')
    for (const f of r.stalePending) console.error(`  - ${f}`)
  }
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
