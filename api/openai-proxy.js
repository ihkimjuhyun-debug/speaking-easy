// Vercel 배포 에러 방지를 위해 Edge Runtime 설정을 제거하고 표준 Node.js(Serverless) 환경으로 원복합니다.

export default async function handler(req, res) {
    // CORS 및 메서드 검사
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        // 1. 오디오 파일을 받아 Whisper로 STT 변환 (Node.js Buffer 사용)
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
        
        if (!sttResponse.ok) throw new Error("STT 엔진 통신 실패");
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        // 2. 한국어 상황 분석 및 훈련 데이터 생성
        if (action === 'korean') {
            let levelInstr = "";
            if (difficulty === "beginner") {
                levelInstr = "초급: 매우 쉬운 기초 단어와 짧고 단순한 구조.";
            } else if (difficulty === "intermediate") {
                levelInstr = "중급: 실생활/비즈니스 원어민 표현.";
            } else if (difficulty === "advanced") {
                levelInstr = "고급: 학술적이고 세련된 고급 어휘.";
            }

            // 10초 Timeout을 피하기 위해 프롬프트를 더욱 간결하게 압축
            const instruction = `
            음성: "${userSpeech}" 
            난이도: ${levelInstr}
            
            [규칙]
            1. 음성 전체 맥락을 영어로 번역.
            2. 'keys': 핵심 구(Phrase) 정확히 3개.
            3. 'vocab': 핵심 단어 정확히 3개.
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

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" },
                    temperature: 0.7
                })
            });

            if (!gptResponse.ok) throw new Error("LLM 엔진 통신 실패");
            const gptData = await gptResponse.json();
            
            try {
                const parsedData = JSON.parse(gptData.choices[0].message.content);
                return res.status(200).json(parsedData);
            } catch (parseError) {
                throw new Error("AI 응답 데이터 파싱 오류");
            }
        
        // 3. 발음 평가 채점
        } else {
            const evalInstruction = `목표: "${target_english}", 인식: "${userSpeech}". 관대하게 채점하여 score(10~100 숫자)와 feedback만 JSON으로 반환.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            
            const gptResult = await gptResponse.json();
            try {
                const result = JSON.parse(gptResult.choices[0].message.content);
                return res.status(200).json({ ...result, recognized_text: userSpeech || "" });
            } catch (e) {
                return res.status(200).json({ score: 0, feedback: "평가 불가", recognized_text: userSpeech });
            }
        }
    } catch (error) { 
        console.error("Proxy Error:", error);
        return res.status(500).json({ error: error.message }); 
    }
}
```eof

프론트엔드(`index.html`)는 이전에 복사하신 코드를 그대로 두시면 됩니다. 이 백엔드 파일만 교체하시면 배포 에러가 즉시 해결됩니다!
