// api/stt.js
// 음성 → 텍스트 변환 (Whisper STT)
// ✅ 외부 require 없음 — 단독으로 완전 동작
// ✅ 25초 타임아웃
// ✅ 3회 자동 재시도 (지수 백오프)
// ✅ 24MB 초과 차단
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
// CORS — 브라우저 preflight 허용
res.setHeader(‘Access-Control-Allow-Origin’,  ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) return res.status(200).end();
if (req.method !== ‘POST’)   return res.status(405).json({ error: ‘허용되지 않는 메서드’ });

// API 키 확인
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
console.error(’[stt] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.’ });
}

// 입력 파싱
const body     = req.body || {};
const audio    = body.audio;
const mimeType = body.mimeType || ‘’;
const langMode = body.lang_mode || ‘’;

if (!audio || typeof audio !== ‘string’) {
return res.status(400).json({ error: ‘오디오 데이터가 없거나 형식이 올바르지 않습니다.’ });
}

// base64 디코딩
let buf;
try {
buf = Buffer.from(audio, ‘base64’);
} catch {
return res.status(400).json({ error: ‘오디오 base64 디코딩 실패’ });
}

// 크기 검증 (Whisper 최대 25MB)
if (buf.length > 24 * 1024 * 1024) {
return res.status(400).json({ error: ‘오디오 파일이 너무 큽니다 (최대 24MB)’ });
}

// Whisper용 FormData 구성
const ext  = resolveExt(mimeType);
const blob = new Blob([buf], { type: ‘application/octet-stream’ });
const form = new FormData();
form.append(‘file’,  blob, ‘audio.’ + ext);
form.append(‘model’, ‘whisper-1’);
if (langMode === ‘ko’) form.append(‘language’, ‘ko’);

// Whisper 호출
try {
const res2 = await withRetry(
() => fetchWithTimeout(
‘https://api.openai.com/v1/audio/transcriptions’,
{ method: ‘POST’, headers: { Authorization: ’Bearer ’ + API_KEY }, body: form },
25000
),
3
);

```
const raw = await res2.text();

if (!res2.ok) {
  console.error('[stt] Whisper 오류 status=' + res2.status + ' body=' + raw.slice(0, 200));
  return res.status(500).json({ error: '음성 인식 서버 오류 (' + res2.status + '). 잠시 후 다시 시도해주세요.' });
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error('[stt] JSON 파싱 실패:', raw.slice(0, 100));
  return res.status(500).json({ error: '음성 인식 응답 파싱 실패' });
}

return res.status(200).json({ text: data.text || '' });
```

} catch (err) {
if (err.name === ‘AbortError’) {
console.error(’[stt] 타임아웃’);
return res.status(504).json({ error: ‘음성 인식 시간이 초과됐습니다. 더 짧게 말하거나 다시 시도해주세요.’ });
}
console.error(’[stt] 예외:’, err.message);
return res.status(500).json({ error: ’음성 인식에 실패했습니다: ’ + err.message });
}
}

handler.config = { api: { bodyParser: { sizeLimit: ‘10mb’ } } };

module.exports = handler;