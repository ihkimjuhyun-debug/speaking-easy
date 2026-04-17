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
        
        if (action === 'evaluate') formData.append('language', 'en');
        else if (lang_mode === 'ko') formData.append('language', 'ko');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        const lowerSpeech = userSpeech.toLowerCase();
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        
        let isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || jpRegex.test(userSpeech);
        if (action === 'korean' && userSpeech.trim().length < 2) isHallucination = true;

        if (isHallucination) {
            if (action === 'korean') {
                return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!" });
            } else {
                return res.status(200).json({ score: 0, feedback: "목소리가 너무 작거나 잡음이 섞였습니다. 다시 명확하게 발음해주세요.", recognized_text: "인식 실패" });
            }
        }

        if (action === 'korean') {
            let levelInstr = difficulty === "beginner" ? "초급: 쉬운 단어 위주" : difficulty === "intermediate" ? "중급: 실생활/비즈니스 자연스러운 표현" : "고급: 학술적, 세련된 어휘";

            // 🌟 1. 데이터 과부하 방지를 위한 핵심 단어(3~4개) 타겟팅
            // 🌟 2. happen to / accidentally 강도 차이 등 디테일한 뉘앙스 룰 적용
            const instruction = `
            사용자의 말: "${userSpeech}"
            현재 난이도: ${levelInstr}
            
            [최우선 엄수 규칙]
            1. '원어민이 쓰는 가장 자연스러운 문장'으로 번역하세요. (주의: 의도치 않은 우연을 표현할 때 'accidentally'보다 'happen to'의 문법적/어감적 강도가 더 높다는 점 등 미묘한 뉘앙스 차이를 엄격히 반영하세요).
            2. "keys"는 문장 내 핵심 덩어리 표현을 정확히 3개 추출. (각 8단계 변형 포함: org, var1, var2, long)
            3. "vocab"은 훈련을 위한 3개 단어 (오답 포함).
            4. "dictionary"는 한국어에서 영어로 번역할 때 까다로운 뉘앙스(예: 이것저것, 막상, happen to 등)나 원어민 핵심 단어 **최대 3~4개만** 선별하세요. 
               - 각 단어의 'ko_context'에는 사용자가 말했던 한국어 맥락을 반드시 포함하세요. (형식: "한국어로 이렇게 말했어요: 나는 [이것저것] 구경했어!")
               - Key값은 특수기호를 제거한 소문자로 작성 (예: don't -> dont).
            
            반환 JSON 구조:
            {
                "title_ko": "짧은 상황 요약",
                "title_en": "세련된 영어 메인 제목",
                "korean": "자연스러운 한국어",
                "english": "원어민식 영어 문장",
                "dictionary": {
                    "stuff": { "ko": "이것저것, 물건", "pos": "명사", "phonetics": "/stʌf/", "ko_context": "한국어로 이렇게 말했어요: 나는 [이것저것] 샀어!" }
                },
                "keys": [
                    { "phrase": "표현1", "ko_org": "해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "해석", "en_full": "전체", "blur_part": "none"},
                    {"step": 2, "ko": "해석", "en_full": "전체", "blur_part": "핵심표현"},
                    {"step": 3, "ko": "해석", "en_full": "전체", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] }
                ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                // 🌟 max_tokens 확장을 통해 JSON이 짤리는 현상 완벽 차단
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" }, max_tokens: 3000 })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            const evalInstruction = `목표 문장: "${target_english}", 사용자 실제 발음: "${userSpeech}". 
            [채점 규칙] 아주 관대하게 채점. "score" 항목에는 10에서 100 사이의 '숫자'만 반환.`;

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
