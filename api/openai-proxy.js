export const config = {
maxDuration: 60, // Vercel Pro: 60초, Hobby: 10초 (기본값 초과 시 Pro 필요)
};

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

```
const { audio, action, target_english, difficulty, lang_mode, mimeType } = req.body;
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

try {
    const audioBuffer = Buffer.from(audio, 'base64');

    // ✅ iOS 호환: MIME 타입에 맞는 파일 확장자 결정
    // iOS Safari → audio/mp4 → .m4a, Chrome → audio/webm → .webm
    const resolvedMime = mimeType || 'audio/webm';
    let fileExt = 'webm';
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        fileExt = 'm4a';
    } else if (resolvedMime.includes('ogg')) {
        fileExt = 'ogg';
    }

    const blob = new Blob([audioBuffer], { type: resolvedMime });
    const formData = new FormData();
    formData.append('file', blob, `audio.${fileExt}`);
    formData.append('model', 'whisper-1');
    
    if (action === 'evaluate') formData.append('language', 'en');
    else if (lang_mode === 'ko') formData.append('language', 'ko');

    const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", 
        headers: { "Authorization": `Bearer ${API_KEY}` }, 
        body: formData
    });
    const sttData = await sttResponse.json();
    const userSpeech = sttData.text || "";
    const lowerSpeech = userSpeech.toLowerCase();
    const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
    
    let isHallucination = lowerSpeech.includes("mbc") || lowerSpeech.includes("amara") || lowerSpeech.includes("thank you") || jpRegex.test(userSpeech);
    if (action === 'korean' && userSpeech.trim().length < 2) isHallucination = true;

    if (isHallucination) {
        if (action === 'korean') {
            return res.status(200).json({ error: "음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!" });
        } else {
            return res.status(200).json({ score: 0, feedback: "목소리가 너무 작거나 잡음이 섞였습니다. 다시 명확하게 발음해주세요.", recognized_text: "인식 실패" });
        }
    }

    if (action === 'korean') {
        // ✅ BUG FIX: 난이도별 안내 명확화
        let levelInstr = difficulty === "beginner" 
            ? "초급: 쉬운 단어 위주, 짧고 간단한 문장" 
            : difficulty === "intermediate" 
            ? "중급: 실생활/비즈니스 자연스러운 표현" 
            : "고급: 학술적, 세련된 어휘";

        const instruction = `
        사용자의 말 (한국어): "${userSpeech}"
        현재 난이도: ${levelInstr}
        
        ======= 절대 엄수 규칙 =======

        [규칙 A] keys 변형 문장 규칙 (가장 중요)
        - keys의 각 항목에서 en_org, en_var1, en_var2, en_long은 반드시 동일한 핵심 키워드/표현을 공유해야 합니다.
        - 즉, en_org의 핵심 단어(phrase)가 en_var1, en_var2, en_long에도 반드시 포함되어야 합니다.
        - 예시: phrase = "have a desire to die" 이면,
            en_org = "Even if I have a desire to die, I keep going."
            en_var1 = "People sometimes have a desire to die when life feels too heavy."  ← 같은 핵심 표현 유지
            en_var2 = "She confessed she had a desire to die after the breakup."         ← 같은 핵심 표현 유지
            en_long = "Even though I have a desire to die sometimes, I remind myself that feelings are temporary." ← 같은 핵심 표현 유지
        - 절대 금지: en_var1이 en_org와 완전히 다른 주제나 표현이 되는 것.

        [규칙 B] vocab 단어 규칙 (두 번째로 중요)
        - "word" 필드: 반드시 영어 단어만 입력. 절대 한국어, 한자, 일본어 불가. (예: "desire" O, "욕망" X, "데자이어" X)
        - "meaning" 필드: 한국어 뜻만 입력. (예: "욕망, 바람" O)
        - "phonetics" 필드: 영어 발음 기호 또는 발음 표기. (예: "/dɪˈzaɪər/" O)
        - "wrong_options": 한국어 오답 뜻 2~3개. (예: ["두려움", "용기"])
        - "confusing_words": 철자가 비슷한 영어 단어 2개. (예: ["desire", "desert", "desir"])
        - vocab은 반드시 정확히 3개.
        - "example_en/ko": 기본 예문.
        - "var1_en/ko", "var2_en/ko", "var3_en/ko": 실생활 바리에이션 문장 3개. 
          같은 단어를 전혀 다른 상황/맥락에서 사용하는 자연스러운 원어민 문장.
          예: word="protein" → example: "Fish is a good source of protein."
                          var1: "This smoothie is high in protein and low in fat."
                          var2: "Athletes need more protein to build muscle."
                          var3: "Many people don't get enough protein in their daily diet."

        [규칙 C] 기타
        - keys는 반드시 정확히 3개. phrase 필드에는 영어 표현만.
        - dictionary는 5개 이상.
        - blur_part: 해당 step에서 가릴 핵심 영어 단어(소문자). 없으면 "none".

        ======= 반환 JSON 구조 =======
        {
            "title_ko": "상황 한 줄 요약 (한국어)",
            "title_en": "English title",
            "korean": "자연스러운 한국어 전체 문장",
            "english": "Natural native English sentence",
            "dictionary": {
                "englishword1": { "ko": "한국어뜻", "pos": "noun/verb/adj 등", "phonetics": "/발음기호/", "ko_context": "이 문장에서: [맥락 설명]" },
                "englishword2": { "ko": "한국어뜻", "pos": "품사", "phonetics": "/발음기호/", "ko_context": "이 문장에서: [맥락 설명]" },
                "englishword3": { "ko": "한국어뜻", "pos": "품사", "phonetics": "/발음기호/", "ko_context": "이 문장에서: [맥락 설명]" },
                "englishword4": { "ko": "한국어뜻", "pos": "품사", "phonetics": "/발음기호/", "ko_context": "관련 표현" },
                "englishword5": { "ko": "한국어뜻", "pos": "품사", "phonetics": "/발음기호/", "ko_context": "관련 표현" }
            },
            "keys": [
                {
                    "phrase": "핵심영어표현1 (영어만, 한국어 절대 금지)",
                    "ko_org": "원문 한국어 해석",
                    "en_org": "원문 영어 (phrase 포함)",
                    "ko_var1": "변형1 한국어 해석",
                    "en_var1": "변형1 영어 (반드시 phrase와 동일한 핵심 단어 포함)",
                    "ko_var2": "변형2 한국어 해석",
                    "en_var2": "변형2 영어 (반드시 phrase와 동일한 핵심 단어 포함)",
                    "ko_long": "확장 한국어 해석",
                    "en_long": "확장 영어 (반드시 phrase와 동일한 핵심 단어 포함, 문장 좀 더 길게)"
                },
                { "phrase": "핵심영어표현2", "ko_org": "...", "en_org": "...", "ko_var1": "...", "en_var1": "...", "ko_var2": "...", "en_var2": "...", "ko_long": "...", "en_long": "..." },
                { "phrase": "핵심영어표현3", "ko_org": "...", "en_org": "...", "ko_var1": "...", "en_var1": "...", "ko_var2": "...", "en_var2": "...", "ko_long": "...", "en_long": "..." }
            ],
            "drills": [
                {"step": 1, "ko": "한국어 해석", "en_full": "전체 영어 문장", "blur_part": "none"},
                {"step": 2, "ko": "한국어 해석", "en_full": "전체 영어 문장", "blur_part": "가릴핵심단어소문자"},
                {"step": 3, "ko": "한국어 해석", "en_full": "전체 영어 문장", "blur_part": "all"}
            ],
            "vocab": [
                {
                    "word": "EnglishWord1 (영어만! 절대 한국어 금지)",
                    "meaning": "한국어뜻1",
                    "pos": "명사/동사/형용사 등",
                    "phonetics": "/발음기호/",
                    "example_en": "Example sentence in English using this word.",
                    "example_ko": "예문 한국어 해석",
                    "var1_en": "Real-life variation sentence 1 (same word, different context).",
                    "var1_ko": "바리에이션1 한국어 해석",
                    "var2_en": "Real-life variation sentence 2 (same word, different context).",
                    "var2_ko": "바리에이션2 한국어 해석",
                    "var3_en": "Real-life variation sentence 3 (same word, different context).",
                    "var3_ko": "바리에이션3 한국어 해석",
                    "wrong_options": ["한국어오답1", "한국어오답2"],
                    "confusing_words": ["similrword", "simialrword"]
                },
                {
                    "word": "EnglishWord2 (영어만! 절대 한국어 금지)",
                    "meaning": "한국어뜻2",
                    "pos": "품사",
                    "phonetics": "/발음기호/",
                    "example_en": "Example sentence.",
                    "example_ko": "예문 해석",
                    "var1_en": "Variation 1 using this word.",
                    "var1_ko": "바리에이션1 해석",
                    "var2_en": "Variation 2 using this word.",
                    "var2_ko": "바리에이션2 해석",
                    "var3_en": "Variation 3 using this word.",
                    "var3_ko": "바리에이션3 해석",
                    "wrong_options": ["한국어오답1", "한국어오답2"],
                    "confusing_words": ["similrword", "simialrword"]
                },
                {
                    "word": "EnglishWord3 (영어만! 절대 한국어 금지)",
                    "meaning": "한국어뜻3",
                    "pos": "품사",
                    "phonetics": "/발음기호/",
                    "example_en": "Example sentence.",
                    "example_ko": "예문 해석",
                    "var1_en": "Variation 1 using this word.",
                    "var1_ko": "바리에이션1 해석",
                    "var2_en": "Variation 2 using this word.",
                    "var2_ko": "바리에이션2 해석",
                    "var3_en": "Variation 3 using this word.",
                    "var3_ko": "바리에이션3 해석",
                    "wrong_options": ["한국어오답1", "한국어오답2"],
                    "confusing_words": ["similrword", "simialrword"]
                }
            ]
        }`;

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", 
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ 
                model: "gpt-4o-mini", 
                messages: [{ role: "user", content: instruction }], 
                response_format: { type: "json_object" }, 
                max_tokens: 6000
            })
        });
        const gptData = await gptResponse.json();

        if (!gptData.choices || !gptData.choices[0]) {
            throw new Error("AI 응답 없음: " + JSON.stringify(gptData));
        }
        
        let aiText = gptData.choices[0].message.content;
        let parsedData;
        try {
            parsedData = JSON.parse(aiText);
        } catch (err) {
            const match = aiText.match(/```json\n([\s\S]*?)\n```/);
            if (match) parsedData = JSON.parse(match[1]);
            else throw new Error("AI 포맷 오류");
        }
        return res.status(200).json(parsedData);
        
    } else {
        // ✅ BUG FIX: target_english가 없거나 "???" 포함시 빈 문자열로 대체 방지
        const cleanTarget = (target_english || "").replace(/\?+/g, "").trim();
        
        if (!cleanTarget) {
            return res.status(200).json({ 
                score: 0, 
                feedback: "평가할 텍스트가 없습니다.", 
                recognized_text: userSpeech 
            });
        }

        const evalInstruction = `목표 문장: "${cleanTarget}", 사용자 발음: "${userSpeech}". 
        [채점 규칙] 
        - 목표 문장과 사용자가 말한 내용을 비교해서 발음 정확도를 채점하세요.
        - 아주 관대하게 채점하세요. 비슷하게 발음했으면 높은 점수를 주세요.
        - "score"에는 10~100 사이 정수만 반환하세요.
        - "feedback"에는 한국어로 간단한 피드백을 작성하세요.
        JSON 형식으로만 반환: {"score": 숫자, "feedback": "피드백"}`;

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", 
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({ 
                model: "gpt-4o-mini", 
                messages: [{ role: "user", content: evalInstruction }], 
                response_format: { type: "json_object" } 
            })
        });
        const gptData = await gptResponse.json();
        const result = JSON.parse(gptData.choices[0].message.content);
        res.status(200).json({ ...result, recognized_text: userSpeech });
    }
} catch (error) { 
    res.status(500).json({ error: error.message }); 
}
```

}