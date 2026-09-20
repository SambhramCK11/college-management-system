#!/usr/bin/env bash
# deploy.sh — publish this app to Cloudflare Workers with a Neon database.
#
#   ./deploy.sh
#   DATABASE_URL='postgresql://...' ADMIN_PASSWORD='...' ./deploy.sh
#
# Needs Node 18+, a free Cloudflare account and a free Neon project.
# Safe to re-run: the migration and seed are both idempotent.

set -euo pipefail
cd "$(dirname "$0")"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mFailed:\033[0m %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null || fail "Node is not installed. Get it from https://nodejs.org (18 or newer)."
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] || fail "Node $MAJOR is too old; wrangler needs 18 or newer."

# ---------------------------------------------------------------- database URL

if [ -z "${DATABASE_URL:-}" ] && [ -f .dev.vars ]; then
  DATABASE_URL="$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' .dev.vars | head -1 | tr -d '"'"'"'')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  cat <<'PROMPT'

This app needs a Neon Postgres database (free, no card):

  1. Sign up at https://neon.tech
  2. Create a project, then add a database called "college"
     (Branches -> your branch -> Databases -> Add database)
  3. Copy the POOLED connection string -- the host contains "-pooler"

Use a database of its own: this schema and the other apps' would collide.

PROMPT
  printf 'Paste the connection string: '
  read -r DATABASE_URL
fi

case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) fail "That does not look like a Postgres connection string." ;;
esac

# ---------------------------------------------------------------- secrets

# Signs the session cookie. Generated here if absent so nothing weak is default.
if [ -z "${SESSION_SECRET:-}" ] && [ -f .dev.vars ]; then
  SESSION_SECRET="$(sed -n 's/^[[:space:]]*SESSION_SECRET[[:space:]]*=[[:space:]]*//p' .dev.vars | head -1 | tr -d '"'"'"'')"
fi
if [ -z "${SESSION_SECRET:-}" ]; then
  if command -v openssl >/dev/null; then
    SESSION_SECRET="$(openssl rand -hex 32)"
  else
    SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  fi
  echo "Generated a new SESSION_SECRET."
fi

# The admin password. Asked for rather than defaulted, because this app is about
# to be reachable from the public internet.
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  printf 'Choose an admin password (leave blank for "admin123"): '
  read -r ADMIN_PASSWORD
  [ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD='admin123'
fi

step "Installing dependencies"
npm install --no-fund --no-audit

printf 'DATABASE_URL=%s\nSESSION_SECRET=%s\n' "$DATABASE_URL" "$SESSION_SECRET" > .dev.vars
echo "Wrote .dev.vars (gitignored)."

step "Running the tests"
npm test

step "Creating the tables"
npm run db:migrate

step "Loading the sample data and the admin login"
ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run db:seed

step "Checking your Cloudflare login"
if npx wrangler whoami 2>&1 | grep -q "not authenticated"; then
  echo "Opening a browser so you can authorise wrangler..."
  npx wrangler login
else
  echo "Already logged in."
fi

step "Storing the secrets on Cloudflare"
printf '%s' "$DATABASE_URL"   | npx wrangler secret put DATABASE_URL
printf '%s' "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET

step "Deploying"
npx wrangler deploy

cat <<DONE

Done. The URL is printed just above, in the form:

    https://college-management-system.<your-subdomain>.workers.dev

Log in with:

    username: admin
    password: $ADMIN_PASSWORD

Every page except the login form needs that session. If you are sending this
link to someone, remember they cannot see anything without the password --
either include it or tell me and I will add a read-only demo login.
DONE
