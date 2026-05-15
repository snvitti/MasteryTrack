module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say hello in one word.' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    const data = await aiRes.json();
    res.json({ ok: true, raw: data });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
};