// /api/stt.js
// 역할: 음성 → 텍스트 변환만 담당 (Whisper STT)
// 실행시간: 3~5초 → Vercel Hobby 10초 제한 안전

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

```
const { audio, mimeType, lang_mode } = req.body;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

try {
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
    const text = sttData.text || "";

    res.status(200).json({ text });

} catch (error) {
    res.status(500).json({ error: error.message });
}
```

}