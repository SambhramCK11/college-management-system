/**
 * Request-level tests for the Worker.
 *
 * These call the exported fetch() handler directly with a stub env, rather than
 * going through `wrangler dev`. Node 22 provides everything the request path
 * touches — Request/Response, Web Crypto, node:crypto — so the whole pipeline
 * (routing, session checks, error mapping, template rendering) is exercised
 * without a runtime to boot.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession, sessionCookie } from '../worker/auth.mjs';
import worker from '../worker/index.mjs';

const SECRET = 'test-secret';

const stubAssets = { fetch: () => new Response('asset body', { status: 200 }) };

/** env with a session secret but no database, unless one is supplied. */
const makeEnv = (overrides = {}) => ({
  SESSION_SECRET: SECRET,
  ASSETS: stubAssets,
  ...overrides,
});

const call = (path, { cookie, env = makeEnv(), method = 'GET', body } = {}) =>
  worker.fetch(
    new Request(`https://example.workers.dev${path}`, {
      method,
      headers: cookie ? { cookie } : {},
      body,
    }),
    env
  );

const validCookie = async (username = 'admin') =>
  `cms_session=${await createSession(SECRET, username)}`;

test('GET / renders the login form without any configuration', async () => {
  const response = await call('/', { env: { ASSETS: stubAssets } });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /<h2>Login<\/h2>/);
  assert.match(body, /name="username"/);
});

test('an unauthenticated request is redirected to the login form', async () => {
  for (const path of ['/students', '/dashboard', '/marks_report', '/fees', '/departments']) {
    const response = await call(path);
    assert.equal(response.status, 302, `${path} should redirect`);
    assert.equal(response.headers.get('location'), '/');
  }
});

test('a delete route is not reachable without a session', async () => {
  // The Flask blueprints leave these open to anyone; the Worker must not.
  for (const path of [
    '/delete_student/1',
    '/delete_faculty/1',
    '/delete_department/1',
    '/delete_subject/1',
    '/delete_marks/1',
    '/delete_fee/1',
    '/delete_attendance/1',
  ]) {
    const response = await call(path);
    assert.equal(response.status, 302, `${path} should redirect, not act`);
    assert.equal(response.headers.get('location'), '/');
  }
});

test('a tampered session cookie is rejected', async () => {
  const cookie = await validCookie();
  const response = await call('/students', { cookie: `${cookie.slice(0, -4)}dead` });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
});

test('a cookie signed with a different secret is rejected', async () => {
  const foreign = `cms_session=${await createSession('other-secret', 'admin')}`;
  const response = await call('/students', { cookie: foreign });
  assert.equal(response.status, 302);
});

test('a valid session passes the guard, then reports the missing database', async () => {
  const response = await call('/students', { cookie: await validCookie() });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /DATABASE_URL is not configured/);
});

test('a missing SESSION_SECRET is reported, not treated as logged out', async () => {
  const response = await call('/students', { env: { ASSETS: stubAssets } });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /SESSION_SECRET is not configured/);
});

test('an unknown path renders the 404 template', async () => {
  const response = await call('/no-such-page');
  assert.equal(response.status, 404);
  assert.match(await response.text(), /404 - Page Not Found/);
});

test('a known path with the wrong method is a 405', async () => {
  const response = await call('/students', { method: 'POST', cookie: await validCookie() });
  assert.equal(response.status, 405);
});

test('a non-numeric id renders the 404 template rather than reaching SQL', async () => {
  const response = await call('/edit_fee/abc', { cookie: await validCookie() });
  assert.equal(response.status, 404);
  assert.match(await response.text(), /404 - Page Not Found/);
});

test('/static/* is delegated to the assets binding', async () => {
  const response = await call('/static/css/style.css');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset body');
});

test('logout clears the cookie and returns to the login form', async () => {
  const response = await call('/logout', { cookie: await validCookie() });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.get('set-cookie'), /cms_session=;/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('the session cookie is HttpOnly, Secure and SameSite=Lax', () => {
  const cookie = sessionCookie('value');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});
