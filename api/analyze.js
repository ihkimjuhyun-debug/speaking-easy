// api/analyze.js — 텍스트 → 학습 데이터 생성 (GPT 전용)

export const config = {
api: {
bodyParser: {
sizeLimit: ‘1mb’,
},
},
};

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY 환경변수 없음' });

try {
    const { text, difficulty } = req.body;
    if (!text || text.trim().length < 2) {
        return res.status(400).json({ error: '음성이 명확히 인식되지 않았습니다. 조용한 곳에서 다시 말씀해주세요!' });
    }

    const level = difficulty === 'beginner' ? '초급(쉬운단어)' :
                  difficulty === 'advanced'  ? '고급(학술적)' : '중급(실생활/비즈니스)';

    // 컴팩트 프롬프트: 입력 토큰 최소화, 응답 속도 향상
    const prompt =
```

`사용자 말(한국어): “${text}”
난이도: ${level}

규칙:

- keys 3개 필수. en_var1/en_var2/en_long은 phrase 핵심단어 반드시 포함.
- vocab 3개 필수. word=영어만(한국어금지). meaning=한국어. var1~3=같은단어 다른실생활문장.
- dictionary 3개 필수. key=영어단어.
- blur_part: 해당단어 소문자 또는 “none” 또는 “all”

JSON 반환:
{
“title_ko”:””,“title_en”:””,“korean”:””,“english”:””,
“dictionary”:{
“단어1”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},
“단어2”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},
“단어3”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””}
},
“keys”:[
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},
{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””}
],
“drills”:[
{“step”:1,“ko”:””,“en_full”:””,“blur_part”:“none”},
{“step”:2,“ko”:””,“en_full”:””,“blur_part”:“핵심단어소문자”},
{“step”:3,“ko”:””,“en_full”:””,“blur_part”:“all”}
],
“vocab”:[
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“한국어오답1”,“한국어오답2”],“confusing_words”:[“비슷스펠링1”,“비슷스펠링2”]},
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“한국어오답1”,“한국어오답2”],“confusing_words”:[“비슷스펠링1”,“비슷스펠링2”]},
{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“한국어오답1”,“한국어오답2”],“confusing_words”:[“비슷스펠링1”,“비슷스펠링2”]}
]
}`;

```
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
        }),
    });

    const responseText = await gptResponse.text();

    if (!gptResponse.ok) {
        console.error('[Analyze] GPT 에러:', responseText);
        return res.status(500).json({ error: `GPT 오류 (${gptResponse.status}): ${responseText.slice(0, 100)}` });
    }

    let gptData;
    try {
        gptData = JSON.parse(responseText);
    } catch (e) {
        return res.status(500).json({ error: 'GPT 응답 파싱 실패' });
    }

    if (!gptData.choices?.[0]?.message?.content) {
        return res.status(500).json({ error: 'GPT 응답 형식 오류' });
    }

    let parsed;
    try {
        parsed = JSON.parse(gptData.choices[0].message.content);
    } catch (e) {
        return res.status(500).json({ error: '학습 데이터 파싱 실패' });
    }

    return res.status(200).json(parsed);

} catch (err) {
    console.error('[Analyze] catch:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
}
```

}