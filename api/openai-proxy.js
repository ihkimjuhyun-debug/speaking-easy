export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        // 1. 오디오 파일을 받아 Whisper로 STT 변환
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

        // 2. 한국어 상황 분석 및 훈련 데이터 3세트 생성 (초고속 다이어트 모드)
        if (action === 'korean') {
            const instruction = `
            사용자 음성: "${userSpeech}" (난이도: ${difficulty})
            
            [초고속 응답을 위한 토큰 다이어트 및 강제 규정]
            1. 'keys' 배열에는 반드시 덩어리 표현을 정확히 3개 생성할 것.
            2. 'vocab' 배열에는 핵심 단어를 정확히 3개 생성할 것.
            3. 지시된 JSON 구조 외의 부가적인 설명(phonetics, 예문 등)은 속도 저하를 유발하므로 절대 생성하지 말 것.
            
            반환 JSON 구조:
            {
                "title_ko": "요약", 
                "title_en": "Title", 
                "korean": "자연스러운 한국어 번역", 
                "english": "원어민식 영어 문장",
                "dictionary": { 
                    "word1": {"ko":"뜻","pos":"품사"}, "word2": {"ko":"뜻","pos":"품사"}, "word3": {"ko":"뜻","pos":"품사"} 
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
        
        // 3. 발음 평가 채점
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
            const result = JSON.parse(gptResult.choices[0].message.content);
            
            res.status(200).json({ ...result, recognized_text: userSpeech || "" });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
