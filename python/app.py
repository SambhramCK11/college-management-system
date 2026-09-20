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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# templates/ and public/static/ sit above this package because the Cloudflare
# Worker in ../worker renders the same templates and serves the same stylesheet.
# One copy, two runtimes.
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "..", "templates"),
    static_folder=os.path.join(BASE_DIR, "..", "public", "static"),
)

# Anchor the log path to this file so the app can be started from any directory.
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(LOG_DIR, "app.log"),
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
app.config.from_object(Config)
app.register_blueprint(department_bp)
app.register_blueprint(student_bp)
app.register_blueprint(faculty_bp)
app.register_blueprint(subject_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(marks_bp)
app.register_blueprint(fees_bp)
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
@app.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_server_error(error):
    return render_template("500.html"), 500

if __name__ == "__main__":
    app.run(debug=True, port=5001)
