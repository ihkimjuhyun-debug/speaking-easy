export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        // [STEP 1] 음성 인식(STT)만 단독으로 처리하는 구역 (10초 Timeout 회피)
        if (body.action === 'transcribe') {
            const audioBuffer = Buffer.from(body.audio, 'base64');
            const blob = new Blob([audioBuffer], { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', blob, 'audio.webm');
            formData.append('model', 'whisper-1');
            
            if (body.lang_mode === 'ko') formData.append('language', 'ko');
            else formData.append('language', 'en'); // 영어 채점용

            const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
            });
            
            if (!sttRes.ok) throw new Error("음성 인식(Whisper) 실패");
            const sttData = await sttRes.json();
            
            return res.status(200).json({ text: sttData.text || "" });
        }

        // [STEP 2] 상황 훈련 데이터 생성(LLM)만 단독으로 처리하는 구역
        if (body.action === 'korean') {
            const { userSpeech, difficulty } = body;
            
            let levelInstr = "";
            if (difficulty === "beginner") levelInstr = "초급: 매우 쉬운 기초 단어와 짧고 단순한 구조.";
            else if (difficulty === "intermediate") levelInstr = "중급: 실생활/비즈니스 원어민 표현.";
            else if (difficulty === "advanced") levelInstr = "고급: 학술적이고 세련된 고급 어휘.";

            const instruction = `
            음성: "${userSpeech}" 
            난이도: ${levelInstr}
            
            [규칙]
            1. 음성 전체 맥락 번역.
            2. 'keys': 핵심 구 3개.
            3. 'vocab': 핵심 단어 3개.
            4. 절대 다른 부가 설명을 넣지 마세요.
            
            JSON 구조:
            {
                "title_ko": "요약", "title_en": "Title", "korean": "자연스러운 한국어", "english": "영어 번역문",
                "dictionary": { "w1": {"ko":"뜻","pos":"품사"}, "w2": {"ko":"뜻","pos":"품사"}, "w3": {"ko":"뜻","pos":"품사"} },
                "keys": [
                    {"phrase": "구1", "ko_org": "해석", "en_org": "전체문장"},
                    {"phrase": "구2", "ko_org": "해석", "en_org": "전체문장"},
                    {"phrase": "구3", "ko_org": "해석", "en_org": "전체문장"}
                ],
                "vocab": [
                    {"word": "단어1", "meaning": "뜻", "wrong_options": ["오답1","오답2"]},
                    {"word": "단어2", "meaning": "뜻", "wrong_options": ["오답1","오답2"]},
                    {"word": "단어3", "meaning": "뜻", "wrong_options": ["오답1","오답2"]}
                ]
            }`;

            const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" },
                    temperature: 0.7
                })
            });

            if (!gptRes.ok) throw new Error("AI 분석(GPT) 실패");
            const gptData = await gptRes.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        }

        // [STEP 3] 발음 채점(Evaluate)만 단독으로 처리하는 구역
        if (body.action === 'evaluate') {
            const { userSpeech, target_english } = body;
            const evalInstruction = `목표: "${target_english}", 인식: "${userSpeech}". 관대하게 채점하여 score(10~100 숫자)와 feedback만 JSON으로 반환.`;
            
            const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            
            if (!gptRes.ok) throw new Error("채점 서버 통신 실패");
            const gptData = await gptRes.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            return res.status(200).json({ ...result, recognized_text: userSpeech || "" });
        }

    } catch (error) { 
        console.error("Proxy Error:", error);
        return res.status(500).json({ error: error.message }); 
    }
}
```eof

위 코드를 `api/openai-proxy.js`에 먼저 적용해 주세요. 이어서 두 번째 파일(`index.html`)을 제공해 드리겠습니다.
