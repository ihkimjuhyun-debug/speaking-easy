// api/stt.js  ─ 음성 → 텍스트 (Whisper STT)
// ✅ 외부 require 없음   ✅ 25초 타임아웃   ✅ 3회 재시도
// ✅ 24MB 크기 검증      ✅ CORS 처리       ✅ 한국어 에러

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
console.error(’[stt] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.’ });
}

const { audio, mimeType, lang_mode } = req.body || {};

if (!audio || typeof audio !== ‘string’) {
return res.status(400).json({ error: ‘오디오 데이터가 없거나 형식이 올바르지 않습니다.’ });
}

let buf;
try   { buf = Buffer.from(audio, ‘base64’); }
catch { return res.status(400).json({ error: ‘오디오 base64 디코딩 실패’ }); }

if (buf.length > 24 * 1024 * 1024) {
return res.status(400).json({ error: ‘오디오 파일이 너무 큽니다 (최대 24MB)’ });
}

const form = new FormData();
form.append(‘file’,  new Blob([buf], { type: ‘application/octet-stream’ }), ‘audio.’ + resolveExt(mimeType));
form.append(‘model’, ‘whisper-1’);
if (lang_mode === ‘ko’) form.append(‘language’, ‘ko’);

try {
const r   = await retry(() => fetchT(‘https://api.openai.com/v1/audio/transcriptions’,
{ method: ‘POST’, headers: { Authorization: ’Bearer ’ + KEY }, body: form }));
const raw = await r.text();

```
if (!r.ok) {
  console.error('[stt] Whisper 오류', r.status, raw.slice(0, 200));
  return res.status(500).json({ error: '음성 인식 서버 오류 (' + r.status + '). 잠시 후 다시 시도해주세요.' });
}

let data;
try   { data = JSON.parse(raw); }
catch { return res.status(500).json({ error: '음성 인식 응답 파싱 실패' }); }

return res.status(200).json({ text: data.text || '' });
```

} catch (e) {
if (e.name === ‘AbortError’) {
console.error(’[stt] 타임아웃’);
return res.status(504).json({ error: ‘음성 인식 시간이 초과됐습니다. 다시 시도해주세요.’ });
}
console.error(’[stt]’, e.message);
return res.status(500).json({ error: ’음성 인식 실패: ’ + e.message });
}
}

handler.config = { api: { bodyParser: { sizeLimit: ‘10mb’ } } };
module.exports = handler;