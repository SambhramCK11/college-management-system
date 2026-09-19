from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

subject_bp = Blueprint("subject", __name__)


# View Subjects
@subject_bp.route("/subjects")
def subjects():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            s.subject_id,
            s.subject_code,
            s.subject_name,
            d.department_name,
            s.semester,
            f.faculty_name

        FROM subjects s

        LEFT JOIN departments d
        ON s.department_id = d.department_id

        LEFT JOIN faculty f
        ON s.faculty_id = f.faculty_id

        ORDER BY s.subject_id
    """)

    subjects = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "subjects.html",
        subjects=subjects
    )


# Add Subject
@subject_bp.route("/add_subject", methods=["GET","POST"])
def add_subject():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT department_id, department_name
        FROM departments
        ORDER BY department_name
    """)

    departments = cur.fetchall()

    cur.execute("""
        SELECT faculty_id, faculty_name
        FROM faculty
        ORDER BY faculty_name
    """)

    faculty = cur.fetchall()

    if request.method == "POST":

        subject_code = request.form["subject_code"]
        subject_name = request.form["subject_name"]
        department = request.form["department"]
        semester = request.form["semester"]
        faculty_id = request.form["faculty"]

        cur.execute("""
            INSERT INTO subjects
            (
                subject_code,
                subject_name,
                department_id,
                semester,
                faculty_id
            )

            VALUES(%s,%s,%s,%s,%s)
        """,

        (
            subject_code,
            subject_name,
            department,
            semester,
            faculty_id
        ))

        conn.commit()
        logging.info(f"Subject '{subject_name}' added successfully")

        cur.close()
        conn.close()

        return redirect("/subjects")

    cur.close()
    conn.close()

    return render_template(
        "add_subject.html",
        departments=departments,
        faculty=faculty
    )
# Edit Subject
@subject_bp.route("/edit_subject/<int:id>", methods=["GET", "POST"])
def edit_subject(id):

    conn = get_connection()
    cur = conn.cursor()

    # Load departments
    cur.execute("""
        SELECT department_id, department_name
        FROM departments
        ORDER BY department_name
    """)
    departments = cur.fetchall()

    # Load faculty
    cur.execute("""
        SELECT faculty_id, faculty_name
        FROM faculty
        ORDER BY faculty_name
    """)
    faculty = cur.fetchall()

    if request.method == "POST":

        subject_code = request.form["subject_code"]
        subject_name = request.form["subject_name"]
        department = request.form["department"]
        semester = request.form["semester"]
        faculty_id = request.form["faculty"]

        cur.execute("""
            UPDATE subjects
            SET
                subject_code=%s,
                subject_name=%s,
                department_id=%s,
                semester=%s,
                faculty_id=%s
            WHERE subject_id=%s
        """,
        (
            subject_code,
            subject_name,
            department,
            semester,
            faculty_id,
            id
        ))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/subjects")

    cur.execute("""
        SELECT *
        FROM subjects
        WHERE subject_id=%s
    """, (id,))

    subject = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_subject.html",
        subject=subject,
        departments=departments,
        faculty=faculty
    )
# Delete Subject
@subject_bp.route("/delete_subject/<int:id>")
def delete_subject(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM subjects
        WHERE subject_id=%s
    """, (id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/subjects")
# Search Subject
@subject_bp.route("/search_subject")
def search_subject():

    search = request.args.get("search", "")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            s.subject_id,
            s.subject_code,
            s.subject_name,
            d.department_name,
            s.semester,
            f.faculty_name

        FROM subjects s

        LEFT JOIN departments d
        ON s.department_id=d.department_id

        LEFT JOIN faculty f
        ON s.faculty_id=f.faculty_id

        WHERE

        s.subject_code ILIKE %s

        OR

        s.subject_name ILIKE %s

        ORDER BY s.subject_id
    """,

    (
        f"%{search}%",
        f"%{search}%"
    ))

    subjects = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "subjects.html",
        subjects=subjects
    )
