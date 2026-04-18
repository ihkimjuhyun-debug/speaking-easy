// api/stt.js

module.exports = async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'API 키 없음' });

try {
    const { audio, mimeType, lang_mode } = req.body;
    if (!audio) return res.status(400).json({ error: '오디오 없음' });

    const resolvedMime = (mimeType || 'audio/webm').toLowerCase();
    let ext = 'webm';
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        ext = 'mp4';
    } else if (resolvedMime.includes('ogg')) {
        ext = 'ogg';
    }

    const audioBuf = Buffer.from(audio, 'base64');
    const boundary = 'FormBoundary' + Date.now() + Math.random().toString(36).slice(2);
    const CRLF = '\r\n';

    const body = Buffer.concat([
        Buffer.from(
            '--' + boundary + CRLF +
            'Content-Disposition: form-data; name="file"; filename="audio.' + ext + '"' + CRLF +
            'Content-Type: application/octet-stream' + CRLF + CRLF
        ),
        audioBuf,
        Buffer.from(
            CRLF + '--' + boundary + CRLF +
            'Content-Disposition: form-data; name="model"' + CRLF + CRLF +
            'whisper-1' + CRLF +
            (lang_mode === 'ko'
                ? '--' + boundary + CRLF +
                  'Content-Disposition: form-data; name="language"' + CRLF + CRLF +
                  'ko' + CRLF
                : '') +
            '--' + boundary + '--' + CRLF
        ),
    ]);

    const sttResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + API_KEY,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
        },
        body,
    });

    const text = await sttResponse.text();
    if (!sttResponse.ok) {
        console.error('[stt] whisper error:', text);
        return res.status(500).json({ error: 'Whisper 오류: ' + text.slice(0, 100) });
    }

    const data = JSON.parse(text);
    return res.status(200).json({ text: data.text || '' });

} catch (err) {
    console.error('[stt] catch:', err.message);
    return res.status(500).json({ error: err.message });
}
```

};

module.exports.config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } },
};