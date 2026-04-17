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
        
        // 🚨 마이크 환각 차단 (MBC, Amara 등)
        if (action === 'evaluate') {
            formData.append('language', 'en');
            if (target_english && !target_english.includes("?")) formData.append('prompt', target_english); 
        } else if (lang_mode === 'ko') {
            formData.append('language', 'ko');
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        const lowerSpeech = userSpeech.toLowerCase();
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        const isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || jpRegex.test(userSpeech) || userSpeech.trim().length < 2;

        if (isHallucination) {
            if (action === 'korean') {
                return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!" });
            } else {
                return res.status(200).json({ score: 0, feedback: "잡음이 섞였거나 목소리가 너무 작습니다. 다시 명확하게 발음해주세요!", recognized_text: "인식 실패 (잡음)" });
            }
        }

        if (action === 'korean') {
            const levelInstr = difficulty === "beginner" ? "초급(기초 단어 위주)" : difficulty === "intermediate" ? "중급(실용/비즈니스 위주)" : "고급(전문/철학/학술 위주)";
            const instruction = `
            사용자의 말: "${userSpeech}"
            난이도 설정: ${levelInstr}
            
            [최우선 엄수 규칙]
            1. '원어민이 실생활에서 쓰는 일상 대화형 문장'으로 번역 (예: "자전거 고쳐서 챙기러 가" -> "I need to stop by the shop to pick up my fixed bike.")
            2. "title_ko"는 한국어 소제목, "title_en"은 영어 메인 제목.
            3. "vocab"은 난이도에 맞는 핵심 단어 3개. (스펠링이 헷갈리는 영어 오답 2개 필수).
            4. "dictionary"는 문장에 쓰인 모든 단어(100%) 분석.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title_ko": "짧은 한국어", "title_en": "영어 메인 제목", "korean": "자연스러운 한국어", "english": "완벽한 영어",
                "dictionary": { "word1": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "expression": "예시", "other_forms": "변형" } },
                "keys": [ { "phrase": "표현", "ko_org": "한글", "en_org": "영어", "ko_var": "응용", "en_var": "응용영어" } ],
                "drills": [ {"step": 1, "ko": "한글", "en_full": "영어", "blur_part": "none"}, {"step": 2, "ko": "한글", "en_full": "영어", "blur_part": "핵심표현"}, {"step": 3, "ko": "한글", "en_full": "영어", "blur_part": "all"} ],
                "vocab": [ { "word": "단어", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] } ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            const evalInstruction = `목표 문장: "${target_english}", 사용자 실제 발음: "${userSpeech}". 
            [채점 규칙] 관대하게 채점하되, "score" 항목에는 '점' 같은 글자를 절대 넣지 말고 오직 10에서 100 사이의 '숫자(정수)'만 반환.
            반환 예시: JSON {"score": 85, "feedback": "매우 훌륭합니다."}`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            // ✨ 사용자 음성을 정확히 반환
            res.status(200).json({ ...result, recognized_text: userSpeech });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
