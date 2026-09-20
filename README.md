# College Management System

Departments, faculty, students, subjects, attendance, marks and fees, with
search and reports across each. Two implementations over one Postgres database
and one set of templates:

- **`worker/`** — a Cloudflare Worker, which is what deploys. See
  **[DEPLOY.md](DEPLOY.md)**.
- **`python/`** — the original Flask app, still runnable locally.

```
templates/        30 Jinja templates — rendered by BOTH runtimes
public/static/    style.css, script.js — served by both
db/
  schema.sql              portable schema, applied to Neon
  seed.sql                sample data
  pg_dump_original.sql    the original dump, kept for reference
worker/
  index.mjs       route table and handlers (41 routes)
  db.mjs          Neon access in arrayMode (positional rows, like psycopg2 tuples)
  template.mjs    the Jinja subset the templates use
  views.mjs       templates bundled as text modules
  auth.mjs        Werkzeug password hashes, signed session cookies
python/
  app.py, config.py, routes/, utils/, requirements.txt
scripts/          migrate, seed, password hashing, autocommit
test/             49 tests
```

## Quick start

```bash
npm install
cp .dev.vars.example .dev.vars      # add your Neon connection string
npm run db:migrate && npm run db:seed
npm run dev                         # http://localhost:8787
```

Log in with the credentials `db:seed` prints.

## Why the templates are not duplicated

`templates/` is rendered by Jinja under Flask and by `worker/template.mjs` under
the Worker. Hand-porting thirty templates would have left two copies to keep in
step. Instead the subset renderer is checked against Jinja itself: every
template is rendered by both and compared byte for byte.

```bash
npm test     # 30 template comparisons + route parity + request-level tests
```

## Notes on the port

- SQL is carried over verbatim; only psycopg2's `%s` placeholders became `$1`,
  `$2`.
- The Worker requires a login for every page except `/` and `/logout`. The Flask
  app checks nothing, which is fine on localhost and not on a public URL —
  see [DEPLOY.md](DEPLOY.md).
- Two pre-existing quirks were left alone so both implementations agree:
  `percentage = total` in the marks logic, and `/delete_*` routes acting on GET.
  Both are discussed in [DEPLOY.md](DEPLOY.md).
