// api/data.js — Vercel serverless function
const { neon } = require('@neondatabase/serverless');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function ensureSchema(sql) {
  try { await sql`CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, instructor_id TEXT NOT NULL DEFAULT 'inst_default', data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT NOW())`; } catch(e) { if(!e.message.includes('already exists'))console.warn('courses:',e.message); }
  try { await sql`CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, student_id TEXT NOT NULL, assessment_id TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', submitted_at TIMESTAMPTZ DEFAULT NOW())`; } catch(e) { if(!e.message.includes('already exists'))console.warn('attempts:',e.message); }
  try { await sql`CREATE TABLE IF NOT EXISTS instructor_accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`; } catch(e) { if(!e.message.includes('already exists'))console.warn('instructors:',e.message); }
  try { await sql`INSERT INTO instructor_accounts (id, name, password) VALUES ('inst_default', 'Instructor', 'family') ON CONFLICT (id) DO NOTHING`; } catch(e) { console.warn('seed:',e.message); }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const body = req.method === 'POST'
      ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {})
      : req.query || {};
    const { action, ...p } = body;

    // ── AI proxy — uses Gemini (free tier) ──────────────────────────────────
    if (action === 'aiCall') {
      const { system, userMsg, maxTokens=1500 } = p;
      if (!process.env.GEMINI_API_KEY) {
        return res.json({ ok:false, error:'GEMINI_API_KEY not configured in Vercel environment variables' });
      }
      const prompt = system ? `${system}\n\n${typeof userMsg==='string'?userMsg:JSON.stringify(userMsg)}` : (typeof userMsg==='string'?userMsg:JSON.stringify(userMsg));
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
        })
      });
      const aiData = await aiRes.json();
      if (aiData.error) return res.json({ ok:false, error: aiData.error.message });
      const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ ok:true, text });
    }

    // ── Database actions ─────────────────────────────────────────────────────
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    if (action === 'getCourses') {
      const rows = await sql`SELECT id, instructor_id, data FROM courses ORDER BY updated_at DESC`;
      const courses = rows.map(r => {
        const d = r.data || {};
        return { id: r.id, instructorId: r.instructor_id, name: d.name||'', description: d.description||'', studentPassword: d.studentPassword||'', roster: d.roster||[], standards: d.standards||[], units: d.units||[], questions: d.questions||[], videos: d.videos||[] };
      });
      return res.json({ ok: true, courses });
    }
    if (action === 'getAttempts') {
      const rows = await sql`SELECT data FROM attempts WHERE course_id = ${p.courseId} ORDER BY submitted_at DESC`;
      return res.json({ ok: true, attempts: rows.map(r => r.data) });
    }
    if (action === 'saveCourse') {
      const course = p.course;
      if (!course || !course.id) return res.json({ ok: false, error: 'Missing course data' });
      const courseData = { name: course.name||'', description: course.description||'', studentPassword: course.studentPassword||'', roster: course.roster||[], standards: course.standards||[], units: course.units||[], questions: course.questions||[], videos: course.videos||[] };
      await sql`INSERT INTO courses (id, instructor_id, data, updated_at) VALUES (${course.id}, ${course.instructorId||'inst_default'}, ${JSON.stringify(courseData)}, NOW()) ON CONFLICT (id) DO UPDATE SET instructor_id=EXCLUDED.instructor_id, data=EXCLUDED.data, updated_at=NOW()`;
      return res.json({ ok: true });
    }
    if (action === 'deleteCourse') {
      await sql`DELETE FROM attempts WHERE course_id = ${p.courseId}`;
      await sql`DELETE FROM courses WHERE id = ${p.courseId}`;
      return res.json({ ok: true });
    }
    if (action === 'saveAttempt') {
      const att = p.attempt;
      if (!att || !att.id) return res.json({ ok: false, error: 'Missing attempt' });
      await sql`INSERT INTO attempts (id, course_id, student_id, assessment_id, data, submitted_at) VALUES (${att.id}, ${p.courseId}, ${att.studentId}, ${att.assessmentId}, ${JSON.stringify(att)}, ${att.submittedAt||new Date().toISOString()}) ON CONFLICT (id) DO NOTHING`;
      return res.json({ ok: true });
    }
    if (action === 'getInstructors') {
      const rows = await sql`SELECT id, name, password FROM instructor_accounts ORDER BY created_at`;
      return res.json({ ok: true, accounts: rows });
    }
    if (action === 'createInstructor') {
      const existing = await sql`SELECT id FROM instructor_accounts WHERE password = ${p.password}`;
      if (existing.length > 0) return res.json({ ok: false, error: 'That password is already in use.' });
      await sql`INSERT INTO instructor_accounts (id, name, password) VALUES (${p.id}, ${p.name}, ${p.password}) ON CONFLICT (id) DO NOTHING`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
