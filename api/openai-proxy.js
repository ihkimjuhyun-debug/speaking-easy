// /api/openai-proxy.js
// PolyGlot Master V41 - 백엔드 최종 안정화 버전

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;
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
            let levelInstr = difficulty === "beginner" ? "초급: 쉬운 단어 위주" : difficulty === "intermediate" ? "중급: 실생활/비즈니스 자연스러운 표현" : "고급: 학술적, 세련된 어휘";

            const instruction = `
            사용자의 말: "${userSpeech}"
            현재 난이도: ${levelInstr}
            
            [최우선 엄수 규칙]
            1. '원어민이 쓰는 가장 자연스러운 문장'으로 번역하세요. 
            2. "keys"는 문장 내 핵심 덩어리 표현을 "무조건 3개" 추출하세요. 문장이 짧아도 지어내서 채우세요.
            3. "vocab"은 훈련을 위한 핵심 단어를 "무조건 3개" 추출하세요.
            4. "dictionary"는 무조건 5개 이상 작성하세요.
            
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
                method: "POST", 
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" }, max_tokens: 3500 })
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
            const evalInstruction = `목표 문장: "${target_english}", 사용자 발음: "${userSpeech}". 
            [채점 규칙] 아주 관대하게 채점. "score"에는 10~100 사이 숫자만 반환.`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", 
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            res.status(200).json({ ...result, recognized_text: userSpeech });
        }
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
}
    if (!API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    try {
        // Whisper STT 요청 준비
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
        const userSpeech = sttData.text?.trim() || "";
        const lowerSpeech = userSpeech.toLowerCase();

        // ==================== Hallucination 필터 강화 ====================
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        const isHallucination = 
            lowerSpeech.includes("mbc") || 
            lowerSpeech.includes("amara") || 
            lowerSpeech.includes("thank you") ||
            lowerSpeech.includes("음") || 
            lowerSpeech.includes("네") || 
            lowerSpeech.includes("그래서") ||
            lowerSpeech.includes("음..") ||
            jpRegex.test(userSpeech);

        if (isHallucination || (action === 'korean' && userSpeech.length < 2)) {
            if (action === 'korean') {
                return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!" });
            } else {
                return res.status(200).json({ 
                    score: 0, 
                    feedback: "목소리가 너무 작거나 잡음이 섞였습니다. 다시 명확하게 발음해주세요.", 
                    recognized_text: "인식 실패" 
                });
            }
        }

        // ==================== 1. 한국어 → AI Lesson 생성 ====================
        if (action === 'korean') {
            const levelInstr = difficulty === "beginner" 
                ? "초급: 쉬운 단어 위주" 
                : difficulty === "intermediate" 
                ? "중급: 실생활/비즈니스 자연스러운 표현" 
                : "고급: 학술적, 세련된 어휘";

            const instruction = `
사용자의 말: "${userSpeech}"
현재 난이도: ${levelInstr}

[최우선 규칙]
- 원어민이 실제로 쓰는 가장 자연스러운 영어 문장으로 번역
- keys: 핵심 표현 3개 이상
- vocab: 핵심 단어 3개 이상
- dictionary: 최소 5개 이상

반드시 아래 JSON 형식으로만 답변하세요.`;

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
                const match = aiText.match(/```json\s*([\s\S]*?)\s*```/);
                parsedData = match ? JSON.parse(match[1]) : { error: "AI 응답 파싱 실패" };
            }

            return res.status(200).json(parsedData);
        }

        // ==================== 2. 발음 평가 (evaluate) ====================
        else {
            const evalInstruction = `목표 문장: "${target_english || '문장'}"
사용자 발음: "${userSpeech}"

아주 관대하게 채점하세요. 반드시 아래 JSON 형식으로만 답변:
{"score": 85, "feedback": "자연스럽고 좋은 발음입니다. intonation이 조금 더 부드러우면 완벽해요."}`;

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

            let result;
            try {
                result = JSON.parse(gptData.choices[0].message.content);
            } catch (e) {
                result = { score: 65, feedback: "발음 평가 중 문제가 발생했습니다. 다시 시도해주세요." };
            }

            return res.status(200).json({
                ...result,
                recognized_text: userSpeech
            });
        }

    } catch (error) {
        console.error("API 오류:", error);
        return res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
    }
}
