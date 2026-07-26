'use strict';
// ── analyze.js: 한국어 텍스트 → 학습 JSON 생성 (초고속 버전) ──────────────
// 핵심 최적화: 프롬프트 70% 단축 + max_tokens 축소 + 25초 타임아웃

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
      if (attempt < (n||3) - 1) {
        attempt++;
        return sleep(attempt * 800).then(run);
      }
      throw e;
    });
  }
  return run();
}

function buildPrompt(text, difficulty) {
  var lvl = difficulty === 'beginner' ? 'basic/easy' : difficulty === 'advanced' ? 'advanced/academic' : 'intermediate/business';
  // ── 초간결 프롬프트: 필드명 영어로 통일, 예시 최소화 ────────────
  return 'Korean input: "' + text + '"\nLevel: ' + lvl + '\n\n'
    + 'Return ONLY valid JSON. ALL fields required, NO empty strings.\n\n'
    + '{\n'
    + '  "title_ko":"제목","title_en":"Title",\n'
    + '  "korean":"교정된 자연스러운 한국어 문장","english":"Complete English translation",\n'
    + '  "dictionary":{\n'
    + '    "단어1":{"ko":"뜻","pos":"noun","phonetics":"/fəˈnɛtɪks/","ko_context":"예시문장"},\n'
    + '    "단어2":{"ko":"뜻","pos":"verb","phonetics":"/fəˈnɛtɪks/","ko_context":"예시문장"},\n'
    + '    "단어3":{"ko":"뜻","pos":"adj","phonetics":"/fəˈnɛtɪks/","ko_context":"예시문장"}\n'
    + '  },\n'
    + '  "keys":[\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence with phrase.","ko_var1":"다른 뜻1","en_var1":"Var1 sentence with phrase.","ko_var2":"다른 뜻2","en_var2":"Var2 sentence with phrase.","ko_long":"긴 설명","en_long":"Long sentence with phrase."},\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence with phrase.","ko_var1":"다른 뜻1","en_var1":"Var1 sentence with phrase.","ko_var2":"다른 뜻2","en_var2":"Var2 sentence with phrase.","ko_long":"긴 설명","en_long":"Long sentence with phrase."},\n'
    + '    {"phrase":"key phrase","ko_org":"뜻","en_org":"Sentence with phrase.","ko_var1":"다른 뜻1","en_var1":"Var1 sentence with phrase.","ko_var2":"다른 뜻2","en_var2":"Var2 sentence with phrase.","ko_long":"긴 설명","en_long":"Long sentence with phrase."}\n'
    + '  ],\n'
    + '  "drills":[\n'
    + '    {"step":1,"ko":"한국어 문장1","en_full":"Complete English drill sentence 1.","blur_part":"none"},\n'
    + '    {"step":2,"ko":"한국어 문장2","en_full":"Complete English drill sentence 2.","blur_part":"keyword"},\n'
    + '    {"step":3,"ko":"한국어 문장3","en_full":"Complete English drill sentence 3.","blur_part":"all"}\n'
    + '  ],\n'
    + '  "vocab":[\n'
    + '    {"word":"englishWord","meaning":"한국어뜻","pos":"noun","phonetics":"/wɜːrd/","example_en":"Ex sentence.","example_ko":"예시 한국어.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.","wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["simlar1","similar2"]},\n'
    + '    {"word":"englishWord","meaning":"한국어뜻","pos":"verb","phonetics":"/wɜːrd/","example_en":"Ex sentence.","example_ko":"예시 한국어.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.","wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["simlar1","similar2"]},\n'
    + '    {"word":"englishWord","meaning":"한국어뜻","pos":"adj","phonetics":"/wɜːrd/","example_en":"Ex sentence.","example_ko":"예시 한국어.","var1_en":"Var1.","var1_ko":"변형1.","var2_en":"Var2.","var2_ko":"변형2.","var3_en":"Var3.","var3_ko":"변형3.","wrong_options":["한국어오답1","한국어오답2"],"confusing_words":["simlar1","similar2"]}\n'
    + '  ]\n'
    + '}';
}

function validate(obj) {
  var req = ['title_ko','title_en','korean','english','dictionary','keys','drills','vocab'];
  for (var i = 0; i < req.length; i++) {
    if (!obj[req[i]]) throw new Error('Missing: ' + req[i]);
  }
  if (!Array.isArray(obj.keys)   || obj.keys.length   < 3) throw new Error('keys < 3');
  if (!Array.isArray(obj.drills) || obj.drills.length < 3) throw new Error('drills < 3');
  if (!Array.isArray(obj.vocab)  || obj.vocab.length  < 3) throw new Error('vocab < 3');
  for (var d = 0; d < obj.drills.length; d++) {
    if (!obj.drills[d].en_full || !obj.drills[d].ko)
      throw new Error('drills[' + d + '] empty');
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

  var body   = req.body || {};
  var text   = (body.text || '').trim();
  var diff   = body.difficulty || 'intermediate';

  if (!text || text.length < 2) {
    return res.status(400).json({ error: '음성이 인식되지 않았습니다. 다시 시도해주세요.' });
  }

  var prompt = buildPrompt(text, diff);

  // ── GPT 호출 (최대 3회 재시도) ────────────────────────────────────
  async function callGPT() {
    return retry(function() {
      return fetchT('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2800,          // 3000 → 2800 (속도 향상)
          temperature: 0.4,          // 일관성 높임 (속도 간접 향상)
          response_format: { type: 'json_object' }
        })
      }, 25000);
    }, 3).then(function(r) {
      return r.text().then(function(raw) {
        if (!r.ok) throw new Error('GPT HTTP ' + r.status);
        var d = JSON.parse(raw);
        var c = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!c) throw new Error('GPT empty response');
        return JSON.parse(c);
      });
    });
  }

  try {
    var parsed;
    var lastErr;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        parsed = await callGPT();
        validate(parsed);
        break;
      } catch(e) {
        lastErr = e;
        console.warn('[analyze] attempt', attempt + 1, 'failed:', e.message);
        if (attempt === 2) throw lastErr;
      }
    }
    return res.status(200).json(parsed);

  } catch(e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: '분석 시간이 초과됐습니다. 다시 시도해주세요.' });
    }
    console.error('[analyze]', e.message);
    return res.status(500).json({ error: '학습 데이터 생성 실패. 다시 시도해주세요.' });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '1mb' } } };
module.exports = handler;
