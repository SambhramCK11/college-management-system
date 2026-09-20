/**
 * Produce a Werkzeug-compatible password hash.
 *
 *   node scripts/hash-password.mjs 'my password'
 *
 * Emits the pbkdf2:sha256 format generate_password_hash() produces, so the
 * value can be pasted into the users table and verified by either runtime —
 * the Flask app via check_password_hash, the Worker via worker/auth.mjs.
 */

import { pbkdf2Sync, randomBytes } from 'node:crypto';

// Werkzeug 3's PBKDF2 default. Its scrypt default is also supported by the
// Worker, but PBKDF2 is what this script emits: it needs no tuned maxmem and
// is the same cost to verify in both runtimes.
const ITERATIONS = 1_000_000;
const SALT_LENGTH = 16;
const SALT_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Werkzeug's salt is a printable string, and is hashed as its own bytes. */
export function generateSalt(length = SALT_LENGTH) {
  const bytes = randomBytes(length);
  return [...bytes].map((b) => SALT_ALPHABET[b % SALT_ALPHABET.length]).join('');
}

export function generatePasswordHash(password, iterations = ITERATIONS) {
  const salt = generateSalt();
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:sha256:${iterations}$${salt}$${digest}`;
}

// Only print when run directly, so seed.mjs can import the helper.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: node scripts/hash-password.mjs 'password'");
    process.exit(1);
  }
  console.log(generatePasswordHash(password));
}
