// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.m4a');
        formData.append('model', 'whisper-1');
        formData.append('language', action === 'korean' ? 'ko' : 'en');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        let instruction = "";

        if (action === 'korean') {
            // ✨ 핵심: 문장 번역과 함께 중요한 3단어/표현을 추출하도록 강제
            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            이를 자연스러운 원어민 영어로 번역하고, 초보자가 꼭 배워야 할 가장 핵심적인 영어 표현이나 단어 3개를 뽑아주세요.
            반드시 아래 JSON 형식만 반환하세요.
            {
                "korean": "${userSpeech}",
                "english": "<자연스러운 영어 번역>",
                "key_expressions": [
                    {"en": "<영어표현1>", "ko": "<한국어 뜻>"},
                    {"en": "<영어표현2>", "ko": "<한국어 뜻>"},
                    {"en": "<영어표현3>", "ko": "<한국어 뜻>"}
                ]
            }`;
        } else {
            // ✨ 발음 평가 모드
            instruction = `
            목표 문장: "${target_english}"
            실제 발음: "${userSpeech}"
            두 문장을 비교하여 발음/유창성 점수(0~100)를 매기고, 피드백을 주세요.
            반드시 아래 JSON 형식만 반환하세요.
            {
                "score": <숫자>,
                "feedback": "<한국어 피드백>"
            }`;
        }

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
        const finalResult = JSON.parse(gptData.choices[0].message.content);
        res.status(200).json({ ...finalResult, user_speech: userSpeech });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
