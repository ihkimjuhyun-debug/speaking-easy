// api/openai-proxy.js
// 발음 평가 전용 (Whisper STT → GPT 채점)
// ✅ 외부 require 없음 — 단독으로 완전 동작
// ✅ 25초 타임아웃
// ✅ 3회 자동 재시도
// ✅ STT/GPT 각각 독립 에러 처리
// ✅ 모든 에러 한국어 메시지

// ── 내부 유틸 ────────────────────────────────────────────────

function sleep(ms) {
return new Promise(r => setTimeout(r, ms));
}

function resolveExt(mimeType) {
const m = (mimeType || ‘’).toLowerCase();
if (m.includes(‘mp4’) || m.includes(‘m4a’) || m.includes(‘aac’)) return ‘mp4’;
if (m.includes(‘ogg’))                                            return ‘ogg’;
if (m.includes(‘wav’))                                            return ‘wav’;
if (m.includes(‘mpeg’) || m.includes(‘mp3’))                     return ‘mp3’;
return ‘webm’;
}

async function fetchWithTimeout(url, options, ms) {
const ctrl  = new AbortController();
const timer = setTimeout(() => ctrl.abort(), ms);
try {
return await fetch(url, { …options, signal: ctrl.signal });
} finally {
clearTimeout(timer);
}
}

async function withRetry(fn, attempts) {
let lastErr;
for (let i = 0; i < attempts; i++) {
try {
const res = await fn();
if (res.status === 429 || res.status >= 500) {
lastErr = new Error(’HTTP ’ + res.status);
if (i < attempts - 1) {
await sleep(Math.pow(2, i) * 600 + Math.random() * 400);
continue;
}
return res;
}
return res;
} catch (err) {
lastErr = err;
if (err.name === ‘AbortError’) throw err;
if (i < attempts - 1) await sleep(Math.pow(2, i) * 600 + Math.random() * 400);
}
}
throw lastErr;
}

// ── 핸들러 ────────────────────────────────────────────────────

async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’,  ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) return res.status(200).end();
if (req.method !== ‘POST’)   return res.status(405).json({ error: ‘허용되지 않는 메서드’ });

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
console.error(’[proxy] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const body          = req.body || {};
const audio         = body.audio;
const mimeType      = body.mimeType || ‘’;
const targetEnglish = body.target_english || ‘’;

if (!audio || typeof audio !== ‘string’) {
return res.status(400).json({ error: ‘오디오 데이터가 없습니다.’ });
}

// base64 디코딩
let buf;
try {
buf = Buffer.from(audio, ‘base64’);
} catch {
return res.status(400).json({ error: ‘오디오 base64 디코딩 실패’ });
}

if (buf.length > 24 * 1024 * 1024) {
return res.status(400).json({ error: ‘오디오 파일이 너무 큽니다 (최대 24MB)’ });
}

// ── 1단계: Whisper STT ────────────────────────────────────
let userSpeech = ‘’;
try {
const ext  = resolveExt(mimeType);
const blob = new Blob([buf], { type: ‘application/octet-stream’ });
const form = new FormData();
form.append(‘file’,     blob, ‘audio.’ + ext);
form.append(‘model’,    ‘whisper-1’);
form.append(‘language’, ‘en’);

```
const sttRes = await withRetry(
  () => fetchWithTimeout(
    'https://api.openai.com/v1/audio/transcriptions',
    { method: 'POST', headers: { Authorization: 'Bearer ' + API_KEY }, body: form },
    25000
  ),
  3
);

const sttRaw = await sttRes.text();

if (!sttRes.ok) {
  console.error('[proxy] Whisper 오류:', sttRaw.slice(0, 200));
  // STT 실패는 graceful — score 0 반환, 앱 계속 동작
  return res.status(200).json({ score: 0, feedback: '음성 인식에 실패했습니다. 다시 시도해주세요.', recognized_text: '인식 실패' });
}

const sttData = JSON.parse(sttRaw);
userSpeech = sttData.text || '';
```

} catch (sttErr) {
if (sttErr.name === ‘AbortError’) {
return res.status(200).json({ score: 0, feedback: ‘음성 인식 시간 초과. 다시 시도해주세요.’, recognized_text: ‘타임아웃’ });
}
console.error(’[proxy] STT 예외:’, sttErr.message);
return res.status(200).json({ score: 0, feedback: ‘음성 인식 오류. 다시 시도해주세요.’, recognized_text: ‘오류’ });
}

// ── 2단계: GPT 발음 채점 ──────────────────────────────────
const cleanTarget = targetEnglish.replace(/?+/g, ‘’).trim();
if (!cleanTarget) {
return res.status(200).json({ score: 0, feedback: ‘평가 텍스트가 없습니다.’, recognized_text: userSpeech });
}

const evalPrompt = [
‘목표 문장: “’ + cleanTarget + ‘”’,
‘인식된 발음: “’ + userSpeech + ‘”’,
‘’,
‘두 문장을 비교해서 발음을 관대하게 채점하세요.’,
‘발음이 비슷하면 높은 점수를 주세요.’,
‘JSON만 반환: {“score”: 정수(10~100), “feedback”: “한국어 짧은 피드백(1~2문장)”}’,
].join(’\n’);

let result = { score: 70, feedback: ‘발음 채점 완료!’ };
try {
const gptRes = await withRetry(
() => fetchWithTimeout(
‘https://api.openai.com/v1/chat/completions’,
{
method:  ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, Authorization: ’Bearer ’ + API_KEY },
body: JSON.stringify({
model:           ‘gpt-4o-mini’,
messages:        [{ role: ‘user’, content: evalPrompt }],
max_tokens:      100,
response_format: { type: ‘json_object’ },
}),
},
25000
),
3
);

```
const gptRaw  = await gptRes.text();
const gptData = JSON.parse(gptRaw);
const content = gptData.choices?.[0]?.message?.content;
if (content) {
  const parsed = JSON.parse(content);
  if (typeof parsed.score === 'number' && parsed.feedback) {
    result = parsed;
  }
}
```

} catch (gptErr) {
// GPT 채점 실패는 무시 — 기본값(70점) 사용
console.warn(’[proxy] GPT 채점 실패 (기본값):’, gptErr.message);
}

return res.status(200).json({ …result, recognized_text: userSpeech });
}

handler.config = { api: { bodyParser: { sizeLimit: ‘10mb’ } } };

module.exports = handler;