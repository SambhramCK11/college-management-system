-- College Management System — schema for Neon Postgres.
--
-- Derived from db/pg_dump_original.sql, which is a pg_dump of the original
-- local database and cannot be replayed against Neon as-is:
--
--   * `\restrict` / `\unrestrict` are psql meta-commands. Anything connecting
--     through a driver rather than the psql binary fails on them.
--   * `ALTER TABLE ... OWNER TO postgres` assumes a `postgres` role. Neon
--     gives you your own owner role (neondb_owner by default), so every one of
--     those statements errors.
--   * `SET transaction_timeout` requires PostgreSQL 17+. A Neon project on 16
--     rejects it.
--   * It is not idempotent — a second run fails on every object.
--
-- This file is the portable equivalent: same tables, columns, keys, checks and
-- foreign-key actions, expressed so it can be applied repeatedly through the
-- serverless driver. The original dump is kept for reference.
--
-- Apply with:  npm run db:migrate

CREATE TABLE IF NOT EXISTS departments (
    department_id   serial       PRIMARY KEY,
    department_name varchar(100) NOT NULL UNIQUE,
    hod_name        varchar(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS faculty (
    faculty_id    serial       PRIMARY KEY,
    faculty_name  varchar(100) NOT NULL,
    department_id integer      REFERENCES departments (department_id) ON DELETE SET NULL,
    qualification varchar(100),
    experience    integer,
    mobile        varchar(15)  UNIQUE,
    email         varchar(100) UNIQUE
);

CREATE TABLE IF NOT EXISTS students (
    student_id    serial       PRIMARY KEY,
    student_name  varchar(100) NOT NULL,
    gender        varchar(10),
    dob           date,
    mobile        varchar(15)  UNIQUE,
    email         varchar(100) UNIQUE,
    address       text,
    department_id integer      REFERENCES departments (department_id) ON DELETE SET NULL,
    semester      integer
);

CREATE TABLE IF NOT EXISTS subjects (
    subject_id    serial       PRIMARY KEY,
    subject_code  varchar(20)  NOT NULL UNIQUE,
    subject_name  varchar(100) NOT NULL,
    department_id integer      REFERENCES departments (department_id) ON DELETE CASCADE,
    semester      integer,
    faculty_id    integer      REFERENCES faculty (faculty_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    attendance_id   serial      PRIMARY KEY,
    student_id      integer     REFERENCES students (student_id) ON DELETE CASCADE,
    subject_id      integer     REFERENCES subjects (subject_id) ON DELETE CASCADE,
    attendance_date date        NOT NULL,
    status          varchar(10) CONSTRAINT attendance_status_check
                                CHECK (status IN ('Present', 'Absent'))
);

CREATE TABLE IF NOT EXISTS marks (
    mark_id        serial      PRIMARY KEY,
    student_id     integer     REFERENCES students (student_id) ON DELETE CASCADE,
    subject_id     integer     REFERENCES subjects (subject_id) ON DELETE CASCADE,
    internal_marks numeric(5,2),
    external_marks numeric(5,2),
    total          numeric(5,2),
    percentage     numeric(5,2),
    grade          varchar(5)
);

CREATE TABLE IF NOT EXISTS fees (
    fee_id         serial PRIMARY KEY,
    student_id     integer REFERENCES students (student_id) ON DELETE CASCADE,
    fee_amount     numeric(10,2),
    paid_amount    numeric(10,2),
    pending_amount numeric(10,2),
    payment_date   date
);

CREATE TABLE IF NOT EXISTS users (
    id       serial       PRIMARY KEY,
    username varchar(50)  NOT NULL UNIQUE,
    -- Werkzeug password hashes ("scrypt:32768:8:1$...") are long; 255 fits them.
    password varchar(255) NOT NULL,
    role     varchar(20)  NOT NULL
);

-- Foreign-key columns are not indexed automatically. The dashboard counts and
-- every join in the app filter on these, so index them.
CREATE INDEX IF NOT EXISTS idx_students_department  ON students (department_id);
CREATE INDEX IF NOT EXISTS idx_faculty_department   ON faculty (department_id);
CREATE INDEX IF NOT EXISTS idx_subjects_department  ON subjects (department_id);
CREATE INDEX IF NOT EXISTS idx_subjects_faculty     ON subjects (faculty_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student   ON attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject   ON attendance (subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON attendance (attendance_date);
CREATE INDEX IF NOT EXISTS idx_marks_student        ON marks (student_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject        ON marks (subject_id);
CREATE INDEX IF NOT EXISTS idx_fees_student         ON fees (student_id);
-- The dashboard's "pending fees" count filters on this directly.
CREATE INDEX IF NOT EXISTS idx_fees_pending         ON fees (pending_amount)
    WHERE pending_amount > 0;
