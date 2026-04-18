// api/analyze.js
// 텍스트 → 학습 데이터 생성 (GPT-4o-mini)
// ─────────────────────────────────────────────────────────────
// 개선사항:
//   ✅ 25초 타임아웃 → 504 즉시 반환
//   ✅ 3회 자동 재시도 + 지수 백오프
//   ✅ 응답 구조 검증 → 불완전 데이터 차단
//   ✅ 검증 실패 시 GPT 1회 추가 재호출
//   ✅ 프롬프트 템플릿 분리 (유지보수 용이)
// ─────────────────────────────────────────────────────────────

const { callGPT, validateAnalyzeResponse } = require(’./_lib/utils’);

// ── 프롬프트 생성 ─────────────────────────────────────────────

function buildPrompt(text, difficulty) {
const levelMap = {
beginner: ‘초급(쉬운단어)’,
advanced: ‘고급(학술적)’,
};
const level = levelMap[difficulty] || ‘중급(실생활/비즈니스)’;

// 스키마를 객체로 선언 → JSON.stringify로 일관성 보장
const schema = {
title_ko:   ‘’,
title_en:   ‘’,
korean:     ‘’,
english:    ‘’,
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
`사용자 말(한국어): "${text}"`,
`난이도: ${level}`,
‘’,
‘규칙:’,
‘- keys 3개. en_var1/en_var2/en_long은 phrase 핵심단어 포함 필수.’,
‘- vocab 3개. word=영어만(한국어 절대 금지). meaning=한국어. var1~3=같은 단어 다른 실생활 문장.’,
‘- dictionary 3개. key=영어단어.’,
‘- blur_part: 소문자 단어 또는 “none” 또는 “all”.’,
‘- 모든 필드를 반드시 채울 것. 빈 문자열 금지.’,
‘’,
`JSON만 반환 (스키마 엄수):\n${JSON.stringify(schema)}`,
].join(’\n’);
}

// ── GPT 호출 + 검증 (실패시 1회 재시도) ───────────────────────

async function fetchAndValidate(apiKey, text, difficulty) {
const prompt = buildPrompt(text, difficulty);

const content = await callGPT(apiKey, {
messages:  [{ role: ‘user’, content: prompt }],
maxTokens: 4000,
jsonMode:  true,
});

let parsed;
try {
parsed = JSON.parse(content);
} catch {
throw new Error(‘GPT가 유효한 JSON을 반환하지 않았습니다.’);
}

// 구조 검증 → 불완전하면 에러 throw → 상위에서 재시도
validateAnalyzeResponse(parsed);
return parsed;
}

// ── 핸들러 ────────────────────────────────────────────────────

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
console.error(’[analyze] OPENAI_API_KEY 환경변수 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const { text, difficulty } = req.body || {};

// ── 입력 검증 ──────────────────────────────────────────────
if (!text || typeof text !== ‘string’ || text.trim().length < 2) {
return res.status(400).json({ error: ‘음성이 명확히 인식되지 않았습니다. 다시 말씀해주세요!’ });
}

// ── GPT 호출 (검증 실패시 1회 추가 재시도) ─────────────────
try {
let parsed;
try {
parsed = await fetchAndValidate(API_KEY, text.trim(), difficulty);
} catch (firstErr) {
// 구조 검증 실패 → 한 번 더 시도
if (firstErr.message.includes(‘누락’) || firstErr.message.includes(‘비어’)) {
console.warn(’[analyze] 1차 검증 실패, 재시도:’, firstErr.message);
parsed = await fetchAndValidate(API_KEY, text.trim(), difficulty);
} else {
throw firstErr;
}
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

handler.config = {
api: { bodyParser: { sizeLimit: ‘1mb’ } },
};

module.exports = handler;