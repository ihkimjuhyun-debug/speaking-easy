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
        
        if (action === 'evaluate') {
            formData.append('language', 'en');
            if (target_english && !target_english.includes("?")) formData.append('prompt', target_english);
        } else if (lang_mode === 'ko') {
            formData.append('language', 'ko');
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        if (action === 'korean') {
            const levelHint = difficulty === "beginner" ? "초급(희생하다 sacrifice)" : difficulty === "intermediate" ? "중급(추구하다 pursue)" : "고급(평등성 parity)";
            const instruction = `
            사용자 의도: "${userSpeech}"
            난이도: ${levelHint}
            [규칙]
            1. 일상 대화형 문장으로 생성(예: "자전거 고쳤다" -> "I need to stop by the shop to pick up my fixed bike.")
            2. title_ko는 한국어 짧은 요약, title_en은 영어 메인 제목.
            3. vocab은 8단계 훈련을 위해 confusing_words(비슷한 스펠링) 2개 필수 포함.
            4. dictionary는 문장의 모든 단어(100%) 포함.
            5. drills는 반드시 3개 단계로 구성.
            {
                "title_ko": "...", "title_en": "...", "korean": "...", "english": "...",
                "dictionary": { "word": { "ko": "뜻", "pos": "품사", "phonetics": "발음", "expression": "예문", "other_forms": "변형" } },
                "keys": [ { "phrase": "덩어리", "ko_org": "한글", "en_org": "영어", "ko_var": "변형한글", "en_var": "변형영어" } ],
                "drills": [ 
                    {"step": 1, "ko": "한글", "en_full": "영어", "blur_part": "none"},
                    {"step": 2, "ko": "한글", "en_full": "영어", "blur_part": "핵심어"},
                    {"step": 3, "ko": "한글", "en_full": "영어", "blur_part": "all"}
                ],
                "vocab": [ { "word": "단어", "meaning": "뜻", "wrong_options": ["뜻오답1", "뜻오답2"], "confusing_words": ["스펠링오답1", "스펠링오답2"] } ]
            }`;

            const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: instruction }], response_format: { type: "json_object" } })
            });
            const gptData = await gptRes.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        } else {
            const evalInstr = `목표: "${target_english}", 인식: "${userSpeech}". 점수(10-100)와 피드백을 JSON {"score": 숫자, "feedback": "문장"}으로만 반환.`;
            const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: evalInstr }], response_format: { type: "json_object" } })
            });
            const gptData = await gptRes.json();
            res.status(200).json({ ...JSON.parse(gptData.choices[0].message.content), recognized_text: userSpeech });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
}
