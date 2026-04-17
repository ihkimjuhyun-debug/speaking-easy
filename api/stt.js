// /api/stt.js - 음성 → 텍스트 변환 전용

export const config = {
api: { bodyParser: { sizeLimit: ‘10mb’ } }, // 오디오 base64 크기 대응
maxDuration: 10,
};

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

try {
    const { audio, mimeType, lang_mode } = req.body;
    if (!audio) return res.status(400).json({ error: "오디오 데이터 없음" });

    // iOS: audio/mp4 → .m4a, Chrome: audio/webm → .webm
    const resolvedMime = mimeType || 'audio/webm';
    let fileExt = 'webm';
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        fileExt = 'm4a';
    } else if (resolvedMime.includes('ogg')) {
        fileExt = 'ogg';
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const blob = new Blob([audioBuffer], { type: resolvedMime });
    const formData = new FormData();
    formData.append('file', blob, `audio.${fileExt}`);
    formData.append('model', 'whisper-1');
    if (lang_mode === 'ko') formData.append('language', 'ko');

    const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}` },
        body: formData
    });

    const sttData = await sttResponse.json();

    if (!sttResponse.ok) {
        return res.status(500).json({ error: `Whisper 오류: ${sttData.error?.message || sttResponse.status}` });
    }

    res.status(200).json({ text: sttData.text || "" });

} catch (error) {
    res.status(500).json({ error: error.message });
}
```

}