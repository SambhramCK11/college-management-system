/**
 * Cloudflare Worker — the college management system.
 *
 * A route-for-route port of the Flask app in python/, against the same Neon
 * Postgres database and rendering the same templates. The SQL is carried over
 * verbatim apart from psycopg2's %s placeholders becoming Postgres $1, $2 —
 * the queries, joins and orderings are unchanged.
 *
 * One deliberate difference from the Flask app: every page except the login
 * form requires a session. The Flask blueprints register no access control, so
 * the original app serves its entire CRUD surface to anonymous callers. That is
 * survivable on localhost and not survivable on a public URL, where anyone
 * could delete every student record. See DEPLOY.md.
 */

import {
  checkPasswordHash,
  clearCookie,
  createSession,
  readSession,
  sessionCookie,
} from './auth.mjs';
import { connect, row, rows, scalar } from './db.mjs';
import { renderTemplate } from './views.mjs';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

/** Read a submitted form into a plain object. */
async function formData(request) {
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
}

/**
 * Require a field to be present and non-empty.
 *
 * Flask's `request.form["x"]` raises a 400 on a missing key; this mirrors that
 * rather than silently inserting a null.
 */
function required(form, name) {
  const value = form[name];
  if (value === undefined || value === '') {
    throw new HttpError(400, `Missing required field '${name}'`);
  }
  return value;
}

/** Optional field: absent or blank becomes NULL, as an empty form input should. */
const optional = (form, name) => (form[name] === undefined || form[name] === '' ? null : form[name]);

/** Parse a path id, rejecting anything Flask's <int:id> converter would. */
function pathId(raw) {
  if (!/^\d+$/.test(raw)) throw new HttpError(404, 'Not found');
  return Number(raw);
}

function toNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `'${field}' must be a number`);
  return n;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The grading ladder from routes/marks.py, unchanged. */
function gradeFor(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
}

const like = (search) => `%${search}%`;

/* ------------------------------------------------------------------ */
/* Shared lookups — the dropdown queries several pages repeat           */
/* ------------------------------------------------------------------ */

const listDepartments = (sql) =>
  rows(sql, 'SELECT department_id, department_name FROM departments ORDER BY department_name');

const listFacultyNames = (sql) =>
  rows(sql, 'SELECT faculty_id, faculty_name FROM faculty ORDER BY faculty_name');

const listStudentNames = (sql) =>
  rows(sql, 'SELECT student_id, student_name FROM students ORDER BY student_name');

const listSubjectNames = (sql) =>
  rows(sql, 'SELECT subject_id, subject_name FROM subjects ORDER BY subject_name');

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

async function login({ request, sql, env }) {
  if (request.method === 'GET') return renderTemplate('login1.html', {});

  const form = await formData(request);
  const username = form.username ?? '';
  const password = form.password ?? '';

  const user = await row(
    sql,
    'SELECT username, password, role FROM users WHERE username = $1',
    [username]
  );

  if (user && (await checkPasswordHash(user[1], password))) {
    const cookie = await createSession(env.SESSION_SECRET, username);
    return redirect('/dashboard', { 'set-cookie': sessionCookie(cookie) });
  }

  // Same message whether the username or the password was wrong, so the form
  // does not confirm which usernames exist.
  return renderTemplate('login1.html', { error: 'Invalid Username or Password' }, 401);
}

const logout = () => redirect('/', { 'set-cookie': clearCookie() });

async function dashboard({ sql, username }) {
  const [totalStudents, totalFaculty, totalDepartments, totalSubjects, todayAttendance, pendingFees] =
    await Promise.all([
      scalar(sql, 'SELECT COUNT(*) FROM students'),
      scalar(sql, 'SELECT COUNT(*) FROM faculty'),
      scalar(sql, 'SELECT COUNT(*) FROM departments'),
      scalar(sql, 'SELECT COUNT(*) FROM subjects'),
      scalar(sql, 'SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE'),
      scalar(sql, 'SELECT COUNT(*) FROM fees WHERE pending_amount > 0'),
    ]);

  return renderTemplate('dashboard1.html', {
    total_students: totalStudents,
    total_faculty: totalFaculty,
    total_departments: totalDepartments,
    total_subjects: totalSubjects,
    today_attendance: todayAttendance,
    pending_fees: pendingFees,
    username,
    session: { username },
  });
}

