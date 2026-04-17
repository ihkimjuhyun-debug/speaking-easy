// api/openai-proxy.js
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
        
        // 평가 시 영어 강제 및 잡음 방지 힌트 제공
        if (action === 'evaluate') {
            formData.append('language', 'en');
            if (target_english && !target_english.includes("?")) {
                formData.append('prompt', target_english); 
            }
        } else if (lang_mode === 'ko') {
            formData.append('language', 'ko');
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        if (action === 'korean') {
            // 일상적인 대화 상황을 더 많이 반영하도록 프롬프트 수정
            const levelInstr = difficulty === "beginner" ? "초급(일상)" : difficulty === "intermediate" ? "중급(실용)" : "고급(전문)";
            
            const instruction = `
            사용자의 말: "${userSpeech}"
            난이도: ${levelInstr}
            [미션] 
            1. 의도를 파악해 자연스러운 '일상 대화형 문장'으로 교정 (예: "자전거 수리점 가서 고친 자전거 찾아와야 해")
            2. title_ko는 짧은 한글 소제목, title_en은 세련된 영어 메인 제목.
            3. vocab은 핵심 단어 3개 (스펠링 헷갈리는 영어 오답 2개 필수 포함).
            4. dictionary는 문장의 모든 개별 단어를 분석.
            반환: JSON 구조 준수`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            // 발음 평가 채점 로직 (숫자만 보내도록 강제)
            const evalInstruction = `목표 문장: "${target_english}", 사용자 발음: "${userSpeech}". 
            점수(10-100 정수)와 피드백을 JSON {"score": 85, "feedback": "내용"} 형태로만 반환하세요.`;
            
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptResponse.json();
            const result = JSON.parse(gptData.choices[0].message.content);
            res.status(200).json({ ...result, recognized_text: userSpeech });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
