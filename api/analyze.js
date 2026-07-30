'use strict';
var sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };

function fetchT(url, opts, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms || 25000);
  opts.signal = ctrl.signal;
  return fetch(url, opts).finally(function() { clearTimeout(timer); });
}

function retry(fn, n) {
  var attempt = 0;
  function run() {
    return fn().catch(function(e) {
      if (e.name === 'AbortError') throw e;
      if (attempt < (n || 3) - 1) { attempt++; return sleep(attempt * 700).then(run); }
      throw e;
    });
  }
  return run();
}

function buildPrompt(text, difficulty) {
  var lvl = difficulty === 'beginner' ? 'basic/easy' : difficulty === 'advanced' ? 'advanced/academic' : 'intermediate/business';
  // vocab_group: 3개 유사 단어를 각 문장에 1개씩 넣는 빈칸 채우기
  // context_sentence: 각 단어별 문맥 문장 (_____ 포함)
  return 'Korean: "' + text + '"\nLevel: ' + lvl + '\n\n'
    + 'Rules: ALL fields required. NO empty strings. vocab words must be ENGLISH only.\n'
    + 'vocab_group: 3 sentences using all 3 vocab words. Words must be NEAR-SYNONYMS '
    + '(similar meaning, different nuance/context). Each sentence contextually requires exactly one specific word.\n'
    + 'context_sentence: English sentence with _____ where the vocab word fits.\n\n'
    + 'Return ONLY JSON:\n'
    + '{\n'
    + '  "title_ko":"제목","title_en":"Title",\n'
    + '  "korean":"교정된 자연스러운 한국어 전체 문장","english":"Complete English translation",\n'
    + '  "dictionary":{\n'
    + '    "단어1":{"ko":"뜻","pos":"noun","phonetics":"/fəˈnɛtɪks/","ko_context":"예시 문장"},\n'
    + '    "단어2":{"ko":"뜻","pos":"verb","phonetics":"/fəˈnɛtɪks/","ko_context":"예시 문장"},\n'
    + '    "단어3":{"ko":"뜻","pos":"adj","phonetics":"/fəˈnɛtɪks/","ko_context":"예시 문장"}\n'
    + '  },\n'
    + '  "keys":[\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence using phrase.","ko_var1":"다른상황1","en_var1":"Var1 with phrase.","ko_var2":"다른상황2","en_var2":"Var2 with phrase.","ko_long":"긴설명","en_long":"Long sentence with phrase."},\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence using phrase.","ko_var1":"다른상황1","en_var1":"Var1 with phrase.","ko_var2":"다른상황2","en_var2":"Var2 with phrase.","ko_long":"긴설명","en_long":"Long sentence with phrase."},\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence using phrase.","ko_var1":"다른상황1","en_var1":"Var1 with phrase.","ko_var2":"다른상황2","en_var2":"Var2 with phrase.","ko_long":"긴설명","en_long":"Long sentence with phrase."}\n'
    + '  ],\n'
    + '  "drills":[\n'
    + '    {"step":1,"ko":"한국어 문장1","en_full":"Complete English sentence 1.","blur_part":"none"},\n'
    + '    {"step":2,"ko":"한국어 문장2","en_full":"Complete English sentence 2.","blur_part":"keyword"},\n'
    + '    {"step":3,"ko":"한국어 문장3","en_full":"Complete English sentence 3.","blur_part":"all"}\n'
    + '  ],\n'
    + '  "vocab":[\n'
    + '    {"word":"englishWord1","meaning":"한국어뜻1","pos":"noun","phonetics":"/wɜːrd/",\n'
    + '     "context_sentence":"Full sentence using _____ in natural context.","context_sentence_ko":"___를 사용한 한국어 문장.",\n'
    + '     "example_en":"Ex sentence.","example_ko":"예시1.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.",\n'
    + '     "wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["similar1","similar2"]},\n'
    + '    {"word":"englishWord2","meaning":"한국어뜻2","pos":"verb","phonetics":"/wɜːrd/",\n'
    + '     "context_sentence":"Full sentence using _____ in natural context.","context_sentence_ko":"___를 사용한 한국어 문장.",\n'
    + '     "example_en":"Ex sentence.","example_ko":"예시2.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.",\n'
    + '     "wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["similar1","similar2"]},\n'
    + '    {"word":"englishWord3","meaning":"한국어뜻3","pos":"adj","phonetics":"/wɜːrd/",\n'
    + '     "context_sentence":"Full sentence using _____ in natural context.","context_sentence_ko":"___를 사용한 한국어 문장.",\n'
    + '     "example_en":"Ex sentence.","example_ko":"예시3.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.",\n'
    + '     "wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["similar1","similar2"]}\n'
    + '  ],\n'
    + '  "vocab_group":[\n'
    + '    {"en":"Sentence where englishWord1 fits best: _____.","ko":"이 문장엔 단어1이 적합: _____.","answer":"englishWord1"},\n'
    + '    {"en":"Sentence where englishWord2 fits best: _____.","ko":"이 문장엔 단어2가 적합: _____.","answer":"englishWord2"},\n'
    + '    {"en":"Sentence where englishWord3 fits best: _____.","ko":"이 문장엔 단어3이 적합: _____.","answer":"englishWord3"}\n'
    + '  ]\n'
    + '}';
}

