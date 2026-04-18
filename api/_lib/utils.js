// api/_lib/utils.js
// ─────────────────────────────────────────────────────────────
// 모든 API 공유 유틸리티
//   - resolveExt       : MIME → Whisper 확장자
//   - fetchWithTimeout : AbortController 타임아웃 fetch
//   - withRetry        : 지수 백오프 + 랜덤 지터 재시도
//   - callWhisper      : Whisper STT 공통 호출
//   - callGPT          : GPT Chat Completion 공통 호출
//   - validateAnalyze  : analyze 응답 필드 검증
// ─────────────────────────────────────────────────────────────

// ── 내부 헬퍼 ───────────────────────────────────────────────

function sleep(ms) {
return new Promise(r => setTimeout(r, ms));
}

// ── MIME → 확장자 ────────────────────────────────────────────

/**

- Whisper는 파일명 확장자로 포맷을 판단하므로 정확해야 함
  */
  function resolveExt(mimeType = ‘’) {
  const m = mimeType.toLowerCase();
  if (m.includes(‘mp4’) || m.includes(‘m4a’) || m.includes(‘aac’)) return ‘mp4’;
  if (m.includes(‘ogg’))                                            return ‘ogg’;
  if (m.includes(‘wav’))                                            return ‘wav’;
  if (m.includes(‘mpeg’) || m.includes(‘mp3’))                      return ‘mp3’;
  return ‘webm’; // Chrome / Android 기본값
  }

// ── 타임아웃 fetch ───────────────────────────────────────────

/**

- ms 안에 응답 없으면 AbortError 발생 → 무반응 핵심 방지
  */
  async function fetchWithTimeout(url, options, ms = 25000) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), ms);
  try {
  return await fetch(url, { …options, signal: controller.signal });
  } finally {
  clearTimeout(timer);
  }
  }

// ── 재시도 래퍼 ──────────────────────────────────────────────

/**

- 지수 백오프 + 랜덤 지터
- 429(속도초과) / 5xx(서버오류) 자동 재시도
- AbortError(타임아웃)는 재시도 없이 즉시 throw
- 
- 대기시간 예시 (maxAttempts=3):
- 1차 실패 → 600~1000ms 대기 → 2차 시도
- 2차 실패 → 1200~2000ms 대기 → 3차 시도
  */
  async function withRetry(fn, maxAttempts = 3) {
  let lastErr;

for (let attempt = 0; attempt < maxAttempts; attempt++) {
try {
const res = await fn();

```
  // 재시도 대상 상태코드
  if (res.status === 429 || res.status >= 500) {
    lastErr = new Error(`HTTP ${res.status}`);

    if (attempt < maxAttempts - 1) {
      const base   = Math.pow(2, attempt) * 600;         // 600 / 1200 / 2400ms
      const jitter = Math.random() * 400;                // 0~400ms 랜덤
      await sleep(base + jitter);
      continue;
    }
    // 마지막 시도: 그냥 반환 (상위에서 .ok 체크)
    return res;
  }

  return res; // 정상 응답
} catch (err) {
  lastErr = err;
  if (err.name === 'AbortError') throw err; // 타임아웃은 재시도 금지

  if (attempt < maxAttempts - 1) {
    const base   = Math.pow(2, attempt) * 600;
    const jitter = Math.random() * 400;
    await sleep(base + jitter);
  }
}
```

}

throw lastErr;
}

// ── Whisper STT ──────────────────────────────────────────────

/**

- @param {string}      apiKey
- @param {string}      audio     base64 인코딩된 오디오
- @param {string}      mimeType
- @param {string|null} language  ‘ko’ | ‘en’ | null(자동)
  */
  async function callWhisper(apiKey, audio, mimeType, language = null) {
  // 오디오 크기 사전 검증 (Whisper 상한 25MB)
  const buf = Buffer.from(audio, ‘base64’);
  if (buf.length > 24 * 1024 * 1024) {
  throw new Error(‘오디오 파일이 너무 큽니다 (최대 24MB)’);
  }

const ext  = resolveExt(mimeType);
const blob = new Blob([buf], { type: ‘application/octet-stream’ });
const form = new FormData();
form.append(‘file’,  blob, `audio.${ext}`);
form.append(‘model’, ‘whisper-1’);
if (language) form.append(‘language’, language);

const res = await withRetry(() =>
fetchWithTimeout(
‘https://api.openai.com/v1/audio/transcriptions’,
{ method: ‘POST’, headers: { ‘Authorization’: `Bearer ${apiKey}` }, body: form },
25000
)
);

const raw = await res.text();
if (!res.ok) {
throw new Error(`Whisper ${res.status}: ${raw.slice(0, 200)}`);
}

try {
return JSON.parse(raw);
} catch {
throw new Error(`Whisper 응답 파싱 실패: ${raw.slice(0, 50)}`);
}
}

// ── GPT Chat Completion ──────────────────────────────────────

/**

- @param {string} apiKey
- @param {{ model?, messages, maxTokens?, jsonMode? }} opts
- @returns {string} GPT 응답 텍스트 (content)
  */
  async function callGPT(apiKey, { model = ‘gpt-4o-mini’, messages, maxTokens = 1000, jsonMode = false }) {
  const res = await withRetry(() =>
  fetchWithTimeout(
  ‘https://api.openai.com/v1/chat/completions’,
  {
  method:  ‘POST’,
  headers: {
  ‘Content-Type’:  ‘application/json’,
  ‘Authorization’: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
  model,
  messages,
  max_tokens: maxTokens,
  …(jsonMode && { response_format: { type: ‘json_object’ } }),
  }),
  },
  25000
  )
  );

const raw = await res.text();
if (!res.ok) {
throw new Error(`GPT ${res.status}: ${raw.slice(0, 200)}`);
}

let data;
try {
data = JSON.parse(raw);
} catch {
throw new Error(‘GPT 응답 JSON 파싱 실패’);
}

const content = data.choices?.[0]?.message?.content;
if (!content) throw new Error(‘GPT 응답이 비어 있음’);
return content;
}

// ── analyze 응답 구조 검증 ───────────────────────────────────

/**

- GPT가 필수 필드를 빠뜨렸을 때 즉시 감지
- → 불완전한 데이터가 프론트에 내려가서 앱이 터지는 것 방지
  */
  function validateAnalyzeResponse(obj) {
  const required = [‘title_ko’, ‘title_en’, ‘korean’, ‘english’, ‘dictionary’, ‘keys’, ‘drills’, ‘vocab’];

for (const key of required) {
if (obj[key] === undefined || obj[key] === null) {
throw new Error(`GPT 응답 누락 필드: "${key}"`);
}
}

if (!Array.isArray(obj.keys)   || obj.keys.length   === 0) throw new Error(‘keys 배열이 비어 있음’);
if (!Array.isArray(obj.drills) || obj.drills.length === 0) throw new Error(‘drills 배열이 비어 있음’);
if (!Array.isArray(obj.vocab)  || obj.vocab.length  === 0) throw new Error(‘vocab 배열이 비어 있음’);

return true;
}

module.exports = {
sleep,
resolveExt,
fetchWithTimeout,
withRetry,
callWhisper,
callGPT,
validateAnalyzeResponse,
};