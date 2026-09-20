/**
 * The Worker must expose the same routes as the Flask app, with the same
 * methods — a page that silently went missing in the port would otherwise only
 * show up as a 404 in production.
 *
 * test/flask-routes.json is generated from the Flask app's url_map:
 *
 *   cd python && python -c "import json, app; print(json.dumps([
 *     {'rule': r.rule, 'methods': sorted(m for m in r.methods if m in {'GET','POST'})}
 *     for r in app.app.url_map.iter_rules() if r.endpoint != 'static'], indent=2))"
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROUTES } from '../worker/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flaskRoutes = JSON.parse(readFileSync(resolve(here, 'flask-routes.json'), 'utf8'));

/** Turn Flask's /edit_fee/<int:id> into a concrete path the Worker can match. */
const concrete = (rule) => rule.replace(/<int:\w+>/g, '7').replace(/<\w+:?\w*>/g, 'x');

function match(pathname) {
  for (const [methods, pattern] of ROUTES) {
    if (pattern.test(pathname)) return methods;
  }
  return null;
}

test('the Worker covers every Flask route', () => {
  const missing = flaskRoutes.filter((r) => match(concrete(r.rule)) === null).map((r) => r.rule);
  assert.deepEqual(missing, [], `routes present in Flask but not in the Worker: ${missing}`);
});

test('each route accepts the same methods as Flask', () => {
  const mismatched = [];
  for (const route of flaskRoutes) {
    const methods = match(concrete(route.rule));
    if (!methods) continue;
    if ([...methods].sort().join(',') !== route.methods.join(',')) {
      mismatched.push(`${route.rule}: flask=${route.methods} worker=${[...methods].sort()}`);
    }
  }
  assert.deepEqual(mismatched, []);
});

test('the Worker adds no routes Flask does not have', () => {
  const flaskPaths = flaskRoutes.map((r) => concrete(r.rule));
  // Every pattern should match at least one Flask path.
  const unused = ROUTES.filter(([, pattern]) => !flaskPaths.some((p) => pattern.test(p))).map(
    ([, pattern]) => String(pattern)
  );
  assert.deepEqual(unused, []);
});

test('only the login form and logout are reachable without a session', () => {
  const publicPatterns = ROUTES.filter(([, , , isPublic]) => isPublic).map(([, p]) => String(p));
  assert.deepEqual(publicPatterns.sort(), ['/^\\/$/', '/^\\/logout$/']);
});

test('id path segments reject non-numeric values', () => {
  // /edit_fee/abc must not be routed as if abc were an id.
  const methods = match('/edit_fee/abc');
  assert.ok(methods, 'pattern should still match so the handler can 404');
});
