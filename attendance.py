from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

attendance_bp = Blueprint("attendance", __name__)


@attendance_bp.route("/attendance", methods=["GET", "POST"])
def attendance():

    conn = get_connection()
    cur = conn.cursor()

    # Students
    cur.execute("""
    SELECT student_id,student_name
    FROM students
    ORDER BY student_name
    """)

    students = cur.fetchall()

    # Subjects
    cur.execute("""
    SELECT subject_id,subject_name
    FROM subjects
    ORDER BY subject_name
    """)

    subjects = cur.fetchall()

    if request.method=="POST":

        student=request.form["student"]

        subject=request.form["subject"]

        date=request.form["date"]

        status=request.form["status"]

        cur.execute("""

        INSERT INTO attendance
        (
        student_id,
        subject_id,
        attendance_date,
        status
        )

        VALUES(%s,%s,%s,%s)

        """,

        (

        student,
        subject,
        date,
        status

        ))

        conn.commit()
        logging.info("Attendance marked successfully")

        cur.close()

        conn.close()

        return redirect("/attendance_report")

    cur.close()

    conn.close()

    return render_template(

    "attendance.html",

    students=students,

    subjects=subjects

    )
@attendance_bp.route("/attendance_report")
def attendance_report():

    conn=get_connection()

    cur=conn.cursor()

    cur.execute("""

    SELECT

    a.attendance_id,

    s.student_name,

    sub.subject_name,

    a.attendance_date,

    a.status

    FROM attendance a

    JOIN students s

    ON a.student_id=s.student_id

    JOIN subjects sub

    ON a.subject_id=sub.subject_id

    ORDER BY a.attendance_date DESC

    """)

    records=cur.fetchall()

    cur.close()

    conn.close()

    return render_template(

    "attendance_report.html",

    records=records

    )
# Edit Attendance
@attendance_bp.route("/edit_attendance/<int:id>", methods=["GET", "POST"])
def edit_attendance(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT student_id, student_name
        FROM students
        ORDER BY student_name
    """)
    students = cur.fetchall()

    cur.execute("""
        SELECT subject_id, subject_name
        FROM subjects
        ORDER BY subject_name
    """)
    subjects = cur.fetchall()

    if request.method == "POST":

        student = request.form["student"]
        subject = request.form["subject"]
        date = request.form["date"]
        status = request.form["status"]

        cur.execute("""
            UPDATE attendance
            SET
                student_id=%s,
                subject_id=%s,
                attendance_date=%s,
                status=%s
            WHERE attendance_id=%s
        """,
        (student, subject, date, status, id))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/attendance_report")

    cur.execute("""
        SELECT *
        FROM attendance
        WHERE attendance_id=%s
    """, (id,))

    attendance = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "edit_attendance.html",
        attendance=attendance,
        students=students,
        subjects=subjects
    )
# Delete Attendance
@attendance_bp.route("/delete_attendance/<int:id>")
def delete_attendance(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM attendance
        WHERE attendance_id=%s
    """, (id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/attendance_report")
@attendance_bp.route("/search_attendance")
def search_attendance():

    search = request.args.get("search","")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""

    SELECT

    a.attendance_id,

    s.student_name,

    sub.subject_name,

    a.attendance_date,

    a.status

    FROM attendance a

    JOIN students s
    ON a.student_id=s.student_id

    JOIN subjects sub
    ON a.subject_id=sub.subject_id

    WHERE

    s.student_name ILIKE %s

    OR

    sub.subject_name ILIKE %s

    ORDER BY attendance_date DESC

    """,

    (
        f"%{search}%",
        f"%{search}%"
    ))

    records=cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "attendance_report.html",
        records=records
    )
@attendance_bp.route("/student_attendance")
def student_attendance():

    conn=get_connection()
    cur=conn.cursor()

    cur.execute("""

    SELECT

    s.student_name,

    COUNT(*) AS total_classes,

    SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,

    SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) AS absent

    FROM attendance a

    JOIN students s

    ON a.student_id=s.student_id

    GROUP BY s.student_name

    ORDER BY s.student_name

    """)

    report=cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "student_attendance.html",
        report=report
    )