/* ------------------------------------------------------------------ */
/* Departments                                                        */
/* ------------------------------------------------------------------ */

async function departmentsPage({ sql }) {
  return renderTemplate('departments.html', {
    departments: await rows(
      sql,
      'SELECT department_id, department_name, hod_name FROM departments ORDER BY department_id'
    ),
  });
}

async function addDepartment({ request, sql }) {
  if (request.method === 'GET') return renderTemplate('add_department.html', {});

  const form = await formData(request);
  await rows(sql, 'INSERT INTO departments (department_name, hod_name) VALUES ($1, $2)', [
    required(form, 'department_name'),
    required(form, 'hod_name'),
  ]);
  return redirect('/departments');
}

async function editDepartment({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      'UPDATE departments SET department_name = $1, hod_name = $2 WHERE department_id = $3',
      [required(form, 'department_name'), required(form, 'hod_name'), id]
    );
    return redirect('/departments');
  }

  const department = await row(
    sql,
    'SELECT department_id, department_name, hod_name FROM departments WHERE department_id = $1',
    [id]
  );
  if (!department) throw new HttpError(404, 'Department not found');
  return renderTemplate('edit_department.html', { department });
}

async function deleteDepartment({ sql, id }) {
  await rows(sql, 'DELETE FROM departments WHERE department_id = $1', [id]);
  return redirect('/departments');
}

/* ------------------------------------------------------------------ */
/* Students                                                           */
/* ------------------------------------------------------------------ */

const STUDENT_LIST_SQL = `
  SELECT s.student_id, s.student_name, s.gender, s.mobile, s.email,
         d.department_name, s.semester
  FROM students s
  LEFT JOIN departments d ON s.department_id = d.department_id`;

async function studentsPage({ sql }) {
  return renderTemplate('students.html', {
    students: await rows(sql, `${STUDENT_LIST_SQL} ORDER BY s.student_id`),
  });
}

async function searchStudent({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('students.html', {
    students: await rows(
      sql,
      `${STUDENT_LIST_SQL}
       WHERE CAST(s.student_id AS TEXT) ILIKE $1
          OR s.student_name ILIKE $2
          OR s.mobile ILIKE $3
       ORDER BY s.student_id`,
      [like(search), like(search), like(search)]
    ),
  });
}

/** The eight student columns the add and edit forms both submit. */
const studentFields = (form) => [
  required(form, 'student_name'),
  optional(form, 'gender'),
  optional(form, 'dob'),
  optional(form, 'mobile'),
  optional(form, 'email'),
  optional(form, 'address'),
  optional(form, 'department'),
  optional(form, 'semester'),
];

async function addStudent({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO students
         (student_name, gender, dob, mobile, email, address, department_id, semester)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      studentFields(form)
    );
    return redirect('/students');
  }
  return renderTemplate('add_student.html', { departments: await listDepartments(sql) });
}

async function editStudent({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE students
       SET student_name = $1, gender = $2, dob = $3, mobile = $4, email = $5,
           address = $6, department_id = $7, semester = $8
       WHERE student_id = $9`,
      [...studentFields(form), id]
    );
    return redirect('/students');
  }

  const [student, departments] = await Promise.all([
    row(sql, 'SELECT * FROM students WHERE student_id = $1', [id]),
    listDepartments(sql),
  ]);
  if (!student) throw new HttpError(404, 'Student not found');
  return renderTemplate('edit_student.html', { student, departments });
}

async function deleteStudent({ sql, id }) {
  await rows(sql, 'DELETE FROM students WHERE student_id = $1', [id]);
  return redirect('/students');
}

/* ------------------------------------------------------------------ */
/* Faculty                                                            */
/* ------------------------------------------------------------------ */

const FACULTY_LIST_SQL = `
  SELECT f.faculty_id, f.faculty_name, d.department_name, f.qualification,
         f.experience, f.mobile, f.email
  FROM faculty f
  LEFT JOIN departments d ON f.department_id = d.department_id`;

async function facultyPage({ sql }) {
  return renderTemplate('faculty.html', {
    faculty: await rows(sql, `${FACULTY_LIST_SQL} ORDER BY f.faculty_id`),
  });
}

async function searchFaculty({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('faculty.html', {
    faculty: await rows(
      sql,
      `${FACULTY_LIST_SQL}
       WHERE CAST(f.faculty_id AS TEXT) ILIKE $1
          OR f.faculty_name ILIKE $2
          OR f.mobile ILIKE $3
       ORDER BY f.faculty_id`,
      [like(search), like(search), like(search)]
    ),
  });
}

const facultyFields = (form) => [
  required(form, 'faculty_name'),
  optional(form, 'department'),
  optional(form, 'qualification'),
  optional(form, 'experience'),
  optional(form, 'mobile'),
  optional(form, 'email'),
];

async function addFaculty({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO faculty
         (faculty_name, department_id, qualification, experience, mobile, email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      facultyFields(form)
    );
    return redirect('/faculty');
  }
  return renderTemplate('add_faculty.html', { departments: await listDepartments(sql) });
}

async function editFaculty({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE faculty
       SET faculty_name = $1, department_id = $2, qualification = $3,
           experience = $4, mobile = $5, email = $6
       WHERE faculty_id = $7`,
      [...facultyFields(form), id]
    );
    return redirect('/faculty');
  }

  const [member, departments] = await Promise.all([
    row(sql, 'SELECT * FROM faculty WHERE faculty_id = $1', [id]),
    listDepartments(sql),
  ]);
  if (!member) throw new HttpError(404, 'Faculty member not found');
  return renderTemplate('edit_faculty.html', { faculty: member, departments });
}

