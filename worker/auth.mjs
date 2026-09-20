/**
 * Password verification and signed session cookies.
 *
 * Verifies the hashes Werkzeug's generate_password_hash() produces, so the
 * users table written by the Flask app works unchanged against the Worker —
 * no re-hashing, no second credential store.
 *
 * Werkzeug hash format:  method$salt$hexdigest
 *   scrypt:32768:8:1$SALT$HEX        (Werkzeug 3's default)
 *   pbkdf2:sha256:1000000$SALT$HEX
 */

import { scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time comparison of two hex digests of equal length. */
function hexEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * scrypt via node:crypto.
 *
 * maxmem has to be raised explicitly. Werkzeug's default parameters
 * (N=32768, r=8) need 128 * N * r = 32 MiB, which is exactly Node's default
 * maxmem ceiling, so workerd rejects it with a bare "Scrypt failed". Measured:
 * N up to 16384 works at the default, 32768 only with maxmem raised.
 */
function scryptHex(password, salt, { N, r, p, keylen = 64 }) {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      keylen,
      { N, r, p, maxmem: 128 * N * r * 2 },
      (error, derived) => (error ? reject(error) : resolve(derived.toString('hex')))
    );
  });
}

/** PBKDF2-HMAC via Web Crypto, which needs no Node shim. */
async function pbkdf2Hex(password, salt, hashName, iterations, keylen) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: hashName },
    key,
    keylen * 8
  );
  return toHex(bits);
}

/**
 * Check a plaintext password against a Werkzeug hash.
 *
 * Returns false for an unparseable or unsupported hash rather than throwing,
 * so a malformed row cannot be told apart from a wrong password by timing or
 * by the error surfaced to the browser.
 */
export async function checkPasswordHash(stored, password) {
  if (typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [method, salt, digest] = parts;
  const spec = method.split(':');

  try {
    if (spec[0] === 'scrypt') {
      const N = Number(spec[1] ?? 32768);
      const r = Number(spec[2] ?? 8);
      const p = Number(spec[3] ?? 1);
      // Werkzeug asks scrypt for a 64-byte key.
      return hexEquals(await scryptHex(password, salt, { N, r, p, keylen: 64 }), digest);
    }

    if (spec[0] === 'pbkdf2') {
      const hashName = (spec[1] ?? 'sha256').toUpperCase().replace('SHA', 'SHA-');
      const iterations = Number(spec[2] ?? 600000);
      // Werkzeug defaults dklen to the digest size: 32 bytes for sha256.
      const keylen = digest.length / 2;
      return hexEquals(await pbkdf2Hex(password, salt, hashName, iterations, keylen), digest);
    }
  } catch {
    return false;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Signed session cookies, replacing Flask's server-side `session`.
 *
 * The payload is not secret — it holds a username and an expiry — so it is
 * stored as plain base64url with an HMAC-SHA256 tag over it. A Worker has no
 * process memory that survives between requests, so putting the session in the
 * cookie avoids needing a KV namespace or a sessions table for what is one
 * username.
 */
const COOKIE_NAME = 'cms_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

const b64url = {
  encode: (text) =>
    btoa(String.fromCharCode(...encoder.encode(text)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  decode: (text) => {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  },
};

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Build a signed cookie value for `username`. */
export async function createSession(secret, username) {
  const payload = b64url.encode(
    JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Return the username from a valid, unexpired cookie, else null. */
export async function readSession(secret, cookieHeader) {
  const raw = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!hexEquals(await hmac(secret, payload), signature)) return null;

  try {
    const { u, exp } = JSON.parse(b64url.decode(payload));
    if (!u || typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000)) return null;
    return u;
  } catch {
    return null;
  }
}

export const sessionCookie = (value) =>
  `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;

export const clearCookie = () =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
