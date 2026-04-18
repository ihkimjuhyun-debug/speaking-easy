// api/analyze.js
// 텍스트 → 학습 데이터 생성 (GPT-4o-mini)
// ✅ 외부 require 없음 — 단독으로 완전 동작
// ✅ 25초 타임아웃
// ✅ 3회 자동 재시도
// ✅ 응답 구조 검증 → 불완전 시 자동 1회 재호출
// ✅ 모든 에러 한국어 메시지

// ── 내부 유틸 ────────────────────────────────────────────────

function sleep(ms) {
return new Promise(r => setTimeout(r, ms));
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

// ── GPT 호출 ─────────────────────────────────────────────────

async function callGPT(apiKey, messages, maxTokens) {
const res = await withRetry(
() => fetchWithTimeout(
‘https://api.openai.com/v1/chat/completions’,
{
method:  ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, Authorization: ’Bearer ’ + apiKey },
body: JSON.stringify({
model:           ‘gpt-4o-mini’,
messages,
max_tokens:      maxTokens,
response_format: { type: ‘json_object’ },
}),
},
25000
),
3
);

const raw = await res.text();
if (!res.ok) throw new Error(’GPT ’ + res.status + ’: ’ + raw.slice(0, 200));

let data;
try { data = JSON.parse(raw); } catch { throw new Error(‘GPT 응답 JSON 파싱 실패’); }

const content = data.choices?.[0]?.message?.content;
if (!content) throw new Error(‘GPT 응답이 비어 있음’);
return content;
}

// ── 프롬프트 ─────────────────────────────────────────────────

function buildPrompt(text, difficulty) {
const levelMap = { beginner: ‘초급(쉬운단어)’, advanced: ‘고급(학술적)’ };
const level    = levelMap[difficulty] || ‘중급(실생활/비즈니스)’;

const schema = {
title_ko: ‘’, title_en: ‘’, korean: ‘’, english: ‘’,
dictionary: {
단어1: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
단어2: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
단어3: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
},
keys: [
{ phrase: ‘영어표현’, ko_org: ‘’, en_org: ‘’, ko_var1: ‘’, en_var1: ‘’, ko_var2: ‘’, en_var2: ‘’, ko_long: ‘’, en_long: ‘’ },
{ phrase: ‘영어표현’, ko_org: ‘’, en_org: ‘’, ko_var1: ‘’, en_var1: ‘’, ko_var2: ‘’, en_var2: ‘’, ko_long: ‘’, en_long: ‘’ },
{ phrase: ‘영어표현’, ko_org: ‘’, en_org: ‘’, ko_var1: ‘’, en_var1: ‘’, ko_var2: ‘’, en_var2: ‘’, ko_long: ‘’, en_long: ‘’ },
],
drills: [
{ step: 1, ko: ‘’, en_full: ‘’, blur_part: ‘none’  },
{ step: 2, ko: ‘’, en_full: ‘’, blur_part: ‘키워드’ },
{ step: 3, ko: ‘’, en_full: ‘’, blur_part: ‘all’   },
],
vocab: [
{ word: ‘영어단어’, meaning: ‘한국어뜻’, pos: ‘’, phonetics: ‘’, example_en: ‘’, example_ko: ‘’, var1_en: ‘’, var1_ko: ‘’, var2_en: ‘’, var2_ko: ‘’, var3_en: ‘’, var3_ko: ‘’, wrong_options: [‘오답1’,‘오답2’], confusing_words: [‘스펠1’,‘스펠2’] },
{ word: ‘영어단어’, meaning: ‘한국어뜻’, pos: ‘’, phonetics: ‘’, example_en: ‘’, example_ko: ‘’, var1_en: ‘’, var1_ko: ‘’, var2_en: ‘’, var2_ko: ‘’, var3_en: ‘’, var3_ko: ‘’, wrong_options: [‘오답1’,‘오답2’], confusing_words: [‘스펠1’,‘스펠2’] },
{ word: ‘영어단어’, meaning: ‘한국어뜻’, pos: ‘’, phonetics: ‘’, example_en: ‘’, example_ko: ‘’, var1_en: ‘’, var1_ko: ‘’, var2_en: ‘’, var2_ko: ‘’, var3_en: ‘’, var3_ko: ‘’, wrong_options: [‘오답1’,‘오답2’], confusing_words: [‘스펠1’,‘스펠2’] },
],
};

return [
‘사용자 말(한국어): “’ + text + ‘”’,
‘난이도: ’ + level,
‘’,
‘규칙:’,
‘- keys 3개. en_var1/en_var2/en_long은 phrase 핵심단어 포함 필수.’,
‘- vocab 3개. word=영어만(한국어 절대 금지). meaning=한국어.’,
‘- dictionary 3개. key=영어단어.’,
‘- blur_part: 소문자 단어 또는 “none” 또는 “all”.’,
‘- 모든 필드를 반드시 채울 것. 빈 문자열 금지.’,
‘’,
‘JSON만 반환 (스키마 엄수):\n’ + JSON.stringify(schema),
].join(’\n’);
}

// ── 응답 검증 ────────────────────────────────────────────────

function validate(obj) {
const required = [‘title_ko’,‘title_en’,‘korean’,‘english’,‘dictionary’,‘keys’,‘drills’,‘vocab’];
for (const k of required) {
if (obj[k] == null) throw new Error(’누락 필드: ’ + k);
}
if (!Array.isArray(obj.keys)   || obj.keys.length   === 0) throw new Error(‘keys 비어 있음’);
if (!Array.isArray(obj.drills) || obj.drills.length === 0) throw new Error(‘drills 비어 있음’);
if (!Array.isArray(obj.vocab)  || obj.vocab.length  === 0) throw new Error(‘vocab 비어 있음’);
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
console.error(’[analyze] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const body       = req.body || {};
const text       = (body.text || ‘’).trim();
const difficulty = body.difficulty || ‘intermediate’;

if (!text || text.length < 2) {
return res.status(400).json({ error: ‘음성이 명확히 인식되지 않았습니다. 다시 말씀해주세요!’ });
}

const messages = [{ role: ‘user’, content: buildPrompt(text, difficulty) }];

try {
// 1차 시도
let parsed;
try {
const content = await callGPT(API_KEY, messages, 4000);
parsed = JSON.parse(content);
validate(parsed);
} catch (firstErr) {
// 구조 검증 실패 → 1회 재시도
console.warn(’[analyze] 1차 실패, 재시도:’, firstErr.message);
const content = await callGPT(API_KEY, messages, 4000);
parsed = JSON.parse(content);
validate(parsed);
}

```
return res.status(200).json(parsed);
```

} catch (err) {
if (err.name === ‘AbortError’) {
console.error(’[analyze] 타임아웃’);
return res.status(504).json({ error: ‘분석 시간이 초과됐습니다. 다시 시도해주세요.’ });
}
console.error(’[analyze]’, err.message);
return res.status(500).json({ error: ‘학습 데이터 생성에 실패했습니다. 잠시 후 다시 시도해주세요.’ });
}
}

handler.config = { api: { bodyParser: { sizeLimit: ‘1mb’ } } };

module.exports = handler;