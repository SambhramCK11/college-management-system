from flask import Blueprint, render_template, request, redirect
from utils.db import get_connection
import logging

marks_bp = Blueprint("marks", __name__)


@marks_bp.route("/marks", methods=["GET", "POST"])
def marks():

    conn = get_connection()
    cur = conn.cursor()

    # Students
    cur.execute("""
        SELECT student_id, student_name
        FROM students
        ORDER BY student_name
    """)
    students = cur.fetchall()

    # Subjects
    cur.execute("""
        SELECT subject_id, subject_name
        FROM subjects
        ORDER BY subject_name
    """)
    subjects = cur.fetchall()

    if request.method == "POST":

        student = int(request.form["student"])
        subject = int(request.form["subject"])

        internal = int(request.form["internal"])
        external = int(request.form["external"])

        total = internal + external

        percentage = total

        if percentage >= 90:
            grade = "A+"
        elif percentage >= 80:
            grade = "A"
        elif percentage >= 70:
            grade = "B"
        elif percentage >= 60:
            grade = "C"
        elif percentage >= 50:
            grade = "D"
        else:
            grade = "F"

        cur.execute("""
            INSERT INTO marks
            (
                student_id,
                subject_id,
                internal_marks,
                external_marks,
                total,
                percentage,
                grade
            )

            VALUES(%s,%s,%s,%s,%s,%s,%s)
        """,

        (
            student,
            subject,
            internal,
            external,
            total,
            percentage,
            grade
        ))

        conn.commit()
        logging.info(f"Marks entered successfully for Student ID {student}, Subject ID {subject}")
        cur.close()
        conn.close()

        return redirect("/marks_report")

    cur.close()
    conn.close()

    return render_template(
        "marks.html",
        students=students,
        subjects=subjects
    )
@marks_bp.route("/marks_report")
def marks_report():

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""

    SELECT

    m.mark_id,

    s.student_name,

    sub.subject_name,

    m.internal_marks,

    m.external_marks,

    m.total,

    m.percentage,

    m.grade

    FROM marks m

    JOIN students s
    ON m.student_id=s.student_id

    JOIN subjects sub
    ON m.subject_id=sub.subject_id

    ORDER BY s.student_name

    """)

    records = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "marks_report.html",
        records=records
    )
# Edit Marks
@marks_bp.route("/edit_marks/<int:id>", methods=["GET","POST"])
def edit_marks(id):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT student_id,student_name
    FROM students
    ORDER BY student_name
    """)
    students = cur.fetchall()

    cur.execute("""
    SELECT subject_id,subject_name
    FROM subjects
    ORDER BY subject_name
    """)
    subjects = cur.fetchall()

    if request.method=="POST":

        student=int(request.form["student"])
        subject=int(request.form["subject"])
        internal=int(request.form["internal"])
        external=int(request.form["external"])

        total=internal+external
        percentage=total

        if percentage>=90:
            grade="A+"
        elif percentage>=80:
            grade="A"
        elif percentage>=70:
            grade="B"
        elif percentage>=60:
            grade="C"
        elif percentage>=50:
            grade="D"
        else:
            grade="F"

        cur.execute("""

        UPDATE marks

        SET

        student_id=%s,
        subject_id=%s,
        internal_marks=%s,
        external_marks=%s,
        total=%s,
        percentage=%s,
        grade=%s

        WHERE mark_id=%s

        """,

        (

        student,
        subject,
        internal,
        external,
        total,
        percentage,
        grade,
        id

        ))

        conn.commit()

        cur.close()
        conn.close()

        return redirect("/marks_report")

    cur.execute("""

    SELECT *

    FROM marks

    WHERE mark_id=%s

    """,(id,))

    mark=cur.fetchone()

    cur.close()
    conn.close()

    return render_template(

    "edit_marks.html",

    mark=mark,

    students=students,

    subjects=subjects

    )

# Delete Marks
@marks_bp.route("/delete_marks/<int:id>")
def delete_marks(id):

    conn=get_connection()

    cur=conn.cursor()

    cur.execute("""

    DELETE FROM marks

    WHERE mark_id=%s

    """,(id,))

    conn.commit()

    cur.close()
    conn.close()

    return redirect("/marks_report")
@marks_bp.route("/search_marks")
def search_marks():

    search=request.args.get("search","")

    conn=get_connection()
    cur=conn.cursor()

    cur.execute("""

    SELECT

    m.mark_id,

    s.student_name,

    sub.subject_name,

    m.internal_marks,

    m.external_marks,

    m.total,

    m.percentage,

    m.grade

    FROM marks m

    JOIN students s
    ON m.student_id=s.student_id

    JOIN subjects sub
    ON m.subject_id=sub.subject_id

    WHERE

    s.student_name ILIKE %s

    OR

    sub.subject_name ILIKE %s

    ORDER BY s.student_name

    """,

    (

    f"%{search}%",

    f"%{search}%"

    ))

    records=cur.fetchall()

    cur.close()
    conn.close()

    return render_template(

    "marks_report.html",

    records=records

    )
@marks_bp.route("/student_result/<int:id>")
def student_result(id):

    conn=get_connection()
    cur=conn.cursor()

    cur.execute("""

    SELECT

    s.student_name,

    sub.subject_name,

    m.internal_marks,

    m.external_marks,

    m.total,

    m.percentage,

    m.grade

    FROM marks m

    JOIN students s
    ON m.student_id=s.student_id

    JOIN subjects sub
    ON m.subject_id=sub.subject_id

    WHERE mark_id=%s

    """,(id,))

    result=cur.fetchone()

    cur.close()
    conn.close()

    return render_template(

    "student_result.html",

    result=result

    )
