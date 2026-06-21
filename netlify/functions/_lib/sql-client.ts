export type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  transaction?: (queries: (sql: SqlClient) => unknown[]) => Promise<unknown[]>
}
