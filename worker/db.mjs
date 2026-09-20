/**
 * Neon data access.
 *
 * Queries run in `arrayMode`, which returns each row as a positional array
 * instead of an object. That is deliberate: the templates index rows
 * positionally (`{{ student[0] }}`) because psycopg2's cursor.fetchall()
 * returns tuples, so array rows let the same templates render unchanged.
 */

import { neon } from '@neondatabase/serverless';

/**
 * Open a connection for one request.
 *
 * The HTTP driver is stateless, so there is no pool to exhaust — which matters
 * on Neon's free tier, where connection slots are limited and the compute
 * suspends when idle.
 */
export function connect(databaseUrl) {
  return neon(databaseUrl, { arrayMode: true, fullResults: false });
}

/** Run a parameterised query and return positional rows. */
export const rows = (sql, text, params = []) => sql.query(text, params);

/** Run a query and return the first row, or null. */
export async function row(sql, text, params = []) {
  const result = await sql.query(text, params);
  return result.length > 0 ? result[0] : null;
}

/** Run a query and return the first column of the first row. */
export async function scalar(sql, text, params = []) {
  const first = await row(sql, text, params);
  return first ? first[0] : null;
}
