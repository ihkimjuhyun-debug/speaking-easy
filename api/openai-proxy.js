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
        
        // ✨ 핵심: language 파라미터를 삭제하여 AI가 한국어+영어를 동시에 감지하도록 합니다.
        // formData.append('language', ...); <- 이 부분을 삭제함

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text;

        let instruction = "";

        if (action === 'korean') {
            instruction = `
            사용자가 다음과 같이 말했습니다: "${userSpeech}"
            (한국어와 영어가 섞여 있을 수 있습니다. 맥락을 파악해 자연스러운 문장으로 이해하세요.)
            난이도: ${difficulty}
            
            1. 혼용된 문장을 분석하여 사용자가 의도한 전체 의미를 파악하세요.
            2. 이를 바탕으로 가장 세련된 원어민식 전체 영어 문장(english)과 한국어 번역(korean)을 만드세요.
            3. 레슨 5단계 구성 규칙:
               - 주제 이탈 절대 금지 (맥락 유지)
               - STEP 1: 원본 문장 (기본)
               - STEP 2: 원본 문장 (핵심단어 블러)
               - STEP 3: 주어/시제/상황을 비튼 변형 문장 (Variation)
               - STEP 4: 변형 문장 (핵심부분 블러)
               - STEP 5: 원본 문장 (전체 공백)

            반드시 아래 JSON 형식만 반환하세요:
            {
                "title": "상황 요약",
                "korean": "사용자 의도를 정리한 한글 문장",
                "english": "세련되게 교정된 전체 영어 문장",
                "keys": [
                    {
                        "word": "핵심표현",
                        "ko_org": "원본 맥락 문장(한)", "en_org": "원본 맥락 문장(영)",
                        "ko_var": "변형 문장(한)", "en_var": "변형 문장(영)"
                    }
                ],
                "drills": [ ... 5단계 데이터 ... ]
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
