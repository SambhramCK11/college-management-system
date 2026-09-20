# College Management System

A full-stack college management system built with **Python, Flask, PostgreSQL, HTML, CSS, and JavaScript**.

## Core Modules
- Authentication & role-based access
- Student management
- Faculty management
- Department & subject management
- Attendance management
- Marks management
- Fee management
- Reports & dashboards
- Logging and error handling

## Tech Stack
**Backend:** Python, Flask  
**Database:** PostgreSQL  
**Frontend:** HTML, CSS, JavaScript  
**Version Control:** Git

## Local Setup
1. Create and activate a virtual environment.
2. Install dependencies:
   `pip install -r requirements.txt`
3. Create a PostgreSQL database and run `database/schema.sql`.
4. Copy `.env.example` to `.env` and add your local credentials.
5. Create a login: `python tools/create_admin.py`
6. Run:
   `python app.py`
7. Open `http://127.0.0.1:5001`

The `users` table ships empty, so step 5 is required — without it there is no
account to log in with. The same script resets an existing user's password.

## Deploying to Vercel

`api/index.py` exposes the WSGI app as a serverless function and `vercel.json`
rewrites every request to it, with framework auto-detection switched off so the
deployment does not depend on Vercel locating the Flask instance by filename.
`includeFiles` bundles the templates and static files, which import tracing
alone would not pick up.

**Vercel has no database.** This app needs a PostgreSQL server reachable from
the internet — Neon, Supabase and Vercel Postgres all have a free tier. Create
one, apply `database/schema.sql` to it, then set these in the project's
**Settings → Environment Variables**:

| Variable | Notes |
|---|---|
| `SECRET_KEY` | Long random string. Without it sessions reset on every cold start. |
| `DB_HOST` | Your database host |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `DB_PORT` | `5432` unless your provider says otherwise |
| `DB_SSLMODE` | Defaults to `require` on Vercel; hosted Postgres needs TLS |

Visit `/healthz` on the deployment to check the wiring. It reports whether each
variable is set — never its value — and whether the database actually answers.

Two deployment-specific details, both handled in the code:

- **The filesystem is read-only.** Logging writes to stderr on Vercel, which is
  what the platform collects into its runtime logs; the `logs/app.log` file
  handler is added only where the filesystem is writable.
- **`database/schema.sql` is a portable schema.** The original `pg_dump` output
  is kept as `database/schema.pg_dump.sql`, but it will not apply to hosted
  Postgres: it uses a `\restrict` psql meta-command, sets `transaction_timeout`
  (which does not exist before PostgreSQL 17), and assigns ownership to a
  `postgres` role you do not get on a managed instance.


## Project Notes
This repository contains the source code for the project. Environment secrets and local virtual-environment files are intentionally excluded from version control.
