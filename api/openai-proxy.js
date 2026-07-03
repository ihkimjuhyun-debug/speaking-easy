export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
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

        if (action === 'korean') {
            // 🌟 1500토큰 -> 300토큰으로 압축하는 초고속 프롬프트
            // 프론트엔드에서 자동 생성하는 예문, 발음기호, drills 등을 전면 생략하여 속도 극대화
            const instruction = `
            사용자: "${userSpeech}" (난이도: ${difficulty})
            
            [초고속 응답을 위한 토큰 다이어트 규정]
            반드시 아래 JSON 포맷을 유지하되, 제시되지 않은 필드(drills, phonetics, 예문 등)는 절대 생성하지 마세요. (생성 시 속도 저하 발생)
            
            {
                "title_ko": "요약", 
                "title_en": "Title", 
                "korean": "자연스러운 번역", 
                "english": "English",
                "dictionary": { 
                    "word1": {"ko":"뜻","pos":"품사"}, 
                    "word2": {"ko":"뜻","pos":"품사"}, 
                    "word3": {"ko":"뜻","pos":"품사"} 
                },
                "keys": [
                    {"phrase": "핵심표현1", "ko_org": "해석", "en_org": "문장"},
                    {"phrase": "핵심표현2", "ko_org": "해석", "en_org": "문장"},
                    {"phrase": "핵심표현3", "ko_org": "해석", "en_org": "문장"}
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
                    response_format: { type: "json_object" } 
                })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        
        } else {
            // 발음 평가 채점 (이 부분은 이미 짧아서 빠릅니다)
            const evalInstruction = `목표: "${target_english}", 인식됨: "${userSpeech}". 관대하게 채점해서 score(10~100)와 feedback만 JSON 반환.`;
            
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
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
