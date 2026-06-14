/**
 * Acumulador de SQL en forma de "template" (parts + values), no de string
 * crudo. El cliente RLS de Trama (`getSql()`) sólo es seguro vía tagged
 * template: cada llamada se envuelve en una transacción que setea
 * `app.current_user_id`. Un string ejecutado con `.query()` saltearía RLS.
 *
 * Por eso el compilador produce `parts`/`values` y el executor los pasa al
 * tagged template (`asTemplateStrings`). `toText()` existe sólo para tests y
 * debug (renderiza con $1..$n).
 *
 * Invariante: `parts.length === values.length + 1`.
 */
export class SqlBuilder {
  readonly parts: string[] = ['']
  readonly values: unknown[] = []

  /** Agrega SQL literal de confianza (constantes del registry, nunca input). */
  raw(sql: string): this {
    this.parts[this.parts.length - 1] += sql
    return this
  }

  /** Agrega un valor como parámetro ($n). Devuelve `this` para encadenar. */
  param(value: unknown): this {
    this.values.push(value)
    this.parts.push('')
    return this
  }

  /** Renderiza con placeholders $1..$n (para tests / logging, no para ejecutar). */
  toText(): string {
    let out = ''
    this.parts.forEach((part, i) => {
      out += part
      if (i < this.values.length) out += `$${i + 1}`
    })
    return out
  }
}

/**
 * Convierte `parts` en algo con forma de `TemplateStringsArray` para invocar el
 * tagged template del driver: `sql(asTemplateStrings(parts), ...values)`.
 */
export function asTemplateStrings(parts: string[]): TemplateStringsArray {
  return Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray
}
