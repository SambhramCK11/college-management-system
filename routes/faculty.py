from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

faculty_bp = Blueprint("faculty", __name__)


# View Faculty
@faculty_bp.route("/faculty")
def faculty():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            f.faculty_id,
            f.faculty_name,
            d.department_name,
            f.qualification,
            f.experience,
            f.mobile,
            f.email

        FROM faculty f

        LEFT JOIN departments d

        ON f.department_id=d.department_id

        ORDER BY faculty_id
    """)

    faculty = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "faculty.html",
        faculty=faculty
    )


# Add Faculty
@faculty_bp.route("/add_faculty", methods=["GET","POST"])
def add_faculty():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT department_id,
               department_name
        FROM departments
        ORDER BY department_name
    """)

    departments = cur.fetchall()

    if request.method=="POST":

        name=request.form["faculty_name"]
        department=request.form["department"]
        qualification=request.form["qualification"]
        experience=request.form["experience"]
        mobile=request.form["mobile"]
        email=request.form["email"]

        cur.execute("""
        INSERT INTO faculty
        (
        faculty_name,
        department_id,
        qualification,
        experience,
        mobile,
        email
        )

        VALUES(%s,%s,%s,%s,%s,%s)

        """,

        (
        name,
        department,
        qualification,
        experience,
        mobile,
        email
        ))

        conn.commit()
        logging.info(f"Faculty '{name}' added")

        cur.close()
        conn.close()

        return redirect("/faculty")

    cur.close()
    conn.close()

    return render_template(
        "add_faculty.html",
        departments=departments
    )
# Edit Faculty
@faculty_bp.route("/edit_faculty/<int:id>", methods=["GET", "POST"])
def edit_faculty(id):

    conn = get_connection()
    cur = conn.cursor()

    # Get departments
    cur.execute("""
        SELECT department_id, department_name
        FROM departments
        ORDER BY department_name
    """)
    departments = cur.fetchall()

    if request.method == "POST":

        faculty_name = request.form["faculty_name"]
        department = request.form["department"]
        qualification = request.form["qualification"]
        experience = request.form["experience"]
        mobile = request.form["mobile"]
        email = request.form["email"]

        cur.execute("""
            UPDATE faculty
            SET
                faculty_name=%s,
                department_id=%s,
                qualification=%s,
                experience=%s,
                mobile=%s,
                email=%s
            WHERE faculty_id=%s
        """,
        (
            faculty_name,
            department,
            qualification,
            experience,
            mobile,
            email,
            id
        ))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/faculty")

    cur.execute("""
        SELECT *
        FROM faculty
        WHERE faculty_id=%s
    """, (id,))

    faculty = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_faculty.html",
        faculty=faculty,
        departments=departments
    )
# Delete Faculty
@faculty_bp.route("/delete_faculty/<int:id>")
def delete_faculty(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM faculty
        WHERE faculty_id=%s
    """, (id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/faculty")
# Search Faculty
@faculty_bp.route("/search_faculty")
def search_faculty():

    search = request.args.get("search", "")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            f.faculty_id,
            f.faculty_name,
            d.department_name,
            f.qualification,
            f.experience,
            f.mobile,
            f.email

        FROM faculty f

        LEFT JOIN departments d
        ON f.department_id = d.department_id

        WHERE
            CAST(f.faculty_id AS TEXT) ILIKE %s
            OR f.faculty_name ILIKE %s
            OR f.mobile ILIKE %s

        ORDER BY f.faculty_id
    """,
    (
        f"%{search}%",
        f"%{search}%",
        f"%{search}%"
    ))

    faculty = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "faculty.html",
        faculty=faculty
    )
