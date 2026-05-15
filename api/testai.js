module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // First list available models
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const listData = await listRes.json();
    const models = (listData.models||[]).map(m=>m.name);
    res.json({ ok: true, availableModels: models });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
};
