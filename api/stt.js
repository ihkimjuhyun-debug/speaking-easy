// api/stt.js
// 음성 → 텍스트 변환 (Whisper STT)
// 개선: 타임아웃(25s) + 자동 재시도(3회) + 공유 유틸리티 사용

const { callWhisper } = require(’./_lib/utils’);

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: ‘API 키 없음’ });

try {
const { audio, mimeType, lang_mode } = req.body;
if (!audio) return res.status(400).json({ error: ‘오디오 데이터 없음’ });

```
// lang_mode='ko' 이면 한국어 고정, 아니면 자동 감지
const language = lang_mode === 'ko' ? 'ko' : null;

const sttData = await callWhisper(API_KEY, audio, mimeType, language);

return res.status(200).json({ text: sttData.text || '' });
```

} catch (err) {
// 타임아웃 에러 별도 메시지
if (err.name === ‘AbortError’) {
console.error(’[stt] timeout’);
return res.status(504).json({ error: ‘음성 인식 시간 초과. 다시 시도해주세요.’ });
}
console.error(’[stt] catch:’, err.message);
return res.status(500).json({ error: err.message });
}
}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;