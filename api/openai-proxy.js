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
        
        // 🚨 마이크 환각 차단 및 언어 강제 세팅
        if (action === 'evaluate') {
            formData.append('language', 'en');
            if (target_english && !target_english.includes("?")) {
                formData.append('prompt', target_english); 
            }
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
            
            [최우선 엄수 규칙: 심호흡을 하고 최대한 꼼꼼하고 세심하게 작성하세요]
            1. '원어민이 실생활에서 쓰는 자연스러운 문장'으로 번역하세요.
            2. "keys"는 문장 내 핵심 덩어리 표현을 무조건 **정확히 3개** 추출하세요. 
               - [원문(org), 변형1(var1), 변형2(var2), 부사추가(long)] 데이터를 모두 생성해야 합니다.
            3. "vocab"은 8단계 훈련을 위한 핵심 단어 3개 (한글 뜻 오답 2개, 스펠링 헷갈리는 영어 오답 2개 포함).
            4. 🌟 "dictionary"는 극한의 디테일로 작성하세요!
               - 생성된 "english" 문장에 쓰인 **단어 100% 빠짐없이 모조리** (a, the, in, it 같은 관사/전치사/대명사 조차도 모두) key로 만드세요.
               - 프론트엔드 매칭을 위해 Key 값은 반드시 '특수기호를 뺀 순수 알파벳 소문자'로만 작성하세요 (예: "don't" -> "dont", "I'm" -> "im").
               - "expression"에는 해당 단어의 원어민식 뉘앙스나 자주 쓰이는 연어(Collocation)를 깊이 있게 설명하세요.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title_ko": "짧은 한국어 상황 요약",
                "title_en": "세련된 영어 메인 제목",
                "korean": "자연스럽게 다듬어진 한국어 문장",
                "english": "교정된 완벽한 원어민식 영어 문장",
                "dictionary": {
                    "dont": { "ko": "뜻", "pos": "품사", "phonetics": "발음기호", "expression": "원어민 뉘앙스 및 실제 자주 쓰이는 연어/숙어 세밀하게", "other_forms": "시제/복수형 파생" }
                },
                "keys": [
                    { "phrase": "핵심표현1", "ko_org": "원문해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1문장", "ko_var2": "변형2해석", "en_var2": "변형2문장", "ko_long": "부사추가해석", "en_long": "부사추가문장" },
                    { "phrase": "핵심표현2", "ko_org": "원문해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1문장", "ko_var2": "변형2해석", "en_var2": "변형2문장", "ko_long": "부사추가해석", "en_long": "부사추가문장" },
                    { "phrase": "핵심표현3", "ko_org": "원문해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1문장", "ko_var2": "변형2해석", "en_var2": "변형2문장", "ko_long": "부사추가해석", "en_long": "부사추가문장" }
                ],
                "drills": [
                    {"step": 1, "ko": "한국어 번역", "en_full": "전체 영어 문장", "blur_part": "none"},
                    {"step": 2, "ko": "한국어 번역", "en_full": "전체 영어 문장", "blur_part": "핵심표현1"},
                    {"step": 3, "ko": "한국어 번역", "en_full": "전체 영어 문장", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어1", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어2", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어3", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] }
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
            [채점 규칙] 관대하게 채점하되, "score" 항목에는 '점' 같은 글자를 절대 넣지 말고 오직 10에서 100 사이의 '숫자(정수)'만 반환하세요.`;

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