async function deleteFaculty({ sql, id }) {
  await rows(sql, 'DELETE FROM faculty WHERE faculty_id = $1', [id]);
  return redirect('/faculty');
}

/* ------------------------------------------------------------------ */
/* Subjects                                                           */
/* ------------------------------------------------------------------ */

const SUBJECT_LIST_SQL = `
  SELECT s.subject_id, s.subject_code, s.subject_name, d.department_name,
         s.semester, f.faculty_name
  FROM subjects s
  LEFT JOIN departments d ON s.department_id = d.department_id
  LEFT JOIN faculty f ON s.faculty_id = f.faculty_id`;

async function subjectsPage({ sql }) {
  return renderTemplate('subjects.html', {
    subjects: await rows(sql, `${SUBJECT_LIST_SQL} ORDER BY s.subject_id`),
  });
}

async function searchSubject({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('subjects.html', {
    subjects: await rows(
      sql,
      `${SUBJECT_LIST_SQL}
       WHERE s.subject_code ILIKE $1 OR s.subject_name ILIKE $2
       ORDER BY s.subject_id`,
      [like(search), like(search)]
    ),
  });
}

const subjectFields = (form) => [
  required(form, 'subject_code'),
  required(form, 'subject_name'),
  optional(form, 'department'),
  optional(form, 'semester'),
  optional(form, 'faculty'),
];

async function addSubject({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO subjects
         (subject_code, subject_name, department_id, semester, faculty_id)
       VALUES ($1, $2, $3, $4, $5)`,
      subjectFields(form)
    );
    return redirect('/subjects');
  }
  const [departments, faculty] = await Promise.all([listDepartments(sql), listFacultyNames(sql)]);
  return renderTemplate('add_subject.html', { departments, faculty });
}

async function editSubject({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE subjects
       SET subject_code = $1, subject_name = $2, department_id = $3,
           semester = $4, faculty_id = $5
       WHERE subject_id = $6`,
      [...subjectFields(form), id]
    );
    return redirect('/subjects');
  }

  const [subject, departments, faculty] = await Promise.all([
    row(sql, 'SELECT * FROM subjects WHERE subject_id = $1', [id]),
    listDepartments(sql),
    listFacultyNames(sql),
  ]);
  if (!subject) throw new HttpError(404, 'Subject not found');
  return renderTemplate('edit_subject.html', { subject, departments, faculty });
}

async function deleteSubject({ sql, id }) {
  await rows(sql, 'DELETE FROM subjects WHERE subject_id = $1', [id]);
  return redirect('/subjects');
}

/* ------------------------------------------------------------------ */
/* Attendance                                                         */
/* ------------------------------------------------------------------ */

const ATTENDANCE_LIST_SQL = `
  SELECT a.attendance_id, s.student_name, sub.subject_name, a.attendance_date, a.status
  FROM attendance a
  JOIN students s ON a.student_id = s.student_id
  JOIN subjects sub ON a.subject_id = sub.subject_id`;

