import logging
from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection

student_bp = Blueprint("student", __name__)


# View Students
@student_bp.route("/students")
def students():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
        s.student_id,
        s.student_name,
        s.gender,
        s.mobile,
        s.email,
        d.department_name,
        s.semester

        FROM students s

        LEFT JOIN departments d

        ON s.department_id=d.department_id

        ORDER BY s.student_id
    """)

    students = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "students.html",
        students=students
    )


# Add Student
@student_bp.route("/add_student", methods=["GET", "POST"])
def add_student():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT department_id,
               department_name
        FROM departments
        ORDER BY department_name
    """)

    departments = cur.fetchall()

    if request.method == "POST":

        name = request.form["student_name"]
        gender = request.form["gender"]
        dob = request.form["dob"]
        mobile = request.form["mobile"]
        email = request.form["email"]
        address = request.form["address"]
        department = request.form["department"]
        semester = request.form["semester"]

        cur.execute("""
            INSERT INTO students
            (
            student_name,
            gender,
            dob,
            mobile,
            email,
            address,
            department_id,
            semester
            )

            VALUES
            (%s,%s,%s,%s,%s,%s,%s,%s)

        """,

        (
            name,
            gender,
            dob,
            mobile,
            email,
            address,
            department,
            semester
        ))

        conn.commit()
        logging.info(f"Student '{name}' added successfully")

        cur.close()
        conn.close()

        return redirect("/students")

    cur.close()
    conn.close()

    return render_template(
        "add_student.html",
        departments=departments
    )
# Edit Student
@student_bp.route("/edit_student/<int:id>", methods=["GET", "POST"])
def edit_student(id):

    conn = get_connection()
    cur = conn.cursor()

    # Get all departments
    cur.execute("""
        SELECT department_id, department_name
        FROM departments
        ORDER BY department_name
    """)
    departments = cur.fetchall()

    if request.method == "POST":

        student_name = request.form["student_name"]
        gender = request.form["gender"]
        dob = request.form["dob"]
        mobile = request.form["mobile"]
        email = request.form["email"]
        address = request.form["address"]
        department = request.form["department"]
        semester = request.form["semester"]

        cur.execute("""
            UPDATE students

            SET
                student_name=%s,
                gender=%s,
                dob=%s,
                mobile=%s,
                email=%s,
                address=%s,
                department_id=%s,
                semester=%s

            WHERE student_id=%s
        """,

        (
            student_name,
            gender,
            dob,
            mobile,
            email,
            address,
            department,
            semester,
            id
        ))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/students")

    cur.execute("""
        SELECT *
        FROM students
        WHERE student_id=%s
    """, (id,))

    student = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_student.html",
        student=student,
        departments=departments
    )
# Delete Student
@student_bp.route("/delete_student/<int:id>")
def delete_student(id):

    conn = get_connection()

    cur = conn.cursor()

    cur.execute("""
        DELETE
        FROM students
        WHERE student_id=%s
    """, (id,))

    conn.commit()

    cur.close()

    conn.close()

    return redirect("/students")
@student_bp.route("/search_student", methods=["GET"])
def search_student():

    search = request.args.get("search", "")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            s.student_id,
            s.student_name,
            s.gender,
            s.mobile,
            s.email,
            d.department_name,
            s.semester

        FROM students s

        LEFT JOIN departments d

        ON s.department_id=d.department_id

        WHERE

        CAST(s.student_id AS TEXT) ILIKE %s

        OR

        s.student_name ILIKE %s

        OR

        s.mobile ILIKE %s

        ORDER BY s.student_id
    """,

    (
        f"%{search}%",
        f"%{search}%",
        f"%{search}%"
    ))

    students = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "students.html",
        students=students
    )
