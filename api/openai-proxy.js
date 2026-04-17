// /api/openai-proxy.js
// 역할: 발음 평가(evaluate)만 담당 - STT + 채점
// korean 분석은 /api/stt + /api/analyze 로 분리됨
// 실행시간: 4~7초 → Vercel Hobby 10초 안전

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

```
const { audio, mimeType, target_english } = req.body;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

try {
    // iOS 호환: MIME 타입 → 파일 확장자
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
    formData.append('language', 'en');

    const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}` },
        body: formData
    });
    const sttData = await sttResponse.json();
    const userSpeech = sttData.text || "";

    // 발음 평가할 텍스트 없으면 바로 반환
    const cleanTarget = (target_english || "").replace(/\?+/g, "").trim();
    if (!cleanTarget) {
        return res.status(200).json({
            score: 0,
            feedback: "평가할 텍스트가 없습니다.",
            recognized_text: userSpeech
        });
    }

    const evalInstruction = `목표: "${cleanTarget}", 발음: "${userSpeech}". 관대하게 채점. JSON: {"score": 10~100정수, "feedback": "한국어피드백"}`;

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: evalInstruction }],
            response_format: { type: "json_object" },
            max_tokens: 100
        })
    });

    const gptData = await gptResponse.json();
    const result = JSON.parse(gptData.choices[0].message.content);
    res.status(200).json({ ...result, recognized_text: userSpeech });

} catch (error) {
    res.status(500).json({ error: error.message });
}
```

}