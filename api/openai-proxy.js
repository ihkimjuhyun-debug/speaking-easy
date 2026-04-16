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
        
        // ✨ 마이크가 헛소리를 잡지 않도록 가이드(Prompt) 추가
        // lang_mode에 따라 Whisper가 더 정확하게 받아쓰게 유도합니다.
        const whisperPrompt = lang_mode === 'en' 
            ? "This is an English speaking lesson. Ignore background noise and focus on English speech."
            : "한국어와 영어가 섞인 대화입니다. 배경 소음은 무시하고 말소리만 정확히 기록하세요.";
        formData.append('prompt', whisperPrompt);

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        let instruction = "";

        if (action === 'korean') {
            instruction = `
            사용자가 다음 모드로 말했습니다: [${lang_mode === 'en' ? '영어 중심' : '한국어/혼용 중심'}]
            내용: "${userSpeech}"
            난이도: ${difficulty}
            
            1. 사용자의 발화를 분석하여 의도한 '완벽한 원어민식 영어 문장'을 만드세요.
            2. 레슨 5단계 구성 (맥락 유지 필수):
               - STEP 1: 원본 문장 (기본)
               - STEP 2: 원본 문장 (핵심단어 블러)
               - STEP 3: 주제를 유지한 채 상황/시제/주어를 바꾼 변형 문장 (Variation)
               - STEP 4: 변형 문장 (핵심부분 블러)
               - STEP 5: 원본 문장 (전체 공백)
            3. 핵심 표현(keys) 3개를 선정해 원본(org)과 변형(var) 문장을 만드세요.

            JSON 형식 반환:
            {
                "title": "제목", "korean": "의도 요약(한)", "english": "교정된 문장(영)",
                "keys": [{"word": "단어", "ko_org": "한", "en_org": "영", "ko_var": "한", "en_var": "영"}],
                "drills": [...]
            }`;
        } else {
            instruction = `목표: "${target_english}", 발음: "${userSpeech}". 점수(0~100)와 피드백을 JSON {"score": <숫자>, "feedback": "<피드백>"}으로 반환.`;
        }

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
        });

        const gptData = await gptResponse.json();
        res.status(200).json({ ...JSON.parse(gptData.choices[0].message.content), user_speech: userSpeech });
    } catch (error) { res.status(500).json({ error: error.message }); }
}
