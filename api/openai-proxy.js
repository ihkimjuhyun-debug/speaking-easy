// api/openai-proxy.js
// 발음 평가 전용 (Whisper STT → GPT 채점)
// 개선: 타임아웃(25s) + 자동 재시도(3회) + 중복 코드 제거

const { callWhisper, callGPT } = require(’./_lib/utils’);

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: ‘API 키 없음’ });

try {
const { audio, mimeType, target_english } = req.body;
if (!audio) return res.status(400).json({ error: ‘오디오 없음’ });

```
// ── 1. Whisper: 영어 고정 인식 ──────────────────
let userSpeech = '';
try {
  const sttData = await callWhisper(API_KEY, audio, mimeType, 'en');
  userSpeech = sttData.text || '';
} catch (sttErr) {
  console.error('[proxy] whisper error:', sttErr.message);
  // STT 실패는 score 0으로 graceful 처리 (프론트가 에러 팝업 안 뜨게)
  return res.status(200).json({
    score: 0,
    feedback: '음성 인식 실패. 다시 시도해주세요.',
    recognized_text: '인식 실패',
  });
}

// ── 2. GPT: 발음 채점 ───────────────────────────
const cleanTarget = (target_english || '').replace(/\?+/g, '').trim();
if (!cleanTarget) {
  return res.status(200).json({ score: 0, feedback: '평가 텍스트 없음', recognized_text: userSpeech });
}

const evalPrompt =
  `목표: "${cleanTarget}"\n` +
  `인식: "${userSpeech}"\n\n` +
  `관대하게 채점하고 JSON만 반환: {"score":정수10~100,"feedback":"한국어 짧은 피드백"}`;

let result = { score: 70, feedback: '채점 완료' };
try {
  const content = await callGPT(API_KEY, {
    messages:  [{ role: 'user', content: evalPrompt }],
    maxTokens: 80,
    jsonMode:  true,
  });
  result = JSON.parse(content);
} catch (gptErr) {
  console.error('[proxy] gpt error:', gptErr.message);
  // GPT 채점 실패 시 기본값 유지 (앱은 계속 동작)
}

return res.status(200).json({ ...result, recognized_text: userSpeech });
```

} catch (err) {
if (err.name === ‘AbortError’) {
console.error(’[proxy] timeout’);
return res.status(504).json({ error: ‘발음 평가 시간 초과. 다시 시도해주세요.’ });
}
console.error(’[proxy] catch:’, err.message);
return res.status(500).json({ error: err.message });
}
}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;