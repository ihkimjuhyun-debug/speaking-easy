// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.m4a');
        formData.append('model', 'whisper-1');
        
        // 한/영 스위치 값에 따른 Whisper 설정
        if (lang_mode === 'ko') {
            formData.append('language', 'ko');
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        let instruction = "";

        if (action === 'korean') {
            const langContext = lang_mode === 'mixed' 
                ? "사용자의 말에 한국어와 영어가 섞여 있을 수 있습니다. 맥락을 파악해 가장 세련된 영어 문장으로 번역하세요."
                : "사용자는 오직 한국어로만 말했습니다. 이를 원어민식 영어로 번역하세요.";

            instruction = `
            사용자가 다음과 같이 말했습니다: "${userSpeech}"
            난이도: ${difficulty}
            ${langContext}
            
            초보자를 위한 입체적인 영어 레슨을 구성하세요. 
            [필수 규칙 - 버그 방지]
            1. "keys" 배열에는 **반드시 정확히 3개의 독립된 객체**가 있어야 합니다. 절대 하나로 합치지 마세요.
            2. 레슨 5단계 구성 규칙 (주제 이탈 금지):
               - STEP 1: 원본 문장 (기본)
               - STEP 2: 원본 문장 (핵심단어 블러)
               - STEP 3: 주어/시제/상황을 비튼 변형 문장 (Variation)
               - STEP 4: 변형 문장 (핵심부분 블러)
               - STEP 5: 원본 문장 (전체 공백)

            반드시 아래 JSON 형식만 반환하세요:
            {
                "title": "상황 요약 제목",
                "korean": "사용자 의도를 정리한 완벽한 한글 문장",
                "english": "세련되게 교정된 전체 영어 문장",
                "keys": [
                    { "word": "핵심단어1", "ko_org": "원본 한글 문장", "en_org": "원본 영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "word": "핵심단어2", "ko_org": "원본 한글 문장", "en_org": "원본 영어", "ko_var": "변형 한글", "en_var": "변형 영어" },
                    { "word": "핵심단어3", "ko_org": "원본 한글 문장", "en_org": "원본 영어", "ko_var": "변형 한글", "en_var": "변형 영어" }
                ],
                "drills": [
                    {"step": 1, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "none"},
                    {"step": 2, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "핵심단어"},
                    {"step": 3, "ko": "변형 한글", "en_full": "변형 영어", "blur_part": "none"},
                    {"step": 4, "ko": "변형 한글", "en_full": "변형 영어", "blur_part": "변형된부분"},
                    {"step": 5, "ko": "원본 한글", "en_full": "원본 영어", "blur_part": "all"}
                ]
            }`;
        } else {
            instruction = `목표 문장: "${target_english}", 실제 발음: "${userSpeech}". 점수(0~100)와 짧은 한국어 피드백을 JSON {"score": <숫자>, "feedback": "<문장>"}으로 반환하세요.`;
        }

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
        });

        const gptData = await gptResponse.json();
        res.status(200).json({ ...JSON.parse(gptData.choices[0].message.content), user_speech: userSpeech });
    } catch (error) { res.status(500).json({ error: error.message }); }
}
