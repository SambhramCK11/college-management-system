from routes.department import department_bp
from flask import Flask, render_template, request, redirect, session
from werkzeug.security import check_password_hash
from routes.student import student_bp
from config import Config
from utils.db import get_connection
from routes.faculty import faculty_bp
from routes.subject import subject_bp
from routes.attendance import attendance_bp
from routes.marks import marks_bp
from routes.fees import fees_bp
import logging
import os
import sys

app = Flask(__name__)

# Log to stderr always; add the file handler only where the filesystem is
# writable. Serverless platforms mount the deployment read-only, so opening
# logs/app.log there raised at import time and took the whole function down
# before it could serve a request. stderr is what the platform collects into
# its runtime logs anyway.
_handlers: list[logging.Handler] = [logging.StreamHandler(sys.stderr)]
if not Config.ON_SERVERLESS:
    _log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(_log_dir, exist_ok=True)
    _handlers.append(logging.FileHandler(os.path.join(_log_dir, "app.log")))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=_handlers,
)

app.config.from_object(Config)

if Config.SECRET_KEY_IS_EPHEMERAL:
    logging.warning(
        "SECRET_KEY is not set — using a random key for this process. "
        "Sessions will not survive a restart. Set SECRET_KEY in the environment."
    )
app.register_blueprint(department_bp)
app.register_blueprint(student_bp)
app.register_blueprint(faculty_bp)
app.register_blueprint(subject_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(marks_bp)
app.register_blueprint(fees_bp)
# Endpoints reachable without a session: the login page itself, the static
# files it needs, and the deployment health check.
PUBLIC_ENDPOINTS = {"login", "static", "healthz"}


@app.before_request
def require_login():
    """Gate every page behind the session the login route sets.

    The login route stored session["username"] but nothing ever read it, so
    every record page — students, faculty, fees — served to anyone who knew
    the URL. Set REQUIRE_LOGIN=0 to turn this off for local development.
    """
    if os.getenv("REQUIRE_LOGIN", "1") == "0":
        return None
    if request.endpoint in PUBLIC_ENDPOINTS or request.endpoint is None:
        return None
    if "username" not in session:
        return redirect("/")
    return None


@app.route("/", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        username = request.form["username"]
        password = request.form["password"]

        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT username,password,role
            FROM users
            WHERE username=%s
            """,
            (username,)
        )

        user = cur.fetchone()

        cur.close()
        conn.close()

        if user:

            if check_password_hash(user[1], password):

                session["username"] = username
                logging.info(f"User '{username}' logged in successfully")
                

                return redirect("/dashboard")
        logging.warning(f"Failed login attempt for username: {username}") 
        return render_template(
            "login1.html",
            error="Invalid Username or Password"
        )

    return render_template("login1.html")

@app.route("/dashboard")
def dashboard():

    conn = get_connection()
    cur = conn.cursor()

    # Total Students
    cur.execute("SELECT COUNT(*) FROM students")
    total_students = cur.fetchone()[0]

    # Total Faculty
    cur.execute("SELECT COUNT(*) FROM faculty")
    total_faculty = cur.fetchone()[0]

    # Total Departments
    cur.execute("SELECT COUNT(*) FROM departments")
    total_departments = cur.fetchone()[0]

    # Total Subjects
    cur.execute("SELECT COUNT(*) FROM subjects")
    total_subjects = cur.fetchone()[0]

    # Today's Attendance
    cur.execute("""
        SELECT COUNT(*)
        FROM attendance
        WHERE attendance_date = CURRENT_DATE
    """)
    today_attendance = cur.fetchone()[0]

    # Pending Fees
    cur.execute("""
        SELECT COUNT(*)
        FROM fees
        WHERE pending_amount > 0
    """)
    pending_fees = cur.fetchone()[0]

    cur.close()
    conn.close()

    return render_template(
        "dashboard1.html",
        total_students=total_students,
        total_faculty=total_faculty,
        total_departments=total_departments,
        total_subjects=total_subjects,
        today_attendance=today_attendance,
        pending_fees=pending_fees
    )


@app.route("/logout")
def logout():

    session.clear()

    return redirect("/")
@app.route("/healthz")
def healthz():
    """Deployment diagnostics: is the app up, and can it reach the database?

    Reports only whether each variable is set, never its value, so the page is
    safe to open on a live deployment.
    """
    missing = Config.missing_db_vars()
    report = {
        "app": "ok",
        "serverless": Config.ON_SERVERLESS,
        "secret_key_set": not Config.SECRET_KEY_IS_EPHEMERAL,
        "db_vars_set": {name: bool(getattr(Config, name))
                        for name in Config.REQUIRED_DB_VARS},
        "db_sslmode": Config.DB_SSLMODE,
    }

    if missing:
        report["database"] = "not_configured"
        report["missing"] = missing
        return report, 503

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        report["users"] = cur.fetchone()[0]
        cur.close()
        conn.close()
        report["database"] = "ok"
        return report, 200
    except Exception as err:                     # noqa: BLE001 - reported below
        logging.exception("Health check could not reach the database")
        report["database"] = "error"
        report["error"] = f"{type(err).__name__}: {err}"
        return report, 503


@app.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_server_error(error):
    return render_template("500.html"), 500

if __name__ == "__main__":
    app.run(debug=True, port=5001)
