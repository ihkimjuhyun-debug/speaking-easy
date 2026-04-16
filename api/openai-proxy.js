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
            if (difficulty === 'beginner') diffContext = "아주 기초적인 단어와 짧고 쉬운 구조 사용";
            else if (difficulty === 'intermediate') diffContext = "원어민들이 자주 쓰는 일상적인 회화 표현과 숙어 사용";
            else if (difficulty === 'advanced') diffContext = "수준 높고 세련된 어휘, 복잡한 문장 구조 사용";

            // ✨ 핵심: keys 배열에 단어(word)와 그 단어가 포함된 실용적인 문장(en, ko)을 함께 요구합니다.
            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            선택된 난이도: ${diffContext}
            
            이 문장을 바탕으로 초보자를 위한 단계별 영어 레슨을 구성하세요.
            반드시 아래 JSON 형식만 반환하세요.
            {
                "title": "<상황 요약 2~3단어 제목>",
                "korean": "${userSpeech}",
                "english": "<난이도에 맞는 자연스러운 번역>",
                "keys": [
                    {
                        "word": "<핵심 단어나 숙어>", 
                        "en": "<이 단어가 포함된 일상에서 돌려 쓰기 좋은 짧은 문장 (예: I was happy to share different values.)>", 
                        "ko": "<위 문장의 한국어 뜻>"
                    },
                    {
                        "word": "<핵심 단어나 숙어>", 
                        "en": "<이 단어가 포함된 일상에서 돌려 쓰기 좋은 짧은 문장>", 
                        "ko": "<위 문장의 한국어 뜻>"
                    },
                    {
                        "word": "<핵심 단어나 숙어>", 
                        "en": "<이 단어가 포함된 일상에서 돌려 쓰기 좋은 짧은 문장>", 
                        "ko": "<위 문장의 한국어 뜻>"
                    }
                ],
                "drills": [
                    {"step": 1, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "none"},
                    {"step": 2, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "<문장 끝부분 1~2단어>"},
                    {"step": 3, "ko": "<상황이 살짝 바뀐 한국어>", "en_full": "<살짝 바뀐 영어 문장>", "blur_part": "<바뀐 부분>"},
                    {"step": 4, "ko": "<상황이 완전히 바뀐 한국어>", "en_full": "<완전히 바뀐 영어 문장>", "blur_part": "<문장의 70% 이상 길게>"},
                    {"step": 5, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "all"}
                ]
            }`;
        } else {
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
