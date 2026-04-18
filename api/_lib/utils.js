// api/_lib/utils.js
// ─────────────────────────────────────────────
// 모든 API에서 공유하는 유틸리티 함수 모음
// ─────────────────────────────────────────────

/**

- MIME 타입 → Whisper용 파일 확장자 변환
- Whisper는 파일명 확장자로 포맷을 판단하므로 정확해야 함
  */
  function resolveExt(mimeType = ‘’) {
  const m = mimeType.toLowerCase();
  if (m.includes(‘mp4’) || m.includes(‘m4a’) || m.includes(‘aac’)) return ‘mp4’;
  if (m.includes(‘ogg’))  return ‘ogg’;
  if (m.includes(‘wav’))  return ‘wav’;
  if (m.includes(‘mpeg’) || m.includes(‘mp3’)) return ‘mp3’;
  return ‘webm’; // Chrome/Android 기본값
  }

/**

- base64 오디오 → Whisper용 FormData 생성
  */
  function buildWhisperForm(audio, mimeType, language = null) {
  const ext     = resolveExt(mimeType);
  const buf     = Buffer.from(audio, ‘base64’);
  const blob    = new Blob([buf], { type: ‘application/octet-stream’ });
  const form    = new FormData();
  form.append(‘file’,  blob, `audio.${ext}`);
  form.append(‘model’, ‘whisper-1’);
  if (language) form.append(‘language’, language);
  return form;
  }

/**

- AbortController 기반 타임아웃 fetch
- ms 안에 응답 없으면 자동 중단 → 무반응 방지 핵심
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

/**

- 지수 백오프 재시도 래퍼
- OpenAI 429(속도초과) / 5xx(서버오류) 시 자동 재시도
- @param {Function} fn    - () => Promise<Response>
- @param {number}   tries - 최대 시도 횟수 (기본 3)
  */
  async function withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
  try {
  const res = await fn();
  // 429 또는 5xx 이면 재시도
  if (res.status === 429 || res.status >= 500) {
  lastErr = new Error(`HTTP ${res.status}`);
  const delay = (2 ** i) * 500; // 0.5s → 1s → 2s
  await new Promise(r => setTimeout(r, delay));
  continue;
  }
  return res;
  } catch (err) {
  lastErr = err;
  if (err.name === ‘AbortError’) throw err; // 타임아웃은 재시도 안 함
  const delay = (2 ** i) * 500;
  await new Promise(r => setTimeout(r, delay));
  }
  }
  throw lastErr;
  }

/**

- Whisper STT 공통 호출
- @returns {{ text: string }}
  */
  async function callWhisper(apiKey, audio, mimeType, language = null) {
  const form = buildWhisperForm(audio, mimeType, language);

const res = await withRetry(() =>
fetchWithTimeout(
‘https://api.openai.com/v1/audio/transcriptions’,
{
method:  ‘POST’,
headers: { ‘Authorization’: `Bearer ${apiKey}` },
body:    form,
},
25000
)
);

const raw = await res.text();
if (!res.ok) {
throw new Error(`Whisper ${res.status}: ${raw.slice(0, 150)}`);
}
return JSON.parse(raw);
}

/**

- GPT Chat Completion 공통 호출
  */
  async function callGPT(apiKey, { model = ‘gpt-4o-mini’, messages, maxTokens = 1000, jsonMode = false }) {
  const body = {
  model,
  messages,
  max_tokens: maxTokens,
  …(jsonMode && { response_format: { type: ‘json_object’ } }),
  };

const res = await withRetry(() =>
fetchWithTimeout(
‘https://api.openai.com/v1/chat/completions’,
{
method:  ‘POST’,
headers: {
‘Content-Type’:  ‘application/json’,
‘Authorization’: `Bearer ${apiKey}`,
},
body: JSON.stringify(body),
},
25000
)
);

const raw = await res.text();
if (!res.ok) {
throw new Error(`GPT ${res.status}: ${raw.slice(0, 150)}`);
}
const data = JSON.parse(raw);
const content = data.choices?.[0]?.message?.content;
if (!content) throw new Error(‘GPT 응답 비어 있음’);
return content;
}

module.exports = { resolveExt, buildWhisperForm, fetchWithTimeout, withRetry, callWhisper, callGPT };