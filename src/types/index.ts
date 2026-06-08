/**
 * Barrel de tipos del dominio Trama.
 *
 * G1: el archivo `src/types.ts` original (197 LOC) se splitteó por dominio
 * para que cada uno responda una sola pregunta. Los call sites que
 * importaban `from './'` siguen funcionando — TS resuelve a este
 * `index.ts` automáticamente.
 *
 * Si necesitás algo específico (e.g. solo Entity), podés importar
 * directamente del sub-archivo: `from './entity'`. Pero el patrón
 * default es `from './'`.
 */

export * from './origin'
export * from './entity'
export * from './relationship'
export * from './quote'
export * from './momento'
export * from './extraction'
export * from './import-export'
