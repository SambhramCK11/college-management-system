from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

department_bp = Blueprint("department", __name__)

# View all departments
@department_bp.route("/departments")
def departments():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT department_id,
               department_name,
               hod_name
        FROM departments
        ORDER BY department_id
    """)

    departments = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "departments.html",
        departments=departments
    )


# Add Department
@department_bp.route("/add_department", methods=["GET", "POST"])
def add_department():

    if request.method == "POST":

        department_name = request.form["department_name"]
        hod_name = request.form["hod_name"]

        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO departments
            (department_name, hod_name)
            VALUES (%s,%s)
            """,
            (department_name, hod_name)
        )

        conn.commit()
        logging.info(f"Department '{department_name}' created")

        cur.close()
        conn.close()

        return redirect("/departments")

    return render_template("add_department.html")
# Edit Department
@department_bp.route("/edit_department/<int:id>", methods=["GET", "POST"])
def edit_department(id):

    conn = get_connection()
    cur = conn.cursor()

    if request.method == "POST":

        department_name = request.form["department_name"]
        hod_name = request.form["hod_name"]

        cur.execute("""
            UPDATE departments
            SET department_name=%s,
                hod_name=%s
            WHERE department_id=%s
        """,
        (department_name, hod_name, id))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/departments")

    cur.execute("""
        SELECT department_id,
               department_name,
               hod_name
        FROM departments
        WHERE department_id=%s
    """, (id,))

    department = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_department.html",
        department=department
    )
# Delete Department
@department_bp.route("/delete_department/<int:id>")
def delete_department(id):

    conn = get_connection()

    cur = conn.cursor()

    cur.execute("""
        DELETE FROM departments
        WHERE department_id=%s
    """, (id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/departments")
