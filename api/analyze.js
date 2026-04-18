// api/analyze.js
// 텍스트 → 학습 데이터 생성 (GPT-4o-mini)
// 개선: 타임아웃(25s) + 자동 재시도(3회) + 프롬프트 템플릿 분리

const { callGPT } = require(’./_lib/utils’);

// ─────────────────────────────────────────────
// 프롬프트 생성 (문자열 연결 대신 템플릿으로 분리)
// ─────────────────────────────────────────────
function buildPrompt(text, difficulty) {
const levelMap = {
beginner: ‘초급(쉬운단어)’,
advanced: ‘고급(학술적)’,
};
const level = levelMap[difficulty] || ‘중급(실생활/비즈니스)’;

const schema = JSON.stringify({
title_ko: ‘’,
title_en: ‘’,
korean:   ‘’,
english:  ‘’,
dictionary: {
단어1: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
단어2: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
단어3: { ko: ‘’, pos: ‘’, phonetics: ‘’, ko_context: ‘’ },
},
keys: [
{ phrase:‘영어표현’, ko_org:’’, en_org:’’, ko_var1:’’, en_var1:’’, ko_var2:’’, en_var2:’’, ko_long:’’, en_long:’’ },
{ phrase:‘영어표현’, ko_org:’’, en_org:’’, ko_var1:’’, en_var1:’’, ko_var2:’’, en_var2:’’, ko_long:’’, en_long:’’ },
{ phrase:‘영어표현’, ko_org:’’, en_org:’’, ko_var1:’’, en_var1:’’, ko_var2:’’, en_var2:’’, ko_long:’’, en_long:’’ },
],
drills: [
{ step:1, ko:’’, en_full:’’, blur_part:‘none’ },
{ step:2, ko:’’, en_full:’’, blur_part:‘키워드’ },
{ step:3, ko:’’, en_full:’’, blur_part:‘all’ },
],
vocab: [
{ word:‘영어단어’, meaning:‘한국어뜻’, pos:’’, phonetics:’’, example_en:’’, example_ko:’’, var1_en:’’, var1_ko:’’, var2_en:’’, var2_ko:’’, var3_en:’’, var3_ko:’’, wrong_options:[‘오답1’,‘오답2’], confusing_words:[‘스펠1’,‘스펠2’] },
{ word:‘영어단어’, meaning:‘한국어뜻’, pos:’’, phonetics:’’, example_en:’’, example_ko:’’, var1_en:’’, var1_ko:’’, var2_en:’’, var2_ko:’’, var3_en:’’, var3_ko:’’, wrong_options:[‘오답1’,‘오답2’], confusing_words:[‘스펠1’,‘스펠2’] },
{ word:‘영어단어’, meaning:‘한국어뜻’, pos:’’, phonetics:’’, example_en:’’, example_ko:’’, var1_en:’’, var1_ko:’’, var2_en:’’, var2_ko:’’, var3_en:’’, var3_ko:’’, wrong_options:[‘오답1’,‘오답2’], confusing_words:[‘스펠1’,‘스펠2’] },
],
});

return (
`사용자 말(한국어): "${text}"\n` +
`난이도: ${level}\n\n` +
`규칙:\n` +
`- keys 3개. en_var1/en_var2/en_long은 phrase 핵심단어 포함 필수.\n` +
`- vocab 3개. word=영어만(한국어 절대 금지). meaning=한국어. var1~3=같은단어 다른 실생활 문장.\n` +
`- dictionary 3개. key=영어단어.\n` +
`- blur_part: 소문자 단어 또는 "none" 또는 "all"\n\n` +
`JSON만 반환 (스키마 준수):\n${schema}`
);
}

// ─────────────────────────────────────────────
// 핸들러
// ─────────────────────────────────────────────
async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: ‘API 키 없음’ });

try {
const { text, difficulty } = req.body;

```
if (!text || text.trim().length < 2) {
  return res.status(400).json({ error: '음성이 명확히 인식되지 않았습니다. 다시 말씀해주세요!' });
}

const prompt  = buildPrompt(text.trim(), difficulty);
const content = await callGPT(API_KEY, {
  messages:  [{ role: 'user', content: prompt }],
  maxTokens: 4000,
  jsonMode:  true,
});

const parsed = JSON.parse(content);
return res.status(200).json(parsed);
```

} catch (err) {
if (err.name === ‘AbortError’) {
console.error(’[analyze] timeout’);
return res.status(504).json({ error: ‘분석 시간 초과. 다시 시도해주세요.’ });
}
console.error(’[analyze] catch:’, err.message);
return res.status(500).json({ error: err.message });
}
}

handler.config = {
api: { bodyParser: { sizeLimit: ‘1mb’ } },
};

module.exports = handler;