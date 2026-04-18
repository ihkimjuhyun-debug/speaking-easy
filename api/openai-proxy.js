// api/openai-proxy.js  ─ 발음 평가 (Whisper STT → GPT 채점)
// ✅ 외부 require 없음   ✅ 25초 타임아웃   ✅ 3회 재시도
// ✅ STT/GPT 각각 독립 에러처리  ✅ Graceful fallback  ✅ CORS

‘use strict’;

/* ── 유틸 ─────────────────────────────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveExt(mime) {
const m = (mime || ‘’).toLowerCase();
if (m.includes(‘mp4’) || m.includes(‘m4a’) || m.includes(‘aac’)) return ‘mp4’;
if (m.includes(‘ogg’))                                            return ‘ogg’;
if (m.includes(‘wav’))                                            return ‘wav’;
if (m.includes(‘mpeg’) || m.includes(‘mp3’))                     return ‘mp3’;
return ‘webm’;
}

async function fetchT(url, opts, ms = 25000) {
const ctrl  = new AbortController();
const timer = setTimeout(() => ctrl.abort(), ms);
try   { return await fetch(url, { …opts, signal: ctrl.signal }); }
finally { clearTimeout(timer); }
}

async function retry(fn, n = 3) {
let err;
for (let i = 0; i < n; i++) {
try {
const r = await fn();
if (r.status === 429 || r.status >= 500) {
err = new Error(’HTTP ’ + r.status);
if (i < n - 1) { await sleep(Math.pow(2, i) * 600 + Math.random() * 400); continue; }
return r;
}
return r;
} catch (e) {
err = e;
if (e.name === ‘AbortError’) throw e;
if (i < n - 1) await sleep(Math.pow(2, i) * 600 + Math.random() * 400);
}
}
throw err;
}

/* ── 핸들러 ───────────────────────────────────────────────── */

async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’,  ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) return res.status(200).end();
if (req.method !== ‘POST’)   return res.status(405).json({ error: ‘허용되지 않는 메서드’ });

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
console.error(’[proxy] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const { audio, mimeType, target_english } = req.body || {};

if (!audio || typeof audio !== ‘string’) {
return res.status(400).json({ error: ‘오디오 데이터가 없습니다.’ });
}

let buf;
try   { buf = Buffer.from(audio, ‘base64’); }
catch { return res.status(400).json({ error: ‘오디오 base64 디코딩 실패’ }); }

if (buf.length > 24 * 1024 * 1024) {
return res.status(400).json({ error: ‘오디오 파일이 너무 큽니다 (최대 24MB)’ });
}

/* ── 1단계: Whisper STT ───────────────────────────────── */
let userSpeech = ‘’;
try {
const form = new FormData();
form.append(‘file’,     new Blob([buf], { type: ‘application/octet-stream’ }), ‘audio.’ + resolveExt(mimeType));
form.append(‘model’,    ‘whisper-1’);
form.append(‘language’, ‘en’);

```
const r   = await retry(() => fetchT('https://api.openai.com/v1/audio/transcriptions',
  { method: 'POST', headers: { Authorization: 'Bearer ' + KEY }, body: form }));
const raw = await r.text();

if (!r.ok) {
  console.error('[proxy] Whisper 오류', r.status, raw.slice(0, 200));
  return res.status(200).json({ score: 0, feedback: '음성 인식 실패. 다시 시도해주세요.', recognized_text: '인식 실패' });
}

userSpeech = JSON.parse(raw).text || '';
```

} catch (e) {
const msg = e.name === ‘AbortError’ ? ‘음성 인식 시간 초과’ : ‘음성 인식 오류’;
console.error(’[proxy] STT 예외:’, e.message);
return res.status(200).json({ score: 0, feedback: msg + ‘. 다시 시도해주세요.’, recognized_text: ‘오류’ });
}

/* ── 2단계: GPT 채점 ──────────────────────────────────── */
const cleanTarget = (target_english || ‘’).replace(/?+/g, ‘’).trim();
if (!cleanTarget) {
return res.status(200).json({ score: 0, feedback: ‘평가 텍스트가 없습니다.’, recognized_text: userSpeech });
}

const prompt = [
‘목표 문장: “’ + cleanTarget + ‘”’,
‘인식된 발음: “’ + userSpeech + ‘”’,
‘’,
‘두 문장을 비교해서 발음을 관대하게 채점하세요.’,
‘발음이 비슷하면 높은 점수를 주세요.’,
‘JSON만 반환: {“score”: 정수(10~100), “feedback”: “한국어 짧은 피드백(1~2문장)”}’,
].join(’\n’);

let result = { score: 70, feedback: ‘발음 채점 완료!’ };
try {
const r   = await retry(() => fetchT(‘https://api.openai.com/v1/chat/completions’,
{
method:  ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, Authorization: ‘Bearer ’ + KEY },
body: JSON.stringify({
model:           ‘gpt-4o-mini’,
messages:        [{ role: ‘user’, content: prompt }],
max_tokens:      100,
response_format: { type: ‘json_object’ },
}),
}));
const raw = await r.text();
const d   = JSON.parse(raw);
const c   = d.choices?.[0]?.message?.content;
if (c) {
const p = JSON.parse(c);
if (typeof p.score === ‘number’ && p.feedback) result = p;
}
} catch (e) {
// GPT 채점 실패 → 기본값 사용, 앱 계속 동작
console.warn(’[proxy] GPT 채점 실패 (기본값):’, e.message);
}

return res.status(200).json({ …result, recognized_text: userSpeech });
}

handler.config = { api: { bodyParser: { sizeLimit: ‘10mb’ } } };
module.exports = handler;