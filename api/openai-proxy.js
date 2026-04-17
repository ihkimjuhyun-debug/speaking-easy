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
        
        // ✨ 핵심 버그 픽스: 액션에 따른 언어 강제 지정 및 프롬프트 힌트 제공
        if (action === 'korean') {
            if (lang_mode === 'ko') formData.append('language', 'ko');
        } else if (action === 'evaluate') {
            // 발음 평가 시 영어를 강제하고, 목표 문장을 힌트로 주어 'MBC' 등의 잡음 환각을 100% 차단합니다.
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
        // 환각 필터링 강화
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
                ? "[난이도: 초급] 어휘 수준: 기초. (예: 희생하다 sacrifice, 대표하다 represent 등 필수 기초 단어 위주)"
                : difficulty === "intermediate" 
                ? "[난이도: 중급] 어휘 수준: 실용/비즈니스. (예: 추구하다 pursue, 현실화하다 realize 등 원어민 중급 어휘 위주)"
                : "[난이도: 고급] 어휘 수준: 학술/철학. (예: 균등한 평등성 equal parity, 삶의 의미 meaning of life 등 철학/고급 어휘 위주)";

            instruction = `
            사용자의 말: "${userSpeech}"
            ${langContext}
            ${levelInstruction}
            
            [필수 엄수 규칙]
            1. "keys" 배열에는 문장 내 핵심 덩어리 표현(Phrase) 3개를 추출.
            2. "vocab" 배열에는 핵심 단어 3개를 추출. 한글 뜻 오답(wrong_options) 2개와 스펠링이 비슷해서 헷갈리는 영어 오답(confusing_words) 2개(예: hospital -> hospitel, hostel)를 반드시 포함.
            3. "dictionary"에는 "english" 문장에 사용된 모든 개별 단어(I, the, in 예외 없이 100%)의 소문자 원형을 키(key)로 백과사전 정보 구축.
            4. 제목은 "title_ko" (한국어 요약)와 "title_en" (영어 요약) 2가지로 분리.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title_ko": "상황 요약 제목 (한국어)",
                "title_en": "상황 요약 제목 (영어)",
                "korean": "사용자 의도를 정리한 완벽한 한글 문장",
                "english": "세련되게 교정된 전체 영어 문장",
                "dictionary": {
                    "word1": { "ko": "한국어 뜻", "pos": "명사/동사 등", "phonetics": "발음기호", "expression": "대표적 표현 예시", "other_forms": "원문: require, 명: requirement" }
                },
                "keys": [
                    { "phrase": "덩어리 표현1", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "phrase": "덩어리 표현2", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "phrase": "덩어리 표현3", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "none"},
                    {"step": 2, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "핵심단어"},
                    {"step": 3, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어1", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["뜻오답1", "뜻오답2"], "confusing_words": ["헷갈리는영어1", "헷갈리는영어2"] },
                    { "word": "단어2", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["뜻오답1", "뜻오답2"], "confusing_words": ["헷갈리는영어1", "헷갈리는영어2"] },
                    { "word": "단어3", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["뜻오답1", "뜻오답2"], "confusing_words": ["헷갈리는영어1", "헷갈리는영어2"] }
                ]
            }`;
        } else {
            instruction = `목표 문장: "${target_english}", 실제 발음: "${userSpeech}". 
            [채점 규칙]
            1. 발음이 완벽하지 않아도 관대하게(lenient) 채점하세요.
            2. score 필드에는 오직 숫자(10~100 사이의 정수)만 입력하세요. '점수' 등의 글자는 절대 넣지 마세요.
            반환: JSON {"score": 85, "feedback": "<문장>"}`;
        }

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
        });

        const gptData = await gptResponse.json();
        const finalResult = JSON.parse(gptData.choices[0].message.content);
        res.status(200).json({ ...finalResult, recognized_text: userSpeech });
    } catch (error) { res.status(500).json({ error: error.message }); }
}
