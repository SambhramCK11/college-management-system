import os
import secrets

from dotenv import load_dotenv

load_dotenv()

# Serverless platforms mount the deployment read-only and hand out a fresh
# instance per cold start. A few defaults differ there.
ON_SERVERLESS = bool(
    os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
)

_secret = os.getenv("SECRET_KEY")


class Config:
    ON_SERVERLESS = ON_SERVERLESS

    # Falling back keeps the app serving rather than failing on the first
    # request that touches the session, but the key dies with the process —
    # everyone is logged out on restart. app.py warns when this happens.
    SECRET_KEY = _secret or secrets.token_hex(32)
    SECRET_KEY_IS_EPHEMERAL = not _secret

    DB_HOST = os.getenv("DB_HOST")
    DB_NAME = os.getenv("DB_NAME")
    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_PORT = os.getenv("DB_PORT", "5432")

    # Hosted Postgres (Neon, Supabase, Vercel Postgres) requires TLS; a local
    # development server usually is not set up for it.
    DB_SSLMODE = os.getenv("DB_SSLMODE", "require" if ON_SERVERLESS else "prefer")

    # Without a timeout an unreachable host hangs until the platform kills the
    # function, which surfaces as a timeout rather than a readable error.
    DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))

    REQUIRED_DB_VARS = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")

    @classmethod
    def missing_db_vars(cls) -> list[str]:
        return [name for name in cls.REQUIRED_DB_VARS if not getattr(cls, name)]
