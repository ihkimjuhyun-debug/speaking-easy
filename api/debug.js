// api/debug.js  ─ STT 500 원인 진단용 (문제 해결 후 삭제해도 됨)

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);

const KEY = process.env.OPENAI_API_KEY;

// 1. API 키 존재 여부
const keyExists  = !!KEY;
const keyPreview = KEY ? (KEY.slice(0, 7) + ‘…’ + KEY.slice(-4)) : ‘MISSING’;

// 2. OpenAI API 실제 연결 테스트
let apiReachable = false;
let apiError     = null;
if (KEY) {
try {
const r = await fetch(‘https://api.openai.com/v1/models’, {
headers: { Authorization: ’Bearer ’ + KEY },
signal: AbortSignal.timeout(8000),
});
apiReachable = r.ok;
if (!r.ok) apiError = ’HTTP ’ + r.status;
} catch (e) {
apiError = e.message;
}
}

// 3. Node 버전
const nodeVersion = process.version;

// 4. 환경
const region = process.env.VERCEL_REGION || ‘unknown’;
const env    = process.env.VERCEL_ENV    || ‘unknown’;

return res.status(200).json({
keyExists,
keyPreview,
apiReachable,
apiError,
nodeVersion,
region,
env,
timestamp: new Date().toISOString(),
});
};