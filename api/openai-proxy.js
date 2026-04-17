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

        let instruction = "";

        if (action === 'korean') {
            const langContext = lang_mode === 'focus90' 
                ? "[LANGUAGE FOCUS: 90% English / 10% Korean] 한국/영어가 섞여 있습니다. 의도를 파악해 90% 세련된 영어로 교정하고, 10% 한국어는 의미 설명에만 사용하세요."
                : "사용자는 한국어로 말했습니다. 이를 원어민식 영어로 번역하세요.";

            let levelInstruction = difficulty === "beginner" 
                ? "[난이도: 초급] 어휘 수준: 기초."
                : difficulty === "intermediate" 
                ? "[난이도: 중급] 어휘 수준: 실용/비즈니스."
                : "[난이도: 고급] 어휘 수준: 학술/철학.";

            instruction = `
            사용자의 말: "${userSpeech}"
            ${langContext}
            ${levelInstruction}
            
            [필수 엄수 규칙 - 특히 Phrase Master 강화]
            1. "keys" 배열에는 **실제 일상 대화에서 자연스럽게 쓰이는 문장** 3개를 만들어야 합니다.
               - 단순한 단어/구가 아니라, **완전한 문장 형태**로 만들어 주세요.
               - 예시: "repaired bicycle" 대신 → "I went to the bike shop to pick up my repaired bike."
               - 한국어 예시: "나는 고쳐진 바이크를 챙기기 위해 자전거 수리점에 가요"
               - 변형도 자연스럽게: "bike that was fixed", "my bike after repair" 등이 아니라 **실제 대화처럼** 만들어 주세요.
            
            2. 각 key에는 반드시 아래 필드를 모두 채워주세요:
               - phrase: 핵심 덩어리 표현 (짧은 제목)
               - ko_org: 원본 한국어 문장
               - en_org: 자연스러운 영어 문장
               - ko_var: 변형 한국어 문장 (같은 의미지만 다른 표현)
               - en_var: 변형 영어 문장 (더 자연스럽거나 다른 뉘앙스)
            
            3. "vocab" 배열에는 핵심 단어 3개를 추출 (오답 2개 + 헷갈리는 스펠링 2개 포함).
            4. "dictionary"에는 영어 문장에 나온 모든 단어의 소문자 원형 정보를 100% 채워주세요.
            5. "title_ko"와 "title_en"도 자연스럽게 만들어 주세요.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title_ko": "상황 요약 제목 (한국어)",
                "title_en": "상황 요약 제목 (영어)",
                "korean": "사용자 의도를 정리한 완벽한 한글 문장",
                "english": "세련되게 교정된 전체 영어 문장",
                "dictionary": { ... },
                "keys": [
                    { "phrase": "...", "ko_org": "...", "en_org": "...", "ko_var": "...", "en_var": "..." },
                    { "phrase": "...", "ko_org": "...", "en_org": "...", "ko_var": "...", "en_var": "..." },
                    { "phrase": "...", "ko_org": "...", "en_org": "...", "ko_var": "...", "en_var": "..." }
                ],
                "drills": [ ... ],
                "vocab": [ ... ]
            }`;
        } else {
            instruction = `목표 문장: "${target_english}", 실제 발음: "${userSpeech}". 
            [채점 규칙]
            1. 발음이 완벽하지 않아도 관대하게 채점하세요.
            2. score는 10~100 사이의 정수만 넣으세요.
            반환: JSON {"score": 85, "feedback": "<문장>"}`;
        }

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
        });

        const gptData = await gptResponse.json();
        const finalResult = JSON.parse(gptData.choices[0].message.content);
        res.status(200).json({ ...finalResult, recognized_text: userSpeech });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
}