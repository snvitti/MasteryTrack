const { neon } = require('@neondatabase/serverless');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id, data FROM courses LIMIT 5`;
    const result = rows.map(r => ({
      id: r.id,
      questionCount: (r.data.questions||[]).length,
      questionIds: (r.data.questions||[]).map(q=>q.id),
      units: (r.data.units||[]).map(u=>({
        name: u.name,
        assessments: u.assessments.map(a=>({
          title: a.title,
          published: a.published,
          questionIds: a.questionIds||[]
        }))
      }))
    }));
    return res.json({ ok: true, courses: result });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
