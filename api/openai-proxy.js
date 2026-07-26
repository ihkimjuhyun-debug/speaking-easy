// Vercel 환경에서 함수 실행 시간 초과(Timeout) 방지를 위해 Edge Runtime을 강제로 사용합니다.
export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const body = await req.json();
        const { audio, action, target_english, difficulty, lang_mode } = body;
        const API_KEY = process.env.OPENAI_API_KEY;

        // Edge 런타임에서는 Buffer 대신 기본 Web API를 사용하여 오디오 데이터를 처리합니다.
        const binaryString = atob(audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/webm' });
        
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

        if (action === 'korean') {
            let levelInstr = "";
            if (difficulty === "beginner") {
                levelInstr = "초급: 매우 쉬운 기초 단어와 짧고 단순한 문장 구조로 번역하세요.";
            } else if (difficulty === "intermediate") {
                levelInstr = "중급: 실생활이나 비즈니스에서 원어민들이 자주 쓰는 자연스러운 표현으로 번역하세요.";
            } else if (difficulty === "advanced") {
                levelInstr = "고급: 학술적, 전문적이거나 격식 있고 세련된 고급 어휘를 사용하여 번역하세요.";
            }

            const instruction = `
            사용자 음성 전체 내용: "${userSpeech}" 
            선택된 난이도 지침: ${levelInstr}
            
            [초고속 응답 및 내용 충실성 규정]
            1. 사용자의 음성 내용 **전체 맥락**을 꼼꼼히 파악하여 빠짐없이 영어로 번역하세요.
            2. 'keys' 배열에는 전체 문장의 흐름을 이해하는 데 가장 중요한 핵심 덩어리 표현을 **정확히 3개** 추출하세요.
            3. 'vocab' 배열에는 번역된 영어 문장에서 학습 가치가 높은 핵심 단어를 **정확히 3개** 추출하세요.
            4. 지시된 JSON 구조 외의 부가적인 설명(phonetics, 예문 등)은 절대 생성하지 마세요.
            
            반환 JSON 구조:
            {
                "title_ko": "상황 전체 요약", 
                "title_en": "Main Title", 
                "korean": "사용자의 말 전체를 다듬은 자연스러운 한국어", 
                "english": "전체 내용을 반영한 원어민식 영어 문장",
                "dictionary": { 
                    "word1": {"ko":"뜻","pos":"품사"}, "word2": {"ko":"뜻","pos":"품사"}, "word3": {"ko":"뜻","pos":"품사"} 
                },
                "keys": [
                    {"phrase": "핵심표현1 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"},
                    {"phrase": "핵심표현2 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"},
                    {"phrase": "핵심표현3 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"}
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
                return new Response(JSON.stringify(parsedData), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (parseError) {
                throw new Error("AI 응답 데이터 구조 오류");
            }
        
        } else {
            const evalInstruction = `목표 문장: "${target_english}", 사용자 인식됨: "${userSpeech}". 매우 관대하게 채점하여 score(10~100 숫자)와 feedback만 JSON으로 반환.`;
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
                return new Response(JSON.stringify({ ...result, recognized_text: userSpeech || "" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                return new Response(JSON.stringify({ score: 0, feedback: "평가 데이터를 읽을 수 없습니다.", recognized_text: userSpeech }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        }
    } catch (error) { 
        console.error("Proxy Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
```eof

The `index.html` file will be provided in the next message.
