module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end();
  }
  return res.status(200).json({ ok: true, ts: Date.now(), region: process.env.VERCEL_REGION || 'unknown' });
};
