import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Travesía recursiva de archivos para los gates de scripts/. Reemplaza el
// `function walk()` que estaba copy-pasteado en ~9 scripts con variantes sutiles
// (unos con guarda `existsSync`, otros fusionando el filtro o con otra firma).
// Una sola implementación, testeada una vez.

// Todos los archivos (paths absolutos) bajo `dir`, recursivo. Si `dir` no existe
// devuelve `files` (la guarda que algunos `walk` traían y otros no) — así un gate
// que apunta a un directorio opcional no explota.
export function listFilesRecursive(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) listFilesRecursive(path, files)
    else files.push(path)
  }
  return files
}

// `<algo>.test.ts(x)` / `<algo>.test.js(x)`.
const TEST_FILE_RE = /\.test\.(?:tsx?|jsx?)$/

// Archivos fuente escaneables bajo `<root>/<dir>` (default `src`), filtrando por
// extensión y excluyendo tests y `.d.ts` salvo que se pidan. Unifica el
// `isScannedFile` que los gates de frontend reimplementaban con exclusiones
// sutilmente distintas (focus-ring excluía `.d.ts` y `.test.ts`; los `.tsx`-only
// no se molestaban). Devuelve paths absolutos, como el viejo `walk`.
export function scannedSourceFiles(
  root,
  { dir = 'src', extensions = ['.tsx'], includeTests = false, includeDts = false } = {},
) {
  return listFilesRecursive(join(resolve(root), dir)).filter((file) => {
    if (!extensions.some((ext) => file.endsWith(ext))) return false
    if (!includeTests && TEST_FILE_RE.test(file)) return false
    if (!includeDts && file.endsWith('.d.ts')) return false
    return true
  })
}
