// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english } = req.body;
    
    // 🔒 보안: 서버의 환경변수에서 키를 읽어옵니다. (절대 실제 키를 여기에 적지 마세요!)
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "환경변수(API_KEY)가 설정되지 않았습니다. Vercel 설정을 확인해주세요." });
    }

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.m4a');
        formData.append('model', 'whisper-1');
        formData.append('language', action === 'korean' ? 'ko' : 'en');

        // 1. Whisper (음성 -> 텍스트)
        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        // 2. GPT (번역 또는 발음 평가)
        const instruction = action === 'korean' 
            ? `Translate "${userSpeech}" to trendy casual English. JSON ONLY: {"korean":"${userSpeech}", "english":"..."}`
            : `User read "${target_english}", actual speech was "${userSpeech}". Rate 0-100 & give 1-line Korean feedback. JSON ONLY: {"score":0, "feedback":"..."}`;

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: instruction }],
                response_format: { type: "json_object" }
            })
        });

        const gptData = await gptResponse.json();
        const feedback = JSON.parse(gptData.choices[0].message.content);

        res.status(200).json({ ...feedback, user_speech: userSpeech });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}