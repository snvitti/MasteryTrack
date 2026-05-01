// api/data.js
// Vercel serverless function — talks to Neon Postgres securely.
// DATABASE_URL is set as an environment variable in Vercel (never in the HTML).

const { neon } = require('@neondatabase/serverless');

// ── CORS helper ──────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Schema setup (runs once on cold start if tables don't exist) ─────────────
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      instructor_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      assessment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS instructor_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Seed default instructor account if none exist
  await sql`
    INSERT INTO instructor_accounts (id, name, password)
    VALUES ('inst_default', 'Instructor', 'family')
    ON CONFLICT (id) DO NOTHING
  `;
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    const { action, ...body } = req.method === 'POST'
      ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
      : req.query;

    // ── GET all courses ──────────────────────────────────────────────────────
    if (action === 'getCourses') {
      const rows = await sql`SELECT id, instructor_id, data FROM courses ORDER BY updated_at DESC`;
      const courses = rows.map(r => ({ id: r.id, instructorId: r.instructor_id, ...r.data }));
      return res.json({ ok: true, courses });
    }

    // ── GET attempts for a course ────────────────────────────────────────────
    if (action === 'getAttempts') {
      const { courseId } = body;
      const rows = await sql`SELECT data FROM attempts WHERE course_id = ${courseId} ORDER BY submitted_at DESC`;
      const attempts = rows.map(r => r.data);
      return res.json({ ok: true, attempts });
    }

    // ── SAVE / UPDATE a course ───────────────────────────────────────────────
    if (action === 'saveCourse') {
      const { course } = body;
      const { id, instructorId, attempts: _a, ...courseData } = course;
      await sql`
        INSERT INTO courses (id, instructor_id, data, updated_at)
        VALUES (${id}, ${instructorId || 'inst_default'}, ${JSON.stringify(courseData)}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          instructor_id = EXCLUDED.instructor_id,
          data = EXCLUDED.data,
          updated_at = NOW()
      `;
      return res.json({ ok: true });
    }

    // ── DELETE a course ──────────────────────────────────────────────────────
    if (action === 'deleteCourse') {
      const { courseId } = body;
      await sql`DELETE FROM courses WHERE id = ${courseId}`;
      await sql`DELETE FROM attempts WHERE course_id = ${courseId}`;
      return res.json({ ok: true });
    }

    // ── SAVE an attempt ──────────────────────────────────────────────────────
    if (action === 'saveAttempt') {
      const { attempt, courseId } = body;
      await sql`
        INSERT INTO attempts (id, course_id, student_id, assessment_id, data, submitted_at)
        VALUES (
          ${attempt.id},
          ${courseId},
          ${attempt.studentId},
          ${attempt.assessmentId},
          ${JSON.stringify(attempt)},
          ${attempt.submittedAt}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      return res.json({ ok: true });
    }

    // ── GET instructor accounts ──────────────────────────────────────────────
    if (action === 'getInstructors') {
      const rows = await sql`SELECT id, name, password FROM instructor_accounts ORDER BY created_at`;
      return res.json({ ok: true, accounts: rows });
    }

    // ── CREATE instructor account ────────────────────────────────────────────
    if (action === 'createInstructor') {
      const { id, name, password } = body;
      // Check password not already in use
      const existing = await sql`SELECT id FROM instructor_accounts WHERE password = ${password}`;
      if (existing.length > 0) {
        return res.json({ ok: false, error: 'That password is already in use.' });
      }
      await sql`INSERT INTO instructor_accounts (id, name, password) VALUES (${id}, ${name}, ${password})`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
