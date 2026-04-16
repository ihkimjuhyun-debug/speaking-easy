// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.m4a');
        formData.append('model', 'whisper-1');
        if (lang_mode === 'ko') formData.append('language', 'ko');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        const lowerSpeech = userSpeech.toLowerCase();
        const isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || userSpeech.trim().length < 2;
        if (isHallucination && action === 'korean') return res.status(200).json({ error: "음성이 명확하지 않습니다. 다시 말씀해주세요!" });

        if (action === 'korean') {
            let levelInstruction = difficulty === "beginner" ? "IELTS 3-5수준 기초" : difficulty === "intermediate" ? "IELTS 5.5-7.5수준 실용" : "IELTS 8-9수준 고급";
            const instruction = `
            사용자의 말: "${userSpeech}"
            난이도: ${levelInstruction}
            규칙: 덩어리 표현(keys) 3개와 핵심 단어(vocab) 3개를 추출하세요.
            반환 구조:
            {
                "title": "요약", "korean": "전체한글", "english": "전체영어",
                "keys": [{ "phrase": "덩어리", "ko_org": "한글", "en_org": "영어", "ko_var": "변형한", "en_var": "변형영" }],
                "drills": [{"step": 1, "ko": "한글", "en_full": "영어", "blur_part": "none"}],
                "vocab": [{ "word": "단어", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"] }]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            res.status(200).json({ ...JSON.parse(gptData.choices[0].message.content), recognized_text: userSpeech });
        } else {
            const instruction = `목표: "${target_english}", 인식: "${userSpeech}". 점수(0-100)와 피드백을 JSON {"score": <num>, "feedback": "<str>"}으로 주세여.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            res.status(200).json({ ...JSON.parse(gptData.choices[0].message.content), recognized_text: userSpeech });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
}
