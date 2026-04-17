// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');
        
        if (action === 'korean') {
            if (lang_mode === 'ko') formData.append('language', 'ko');
        } else if (action === 'evaluate') {
            formData.append('language', 'en');
            if (target_english && !target_english.includes("?")) {
                formData.append('prompt', target_english); 
            }
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        if (action === 'korean') {
            const levelContext = difficulty === "beginner" ? "초급(기초)" : difficulty === "intermediate" ? "중급(실용)" : "고급(전문)";
            
            let instruction = `
            사용자의 말: "${userSpeech}"
            난이도: ${levelContext}
            
            [미션]
            1. 사용자의 의도를 파악해 '일상 대화형' 문장으로 교정하세요. 
               (예: "자전거 고쳤다" -> "I'm going to the bike shop to pick up my fixed bike.")
            2. "title_ko"는 한국어 소제목, "title_en"은 영어 메인 제목으로 작성 (중복 금지).
            3. "dictionary"는 문장의 모든 단어를 포함할 것.
            4. "vocab"은 난이도에 맞는 핵심 어휘 3개 (뜻 오답 2개, 스펠링 헷갈리는 영어 오답 2개 포함).
            
            반환 형식: JSON
            {
                "title_ko": "소제목(한국어)", "title_en": "Main Title(English)",
                "korean": "자연스러운 한국어 문장", "english": "교정된 원어민식 영어 문장",
                "dictionary": { "word": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "expression": "예시", "other_forms": "변형" } },
                "keys": [ { "phrase": "표현", "ko_org": "원문한글", "en_org": "원문영어", "ko_var": "변형한글", "en_var": "변형영어" } ],
                "drills": [ 
                    {"step": 1, "ko": "한글", "en_full": "영어", "blur_part": "none"},
                    {"step": 2, "ko": "한글", "en_full": "영어", "blur_part": "핵심어"},
                    {"step": 3, "ko": "한글", "en_full": "영어", "blur_part": "all"}
                ],
                "vocab": [ { "word": "단어", "meaning": "뜻", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] } ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            // 평가 로직: 숫자만 반환하도록 엄격히 지시
            const evalInstruction = `목표: "${target_english}", 사용자: "${userSpeech}". 점수(10-100)와 피드백을 JSON {"score": 숫자, "feedback": "문장"}으로만 반환.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            res.status(200).json({ ...result, recognized_text: userSpeech });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
