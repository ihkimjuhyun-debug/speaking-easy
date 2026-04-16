// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        // 호환성을 위해 webm 혹은 mp4를 자동 포용하도록 파일명 지정
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

        // ✨ 환각(Hallucination) 및 일본어 잡음 완벽 차단 필터
        const lowerSpeech = userSpeech.toLowerCase();
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        const isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || jpRegex.test(userSpeech) || userSpeech.trim().length < 2;

        if (isHallucination && action === 'korean') {
            return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조금 더 크게 말씀해주세요!" });
        }

        let instruction = "";

        if (action === 'korean') {
            const langContext = lang_mode === 'focus90' 
                ? "[LANGUAGE FOCUS: 90% English / 10% Korean] 사용자의 말에 한국/영어가 섞여 있습니다. 의도를 파악해 90% 세련된 영어 표현으로 교정하고, 10% 한국어는 의미 설명에만 사용하세요."
                : "사용자는 한국어로 말했습니다. 이를 원어민식 영어로 번역하세요.";

            let levelInstruction = difficulty === "beginner" ? "[난이도: 초급] IELTS 3.0 ~ 5.0 수준. 누구나 알만한 매우 쉽고 직관적인 기초 단어와 짧은 문장 구조."
                : difficulty === "intermediate" ? "[난이도: 중급] IELTS 5.5 ~ 7.5 수준. 실생활 유기적 표현, 적당한 이디엄 혼합."
                : "[난이도: 고급] IELTS 8.0 ~ 9.0 수준. 세련된 원어민 관용구, 복잡한 문장 구조.";

            instruction = `
            사용자의 말: "${userSpeech}"
            ${langContext}
            ${levelInstruction}
            
            [필수 엄수 규칙]
            1. "keys" 배열에는 단어가 아닌, 실제 문장에서 쓰이는 **덩어리 표현(Phrase, 2~4단어)** 3개를 추출하세요.
            2. "vocab" 배열에는 핵심 단어 3개를 추출하고, 객관식 오답(wrong_options) 2개를 포함하세요.
            3. "dictionary"에는 "english" 문장에 사용된 핵심 단어들의 소문자 원형을 키(key)로 하는 백과사전 정보를 구축하세요.
            
            반환은 오직 아래 JSON 구조로만 하세요.
            {
                "title": "상황 요약 제목",
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
                    { "word": "단어1", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["오답1", "오답2"] },
                    { "word": "단어2", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["오답1", "오답2"] },
                    { "word": "단어3", "meaning": "한글 뜻", "pos": "품사", "phonetics": "발음기호", "example_en": "영어 예문", "example_ko": "예문 해석", "wrong_options": ["오답1", "오답2"] }
                ]
            }`;
        } else {
            // ✨ 점수 완화 (부분 점수제 완벽 적용)
            instruction = `목표 문장: "${target_english}", 실제 발음: "${userSpeech}". 
            [채점 규칙]
            1. 발음이 완벽하지 않거나 단어가 조금 달라도, 원어민이 문맥상 이해할 수 있다면 너무 빡빡하게 깎지 말고 관대하게(lenient) 채점하세요.
            2. 한 단어가 틀렸다고 0점 처리하지 마세요. 전체 문장 중 맞춘 비율과 중요도를 고려하여 10~100점 사이의 유연한 부분 점수를 부여하세요. (예: 3단어 중 1개 틀리면 60점 이상)
            3. 완전히 무관한 잡음일 때만 낮은 점수를 주세요.
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
