// api/analyze.js  ─ 텍스트 → 학습 데이터 (GPT-4o-mini)
// ✅ 외부 require 없음   ✅ 25초 타임아웃   ✅ 3회 재시도
// ✅ 응답 구조 검증      ✅ 실패 시 자동 재호출  ✅ CORS

‘use strict’;

/* ── 유틸 ─────────────────────────────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/* ── GPT 호출 ─────────────────────────────────────────────── */

async function callGPT(key, messages, maxTokens = 4000) {
const r = await retry(() => fetchT(
‘https://api.openai.com/v1/chat/completions’,
{
method:  ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, Authorization: ’Bearer ’ + key },
body: JSON.stringify({
model:           ‘gpt-4o-mini’,
messages,
max_tokens:      maxTokens,
response_format: { type: ‘json_object’ },
}),
}
));

const raw = await r.text();
if (!r.ok) throw new Error(’GPT ’ + r.status + ’: ’ + raw.slice(0, 200));

let d;
try   { d = JSON.parse(raw); }
catch { throw new Error(‘GPT 응답 JSON 파싱 실패’); }

const c = d.choices?.[0]?.message?.content;
if (!c) throw new Error(‘GPT 응답 비어 있음’);
return c;
}

/* ── 프롬프트 ─────────────────────────────────────────────── */

function buildPrompt(text, difficulty) {
const level = { beginner: ‘초급(쉬운단어)’, advanced: ‘고급(학술적)’ }[difficulty] || ‘중급(실생활/비즈니스)’;

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
{ step: 1, ko: ‘’, en_full: ‘’, blur_part: ‘none’   },
{ step: 2, ko: ‘’, en_full: ‘’, blur_part: ‘키워드’  },
{ step: 3, ko: ‘’, en_full: ‘’, blur_part: ‘all’    },
],
vocab: Array(3).fill(null).map(() => ({
word: ‘영어단어’, meaning: ‘한국어뜻’, pos: ‘’, phonetics: ‘’,
example_en: ‘’, example_ko: ‘’,
var1_en: ‘’, var1_ko: ‘’, var2_en: ‘’, var2_ko: ‘’, var3_en: ‘’, var3_ko: ‘’,
wrong_options: [‘오답1’, ‘오답2’], confusing_words: [‘스펠1’, ‘스펠2’],
})),
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

/* ── 응답 검증 ────────────────────────────────────────────── */

function validate(obj) {
for (const k of [‘title_ko’,‘title_en’,‘korean’,‘english’,‘dictionary’,‘keys’,‘drills’,‘vocab’]) {
if (obj[k] == null) throw new Error(’누락 필드: ’ + k);
}
if (!Array.isArray(obj.keys)   || !obj.keys.length)   throw new Error(‘keys 비어 있음’);
if (!Array.isArray(obj.drills) || !obj.drills.length) throw new Error(‘drills 비어 있음’);
if (!Array.isArray(obj.vocab)  || !obj.vocab.length)  throw new Error(‘vocab 비어 있음’);
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
console.error(’[analyze] OPENAI_API_KEY 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const text       = ((req.body || {}).text || ‘’).trim();
const difficulty = (req.body || {}).difficulty || ‘intermediate’;

if (!text || text.length < 2) {
return res.status(400).json({ error: ‘음성이 명확히 인식되지 않았습니다. 다시 말씀해주세요!’ });
}

const messages = [{ role: ‘user’, content: buildPrompt(text, difficulty) }];

try {
let parsed;

```
// 1차 시도
try {
  parsed = JSON.parse(await callGPT(KEY, messages));
  validate(parsed);
} catch (e1) {
  // 구조 불완전 → 1회 자동 재시도
  console.warn('[analyze] 1차 실패, 재시도:', e1.message);
  parsed = JSON.parse(await callGPT(KEY, messages));
  validate(parsed);
}

return res.status(200).json(parsed);
```

} catch (e) {
if (e.name === ‘AbortError’) {
console.error(’[analyze] 타임아웃’);
return res.status(504).json({ error: ‘분석 시간이 초과됐습니다. 다시 시도해주세요.’ });
}
console.error(’[analyze]’, e.message);
return res.status(500).json({ error: ‘학습 데이터 생성 실패. 잠시 후 다시 시도해주세요.’ });
}
}

handler.config = { api: { bodyParser: { sizeLimit: ‘1mb’ } } };
module.exports = handler;