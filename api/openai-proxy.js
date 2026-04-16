// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english, difficulty } = req.body;
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
            let diffContext = "";
            if (difficulty === 'beginner') diffContext = "초급: 기초적이고 쉬운 단어 사용";
            else if (difficulty === 'intermediate') diffContext = "중급: 일상 회화 표현과 자연스러운 숙어 사용";
            else if (difficulty === 'advanced') diffContext = "상급: 고급 어휘와 세련된 문장 구조 사용";

            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            난이도: ${diffContext}
            
            초보자를 위한 입체적인 영어 레슨을 구성하세요. 단어 반복을 피하고 다양한 바리에이션을 적용하세요.
            반드시 아래 JSON 형식만 반환하세요.
            {
                "title": "<상황 요약 2~3단어 제목>",
                "korean": "${userSpeech}",
                "english": "<원어민식 번역>",
                "keys": [
                    {"word": "<핵심단어1>", "en": "<이 단어를 활용한 완전히 다른 예문>", "ko": "<뜻>"},
                    {"word": "<핵심단어2>", "en": "<이 단어를 활용한 완전히 다른 예문>", "ko": "<뜻>"},
                    {"word": "<핵심단어3>", "en": "<이 단어를 활용한 완전히 다른 예문>", "ko": "<뜻>"}
                ],
                "drills": [
                    {"step": 1, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "none"},
                    {"step": 2, "ko": "<명사나 목적어가 다른 것으로 바뀐 문장 (예: 진정한 우정 -> 진정한 사랑)>", "en_full": "<바뀐 영어 문장>", "blur_part": "<바뀐 단어 부분>"},
                    {"step": 3, "ko": "<부정문이나 의문문으로 변형된 문장 (예: 진정한 우정을 원하지 않는다)>", "en_full": "<바뀐 영어 문장>", "blur_part": "<동사/부정어 부분>"},
                    {"step": 4, "ko": "<시제나 주어가 완전히 바뀐 문장 (예: 그들은 진정한 가족을 원했다)>", "en_full": "<바뀐 영어 문장>", "blur_part": "<절반 이상>"},
                    {"step": 5, "ko": "<1번 문장에 부사나 수식어가 붙어 더 길고 풍성해진 문장>", "en_full": "<길어진 영어 문장>", "blur_part": "all"}
                ]
            }`;
        } else {
            instruction = `
            목표 문장: "${target_english}"
            실제 발음: "${userSpeech}"
            두 문장을 비교해 발음/유창성 점수(0~100)를 매기고, 짧고 다정한 한국어 피드백을 주세요.
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
