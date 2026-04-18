// api/openai-proxy.js - 발음 평가 전용
// Node.js 20 네이티브 FormData + Blob 사용

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'API 키 없음' });

try {
    const { audio, mimeType, target_english } = req.body;
    if (!audio) return res.status(400).json({ error: '오디오 없음' });

    const resolvedMime = (mimeType || '').toLowerCase();
    let ext = 'webm';
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        ext = 'mp4';
    } else if (resolvedMime.includes('ogg')) {
        ext = 'ogg';
    }

    const audioBuf = Buffer.from(audio, 'base64');
    const blob = new Blob([audioBuf], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob, 'audio.' + ext);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const sttResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + API_KEY },
        body: formData,
    });

    const sttText = await sttResp.text();
    if (!sttResp.ok) {
        console.error('[proxy] whisper error:', sttText.slice(0, 200));
        return res.status(200).json({
            score: 0,
            feedback: '음성 인식 실패. 다시 시도해주세요.',
            recognized_text: '인식 실패'
        });
    }

    let sttData;
    try { sttData = JSON.parse(sttText); } catch(e) {
        return res.status(200).json({ score: 0, feedback: '인식 실패', recognized_text: '' });
    }

    const userSpeech = sttData.text || '';
    const cleanTarget = (target_english || '').replace(/\?+/g, '').trim();

    if (!cleanTarget) {
        return res.status(200).json({ score: 0, feedback: '평가 텍스트 없음', recognized_text: userSpeech });
    }

    const evalPrompt =
        '목표:"' + cleanTarget + '", 인식:"' + userSpeech + '". ' +
        '관대하게채점. JSON:{"score":정수10~100,"feedback":"한국어짧은피드백"}';

    const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_KEY
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: evalPrompt }],
            response_format: { type: 'json_object' },
            max_tokens: 80,
        }),
    });

    const gptText = await gptResp.text();
    let result = { score: 70, feedback: '채점 완료' };
    try {
        const gptData = JSON.parse(gptText);
        if (gptData.choices?.[0]?.message?.content) {
            result = JSON.parse(gptData.choices[0].message.content);
        }
    } catch(e) {}

    return res.status(200).json({ ...result, recognized_text: userSpeech });

} catch (err) {
    console.error('[proxy] catch:', err.message);
    return res.status(500).json({ error: err.message });
}
```

}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;