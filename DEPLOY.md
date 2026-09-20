# Deploying on Cloudflare + Neon (free tier)

Two free services, neither needing a card:

| Piece | Service | Free allowance |
|---|---|---|
| Pages and forms | Cloudflare Workers | 100,000 requests/day, 10 ms CPU each |
| `style.css`, `script.js` | Workers static assets | unmetered, never billed |
| Database | Neon Postgres | 0.5 GB storage, compute suspends when idle |

## One-time setup

```bash
npm install
npx wrangler login
```

Create a Neon project at <https://neon.tech> and copy the **pooled** connection
string — the host contains `-pooler`. The pooled endpoint is the one to use: the
HTTP driver holds no connections open, so Neon's compute can suspend between
requests, which is what keeps it free.

```bash
# Local dev and the db:* scripts read .dev.vars:
cp .dev.vars.example .dev.vars     # then paste your connection string in

# The deployed Worker reads secrets:
npx wrangler secret put DATABASE_URL
npx wrangler secret put SESSION_SECRET      # any long random string
```

Generate a session secret with `openssl rand -hex 32`.

## Load the database

```bash
npm run db:migrate                          # create the 8 tables
ADMIN_PASSWORD='choose something' npm run db:seed
```

`db:seed` loads sample departments, faculty, students, subjects, attendance,
marks and fees so every page has rows, then creates the admin login. Without
`ADMIN_PASSWORD` it uses `admin123` — change it before sharing the URL:

```bash
ADMIN_PASSWORD='...' npm run db:seed -- --admin-only
```

Both scripts are idempotent; re-running them adds no duplicates.

## Run and deploy

```bash
npm run dev       # http://localhost:8787
npm test          # 49 tests
npm run deploy    # https://college-management-system.<subdomain>.workers.dev
```

## Access control — one deliberate difference from the Flask app

The Flask blueprints register **no session check**. `app.py` sets
`session["username"]` on login and nothing ever reads it, so every page —
including `/delete_student/<id>`, which acts on a plain GET — is reachable by
anyone who knows the path. On `localhost` that is survivable. On a public
`workers.dev` URL it means a stranger could empty the database with a browser.

So the Worker requires a session for everything except `/` and `/logout`.
Anonymous requests get a 302 back to the login form. `test/worker.test.mjs`
asserts this for all seven delete routes.

The Flask app in `python/` is left exactly as it was. If you want the same
protection there, add a `before_request` hook that redirects when
`session.get("username")` is absent.

Two further things worth knowing:

- **`/delete_*` routes act on GET.** Kept as-is for route parity, but it means
  any page that could link or prefetch one would trigger it. Converting them to
  POST with a form button is the real fix, and changes both implementations.
- **`percentage = total`** in the marks logic is only correct while internal +
  external add up to 100. Carried over unchanged from `routes/marks.py` so the
  two implementations agree.

## How one set of templates serves both runtimes

`templates/` holds the Jinja templates. Flask renders them with Jinja;
`worker/template.mjs` implements the subset they use and renders the same files.
They are not duplicated or hand-ported, so they cannot drift.

Correctness is enforced by differential testing: all 30 templates are rendered
by both engines and compared byte for byte (`test/template.test.mjs`). After
editing a template, regenerate the expected output:

```bash
python scripts/regenerate-template-expectations.py . test/jinja-expected.json
npm test
```

Route parity is tested the same way — `test/flask-routes.json` is generated from
Flask's own `url_map`, and the suite fails if the Worker is missing a route,
accepts different methods, or adds one of its own.

## Passwords

`worker/auth.mjs` verifies the hashes Werkzeug's `generate_password_hash()`
produces, so both runtimes share one `users` table with no re-hashing. Both of
Werkzeug 3's formats work:

- **scrypt** (its default) via `node:crypto`. Its parameters (N=32768, r=8) need
  32 MiB, which is exactly Node's default `maxmem` ceiling, so the Worker raises
  `maxmem` explicitly — without that, workerd fails with a bare
  "Scrypt failed".
- **pbkdf2:sha256** via Web Crypto.

To hash a password outside the app:

```bash
node scripts/hash-password.mjs 'the password'
```

## Staying inside the free tier

- Static asset requests do not count against the Workers daily limit.
- Neon suspends compute when idle and the HTTP driver keeps nothing open.
- The seeded dataset is a few kilobytes against a 0.5 GB allowance.
- Nothing here enables a paid Neon or Workers feature.

## Automatic commits

`scripts/autocommit.sh` commits and pushes as you edit:

```bash
./scripts/autocommit.sh                  # every 3+ changed lines, checked every 15s
THRESHOLD=10 INTERVAL=60 ./scripts/autocommit.sh
NO_PUSH=1 ./scripts/autocommit.sh        # commit locally only
./scripts/autocommit.sh --once           # single pass
```

## Running the original Flask app

Still works, against the same Neon database:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r python/requirements.txt
cd python
DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... DB_PORT=5432 python app.py
```

It cannot run on Cloudflare — Workers execute JavaScript and WASM, not CPython,
and `psycopg2` needs a raw TCP socket and native libpq. That is why the app was
ported to `worker/` rather than wrapped.
