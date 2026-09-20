/**
 * Load db/seed.sql and create the admin login.
 *
 * The sample rows live in db/seed.sql so they can be inspected and applied with
 * psql directly. The admin user is created here instead, with a password hash
 * generated at run time — shipping a fixed hash in git would mean every deploy
 * of this repo shared one credential.
 *
 *   npm run db:seed                       # password from ADMIN_PASSWORD, else 'admin123'
 *   ADMIN_PASSWORD='...' npm run db:seed
 *   npm run db:seed -- --admin-only       # skip the sample rows
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { neon } from '@neondatabase/serverless';

import { ROOT, databaseUrl, splitStatements } from './db.mjs';
import { generatePasswordHash } from './hash-password.mjs';

const sql = neon(databaseUrl());
const adminOnly = process.argv.includes('--admin-only');

if (!adminOnly) {
  const statements = splitStatements(readFileSync(resolve(ROOT, 'db/seed.sql'), 'utf8'));
  console.log(`Applying ${statements.length} statement(s) from db/seed.sql...`);
  for (const statement of statements) {
    await sql.query(statement);
  }
  const [counts] = await sql`
    SELECT (SELECT count(*)::int FROM departments) AS departments,
           (SELECT count(*)::int FROM faculty)     AS faculty,
           (SELECT count(*)::int FROM students)    AS students,
           (SELECT count(*)::int FROM subjects)    AS subjects,
           (SELECT count(*)::int FROM attendance)  AS attendance,
           (SELECT count(*)::int FROM marks)       AS marks,
           (SELECT count(*)::int FROM fees)        AS fees
  `;
  console.log('  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
}

const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD ?? 'admin123';

await sql`
  INSERT INTO users (username, password, role)
  VALUES (${username}, ${generatePasswordHash(password)}, 'admin')
  ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role
`;

console.log(`\nAdmin login ready: ${username} / ${password}`);
if (!process.env.ADMIN_PASSWORD) {
  console.log('This is the default password. Change it before sharing the URL:');
  console.log("  ADMIN_PASSWORD='something better' npm run db:seed -- --admin-only");
}
