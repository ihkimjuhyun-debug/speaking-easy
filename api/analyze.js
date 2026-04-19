'use strict';
var sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };
function fetchT(url, opts, ms) {
  ms = ms || 25000;
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms);
  opts.signal = ctrl.signal;
  return fetch(url, opts).finally(function() { clearTimeout(timer); });
}
function retry(fn, n) {
  n = n || 3;
  var attempt = 0;
  function run() {
    return fn().then(function(r) {
      if ((r.status === 429 || r.status >= 500) && attempt < n - 1) {
        attempt++;
        return sleep(Math.pow(2, attempt - 1) * 600 + Math.random() * 400).then(run);
      }
      return r;
    }).catch(function(e) {
      if (e.name === 'AbortError') throw e;
      if (attempt < n - 1) {
        attempt++;
        return sleep(Math.pow(2, attempt - 1) * 600 + Math.random() * 400).then(run);
      }
      throw e;
    });
  }
  return run();
}
function callGPT(key, messages, maxTokens) {
  maxTokens = maxTokens || 4000;
  return retry(function() {
    return fetchT('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      })
    }, 25000);
  }, 3).then(function(r) {
    return r.text().then(function(raw) {
      if (!r.ok) throw new Error('GPT ' + r.status + ': ' + raw.slice(0, 200));
      var d = JSON.parse(raw);
      var c = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!c) throw new Error('GPT empty response');
      return c;
    });
  });
}