function validate(obj) {
  var req = ['title_ko','title_en','korean','english','dictionary','keys','drills','vocab','vocab_group'];
  for (var i = 0; i < req.length; i++) { if (!obj[req[i]]) throw new Error('Missing: ' + req[i]); }
  if (!Array.isArray(obj.keys)        || obj.keys.length        < 3) throw new Error('keys < 3');
  if (!Array.isArray(obj.drills)      || obj.drills.length      < 3) throw new Error('drills < 3');
  if (!Array.isArray(obj.vocab)       || obj.vocab.length       < 3) throw new Error('vocab < 3');
  if (!Array.isArray(obj.vocab_group) || obj.vocab_group.length < 3) throw new Error('vocab_group < 3');
  for (var d = 0; d < obj.drills.length; d++) {
    if (!obj.drills[d].en_full || !obj.drills[d].ko) throw new Error('drills[' + d + '] empty');
  }
  for (var v = 0; v < obj.vocab.length; v++) {
    if (!obj.vocab[v].context_sentence) throw new Error('vocab[' + v + '] missing context_sentence');
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var KEY = process.env.OPENAI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API key missing' });

  var body = req.body || {};
  var text = (body.text || '').trim();
  var diff = body.difficulty || 'intermediate';

  if (!text || text.length < 2) {
    return res.status(400).json({ error: '음성이 인식되지 않았습니다. 다시 시도해주세요.' });
  }

  var prompt = buildPrompt(text, diff);

  async function callGPT() {
    return retry(function() {
      return fetchT('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
          temperature: 0.4,
          response_format: { type: 'json_object' }
        })
      }, 25000);
    }, 3).then(function(r) {
      return r.text().then(function(raw) {
        if (!r.ok) throw new Error('GPT HTTP ' + r.status);
        var d = JSON.parse(raw);
        var c = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!c) throw new Error('GPT empty');
        return JSON.parse(c);
      });
    });
  }

  try {
    var parsed, lastErr;
    for (var i = 0; i < 3; i++) {
      try { parsed = await callGPT(); validate(parsed); break; }
      catch(e) { lastErr = e; console.warn('[analyze] attempt', i+1, e.message); if (i === 2) throw lastErr; }
    }
    return res.status(200).json(parsed);
  } catch(e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: '분석 시간이 초과됐습니다.' });
    console.error('[analyze]', e.message);
    return res.status(500).json({ error: '학습 데이터 생성 실패. 다시 시도해주세요.' });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '1mb' } } };
module.exports = handler;
