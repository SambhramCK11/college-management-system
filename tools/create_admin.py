"""Create or reset a login for the College Management System.

The users table ships empty, so a fresh database has nobody to log in as.

    python tools/create_admin.py                  # prompts for the details
    python tools/create_admin.py --username admin --role admin

Reads the same environment variables the app does, so point it at whichever
database you want by setting DB_HOST and friends (or a local .env file).
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from werkzeug.security import generate_password_hash  # noqa: E402

from config import Config  # noqa: E402
from utils.db import get_connection  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username")
    parser.add_argument("--role", default="admin")
    parser.add_argument("--password", help="omit to be prompted (recommended)")
    args = parser.parse_args()

    missing = Config.missing_db_vars()
    if missing:
        print("Database is not configured. Missing: " + ", ".join(missing),
              file=sys.stderr)
        return 1

    username = args.username or input("Username: ").strip()
    if not username:
        print("A username is required.", file=sys.stderr)
        return 1

    password = args.password or getpass.getpass("Password: ")
    if not password:
        print("A password is required.", file=sys.stderr)
        return 1

    conn = get_connection()
    cur = conn.cursor()
    # ON CONFLICT makes this a password reset when the user already exists.
    cur.execute(
        """
        INSERT INTO users (username, password, role)
        VALUES (%s, %s, %s)
        ON CONFLICT (username)
        DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role
        """,
        (username, generate_password_hash(password), args.role),
    )
    conn.commit()
    cur.close()
    conn.close()

    print(f"User '{username}' is ready with role '{args.role}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