async function attendancePage({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO attendance (student_id, subject_id, attendance_date, status)
       VALUES ($1, $2, $3, $4)`,
      [
        required(form, 'student'),
        required(form, 'subject'),
        required(form, 'date'),
        required(form, 'status'),
      ]
    );
    return redirect('/attendance_report');
  }

  const [students, subjects] = await Promise.all([listStudentNames(sql), listSubjectNames(sql)]);
  return renderTemplate('attendance.html', { students, subjects });
}

async function attendanceReport({ sql }) {
  return renderTemplate('attendance_report.html', {
    records: await rows(sql, `${ATTENDANCE_LIST_SQL} ORDER BY a.attendance_date DESC`),
  });
}

async function searchAttendance({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('attendance_report.html', {
    records: await rows(
      sql,
      `${ATTENDANCE_LIST_SQL}
       WHERE s.student_name ILIKE $1 OR sub.subject_name ILIKE $2
       ORDER BY a.attendance_date DESC`,
      [like(search), like(search)]
    ),
  });
}

async function editAttendance({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE attendance
       SET student_id = $1, subject_id = $2, attendance_date = $3, status = $4
       WHERE attendance_id = $5`,
      [
        required(form, 'student'),
        required(form, 'subject'),
        required(form, 'date'),
        required(form, 'status'),
        id,
      ]
    );
    return redirect('/attendance_report');
  }

  const [record, students, subjects] = await Promise.all([
    row(sql, 'SELECT * FROM attendance WHERE attendance_id = $1', [id]),
    listStudentNames(sql),
    listSubjectNames(sql),
  ]);
  if (!record) throw new HttpError(404, 'Attendance record not found');
  return renderTemplate('edit_attendance.html', { attendance: record, students, subjects });
}

async function deleteAttendance({ sql, id }) {
  await rows(sql, 'DELETE FROM attendance WHERE attendance_id = $1', [id]);
  return redirect('/attendance_report');
}

