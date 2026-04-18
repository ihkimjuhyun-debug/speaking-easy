// api/analyze.js

module.exports = async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'API 키 없음' });

try {
    const { text, difficulty } = req.body;
    if (!text || text.trim().length < 2) {
        return res.status(400).json({ error: '음성이 명확히 인식되지 않았습니다. 다시 말씀해주세요!' });
    }

    const level = difficulty === 'beginner' ? '초급(쉬운단어)' :
                  difficulty === 'advanced'  ? '고급(학술적)' : '중급(실생활/비즈니스)';

    const prompt =
```

‘사용자 말(한국어): “’ + text + ‘”\n’ +
’난이도: ’ + level + ‘\n\n’ +
‘규칙:\n’ +
‘- keys 3개. en_var1/en_var2/en_long은 phrase 핵심단어 포함 필수.\n’ +
‘- vocab 3개. word=영어만(한국어절대금지). meaning=한국어. var1~3=같은단어 다른실생활문장.\n’ +
‘- dictionary 3개. key=영어단어.\n’ +
‘- blur_part: 소문자 단어 또는 “none” 또는 “all”\n\n’ +
‘JSON만 반환:\n’ +
‘{“title_ko”:””,“title_en”:””,“korean”:””,“english”:””,’ +
‘“dictionary”:{“단어1”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},“단어2”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””},“단어3”:{“ko”:””,“pos”:””,“phonetics”:””,“ko_context”:””}},’ +
‘“keys”:[’ +
‘{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},’ +
‘{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””},’ +
‘{“phrase”:“영어표현”,“ko_org”:””,“en_org”:””,“ko_var1”:””,“en_var1”:””,“ko_var2”:””,“en_var2”:””,“ko_long”:””,“en_long”:””}],’ +
‘“drills”:[{“step”:1,“ko”:””,“en_full”:””,“blur_part”:“none”},{“step”:2,“ko”:””,“en_full”:””,“blur_part”:“키워드”},{“step”:3,“ko”:””,“en_full”:””,“blur_part”:“all”}],’ +
‘“vocab”:[’ +
‘{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“스펠1”,“스펠2”]},’ +
‘{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“스펠1”,“스펠2”]},’ +
‘{“word”:“영어단어”,“meaning”:“한국어뜻”,“pos”:””,“phonetics”:””,“example_en”:””,“example_ko”:””,“var1_en”:””,“var1_ko”:””,“var2_en”:””,“var2_ko”:””,“var3_en”:””,“var3_ko”:””,“wrong_options”:[“오답1”,“오답2”],“confusing_words”:[“스펠1”,“스펠2”]}]}’;

```
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_KEY,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
        }),
    });

    const rawText = await gptResponse.text();
    if (!gptResponse.ok) {
        console.error('[analyze] gpt error:', rawText);
        return res.status(500).json({ error: 'GPT 오류: ' + rawText.slice(0, 100) });
    }

    const gptData = JSON.parse(rawText);
    if (!gptData.choices?.[0]?.message?.content) {
        return res.status(500).json({ error: 'GPT 응답 형식 오류' });
    }

    const parsed = JSON.parse(gptData.choices[0].message.content);
    return res.status(200).json(parsed);

} catch (err) {
    console.error('[analyze] catch:', err.message);
    return res.status(500).json({ error: err.message });
}
```

};

module.exports.config = {
api: { bodyParser: { sizeLimit: ‘1mb’ } },
};