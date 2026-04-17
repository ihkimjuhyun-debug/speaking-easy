// /api/analyze.js
// 역할: 한국어 텍스트 → 학습 데이터 생성 (GPT)
// 실행시간: 5~9초 → Vercel Hobby 10초 제한 안전

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

```
const { text, difficulty, lang_mode } = req.body;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: "API 키 오류" });

try {
    let levelInstr = difficulty === "beginner"
        ? "초급: 쉬운 단어, 짧은 문장"
        : difficulty === "intermediate"
        ? "중급: 실생활/비즈니스 표현"
        : "고급: 학술적, 세련된 어휘";

    const instruction = `
```

사용자 말: “${text}”
난이도: ${levelInstr}

[규칙]
A. keys: 정확히 3개. en_var1/en_var2/en_long은 반드시 phrase의 핵심 단어 포함.
B. vocab: 정확히 3개. word는 영어만(한국어 절대 금지). meaning은 한국어.
C. vocab var1~3: 같은 단어를 다른 실생활 상황에서 사용하는 문장.
D. dictionary: 정확히 3개. key는 영어 단어.

JSON만 반환:
{“title_ko”:””,“title_en”:””,“korean”:””,“english”:””,
“dictionary”:{“word1”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},“word2”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},“word3”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””}},
“keys”:[
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””}],
“drills”:[{“step”:1,“ko”:””,“en_full”:””,“blur_part”:“none”},{“step”:2,“ko”:””,“en_full”:””,“blur_part”:“핵심단어”},{“step”:3,“ko”:””,“en_full”:””,“blur_part”:“all”}],
“vocab”:[
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“비슷한스펠링1”,“비슷한스펠링2”]},
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“비슷한스펠링1”,“비슷한스펠링2”]},
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“비슷한스펠링1”,“비슷한스펠링2”]}]}`;

```
    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: instruction }],
            response_format: { type: "json_object" },
            max_tokens: 4000
        })
    });

    const gptData = await gptResponse.json();
    if (!gptData.choices || !gptData.choices[0]) {
        throw new Error("AI 응답 없음: " + JSON.stringify(gptData));
    }

    const parsed = JSON.parse(gptData.choices[0].message.content);
    res.status(200).json(parsed);

} catch (error) {
    res.status(500).json({ error: error.message });
}
```

}