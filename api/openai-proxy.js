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
            method: "POST", 
            headers: { "Authorization": `Bearer ${API_KEY}` }, 
            body: formData
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
            // ✅ BUG FIX: 난이도별 안내 명확화
            let levelInstr = difficulty === "beginner" 
                ? "초급: 쉬운 단어 위주, 짧고 간단한 문장" 
                : difficulty === "intermediate" 
                ? "중급: 실생활/비즈니스 자연스러운 표현" 
                : "고급: 학술적, 세련된 어휘";

            const instruction = `
            사용자의 말: "${userSpeech}"
            현재 난이도: ${levelInstr}
            
            [최우선 엄수 규칙]
            1. '원어민이 쓰는 가장 자연스러운 문장'으로 번역하세요. 
            2. "keys"는 문장 내 핵심 덩어리 표현을 반드시 정확히 3개 추출하세요. 문장이 짧아도 반드시 3개를 채우세요. 절대 3개 미만 반환 금지.
            3. "vocab"은 훈련을 위한 핵심 단어를 반드시 정확히 3개 추출하세요. 절대 3개 미만 반환 금지.
            4. "dictionary"는 무조건 5개 이상 작성하세요.
            5. keys의 "phrase" 필드에는 반드시 실제 영어 표현만 들어가야 합니다. "none" 같은 값 절대 금지.
            6. "blur_part"에는 흐리게 처리할 핵심 단어(영어, 소문자)를 넣거나, 없으면 "none"으로 설정하세요.
            
            반환 JSON 구조:
            {
                "title_ko": "상황 요약",
                "title_en": "영어 메인 제목",
                "korean": "자연스러운 한국어",
                "english": "원어민식 영어 문장",
                "dictionary": {
                    "word1": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "ko_context": "한국어로 이렇게 말했어요: [맥락]" },
                    "word2": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "ko_context": "한국어로 이렇게 말했어요: [맥락]" },
                    "word3": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "ko_context": "한국어로 이렇게 말했어요: [맥락]" },
                    "word4": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "ko_context": "관련 단어" },
                    "word5": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "ko_context": "관련 단어" }
                },
                "keys": [
                    { "phrase": "표현1", "ko_org": "해석1", "en_org": "원문1", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현2", "ko_org": "해석2", "en_org": "원문2", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현3", "ko_org": "해석3", "en_org": "원문3", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "해석", "en_full": "전체문장", "blur_part": "none"},
                    {"step": 2, "ko": "해석", "en_full": "전체문장", "blur_part": "핵심단어(소문자)"},
                    {"step": 3, "ko": "해석", "en_full": "전체문장", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어1", "meaning": "뜻1", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어2", "meaning": "뜻2", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어3", "meaning": "뜻3", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] }
                ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", 
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" }, 
                    max_tokens: 3500 
                })
            });
            const gptData = await gptResponse.json();
            
            let aiText = gptData.choices[0].message.content;
            let parsedData;
            try {
                parsedData = JSON.parse(aiText);
            } catch (err) {
                const match = aiText.match(/```json\n([\s\S]*?)\n```/);
                if (match) parsedData = JSON.parse(match[1]);
                else throw new Error("AI 포맷 오류");
            }
            return res.status(200).json(parsedData);
            
        } else {
            // ✅ BUG FIX: target_english가 없거나 "???" 포함시 빈 문자열로 대체 방지
            const cleanTarget = (target_english || "").replace(/\?+/g, "").trim();
            
            if (!cleanTarget) {
                return res.status(200).json({ 
                    score: 0, 
                    feedback: "평가할 텍스트가 없습니다.", 
                    recognized_text: userSpeech 
                });
            }

            const evalInstruction = `목표 문장: "${cleanTarget}", 사용자 발음: "${userSpeech}". 
            [채점 규칙] 
            - 목표 문장과 사용자가 말한 내용을 비교해서 발음 정확도를 채점하세요.
            - 아주 관대하게 채점하세요. 비슷하게 발음했으면 높은 점수를 주세요.
            - "score"에는 10~100 사이 정수만 반환하세요.
            - "feedback"에는 한국어로 간단한 피드백을 작성하세요.
            JSON 형식으로만 반환: {"score": 숫자, "feedback": "피드백"}`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", 
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            const gptData = await gptResponse.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            res.status(200).json({ ...result, recognized_text: userSpeech });
        }
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
}