function buildPrompt(text, difficulty) {
  var level = difficulty === 'beginner' ? '\ucd08\uae09(\uc27d\uc740\ub2e8\uc5b4)' : difficulty === 'advanced' ? '\uace0\uae09(\ud559\uc220\uc801)' : '\uc911\uae09(\uc2e4\uc0dd\ud65c/\ube44\uc988\ub2c8\uc2a4)';

  var p = '';
  p += '\uc0ac\uc6a9\uc790 \ud55c\uad6d\uc5b4: "' + text + '"\n';
  p += '\ub09c\uc774\ub3c4: ' + level + '\n\n';

  p += '=== \ubc18\ub4dc\uc2dc \ubaa8\ub4e0 \ud544\ub4dc\ub97c \uccb4\uc6b8 \uac83. \ube48 \ubb38\uc790\uc5f4("") \uc808\ub300 \uae08\uc9c0 ===\n\n';

  p += '[title_ko] \ud55c\uad6d\uc5b4 \uc81c\ubaa9 (\uc608: "\uc2e4\uc218\ub97c \uc778\uc815\ud558\ub294 \uc0c1\ud669")\n';
  p += '[title_en] \uc601\uc5b4 \uc81c\ubaa9 (\uc608: "Admitting Mistakes")\n';
  p += '[korean] \uc0ac\uc6a9\uc790\uc758 \ud55c\uad6d\uc5b4\ub97c AI\uac00 \uae54\ub054\ud558\uac8c \uad50\uc815\ud55c \ubb38\uc7a5 (\ubc18\ub4dc\uc2dc \uc81c\ub300\ub85c \ub41c \ud55c\uad6d\uc5b4 \ubb38\uc7a5)\n';
  p += '[english] korean\uc758 \uc644\uc804\ud55c \uc601\uc5b4 \ubc88\uc5ed (\ubc18\ub4dc\uc2dc \uc644\uc131\ub41c \uc601\uc5b4 \ubb38\uc7a5)\n\n';

  p += '[dictionary] \uc601\uc5b4 \ud575\uc2ec\ub2e8\uc5b4 3\uac1c:\n';
  p += '  \ub2e8\uc5b41, \ub2e8\uc5b42, \ub2e8\uc5b43 \ub9ac\ud130\ub7f4 \ud0a4\ub85c \uc0ac\uc6a9\n';
  p += '  ko: \ud55c\uad6d\uc5b4 \ub73b, pos: \ud488\uc0ac, phonetics: \ubc1c\uc74c\uae30\ud638, ko_context: \ud55c\uad6d\uc5b4 \uc608\uc2dc \ubb38\uc7a5\n\n';

  p += '[keys] \uc601\uc5b4 \ud575\uc2ec\ud45c\ud604 3\uac1c. \uac01 \ud56d\ubaa9\uc5d0 \ub2e4\uc74c \ubaa8\ub450 \ud3ec\ud568:\n';
  p += '  phrase: \uc601\uc5b4 \ud45c\ud604 (\uc608: "take responsibility")\n';
  p += '  ko_org: phrase\uc758 \ud55c\uad6d\uc5b4 \ubfd0 (\uc608: "\uccb4\uc784\uc9c0\ub2e4")\n';
  p += '  en_org: phrase\ub97c \uc0ac\uc6a9\ud55c \uc644\uc131 \uc601\uc5b4 \ubb38\uc7a5\n';
  p += '  ko_var1: \ub2e4\ub978 \uc0c1\ud669 \ud55c\uad6d\uc5b4 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n';
  p += '  en_var1: ko_var1\uc758 \uc601\uc5b4 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n';
  p += '  ko_var2: \ub610 \ub2e4\ub978 \uc0c1\ud669 \ud55c\uad6d\uc5b4 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n';
  p += '  en_var2: ko_var2\uc758 \uc601\uc5b4 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n';
  p += '  ko_long: \uae34 \ud55c\uad6d\uc5b4 \ubb38\uc7a5 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n';
  p += '  en_long: ko_long\uc758 \uc601\uc5b4 (\ubc18\ub4dc\uc2dc phrase \ud3ec\ud568)\n\n';

  p += '[drills] 3\ub2e8\uacc4 \uc5f0\uc2b5:\n';
  p += '  step1: blur_part="none", ko=\ud55c\uad6d\uc5b4, en_full=\uc644\uc804\ud55c \uc601\uc5b4 \ubb38\uc7a5\n';
  p += '  step2: blur_part=\ube14\ub7ec \ub2e8\uc5b4(\uc18c\ubb38\uc790), ko=\ud55c\uad6d\uc5b4, en_full=\uc644\uc804\ud55c \uc601\uc5b4 \ubb38\uc7a5\n';
  p += '  step3: blur_part="all", ko=\ud55c\uad6d\uc5b4, en_full=\uc644\uc804\ud55c \uc601\uc5b4 \ubb38\uc7a5\n';
  p += '  \u26a0\ufe0f en_full\uc740 \ubc18\ub4dc\uc2dc \uc644\uc131\ub41c \uc601\uc5b4 \ubb38\uc7a5. "Missing Text" \uc808\ub300 \uae08\uc9c0.\n\n';

  p += '[vocab] \uc601\uc5b4 \ub2e8\uc5b4 3\uac1c:\n';
  p += '  word: \uc601\uc5b4\ub9cc(\ud55c\uad6d\uc5b4 \uc808\ub300 \uae08\uc9c0)\n';
  p += '  meaning: \ud55c\uad6d\uc5b4 \ub73b\n';
  p += '  pos: \ud488\uc0ac (noun/verb/adj/adv)\n';
  p += '  phonetics: \ubc1c\uc74c\uae30\ud638\n';
  p += '  example_en: \uc608\uc2dc \uc601\uc5b4 \ubb38\uc7a5\n';
  p += '  example_ko: \uc608\uc2dc \ud55c\uad6d\uc5b4 \ubb38\uc7a5\n';
  p += '  var1_en, var1_ko, var2_en, var2_ko, var3_en, var3_ko: \ubcc0\ud615 \ubb38\uc7a5\n';
  p += '  wrong_options: \uc624\ub2f5 2\uac1c \ubc30\uc5f4\n';
  p += '  confusing_words: \ud5f7\uac08\ub9ac\ub294 \uc2a4\ud399 2\uac1c \ubc30\uc5f4\n\n';

  p += 'JSON\ub9cc \ubc18\ud658 (\ub2e4\ub978 \ud14d\uc2a4\ud2b8 \uc5c6\uc774):\n';
  p += '{\n';
  p += '  "title_ko": "\ub124 \uc774\uc57c\uae30\uc758 \ud55c\uad6d\uc5b4 \uc81c\ubaa9",\n';
  p += '  "title_en": "English Title Here",\n';
  p += '  "korean": "\uc0ac\uc6a9\uc790\uac00 \ub9d0\ud55c \ub0b4\uc6a9\uc744 \uc5ec\uae30\uc5d0 \ud55c\uad6d\uc5b4\ub85c \uc77c\uad00\uc131 \uc788\uac8c \uc791\uc131",\n';
  p += '  "english": "Complete English translation of the korean field here",\n';
  p += '  "dictionary": {\n';
  p += '    "\ub2e8\uc5b41": {"ko": "\ub73b1", "pos": "noun", "phonetics": "/\ubc1c\uc74c/", "ko_context": "\uc608\uc2dc\ubb38\uc7a51"},\n';
  p += '    "\ub2e4\uc5b42": {"ko": "\ub73b2", "pos": "verb", "phonetics": "/\ubc1c\uc74c/", "ko_context": "\uc608\uc2dc\ubb38\uc7a52"},\n';
  p += '    "\ub2e4\uc5b43": {"ko": "\ub73b3", "pos": "adj", "phonetics": "/\ubc1c\uc74c/", "ko_context": "\uc608\uc2dc\ubb38\uc7a53"}\n';
  p += '  },\n';
  p += '  "keys": [\n';
  p += '    {"phrase": "key phrase 1", "ko_org": "\ud55c\uad6d\uc5b4 \ub73b1", "en_org": "Sentence using key phrase 1.", "ko_var1": "\ubcc0\ud615 \ud55c\uad6d\uc5b41", "en_var1": "Variation sentence 1.", "ko_var2": "\ubcc0\ud615 \ud55c\uad6d\uc5b42", "en_var2": "Variation sentence 2.", "ko_long": "\uae34 \ud55c\uad6d\uc5b41", "en_long": "Long sentence 1."},\n';
  p += '    {"phrase": "key phrase 2", "ko_org": "\ud55c\uad6d\uc5b4 \ub73b2", "en_org": "Sentence using key phrase 2.", "ko_var1": "\ubcc0\ud615 \ud55c\uad6d\uc5b41", "en_var1": "Variation sentence 1.", "ko_var2": "\ubcc0\ud615 \ud55c\uad6d\uc5b42", "en_var2": "Variation sentence 2.", "ko_long": "\uae34 \ud55c\uad6d\uc5b42", "en_long": "Long sentence 2."},\n';
  p += '    {"phrase": "key phrase 3", "ko_org": "\ud55c\uad6d\uc5b4 \ub73b3", "en_org": "Sentence using key phrase 3.", "ko_var1": "\ubcc0\ud615 \ud55c\uad6d\uc5b41", "en_var1": "Variation sentence 1.", "ko_var2": "\ubcc0\ud615 \ud55c\uad6d\uc5b42", "en_var2": "Variation sentence 2.", "ko_long": "\uae34 \ud55c\uad6d\uc5b43", "en_long": "Long sentence 3."}\n';
  p += '  ],\n';
  p += '  "drills": [\n';
  p += '    {"step": 1, "ko": "\uc5f0\uc2b5 \ud55c\uad6d\uc5b41", "en_full": "Complete drill sentence 1.", "blur_part": "none"},\n';
  p += '    {"step": 2, "ko": "\uc5f0\uc2b5 \ud55c\uad6d\uc5b42", "en_full": "Complete drill sentence 2.", "blur_part": "keyword"},\n';
  p += '    {"step": 3, "ko": "\uc5f0\uc2b5 \ud55c\uad6d\uc5b43", "en_full": "Complete drill sentence 3.", "blur_part": "all"}\n';
  p += '  ],\n';
  p += '  "vocab": [\n';
  p += '    {"word": "word1", "meaning": "\ub73b1", "pos": "noun", "phonetics": "/w\u025crd/", "example_en": "Example 1.", "example_ko": "\uc608\uc2dc1", "var1_en": "Var1.", "var1_ko": "\ubcc0\ud6151", "var2_en": "Var2.", "var2_ko": "\ubcc0\ud6152", "var3_en": "Var3.", "var3_ko": "\ubcc0\ud6153", "wrong_options": ["\uc624\ub2f51", "\uc624\ub2f52"], "confusing_words": ["\uc2a4\ud3a81", "\uc2a4\ud3a82"]},\n';
  p += '    {"word": "word2", "meaning": "\ub73b2", "pos": "verb", "phonetics": "/w\u025crd/", "example_en": "Example 2.", "example_ko": "\uc608\uc2dc2", "var1_en": "Var1.", "var1_ko": "\ubcc0\ud615 1", "var2_en": "Var2.", "var2_ko": "\ubcc0\ud615 2", "var3_en": "Var3.", "var3_ko": "\ubcc0\ud615 3", "wrong_options": ["\uc624\ub2f51", "\uc624\ub2f52"], "confusing_words": ["\uc2a4\ud3a81", "\uc2a4\ud3a82"]},\n';
  p += '    {"word": "word3", "meaning": "\ub73b3", "pos": "adj", "phonetics": "/w\u025crd/", "example_en": "Example 3.", "example_ko": "\uc608\uc2dc3", "var1_en": "Var1.", "var1_ko": "\ubcc0\ud615 1", "var2_en": "Var2.", "var2_ko": "\ubcc0\ud615 2", "var3_en": "Var3.", "var3_ko": "\ubcc0\ud615 3", "wrong_options": ["\uc624\ub2f51", "\uc624\ub2f52"], "confusing_words": ["\uc2a4\ud3a81", "\uc2a4\ud3a82"]}\n';
  p += '  ]\n';
  p += '}';
  return p;
}

