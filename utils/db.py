import psycopg2

from config import Config


class DatabaseNotConfigured(RuntimeError):
    """Raised when the connection details are missing from the environment."""


def get_connection():
    missing = Config.missing_db_vars()
    if missing:
        # Naming the variables turns an opaque 500 into something actionable.
        raise DatabaseNotConfigured(
            "Database is not configured. Missing environment variable(s): "
            + ", ".join(missing)
        )

    return psycopg2.connect(
        host=Config.DB_HOST,
        database=Config.DB_NAME,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        port=Config.DB_PORT,
        sslmode=Config.DB_SSLMODE,
        connect_timeout=Config.DB_CONNECT_TIMEOUT,
    )
