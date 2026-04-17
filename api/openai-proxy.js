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
            [절대 규칙] 
            1. 'keys' 배열에는 반드시 덩어리 표현을 **3개** 넣으세요. 문장이 짧아도 관련 표현을 지어내서 3개를 채워야 합니다.
            2. 'vocab' 배열에도 핵심 단어를 **3개** 넣으세요.
            3. 'dictionary'는 5개 단어를 상세히 설명하세요.
            반환 JSON 구조를 엄수하세요.`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            const evalInstruction = `목표: "${target_english}", 인식됨: "${userSpeech}". 관대하게 채점해서 score(10~100)와 feedback만 JSON 반환.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptResult = await gptResponse.json();
            const result = JSON.parse(gptResult.choices[0].message.content);
            // 🌟 백엔드에서도 인식 텍스트가 없을 경우 빈 문자열을 보장함
            res.status(200).json({ ...result, recognized_text: userSpeech || "" });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
