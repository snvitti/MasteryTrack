module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasDatabase: !!process.env.DATABASE_URL,
    geminiKeyStart: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0,8)+'...' : 'NOT SET',
    nodeVersion: process.version,
  });
};
