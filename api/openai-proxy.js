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
            const instruction = `
            사용자의 말: "${userSpeech}"
            난이도: ${difficulty}
            
            [미션]
            1. 'keys' 배열에 덩어리 표현을 **무조건 3개** 넣으세요. 문장이 짧으면 그 상황에 꼭 필요한 다른 표현을 추가해서라도 3개를 채우세요.
            2. 'vocab' 배열에 핵심 단어를 **무조건 3개** 넣으세요. 
            3. 'dictionary'는 최소 5개 단어를 상세히 설명하세요.
            4. 'happen to' 동사구의 뉘앙스를 적극 반영하세요.
            
            반환 구조(JSON):
            {
                "title_ko": "요약", "title_en": "Title", "korean": "한국어", "english": "English",
                "dictionary": { "word1": {...}, "word2": {...}, "word3": {...}, "word4": {...}, "word5": {...} },
                "keys": [ {"phrase": "...", "ko_org": "...", ...}, {"phrase": "...", ...}, {"phrase": "...", ...} ],
                "drills": [ {"step": 1, ...}, {"step": 2, ...}, {"step": 3, ...} ],
                "vocab": [ {"word": "...", ...}, {"word": "...", ...}, {"word": "...", ...} ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            // 평가 로직
            const evalInstruction = `목표: "${target_english}", 인식됨: "${userSpeech}". 관대하게 채점해서 score(10~100)와 feedback만 JSON으로 반환.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptResult = await gptResponse.json();
            res.status(200).json({ ...JSON.parse(gptResult.choices[0].message.content), recognized_text: userSpeech });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
