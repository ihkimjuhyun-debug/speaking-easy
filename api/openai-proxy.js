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
            if (difficulty === 'beginner') diffContext = "초급: 아주 기초적이고 쉬운 단어 사용";
            else if (difficulty === 'intermediate') diffContext = "중급: 일상 회화 표현과 자연스러운 숙어 사용";
            else if (difficulty === 'advanced') diffContext = "상급: 고급 어휘와 세련된 문장 구조 사용";

            // ✨ 핵심: 뜬금없는 문장이 나오지 않도록 '원본 맥락 유지'를 강제합니다.
            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            난이도: ${diffContext}
            
            초보자를 위한 입체적인 영어 레슨을 구성하세요. 
            [중요 규칙] 변형(Variation)을 만들 때 절대 뜬금없는 주제(예: 배고픈 이야기 중 갑자기 기타 치는 이야기)를 만들지 마세요. 반드시 사용자의 원래 이야기 맥락(Context)을 유지하면서 주어, 시제, 긍정/부정만 변형하세요.
            
            반드시 아래 JSON 형식만 반환하세요.
            {
                "title": "<상황 요약 2~3단어 제목>",
                "korean": "${userSpeech}",
                "english": "<원어민식 번역>",
                "keys": [
                    {
                        "word": "<핵심단어1>", 
                        "ko_org": "<원본 이야기 중 이 단어가 포함된 문장>", 
                        "en_org": "<ko_org의 영어 번역>",
                        "ko_var": "<ko_org를 기반으로 주어나 시제만 바꾼 변형 문장>",
                        "en_var": "<ko_var의 영어 번역>"
                    },
                    {
                        "word": "<핵심단어2>", 
                        "ko_org": "<원본 이야기 중 이 단어가 포함된 문장>", 
                        "en_org": "<ko_org의 영어 번역>",
                        "ko_var": "<ko_org를 기반으로 긍정/부정을 바꾼 변형 문장>",
                        "en_var": "<ko_var의 영어 번역>"
                    },
                    {
                        "word": "<핵심단어3>", 
                        "ko_org": "<원본 이야기 중 이 단어가 포함된 문장>", 
                        "en_org": "<ko_org의 영어 번역>",
                        "ko_var": "<ko_org를 기반으로 의문문이나 시제를 바꾼 변형 문장>",
                        "en_var": "<ko_var의 영어 번역>"
                    }
                ],
                "drills": [
                    {"step": 1, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "none"},
                    {"step": 2, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "<핵심 단어들>"},
                    {"step": 3, "ko": "<원본 주제를 유지한 채 주어나 상황을 조금 바꾼 이야기>", "en_full": "<바뀐 영어 문장>", "blur_part": "none"},
                    {"step": 4, "ko": "<3번의 변형 이야기>", "en_full": "<바뀐 영어 문장>", "blur_part": "<바뀐 핵심 부분>"},
                    {"step": 5, "ko": "${userSpeech}", "en_full": "<원래 번역 문장>", "blur_part": "all"}
                ]
            }`;
        } else {
            instruction = `
            목표 문장: "${target_english}"
            실제 발음: "${userSpeech}"
            두 문장을 비교해 발음/유창성 점수(0~100)를 매기고 피드백을 주세요.
            JSON 반환: {"score": <숫자>, "feedback": "<짧고 다정한 한국어 피드백>"}
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