async function studentAttendance({ sql }) {
  return renderTemplate('student_attendance.html', {
    report: await rows(
      sql,
      `SELECT s.student_name,
              COUNT(*) AS total_classes,
              SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status = 'Absent'  THEN 1 ELSE 0 END) AS absent
       FROM attendance a
       JOIN students s ON a.student_id = s.student_id
       GROUP BY s.student_name
       ORDER BY s.student_name`
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Marks                                                              */
/* ------------------------------------------------------------------ */

const MARKS_LIST_SQL = `
  SELECT m.mark_id, s.student_name, sub.subject_name, m.internal_marks,
         m.external_marks, m.total, m.percentage, m.grade
  FROM marks m
  JOIN students s ON m.student_id = s.student_id
  JOIN subjects sub ON m.subject_id = sub.subject_id`;

/**
 * Derive total, percentage and grade from a marks form.
 *
 * percentage is set equal to total, which is what routes/marks.py does — only
 * correct while internal + external sum to 100. Kept as-is so the two
 * implementations agree; changing the formula is a separate decision.
 */
function marksFields(form) {
  const student = required(form, 'student');
  const subject = required(form, 'subject');
  const internal = toNumber(required(form, 'internal'), 'internal');
  const external = toNumber(required(form, 'external'), 'external');
  const total = internal + external;
  return [student, subject, internal, external, total, total, gradeFor(total)];
}

async function marksPage({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO marks
         (student_id, subject_id, internal_marks, external_marks, total, percentage, grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      marksFields(form)
    );
    return redirect('/marks_report');
  }

  const [students, subjects] = await Promise.all([listStudentNames(sql), listSubjectNames(sql)]);
  return renderTemplate('marks.html', { students, subjects });
}

async function marksReport({ sql }) {
  return renderTemplate('marks_report.html', {
    records: await rows(sql, `${MARKS_LIST_SQL} ORDER BY s.student_name`),
  });
}

async function searchMarks({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('marks_report.html', {
    records: await rows(
      sql,
      `${MARKS_LIST_SQL}
       WHERE s.student_name ILIKE $1 OR sub.subject_name ILIKE $2
       ORDER BY s.student_name`,
      [like(search), like(search)]
    ),
  });
}

async function editMarks({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE marks
       SET student_id = $1, subject_id = $2, internal_marks = $3, external_marks = $4,
           total = $5, percentage = $6, grade = $7
       WHERE mark_id = $8`,
      [...marksFields(form), id]
    );
    return redirect('/marks_report');
  }

  const [mark, students, subjects] = await Promise.all([
    row(sql, 'SELECT * FROM marks WHERE mark_id = $1', [id]),
    listStudentNames(sql),
    listSubjectNames(sql),
  ]);
  if (!mark) throw new HttpError(404, 'Marks record not found');
  return renderTemplate('edit_marks.html', { mark, students, subjects });
}

async function deleteMarks({ sql, id }) {
  await rows(sql, 'DELETE FROM marks WHERE mark_id = $1', [id]);
  return redirect('/marks_report');
}

async function studentResult({ sql, id }) {
  const result = await row(
    sql,
    `SELECT s.student_name, sub.subject_name, m.internal_marks, m.external_marks,
            m.total, m.percentage, m.grade
     FROM marks m
     JOIN students s ON m.student_id = s.student_id
     JOIN subjects sub ON m.subject_id = sub.subject_id
     WHERE mark_id = $1`,
    [id]
  );
  if (!result) throw new HttpError(404, 'Result not found');
  return renderTemplate('student_result.html', { result });
}

/* ------------------------------------------------------------------ */
/* Fees                                                               */
/* ------------------------------------------------------------------ */

const FEES_LIST_SQL = `
  SELECT f.fee_id, s.student_name, f.fee_amount, f.paid_amount,
         f.pending_amount, f.payment_date
  FROM fees f
  JOIN students s ON f.student_id = s.student_id`;

/** Fee columns, with pending derived as total - paid, per routes/fees.py. */
function feeFields(form) {
  const student = required(form, 'student');
  const total = toNumber(required(form, 'fee_amount'), 'fee_amount');
  const paid = toNumber(required(form, 'paid_amount'), 'paid_amount');
  return [student, total, paid, total - paid, optional(form, 'payment_date')];
}

async function feesPage({ request, sql }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `INSERT INTO fees (student_id, fee_amount, paid_amount, pending_amount, payment_date)
       VALUES ($1, $2, $3, $4, $5)`,
      feeFields(form)
    );
    return redirect('/fees_report');
  }
  return renderTemplate('fees.html', { students: await listStudentNames(sql) });
}

async function feesReport({ sql }) {
  return renderTemplate('fees_report.html', {
    records: await rows(sql, `${FEES_LIST_SQL} ORDER BY s.student_name`),
  });
}

async function searchFee({ sql, url }) {
  const search = url.searchParams.get('search') ?? '';
  return renderTemplate('fees_report.html', {
    records: await rows(
      sql,
      `${FEES_LIST_SQL} WHERE s.student_name ILIKE $1 ORDER BY s.student_name`,
      [like(search)]
    ),
  });
}

async function editFee({ request, sql, id }) {
  if (request.method === 'POST') {
    const form = await formData(request);
    await rows(
      sql,
      `UPDATE fees
       SET student_id = $1, fee_amount = $2, paid_amount = $3,
           pending_amount = $4, payment_date = $5
       WHERE fee_id = $6`,
      [...feeFields(form), id]
    );
    return redirect('/fees_report');
  }

  const [fee, students] = await Promise.all([
    row(sql, 'SELECT * FROM fees WHERE fee_id = $1', [id]),
    listStudentNames(sql),
  ]);
  if (!fee) throw new HttpError(404, 'Fee record not found');
  return renderTemplate('edit_fee.html', { fee, students });
}

async function deleteFee({ sql, id }) {
  await rows(sql, 'DELETE FROM fees WHERE fee_id = $1', [id]);
  return redirect('/fees_report');
}

async function paidStudents({ sql }) {
  return renderTemplate('paid_students.html', {
    records: await rows(
      sql,
      `SELECT s.student_name, f.fee_amount, f.paid_amount, f.payment_date
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       WHERE f.pending_amount = 0
       ORDER BY s.student_name`
    ),
  });
}

async function pendingStudents({ sql }) {
  return renderTemplate('pending_students.html', {
    records: await rows(
      sql,
      `SELECT s.student_name, f.fee_amount, f.paid_amount, f.pending_amount
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       WHERE f.pending_amount > 0
       ORDER BY s.student_name`
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Route table                                                        */
/* ------------------------------------------------------------------ */

// [methods, pattern, handler, public?]
export const ROUTES = [
  [['GET', 'POST'], /^\/$/, login, true],
  [['GET'], /^\/logout$/, logout, true],
  [['GET'], /^\/dashboard$/, dashboard],

  [['GET'], /^\/departments$/, departmentsPage],
  [['GET', 'POST'], /^\/add_department$/, addDepartment],
  [['GET', 'POST'], /^\/edit_department\/([^/]+)$/, editDepartment],
  [['GET'], /^\/delete_department\/([^/]+)$/, deleteDepartment],

  [['GET'], /^\/students$/, studentsPage],
  [['GET'], /^\/search_student$/, searchStudent],
  [['GET', 'POST'], /^\/add_student$/, addStudent],
  [['GET', 'POST'], /^\/edit_student\/([^/]+)$/, editStudent],
  [['GET'], /^\/delete_student\/([^/]+)$/, deleteStudent],

  [['GET'], /^\/faculty$/, facultyPage],
  [['GET'], /^\/search_faculty$/, searchFaculty],
  [['GET', 'POST'], /^\/add_faculty$/, addFaculty],
  [['GET', 'POST'], /^\/edit_faculty\/([^/]+)$/, editFaculty],
  [['GET'], /^\/delete_faculty\/([^/]+)$/, deleteFaculty],

  [['GET'], /^\/subjects$/, subjectsPage],
  [['GET'], /^\/search_subject$/, searchSubject],
  [['GET', 'POST'], /^\/add_subject$/, addSubject],
  [['GET', 'POST'], /^\/edit_subject\/([^/]+)$/, editSubject],
  [['GET'], /^\/delete_subject\/([^/]+)$/, deleteSubject],

  [['GET', 'POST'], /^\/attendance$/, attendancePage],
  [['GET'], /^\/attendance_report$/, attendanceReport],
  [['GET'], /^\/search_attendance$/, searchAttendance],
  [['GET', 'POST'], /^\/edit_attendance\/([^/]+)$/, editAttendance],
  [['GET'], /^\/delete_attendance\/([^/]+)$/, deleteAttendance],
  [['GET'], /^\/student_attendance$/, studentAttendance],

  [['GET', 'POST'], /^\/marks$/, marksPage],
  [['GET'], /^\/marks_report$/, marksReport],
  [['GET'], /^\/search_marks$/, searchMarks],
  [['GET', 'POST'], /^\/edit_marks\/([^/]+)$/, editMarks],
  [['GET'], /^\/delete_marks\/([^/]+)$/, deleteMarks],
  [['GET'], /^\/student_result\/([^/]+)$/, studentResult],

  [['GET', 'POST'], /^\/fees$/, feesPage],
  [['GET'], /^\/fees_report$/, feesReport],
  [['GET'], /^\/search_fee$/, searchFee],
  [['GET', 'POST'], /^\/edit_fee\/([^/]+)$/, editFee],
  [['GET'], /^\/delete_fee\/([^/]+)$/, deleteFee],
  [['GET'], /^\/paid_students$/, paidStudents],
  [['GET'], /^\/pending_students$/, pendingStudents],
];

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /static/* and anything else on disk is served by the assets binding.
    if (url.pathname.startsWith('/static/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    let matchedPath = false;
    for (const [methods, pattern, handler, isPublic] of ROUTES) {
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      matchedPath = true;
      if (!methods.includes(request.method)) continue;

      try {
        if (!env.DATABASE_URL) {
          throw new HttpError(
            503,
            'DATABASE_URL is not configured. Set it with: npx wrangler secret put DATABASE_URL'
          );
        }
        if (!env.SESSION_SECRET) {
          throw new HttpError(
            503,
            'SESSION_SECRET is not configured. Set it with: npx wrangler secret put SESSION_SECRET'
          );
        }

        const username = await readSession(env.SESSION_SECRET, request.headers.get('cookie'));
        // Unlike the Flask app, which leaves every page open, the deployed
        // Worker sends anonymous callers back to the login form.
        if (!isPublic && !username) return redirect('/');

        return await handler({
          request,
          env,
          url,
          username,
          sql: connect(env.DATABASE_URL),
          id: match[1] !== undefined ? pathId(decodeURIComponent(match[1])) : undefined,
        });
      } catch (error) {
        if (error instanceof HttpError) {
          if (error.status === 404) return renderTemplate('404.html', {}, 404);
          return new Response(error.message, {
            status: error.status,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
        console.error('Unhandled error:', error?.stack ?? error);
        return renderTemplate('500.html', {}, 500);
      }
    }

    if (matchedPath) return new Response('Method not allowed', { status: 405 });
    return renderTemplate('404.html', {}, 404);
  },
};
