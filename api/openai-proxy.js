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
        
        if (lang_mode === 'ko') formData.append('language', 'ko');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        const lowerSpeech = userSpeech.toLowerCase();
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        const isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || jpRegex.test(userSpeech) || userSpeech.trim().length < 2;

        if (isHallucination && action === 'korean') {
            return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조금 더 크게 말씀해주세요!" });
        }

        let instruction = "";

        if (action === 'korean') {
            const langContext = lang_mode === 'focus90' 
                ? "[LANGUAGE FOCUS: 90% English / 10% Korean] 한국/영어가 섞여 있습니다. 의도를 파악해 90% 세련된 영어로 교정하고, 10% 한국어는 의미 설명에만 사용하세요."
                : "사용자는 한국어로 말했습니다. 이를 원어민식 영어로 번역하세요.";

            // ✨ 전반적인 수준(난이도) 대폭 상향 조정
            let levelInstruction = difficulty === "beginner" ? "[난이도: 초급] 실생활 필수 단어와 명확한 문장 구조."
                : difficulty === "intermediate" ? "[난이도: 중급] IELTS 6.0 ~ 7.5 수준. 원어민들이 자주 쓰는 까다로운 어휘와 이디엄 혼합."
                : "[난이도: 고급] IELTS 8.0 ~ 9.0 수준. 매우 세련된 원어민 관용구, 비즈니스 및 학술적 어휘 적극 활용.";

            instruction = `
            사용자의 말: "${userSpeech}"
            ${langContext}
            ${levelInstruction}
            
            [필수 엄수 규칙]
            1. "keys" 배열에는 단어가 아닌, 문장 내 핵심 덩어리 표현(Phrase) 3개를 추출.
            2. "vocab" 배열에는 핵심 단어 3개를 추출하고, 한글 뜻 오답(wrong_options) 2개와 **스펠링이 비슷해서 헷갈리는 영어 오답(confusing_words) 2개(예: hospital -> hospitel, hostel)**를 반드시 포함하세요.
            3. "dictionary"에는 "english" 문장에 사용된 **모든 개별 단어(관사, 전치사 예외 없이 100% 전부)**의 소문자 원형을 키(key)로 하는 백과사전 정보를 구축.
            4. 제목은 반드시 "title_ko" (한국어 요약)와 "title_en" (영어 요약) 2가지로 분리 작성.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title_ko": "상황 요약 제목 (한국어)",
                "title_en": "상황 요약 제목 (영어)",
                "korean": "사용자 의도를 정리한 완벽한 한글 문장",
                "english": "세련되게 교정된 전체 영어 문장",
                "dictionary": {
                    "word1": { "ko": "한국어 뜻", "pos": "명사/동사 등", "phonetics": "발음기호", "expression": "대표적 표현 예시", "other_forms": "원문: require, 명: requirement" },
                    "word2": { "ko": "...", "pos": "...", "phonetics": "...", "expression": "...", "other_forms": "..." }
                },
                "keys": [
                    { "phrase": "덩어리 표현1", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "phrase": "덩어리 표현2", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "phrase": "덩어리 표현3", "ko_org": "한글", "en_org": "영어", "ko_var": "변형 한글", "en_var": "변형 영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "none"},
                    {"step": 2, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "핵심단어"},
                    {"step": 3, "ko": "변형 한글", "en_full": "변형 영어", "blur_part": "none"},
                    {"step": 4, "ko": "변형 한글", "en_full": "변형 영어", "blur_part": "변형된부분"},
                    {"step": 5, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "all"}
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
            1. 발음이 완벽하지 않거나 조금 달라도 원어민이 문맥상 이해할 수 있다면 관대하게(lenient) 채점하세요.
            2. 한 단어가 틀렸다고 0점 주지 말고, 맞춘 비율을 고려하여 10~100점 사이의 부분 점수를 유연하게 부여.
            반환: JSON {"score": <숫자>, "feedback": "<문장>"}`;
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
