// api/openai-proxy.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { audio, action, target_english, difficulty } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

    try {
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.m4a');
        formData.append('model', 'whisper-1');
        formData.append('language', action === 'korean' ? 'ko' : 'en');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        let instruction = "";

        if (action === 'korean') {
            instruction = `
            사용자가 한국어로 말했습니다: "${userSpeech}"
            난이도: ${difficulty}
            
            초보자를 위한 입체적인 영어 레슨을 구성하세요. 
            [필수 규칙]
            1. 주제 이탈 금지: 원래 이야기의 주제(Context) 내에서만 변형하세요.
            2. 핵심 표현 3개를 선정하고 각 표현마다 원본 문장(org)과 상황/시제/주어를 비튼 변형 문장(var)을 만드세요.
            3. 레슨 5단계 구성:
               - STEP 1: 원본 문장 (기본형)
               - STEP 2: 원본 문장 (핵심 단어 블러 처리)
               - STEP 3: 맥락을 유지한 변형 문장 (새로운 상황/시제 제시)
               - STEP 4: 변형 문장 (변형된 부분 블러 처리)
               - STEP 5: 원본 문장 (전체 공백 처리)

            반드시 아래 JSON 형식만 반환하세요.
            {
                "title": "상황 요약 제목",
                "korean": "${userSpeech}",
                "english": "전체 번역",
                "keys": [
                    {
                        "word": "핵심표현",
                        "ko_org": "원본 한글 문장", "en_org": "원본 영어 번역",
                        "ko_var": "변형 한글 문장", "en_var": "변형 영어 번역"
                    }
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
