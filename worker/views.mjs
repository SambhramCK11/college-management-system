/**
 * Template registry.
 *
 * The .html files are pulled in as text modules (see the [[rules]] block in
 * wrangler.toml) and bundled into the Worker, so rendering needs no filesystem
 * and no network round trip. They are the same files Flask renders from
 * templates/.
 */

import { render } from './template.mjs';

import html404 from '../templates/404.html';
import html500 from '../templates/500.html';
import addDepartment from '../templates/add_department.html';
import addFaculty from '../templates/add_faculty.html';
import addStudent from '../templates/add_student.html';
import addSubject from '../templates/add_subject.html';
import attendance from '../templates/attendance.html';
import attendanceReport from '../templates/attendance_report.html';
import dashboard1 from '../templates/dashboard1.html';
import departments from '../templates/departments.html';
import editAttendance from '../templates/edit_attendance.html';
import editDepartment from '../templates/edit_department.html';
import editFaculty from '../templates/edit_faculty.html';
import editFee from '../templates/edit_fee.html';
import editMarks from '../templates/edit_marks.html';
import editStudent from '../templates/edit_student.html';
import editSubject from '../templates/edit_subject.html';
import faculty from '../templates/faculty.html';
import fees from '../templates/fees.html';
import feesReport from '../templates/fees_report.html';
import login1 from '../templates/login1.html';
import marks from '../templates/marks.html';
import marksReport from '../templates/marks_report.html';
import paidStudents from '../templates/paid_students.html';
import pendingStudents from '../templates/pending_students.html';
import student from '../templates/student.html';
import studentAttendance from '../templates/student_attendance.html';
import studentResult from '../templates/student_result.html';
import students from '../templates/students.html';
import subjects from '../templates/subjects.html';

const TEMPLATES = {
  '404.html': html404,
  '500.html': html500,
  'add_department.html': addDepartment,
  'add_faculty.html': addFaculty,
  'add_student.html': addStudent,
  'add_subject.html': addSubject,
  'attendance.html': attendance,
  'attendance_report.html': attendanceReport,
  'dashboard1.html': dashboard1,
  'departments.html': departments,
  'edit_attendance.html': editAttendance,
  'edit_department.html': editDepartment,
  'edit_faculty.html': editFaculty,
  'edit_fee.html': editFee,
  'edit_marks.html': editMarks,
  'edit_student.html': editStudent,
  'edit_subject.html': editSubject,
  'faculty.html': faculty,
  'fees.html': fees,
  'fees_report.html': feesReport,
  'login1.html': login1,
  'marks.html': marks,
  'marks_report.html': marksReport,
  'paid_students.html': paidStudents,
  'pending_students.html': pendingStudents,
  'student.html': student,
  'student_attendance.html': studentAttendance,
  'student_result.html': studentResult,
  'students.html': students,
  'subjects.html': subjects,
};

/** Render a template by filename, exactly as Flask's render_template would. */
export function renderTemplate(name, context = {}, status = 200) {
  const source = TEMPLATES[name];
  if (source === undefined) throw new Error(`No such template: ${name}`);
  return new Response(render(source, context), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
