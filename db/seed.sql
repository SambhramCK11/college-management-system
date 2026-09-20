-- Sample reference data, so the dashboard and every report have something to
-- show immediately after a deploy.
--
-- Idempotent: each insert is keyed on the table's natural unique column and
-- does nothing on conflict, so re-running adds no duplicates. The `users` row
-- is not here — scripts/seed.mjs inserts it with a freshly generated password
-- hash rather than shipping a fixed one in git.
--
-- Applied by:  npm run db:seed

INSERT INTO departments (department_name, hod_name) VALUES
    ('Computer Science', 'Dr. Meera Iyer'),
    ('Electronics',      'Dr. Rahul Rao'),
    ('Mechanical',       'Dr. Anil Kumar')
ON CONFLICT (department_name) DO NOTHING;

INSERT INTO faculty (faculty_name, department_id, qualification, experience, mobile, email)
SELECT v.name, d.department_id, v.qualification, v.experience, v.mobile, v.email
FROM (VALUES
    ('Dr. Meera Iyer',  'Computer Science', 'PhD Computer Science', 14, '9800000001', 'meera.iyer@example.edu'),
    ('Prof. Sana Ali',  'Computer Science', 'M.Tech CSE',            7, '9800000002', 'sana.ali@example.edu'),
    ('Dr. Rahul Rao',   'Electronics',      'PhD VLSI',             11, '9800000003', 'rahul.rao@example.edu'),
    ('Dr. Anil Kumar',  'Mechanical',       'PhD Thermal',          16, '9800000004', 'anil.kumar@example.edu')
) AS v(name, dept, qualification, experience, mobile, email)
JOIN departments d ON d.department_name = v.dept
ON CONFLICT (email) DO NOTHING;

INSERT INTO students (student_name, gender, dob, mobile, email, address, department_id, semester)
SELECT v.name, v.gender, v.dob::date, v.mobile, v.email, v.address, d.department_id, v.semester
FROM (VALUES
    ('Asha Nair',     'Female', '2005-03-14', '9900000001', 'asha.nair@example.edu',     '12 Lake Road, Kochi',     'Computer Science', 3),
    ('Rohit Sharma',  'Male',   '2004-11-02', '9900000002', 'rohit.sharma@example.edu',  '44 Hill View, Pune',      'Computer Science', 3),
    ('Fatima Khan',   'Female', '2005-07-21', '9900000003', 'fatima.khan@example.edu',   '9 Park Street, Hyderabad','Electronics',      5),
    ('Vikram Singh',  'Male',   '2004-01-30', '9900000004', 'vikram.singh@example.edu',  '77 MG Road, Jaipur',      'Mechanical',       7),
    ('Priya Menon',   'Female', '2005-09-09', '9900000005', 'priya.menon@example.edu',   '3 Beach Lane, Chennai',   'Electronics',      5)
) AS v(name, gender, dob, mobile, email, address, dept, semester)
JOIN departments d ON d.department_name = v.dept
ON CONFLICT (email) DO NOTHING;

INSERT INTO subjects (subject_code, subject_name, department_id, semester, faculty_id)
SELECT v.code, v.name, d.department_id, v.semester, f.faculty_id
FROM (VALUES
    ('CS301', 'Data Structures',        'Computer Science', 3, 'meera.iyer@example.edu'),
    ('CS302', 'Operating Systems',      'Computer Science', 3, 'sana.ali@example.edu'),
    ('EC501', 'Digital Signal Processing', 'Electronics',    5, 'rahul.rao@example.edu'),
    ('ME701', 'Heat Transfer',          'Mechanical',       7, 'anil.kumar@example.edu')
) AS v(code, name, dept, semester, faculty_email)
JOIN departments d ON d.department_name = v.dept
LEFT JOIN faculty f ON f.email = v.faculty_email
ON CONFLICT (subject_code) DO NOTHING;

-- Attendance across the last few days, so /attendance_report and
-- /student_attendance both have rows and the dashboard's "today" count is
-- non-zero.
INSERT INTO attendance (student_id, subject_id, attendance_date, status)
SELECT s.student_id, sub.subject_id, v.day::date, v.status
FROM (VALUES
    ('asha.nair@example.edu',    'CS301', CURRENT_DATE::text,                       'Present'),
    ('asha.nair@example.edu',    'CS302', CURRENT_DATE::text,                       'Present'),
    ('rohit.sharma@example.edu', 'CS301', CURRENT_DATE::text,                       'Absent'),
    ('rohit.sharma@example.edu', 'CS302', (CURRENT_DATE - 1)::text,                 'Present'),
    ('fatima.khan@example.edu',  'EC501', CURRENT_DATE::text,                       'Present'),
    ('priya.menon@example.edu',  'EC501', (CURRENT_DATE - 1)::text,                 'Absent'),
    ('vikram.singh@example.edu', 'ME701', (CURRENT_DATE - 2)::text,                 'Present')
) AS v(student_email, subject_code, day, status)
JOIN students s   ON s.email = v.student_email
JOIN subjects sub ON sub.subject_code = v.subject_code
WHERE NOT EXISTS (
    SELECT 1 FROM attendance a
    WHERE a.student_id = s.student_id
      AND a.subject_id = sub.subject_id
      AND a.attendance_date = v.day::date
);

-- Marks. total and percentage are equal, matching what routes/marks.py writes.
INSERT INTO marks (student_id, subject_id, internal_marks, external_marks, total, percentage, grade)
SELECT s.student_id, sub.subject_id, v.internal, v.external,
       v.internal + v.external, v.internal + v.external, v.grade
FROM (VALUES
    ('asha.nair@example.edu',    'CS301', 27, 65, 'A+'),
    ('asha.nair@example.edu',    'CS302', 24, 58, 'A'),
    ('rohit.sharma@example.edu', 'CS301', 19, 47, 'C'),
    ('fatima.khan@example.edu',  'EC501', 22, 51, 'B'),
    ('vikram.singh@example.edu', 'ME701', 15, 30, 'F'),
    ('priya.menon@example.edu',  'EC501', 25, 60, 'A')
) AS v(student_email, subject_code, internal, external, grade)
JOIN students s   ON s.email = v.student_email
JOIN subjects sub ON sub.subject_code = v.subject_code
WHERE NOT EXISTS (
    SELECT 1 FROM marks m
    WHERE m.student_id = s.student_id AND m.subject_id = sub.subject_id
);

-- Fees: a mix of settled and outstanding, so /paid_students,
-- /pending_students and the dashboard's pending count are all populated.
INSERT INTO fees (student_id, fee_amount, paid_amount, pending_amount, payment_date)
SELECT s.student_id, v.total, v.paid, v.total - v.paid, v.paid_on::date
FROM (VALUES
    ('asha.nair@example.edu',    85000.00, 85000.00, '2026-07-15'),
    ('rohit.sharma@example.edu', 85000.00, 40000.00, '2026-08-02'),
    ('fatima.khan@example.edu',  92000.00, 92000.00, '2026-07-28'),
    ('vikram.singh@example.edu', 78000.00, 20000.00, '2026-09-01'),
    ('priya.menon@example.edu',  92000.00, 46000.00, '2026-08-19')
) AS v(student_email, total, paid, paid_on)
JOIN students s ON s.email = v.student_email
WHERE NOT EXISTS (SELECT 1 FROM fees f WHERE f.student_id = s.student_id);
