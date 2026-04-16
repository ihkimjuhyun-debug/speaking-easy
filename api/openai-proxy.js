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
            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            이 문장을 바탕으로 초보자를 위한 단계별 영어 레슨을 구성하세요.
            
            반드시 아래 JSON 형식만 반환하세요.
            {
                "title": "<이 상황을 요약한 2~3단어 제목 (예: 놀이공원 가기)>",
                "korean": "${userSpeech}",
                "english": "<자연스러운 원어민 영어 번역>",
                "keys": [
                    {"en": "<핵심표현1>", "ko": "<뜻>"},
                    {"en": "<핵심표현2>", "ko": "<뜻>"},
                    {"en": "<핵심표현3>", "ko": "<뜻>"}
                ],
                "drills": [
                    {"step": 1, "ko": "<원래 한국어 문장>", "en_full": "<원래 영어 문장>", "blur_part": "<끝부분 명사/표현 1개>"},
                    {"step": 2, "ko": "<상황이 살짝 바뀐 한국어>", "en_full": "<살짝 바뀐 영어 문장>", "blur_part": "<바뀐 단어/표현>"},
                    {"step": 3, "ko": "<상황이 바뀐 한국어>", "en_full": "<살짝 바뀐 영어 문장>", "blur_part": "<절반 이상 길게>"},
                    {"step": 4, "ko": "<원래 한국어 문장>", "en_full": "<원래 영어 문장>", "blur_part": "<문장 전체>"}
                ]
            }`;
        } else {
            // 발음 평가 모드
            instruction = `
            목표 문장: "${target_english}"
            실제 발음: "${userSpeech}"
            두 문장을 비교해 발음/유창성 점수(0~100)를 매기고, 짧은 한국어 피드백 한 줄을 주세요.
            JSON 반환: {"score": <숫자>, "feedback": "<피드백>"}
            `;
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
