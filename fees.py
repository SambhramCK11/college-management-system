from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

fees_bp = Blueprint("fees", __name__)


@fees_bp.route("/fees", methods=["GET","POST"])
def fees():

    conn=get_connection()
    cur=conn.cursor()

    cur.execute("""
    SELECT student_id,student_name
    FROM students
    ORDER BY student_name
    """)

    students=cur.fetchall()

    if request.method=="POST":

        student=request.form["student"]

        total=float(request.form["fee_amount"])

        paid=float(request.form["paid_amount"])

        payment_date=request.form["payment_date"]

        pending=total-paid

        cur.execute("""

        INSERT INTO fees

        (

        student_id,

        fee_amount,

        paid_amount,

        pending_amount,

        payment_date

        )

        VALUES(%s,%s,%s,%s,%s)

        """,

        (

        student,

        total,

        paid,

        pending,

        payment_date

        ))

        conn.commit()
        logging.info("Fee record added successfully")
        cur.close()
        conn.close()

        return redirect("/fees_report")

    cur.close()
    conn.close()

    return render_template(

    "fees.html",

    students=students

    )
@fees_bp.route("/fees_report")
def fees_report():

    conn=get_connection()
    cur=conn.cursor()

    cur.execute("""

    SELECT

    f.fee_id,

    s.student_name,

    f.fee_amount,

    f.paid_amount,

    f.pending_amount,

    f.payment_date

    FROM fees f

    JOIN students s

    ON f.student_id=s.student_id

    ORDER BY s.student_name

    """)

    records=cur.fetchall()

    cur.close()
    conn.close()

    return render_template(

    "fees_report.html",

    records=records

    )
# Edit Fee
@fees_bp.route("/edit_fee/<int:id>", methods=["GET", "POST"])
def edit_fee(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT student_id, student_name
        FROM students
        ORDER BY student_name
    """)
    students = cur.fetchall()

    if request.method == "POST":

        student = request.form["student"]
        total = float(request.form["fee_amount"])
        paid = float(request.form["paid_amount"])
        payment_date = request.form["payment_date"]

        pending = total - paid

        cur.execute("""
            UPDATE fees
            SET
                student_id=%s,
                fee_amount=%s,
                paid_amount=%s,
                pending_amount=%s,
                payment_date=%s
            WHERE fee_id=%s
        """,
        (
            student,
            total,
            paid,
            pending,
            payment_date,
            id
        ))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/fees_report")

    cur.execute("""
        SELECT *
        FROM fees
        WHERE fee_id=%s
    """, (id,))

    fee = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_fee.html",
        fee=fee,
        students=students
    )
# Delete Fee
@fees_bp.route("/delete_fee/<int:id>")
def delete_fee(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM fees
        WHERE fee_id=%s
    """, (id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/fees_report")
# Search Fee
@fees_bp.route("/search_fee")
def search_fee():

    search = request.args.get("search", "")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            f.fee_id,
            s.student_name,
            f.fee_amount,
            f.paid_amount,
            f.pending_amount,
            f.payment_date

        FROM fees f

        JOIN students s
        ON f.student_id = s.student_id

        WHERE s.student_name ILIKE %s

        ORDER BY s.student_name
    """,
    (f"%{search}%",))

    records = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "fees_report.html",
        records=records
    )
@fees_bp.route("/paid_students")
def paid_students():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            s.student_name,
            f.fee_amount,
            f.paid_amount,
            f.payment_date
        FROM fees f
        JOIN students s
        ON f.student_id = s.student_id
        WHERE f.pending_amount = 0
        ORDER BY s.student_name
    """)

    records = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "paid_students.html",
        records=records
    )

@fees_bp.route("/pending_students")
def pending_students():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            s.student_name,
            f.fee_amount,
            f.paid_amount,
            f.pending_amount

        FROM fees f

        JOIN students s
        ON f.student_id = s.student_id

        WHERE f.pending_amount > 0

        ORDER BY s.student_name
    """)

    records = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "pending_students.html",
        records=records
    )
