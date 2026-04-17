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
        
        // 연습 모드일 땐 영어를, 한국어 모드일 땐 한국어 위주로 강제 세팅
        if (action === 'evaluate') {
            formData.append('language', 'en');
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
        
        // 🚨 연습 모드에서는 1~2글자의 짧은 단어도 인식해야 하므로 메인 녹음에만 길이 제한 적용
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
            let levelInstr = "";
            if (difficulty === "beginner") levelInstr = "초급(Beginner): 아주 기초적인 단어와 간단한 1형식/3형식 문장 위주로 구성. 어려운 숙어 배제.";
            else if (difficulty === "intermediate") levelInstr = "중급(Intermediate): 실생활과 비즈니스에서 가장 많이 쓰이는 자연스러운 원어민 표현 및 연어(Collocation) 적극 사용.";
            else levelInstr = "고급(Advanced): 전문적이고 학술적이거나 깊이 있는 철학적 표현, 세련된 고급 어휘 및 복잡한 문장 구조 사용.";

            const instruction = `
            사용자의 말: "${userSpeech}"
            현재 난이도: ${levelInstr}
            
            [최우선 엄수 규칙: 심호흡을 하고 최대한 꼼꼼하게 작성하세요]
            1. 현재 난이도 수준에 정확히 맞춰서 '원어민이 쓰는 가장 자연스러운 문장'으로 번역하세요.
            2. "keys"는 문장 내 핵심 덩어리 표현을 무조건 **정확히 3개** 추출하세요. 
               - 각 표현마다 [원문(org), 변형1(var1), 변형2(var2), 부사추가 긴 문장(long)] 데이터를 모두 생성하세요.
            3. "vocab"은 난이도에 맞는 핵심 단어 3개 (한글 뜻 오답 2개, 스펠링 헷갈리는 영어 오답 2개 반드시 포함).
            4. "dictionary"는 생성된 "english" 문장에 쓰인 **단어 100% 빠짐없이 모조리** 추출하여 뉘앙스와 자주 쓰이는 표현(Collocation)을 깊이 있게 작성하세요. (Key값은 특수기호를 제거한 소문자로 작성. 예: don't -> dont)
            
            반환 JSON 구조:
            {
                "title_ko": "짧은 상황 요약",
                "title_en": "세련된 영어 메인 제목",
                "korean": "자연스러운 한국어",
                "english": "원어민식 영어 문장",
                "dictionary": {
                    "dont": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "expression": "원어민 뉘앙스 및 연어 설명" }
                },
                "keys": [
                    { "phrase": "표현1", "ko_org": "원문해석", "en_org": "원문영어", "ko_var1": "변형1해석", "en_var1": "변형1영어", "ko_var2": "변형2해석", "en_var2": "변형2영어", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현2", "ko_org": "원문해석", "en_org": "원문영어", "ko_var1": "변형1해석", "en_var1": "변형1영어", "ko_var2": "변형2해석", "en_var2": "변형2영어", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현3", "ko_org": "원문해석", "en_org": "원문영어", "ko_var1": "변형1해석", "en_var1": "변형1영어", "ko_var2": "변형2해석", "en_var2": "변형2영어", "ko_long": "추가해석", "en_long": "추가영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "해석", "en_full": "전체 문장", "blur_part": "none"},
                    {"step": 2, "ko": "해석", "en_full": "전체 문장", "blur_part": "핵심표현"},
                    {"step": 3, "ko": "해석", "en_full": "전체 문장", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] }
                ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            const evalInstruction = `목표 문장: "${target_english}", 사용자 실제 발음: "${userSpeech}". 
            [채점 규칙] 아주 관대하게 채점하되, "score" 항목에는 오직 10에서 100 사이의 '숫자(정수)'만 반환하세요.`;

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
