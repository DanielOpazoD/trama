#!/usr/bin/env node
/**
 * Trinquete de estados vacíos: todo vacío ofrece una salida, o dice por qué no.
 *
 * POR QUÉ EXISTE
 *
 * Un estado vacío es lo primero que ve quien estrena una vista, y en Trama
 * muchos eran callejones: explicaban qué falta pero no ofrecían cómo seguir.
 * Uno era peor: un error de carga pintado como vacío, sin «reintentar». Nada
 * lo impedía, porque `EmptyMessage` acepta `action` y `hint` como opcionales.
 *
 * QUÉ CUENTA COMO SALIDA
 *
 *   - `action=` o `hint=` en el elemento;
 *   - un `<button` o un `onClick` dentro del elemento (a veces la acción vive
 *     dentro de `body`, como el «Limpiar la búsqueda» de Prompts);
 *   - un componente de vacío que trae la acción DENTRO (COMPONENTES_CON_SALIDA).
 *     El test comprueba que esos componentes contienen de verdad un botón, para
 *     que la excepción no se pudra.
 *
 * POR ARCHIVO, NO POR LÍNEA
 *
 * Cada edición mueve los números de línea, y un trinquete anclado a ellos se
 * rompería solo. La lista cuenta, por archivo, cuántos vacíos sin salida se
 * admiten y por qué. Si un archivo tiene MÁS, falla; si tiene MENOS, también
 * falla, para obligar a bajar el número (trinquete en los dos sentidos).
 *
 * USO: node scripts/check-empty-states.mjs
 */
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { scannedSourceFiles } from './lib/source-files.mjs'

export const ETIQUETAS_DE_VACIO = ['EmptyMessage', 'EmptyState', 'MomentosEmptyState']

/** Componentes de vacío que llevan su acción dentro y no la reciben por prop. */
export const COMPONENTES_CON_SALIDA = new Map([
  ['EmptyState', 'src/components/EmptyState.tsx'],
  ['MomentosEmptyState', 'src/components/momentos/MomentosViewSections.tsx'],
])

/**
 * Vacíos sin salida admitidos, por archivo: `n` es el máximo, `motivo` el
 * porqué. Se siembra con la medición del estado actual y cada arreglo baja el
 * número; un exento legítimo (la acción depende de algo fuera de la app) se
 * queda con su motivo.
 */
export const SIN_SALIDA_ADMITIDOS = new Map([
  [
    'src/components/BibliotecaView.tsx',
    { n: 1, motivo: 'pendiente: la búsqueda sin resultados no ofrece «limpiar filtros»' },
  ],
  [
    'src/components/CronologiaView.tsx',
    { n: 1, motivo: 'pendiente: no lleva a donde se crea lo que la cronología teje' },
  ],
  [
    'src/components/TwitterView.tsx',
    { n: 1, motivo: 'pendiente: «X no está conectado» sin llevar a Configuración → X' },
  ],
  [
    'src/components/momentos/AlbumGrid.tsx',
    { n: 1, motivo: 'pendiente: remite al compositor de arriba sin ofrecerlo' },
  ],
  [
    'src/components/momentos/MomentosViewSections.tsx',
    { n: 1, motivo: 'pendiente: remite al compositor de arriba sin ofrecerlo' },
  ],
  [
    'src/components/notas/PromptsView.tsx',
    { n: 1, motivo: 'pendiente: biblioteca de prompts vacía sin «crear el primero»' },
  ],
  [
    'src/components/recortes/CapturasGalleryGrid.tsx',
    { n: 1, motivo: 'pendiente: galería filtrada sin «ver todas»' },
  ],
  [
    'src/components/recortes/FavoritosPanel.tsx',
    {
      n: 1,
      motivo:
        'la acción vive en la extensión de Chrome; pendiente: llevar a Configuración → Extensión',
    },
  ],
])

