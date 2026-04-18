// api/stt.js
// Node.js 20 네이티브 FormData + Blob 사용 (가장 안정적)

async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'API 키 없음' });

try {
    const { audio, mimeType, lang_mode } = req.body;

    if (!audio) return res.status(400).json({ error: '오디오 데이터 없음' });

    // MIME 타입에 따른 파일 확장자
    // Whisper는 파일명 확장자로 포맷을 판단함
    const resolvedMime = (mimeType || '').toLowerCase();
    let ext = 'webm'; // Chrome/Android 기본값
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        ext = 'mp4'; // iOS Safari
    } else if (resolvedMime.includes('ogg')) {
        ext = 'ogg';
    } else if (resolvedMime.includes('wav')) {
        ext = 'wav';
    }

    const audioBuf = Buffer.from(audio, 'base64');

    // Node.js 20 네이티브 FormData + Blob
    // Blob의 type은 application/octet-stream으로 고정
    // Whisper는 filename 확장자로 포맷 인식하므로 type은 무관
    const blob = new Blob([audioBuf], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob, 'audio.' + ext);
    formData.append('model', 'whisper-1');
    if (lang_mode === 'ko') {
        formData.append('language', 'ko');
    }

    const sttResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + API_KEY,
            // Content-Type은 설정하지 않음 — FormData가 boundary 포함해서 자동 설정
        },
        body: formData,
    });

    const responseText = await sttResponse.text();

    if (!sttResponse.ok) {
        console.error('[stt] status=' + sttResponse.status + ' body=' + responseText.slice(0, 300));
        return res.status(500).json({
            error: 'Whisper 오류 (' + sttResponse.status + '): ' + responseText.slice(0, 150)
        });
    }

    let sttData;
    try {
        sttData = JSON.parse(responseText);
    } catch (parseErr) {
        console.error('[stt] parse fail:', responseText.slice(0, 100));
        return res.status(500).json({ error: '응답 파싱 실패: ' + responseText.slice(0, 50) });
    }

    return res.status(200).json({ text: sttData.text || '' });

} catch (err) {
    console.error('[stt] catch:', err.message);
    return res.status(500).json({ error: err.message });
}
```

}

handler.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};

module.exports = handler;