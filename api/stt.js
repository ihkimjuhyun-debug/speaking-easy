// api/stt.js
// 음성 → 텍스트 변환 (Whisper STT)
// ─────────────────────────────────────────────────────────────
// 개선사항:
//   ✅ 25초 타임아웃 → 504 즉시 반환 (무반응 방지)
//   ✅ 3회 자동 재시도 + 지수 백오프
//   ✅ 오디오 크기 사전 검증 (24MB 초과 차단)
//   ✅ 한국어 에러 메시지
// ─────────────────────────────────────────────────────────────

const { callWhisper } = require(’./_lib/utils’);

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
console.error(’[stt] OPENAI_API_KEY 환경변수 없음’);
return res.status(500).json({ error: ‘API 키가 설정되지 않았습니다.’ });
}

const { audio, mimeType, lang_mode } = req.body || {};

// ── 입력 검증 ──────────────────────────────────────────────
if (!audio) {
return res.status(400).json({ error: ‘오디오 데이터가 없습니다.’ });
}
if (typeof audio !== ‘string’) {
return res.status(400).json({ error: ‘오디오 형식이 올바르지 않습니다.’ });
}

// ── Whisper 호출 ───────────────────────────────────────────
try {
// lang_mode=‘ko’ → 한국어 고정, 나머지 → 자동 감지
const language = lang_mode === ‘ko’ ? ‘ko’ : null;
const sttData  = await callWhisper(API_KEY, audio, mimeType || ‘’, language);

```
return res.status(200).json({ text: sttData.text || '' });
```

} catch (err) {
// 타임아웃
if (err.name === ‘AbortError’) {
console.error(’[stt] 타임아웃’);
return res.status(504).json({ error: ‘음성 인식 시간이 초과됐습니다. 다시 시도해주세요.’ });
}
// 파일 크기 초과
if (err.message.includes(‘너무 큽니다’)) {
return res.status(400).json({ error: err.message });
}
console.error(’[stt]’, err.message);
return res.status(500).json({ error: ‘음성 인식에 실패했습니다. 잠시 후 다시 시도해주세요.’ });
}
}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;