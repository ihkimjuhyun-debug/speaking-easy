export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        // 1. Whisper로 음성을 텍스트로 변환 (STT)
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

        // 2. 한국어 상황 분석 및 훈련 데이터 생성
        if (action === 'korean') {
            const instruction = `
            사용자의 말: "${userSpeech}"
            난이도: ${difficulty}
            
            [절대 규칙] 
            1. 'keys' 배열에는 반드시 덩어리 표현을 **3개** 넣으세요. 문장이 짧아도 관련 표현을 지어내서 3개를 채워야 합니다.
            2. 'vocab' 배열에도 핵심 단어를 **3개** 넣으세요.
            3. 'dictionary'는 5개 단어를 상세히 설명하세요.
            
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
                    { "phrase": "표현1", "ko_org": "해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현2", "ko_org": "해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" },
                    { "phrase": "표현3", "ko_org": "해석", "en_org": "원문", "ko_var1": "변형1해석", "en_var1": "변형1", "ko_var2": "변형2해석", "en_var2": "변형2", "ko_long": "추가해석", "en_long": "추가영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "해석", "en_full": "전체", "blur_part": "none"},
                    {"step": 2, "ko": "해석", "en_full": "전체", "blur_part": "핵심표현"},
                    {"step": 3, "ko": "해석", "en_full": "전체", "blur_part": "all"}
                ],
                "vocab": [
                    { "word": "단어1", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어2", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] },
                    { "word": "단어3", "meaning": "뜻", "pos": "품사", "phonetics": "발음", "example_en": "예문", "example_ko": "해석", "wrong_options": ["오답1", "오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] }
                ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", // ⚡ 초고속 가성비 엔진 적용 완료
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        
        // 3. 발음 평가 채점 로직
        } else {
            const evalInstruction = `목표: "${target_english}", 인식됨: "${userSpeech}". 관대하게 채점해서 score(10~100)와 feedback만 JSON 반환.`;
            
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", // ⚡ 발음 평가에도 동일하게 적용 완료
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            const gptResult = await gptResponse.json();
            const result = JSON.parse(gptResult.choices[0].message.content);
            
            res.status(200).json({ ...result, recognized_text: userSpeech || "" });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
