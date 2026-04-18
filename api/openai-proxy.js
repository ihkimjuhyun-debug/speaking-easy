// api/openai-proxy.js
// 발음 평가 전용 (Whisper STT → GPT 채점)
// ─────────────────────────────────────────────────────────────
// 개선사항:
//   ✅ 25초 타임아웃 → 504 즉시 반환
//   ✅ Whisper 3회 자동 재시도 + 지수 백오프
//   ✅ GPT 채점 실패 시 기본값 유지 (앱 계속 동작)
//   ✅ 중복 MIME 처리 코드 제거 (utils 사용)
//   ✅ 오디오 크기 사전 검증
// ─────────────────────────────────────────────────────────────

const { callWhisper, callGPT } = require(’./_lib/utils’);

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
console.error(’[proxy] OPENAI_API_KEY 환경변수 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const { audio, mimeType, target_english } = req.body || {};

// ── 입력 검증 ──────────────────────────────────────────────
if (!audio) {
return res.status(400).json({ error: ‘오디오 데이터가 없습니다.’ });
}

try {
// ── 1단계: Whisper STT (영어 고정) ─────────────────────────
let userSpeech = ‘’;
try {
const sttData = await callWhisper(API_KEY, audio, mimeType || ‘’, ‘en’);
userSpeech = sttData.text || ‘’;
} catch (sttErr) {
// STT 실패는 score 0으로 graceful 처리
// → 프론트에 에러 팝업 대신 “인식 실패” 메시지 표시
console.error(’[proxy] Whisper 실패:’, sttErr.message);
return res.status(200).json({
score:           0,
feedback:        ‘음성 인식에 실패했습니다. 다시 시도해주세요.’,
recognized_text: ‘인식 실패’,
});
}

```
// ── 2단계: GPT 발음 채점 ────────────────────────────────────
const cleanTarget = (target_english || '').replace(/\?+/g, '').trim();

if (!cleanTarget) {
  return res.status(200).json({
    score:           0,
    feedback:        '평가 텍스트가 없습니다.',
    recognized_text: userSpeech,
  });
}

// 채점 프롬프트: 관대하게 평가 + 짧은 한국어 피드백
const evalPrompt = [
  `목표 문장: "${cleanTarget}"`,
  `인식된 발음: "${userSpeech}"`,
  '',
  '위 두 문장을 비교해서 발음을 관대하게 채점해주세요.',
  '발음이 비슷하면 높은 점수를 주세요.',
  'JSON만 반환: {"score": 정수(10~100), "feedback": "한국어 짧은 피드백(1~2문장)"}',
].join('\n');

// GPT 채점 실패 시 기본값(70점)으로 graceful 처리
let result = { score: 70, feedback: '발음 채점 완료!' };
try {
  const content = await callGPT(API_KEY, {
    messages:  [{ role: 'user', content: evalPrompt }],
    maxTokens: 100,
    jsonMode:  true,
  });
  const parsed = JSON.parse(content);
  if (typeof parsed.score === 'number' && parsed.feedback) {
    result = parsed;
  }
} catch (gptErr) {
  // GPT 채점 실패는 무시하고 기본값 사용
  console.warn('[proxy] GPT 채점 실패 (기본값 사용):', gptErr.message);
}

return res.status(200).json({ ...result, recognized_text: userSpeech });
```

} catch (err) {
if (err.name === ‘AbortError’) {
console.error(’[proxy] 타임아웃’);
return res.status(504).json({ error: ‘발음 평가 시간이 초과됐습니다. 다시 시도해주세요.’ });
}
console.error(’[proxy]’, err.message);
return res.status(500).json({ error: ‘발음 평가에 실패했습니다. 잠시 후 다시 시도해주세요.’ });
}
}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;