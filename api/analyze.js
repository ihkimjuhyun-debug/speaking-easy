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
  var prompt = '\uc0ac\uc6a9\uc790 \ub9d0(\ud55c\uad6d\uc5b4): "' + text + '"\n';
  prompt += '\ub09c\uc774\ub3c4: ' + level + '\n\n';
  prompt += '\uaddc\uce59:\n';
  prompt += '- keys 3\uac1c. en_var1/en_var2/en_long\uc740 phrase \ud575\uc2ec\ub2e8\uc5b4 \ud3ec\ud568 \ud544\uc218.\n';
  prompt += '- vocab 3\uac1c. word=\uc601\uc5b4\ub9cc(\ud55c\uad6d\uc5b4\uc808\ub300\uae08\uc9c0). meaning=\ud55c\uad6d\uc5b4. var1~3=\uac19\uc740\ub2e8\uc5b4 \ub2e4\ub978\uc2e4\uc0dd\ud65c\ubb38\uc7a5.\n';
  prompt += '- dictionary 3\uac1c. key=\uc601\uc5b4\ub2e8\uc5b4.\n';
  prompt += '- blur_part: \uc18c\ubb38\uc790 \ub2e8\uc5b4 \ub610\ub294 "none" \ub610\ub294 "all"\n';
  prompt += '- \ubaa8\ub4e0 \ud544\ub4dc\ub97c \ubc18\ub4dc\uc2dc \ucc44\uc6b8 \uac83. \ube48 \ubb38\uc790\uc5f4 \uae08\uc9c0.\n\n';
  prompt += 'JSON\ub9cc \ubc18\ud658:\n';
  prompt += '{"title_ko":"","title_en":"","korean":"","english":"",';
  prompt += '"dictionary":{"\ub2e8\uc5b41":{"ko":"","pos":"","phonetics":"","ko_context":""},"\ub2e8\uc5b42":{"ko":"","pos":"","phonetics":"","ko_context":""},"\ub2e4\uc5b43":{"ko":"","pos":"","phonetics":"","ko_context":""}},';
  prompt += '"keys":[';
  prompt += '{"phrase":"\uc601\uc5b4\ud45c\ud604","ko_org":"","en_org":"","ko_var1":"","en_var1":"","ko_var2":"","en_var2":"","ko_long":"","en_long":""},';
  prompt += '{"phrase":"\uc601\uc5b4\ud45c\ud604","ko_org":"","en_org":"","ko_var1":"","en_var1":"","ko_var2":"","en_var2":"","ko_long":"","en_long":""},';
  prompt += '{"phrase":"\uc601\uc5b4\ud45c\ud604","ko_org":"","en_org":"","ko_var1":"","en_var1":"","ko_var2":"","en_var2":"","ko_long":"","en_long":""}],';
  prompt += '"drills":[{"step":1,"ko":"","en_full":"","blur_part":"none"},{"step":2,"ko":"","en_full":"","blur_part":"\ud0a4\uc6cc\ub4dc"},{"step":3,"ko":"","en_full":"","blur_part":"all"}],';
  prompt += '"vocab":[';
  prompt += '{"word":"\uc601\uc5b4\ub2e8\uc5b4","meaning":"\ud55c\uad6d\uc5b4\ub73b","pos":"","phonetics":"","example_en":"","example_ko":"","var1_en":"","var1_ko":"","var2_en":"","var2_ko":"","var3_en":"","var3_ko":"","wrong_options":["\uc624\ub2f51","\uc624\ub2f52"],"confusing_words":["\uc2a4\ud3a81","\uc2a4\ud3a82"]},';
  prompt += '{"word":"\uc601\uc5b4\ub2e8\uc5b4","meaning":"\ud55c\uad6d\uc5b4\ub73b","pos":"","phonetics":"","example_en":"","example_ko":"","var1_en":"","var1_ko":"","var2_en":"","var2_ko":"","var3_en":"","var3_ko":"","wrong_options":["\uc624\ub2f51","\uc624\ub2f52"],"confusing_words":["\uc2a4\ud3a81","\uc2a4\ud3a82"]},';
  prompt += '{"word":"\uc601\uc5b4\ub2e8\uc5b4","meaning":"\ud55c\uad6d\uc5b4\ub73b","pos":"","phonetics":"","example_en":"","example_ko":"","var1_en":"","var1_ko":"","var2_en":"","var2_ko":"","var3_en":"","var3_ko":"","wrong_options":["\uc624\ub2f51","\uc624\ub2f52"],"confusing_words":["\uc2a4\ud3a81","\uc2a4\ud3a82"]}]}';
  return prompt;
}
function validate(obj) {
  var required = ['title_ko','title_en','korean','english','dictionary','keys','drills','vocab'];
  for (var i = 0; i < required.length; i++) {
    if (obj[required[i]] == null) throw new Error('Missing: ' + required[i]);
  }
  if (!Array.isArray(obj.keys) || !obj.keys.length) throw new Error('keys empty');
  if (!Array.isArray(obj.drills) || !obj.drills.length) throw new Error('drills empty');
  if (!Array.isArray(obj.vocab) || !obj.vocab.length) throw new Error('vocab empty');
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
    try {
      var c1 = await callGPT(KEY, messages, 4000);
      parsed = JSON.parse(c1);
      validate(parsed);
    } catch(e1) {
      console.warn('[analyze] retry:', e1.message);
      var c2 = await callGPT(KEY, messages, 4000);
      parsed = JSON.parse(c2);
      validate(parsed);
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