/**
 * Texto del elemento de apertura desde `<Etiqueta` hasta su cierre, respetando
 * llaves y comillas: `title="a > b"` o `action={<b>x</b>}` no lo cortan antes.
 */
export function textoDelElemento(fuente, inicio) {
  let prof = 0
  let comilla = null
  for (let i = inicio + 1; i < fuente.length; i++) {
    const c = fuente[i]
    if (comilla) {
      if (c === comilla && fuente[i - 1] !== '\\') comilla = null
      continue
    }
    if (prof === 0 && (c === '"' || c === "'")) {
      comilla = c
      continue
    }
    if (c === '{') prof++
    else if (c === '}') prof--
    else if (prof === 0 && fuente.startsWith('/>', i)) return fuente.slice(inicio, i + 2)
    else if (prof === 0 && c === '>') return fuente.slice(inicio, i + 1)
  }
  return fuente.slice(inicio, inicio + 400)
}

export function tieneSalida(etiqueta, texto) {
  if (COMPONENTES_CON_SALIDA.has(etiqueta)) return true
  return /\baction=|\bhint=|<button\b|\bonClick=/.test(texto)
}

/** Por archivo: cuántos vacíos hay y cuántos no ofrecen salida. */
export function recogerVacios(root = process.cwd()) {
  const raiz = resolve(root)
  const porArchivo = new Map()
  const patron = new RegExp(`<(${ETIQUETAS_DE_VACIO.join('|')})\\b`, 'g')
  for (const archivo of scannedSourceFiles(root)) {
    if (!archivo.endsWith('.tsx')) continue
    const fuente = readFileSync(archivo, 'utf8')
    let total = 0
    let sinSalida = 0
    for (const m of fuente.matchAll(patron)) {
      // La propia definición del componente no es un uso.
      if (fuente.slice(Math.max(0, m.index - 30), m.index).includes('function')) continue
      total++
      if (!tieneSalida(m[1], textoDelElemento(fuente, m.index))) sinSalida++
    }
    if (total > 0) porArchivo.set(relative(raiz, archivo), { total, sinSalida })
  }
  return porArchivo
}

export function checkEmptyStates({
  root = process.cwd(),
  admitidos = SIN_SALIDA_ADMITIDOS,
} = {}) {
  const vacios = recogerVacios(root)
  const exceden = []
  const rancios = []
  let total = 0
  let sinSalida = 0
  for (const [archivo, { total: t, sinSalida: s }] of vacios) {
    total += t
    sinSalida += s
    const permitido = admitidos.get(archivo)?.n ?? 0
    if (s > permitido) exceden.push({ archivo, sinSalida: s, permitido })
  }
  for (const [archivo, { n }] of admitidos) {
    const real = vacios.get(archivo)?.sinSalida ?? 0
    if (real < n) rancios.push({ archivo, admitidos: n, real })
  }
  return {
    total,
    sinSalida,
    exceden,
    rancios,
    failures: exceden.length + rancios.length > 0 ? { exceden, rancios } : null,
  }
}

function main() {
  const r = checkEmptyStates()
  console.log(`  estados vacíos        ${String(r.total).padStart(4)}`)
  console.log(`  sin salida admitidos  ${String(r.sinSalida).padStart(4)}`)
  if (!r.failures) {
    console.log('\nempty states ok')
    return
  }
  if (r.exceden.length > 0) {
    console.error(
      '\nVacíos sin salida por encima de lo admitido. Ofrecé una acción (`action`),\n' +
        'una pista (`hint`), o agregá el archivo a SIN_SALIDA_ADMITIDOS con su motivo:',
    )
    for (const e of r.exceden)
      console.error(`  - ${e.archivo}: ${e.sinSalida} (admitidos ${e.permitido})`)
  }
  if (r.rancios.length > 0) {
    console.error('\nSIN_SALIDA_ADMITIDOS admite más de los que quedan (bajá el número):')
    for (const e of r.rancios)
      console.error(`  - ${e.archivo}: admite ${e.admitidos}, quedan ${e.real}`)
  }
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
