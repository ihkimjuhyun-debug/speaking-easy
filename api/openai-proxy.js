// /api/openai-proxy.js
// PolyGlot Master V41 - 백엔드 완전 수정 버전

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API 키가 설정되지 않았습니다." });
    }

    try {
        // Whisper API 호출 준비
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');

        if (action === 'evaluate') {
            formData.append('language', 'en');
        } else if (lang_mode === 'ko') {
            formData.append('language', 'ko');
        }

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}` },
            body: formData
        });

        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";
        const lowerSpeech = userSpeech.toLowerCase();

        // ==================== hallucination 필터 강화 ====================
        const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
        let isHallucination = 
            lowerSpeech.includes("mbc") || 
            lowerSpeech.includes("amara") || 
            lowerSpeech.includes("thank you") ||
            lowerSpeech.includes("음") || 
            lowerSpeech.includes("네") || 
            lowerSpeech.includes("그래서") ||
            jpRegex.test(userSpeech);

        if (action === 'korean' && userSpeech.trim().length < 2) isHallucination = true;

        if (isHallucination) {
            if (action === 'korean') {
                return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!" });
            } else {
                return res.status(200).json({ 
                    score: 0, 
                    feedback: "목소리가 너무 작거나 잡음이 섞였습니다. 다시 명확하게 발음해주세요.", 
                    recognized_text: "인식 실패" 
                });
            }
        }

        // ==================== 한국어 → AI Lesson 생성 ====================
        if (action === 'korean') {
            let levelInstr = difficulty === "beginner" 
                ? "초급: 쉬운 단어 위주" 
                : difficulty === "intermediate" 
                ? "중급: 실생활/비즈니스 자연스러운 표현" 
                : "고급: 학술적, 세련된 어휘";

            const instruction = `
사용자의 말: "${userSpeech}"
현재 난이도: ${levelInstr}

[최우선 엄수 규칙]
1. 원어민이 쓰는 가장 자연스러운 문장으로 번역하세요.
2. "keys"는 문장 내 핵심 덩어리 표현을 무조건 3개 추출하세요.
3. "vocab"은 훈련을 위한 핵심 단어를 무조건 3개 추출하세요.
4. "dictionary"는 최소 5개 이상 작성하세요.

반드시 아래 JSON 형식으로만 답변하세요.`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${API_KEY}` 
                },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" }, 
                    max_tokens: 3500 
                })
            });

            const gptData = await gptResponse.json();
            let aiText = gptData.choices[0].message.content;

            let parsedData;
            try {
                parsedData = JSON.parse(aiText);
            } catch (err) {
                const match = aiText.match(/```json\n([\s\S]*?)\n```/);
                if (match) parsedData = JSON.parse(match[1]);
                else throw new Error("AI 응답 파싱 실패");
            }

            return res.status(200).json(parsedData);
        } 
        // ==================== 발음 평가 (evaluate) ====================
        else {
            // ★★★ CRITICAL FIX: GPT에게 JSON 형식 강제 + 안전 파싱 ★★★
            const evalInstruction = `목표 문장: "${target_english}"
사용자 발음: "${userSpeech}"

[채점 규칙]
- 아주 관대하게 채점하세요.
- 반드시 아래 JSON 형식으로만 답변:
{"score": 숫자(10~100), "feedback": "한글로 자연스러운 피드백"}

JSON 형식으로만 답변하세요.`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${API_KEY}` 
                },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });

            const gptData = await gptResponse.json();

            let result;
            try {
                result = JSON.parse(gptData.choices[0].message.content);
            } catch (e) {
                result = { 
                    score: 65, 
                    feedback: "발음 평가 중 오류가 발생했습니다. 다시 시도해주세요." 
                };
            }

            return res.status(200).json({ 
                ...result, 
                recognized_text: userSpeech 
            });
        }

    } catch (error) {
        console.error("API 오류:", error);
        return res.status(500).json({ error: error.message || "서버 내부 오류" });
    }
}
