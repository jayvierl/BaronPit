/** In-memory Postgres transport for testing production SQL without a Neon account. */
import { PGlite } from "@electric-sql/pglite";

export const postgres = new PGlite();
type SqlStatement = { text: string; params: unknown[] };
function statement(template: TemplateStringsArray | string, values: unknown[]): SqlStatement {
  if (typeof template === "string") return { text: template, params: (values[0] ?? []) as unknown[] };
  return {
    text: template.reduce((sql, part, index) => sql + (index ? "$" + index : "") + part, ""),
    params: values,
  };
}

export const testQueries: string[] = [];
function sql(template: TemplateStringsArray | string, ...values: unknown[]) {
  const prepared = statement(template, values);
  // Neon defers a tagged query until awaited or passed to a transaction.
  return Object.assign(prepared, {
    then(resolve: (rows: unknown[]) => unknown, reject: (err: Error) => unknown) {
      testQueries.push(prepared.text);
      return postgres.query(prepared.text, prepared.params).then(result => resolve(result.rows), reject);
    },
  });
}
sql.transaction = async function transaction(statements: SqlStatement[] | ((client: typeof sql) => SqlStatement[])) {
  return postgres.transaction(async tx => {
    const results = [];
    for (const stmt of typeof statements === "function" ? statements(sql) : statements) {
      testQueries.push(stmt.text);
      results.push((await tx.query(stmt.text, stmt.params)).rows);
    }
    return results;
  });
};
export const neonForTests = () => sql;