function validate(obj) {
  var required = ['title_ko','title_en','korean','english','dictionary','keys','drills','vocab'];
  for (var i = 0; i < required.length; i++) {
    if (!obj[required[i]]) throw new Error('Missing or empty: ' + required[i]);
  }
  if (!Array.isArray(obj.keys)   || obj.keys.length   < 3) throw new Error('keys < 3');
  if (!Array.isArray(obj.drills) || obj.drills.length < 3) throw new Error('drills < 3');
  if (!Array.isArray(obj.vocab)  || obj.vocab.length  < 3) throw new Error('vocab < 3');
  for (var k = 0; k < obj.keys.length; k++) {
    var key = obj.keys[k];
    if (!key.ko_org || !key.en_org || !key.en_full && !key.en_long) throw new Error('keys[' + k + '] missing fields');
  }
  for (var d = 0; d < obj.drills.length; d++) {
    if (!obj.drills[d].en_full || !obj.drills[d].ko) throw new Error('drills[' + d + '] missing en_full or ko');
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { console.error('[analyze] no key'); return res.status(500).json({ error: 'API key missing' }); }

  var body = req.body || {};
  var text = (body.text || '').trim();
  var difficulty = body.difficulty || 'intermediate';

  if (!text || text.length < 2) {
    return res.status(400).json({ error: '\uc74c\uc131\uc774 \uba85\ud655\ud788 \uc778\uc2dd\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \ub9d0\uc528\uc8fc\uc138\uc694!' });
  }

  var messages = [{ role: 'user', content: buildPrompt(text, difficulty) }];

  try {
    var parsed;
    var lastErr;

    // 최대 3회 시도 (검증 실패 시 재시도)
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var content = await callGPT(KEY, messages, 4000);
        parsed = JSON.parse(content);
        validate(parsed);
        break; // 검증 통과
      } catch(e) {
        lastErr = e;
        console.warn('[analyze] attempt ' + (attempt+1) + ' failed:', e.message);
        if (attempt === 2) throw lastErr;
      }
    }

    return res.status(200).json(parsed);

  } catch(e) {
    if (e.name === 'AbortError') {
      console.error('[analyze] timeout');
      return res.status(504).json({ error: '\ubd84\uc11d \uc2dc\uac04\uc774 \ucd08\uacfc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.' });
    }
    console.error('[analyze]', e.message);
    return res.status(500).json({ error: '\ud559\uc2b5 \ub370\uc774\ud130 \uc0dd\uc131 \uc2e4\ud328. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.' });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '1mb' } } };
module.exports = handler;
