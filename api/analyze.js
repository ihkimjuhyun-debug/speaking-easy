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
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: messages, max_tokens: maxTokens, response_format: { type: 'json_object' } })
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
  var level = difficulty === 'beginner' ? 'beginner(easy words)' : difficulty === 'advanced' ? 'advanced(academic)' : 'intermediate(daily/business)';
  var schema = {
    title_ko: '', title_en: '', korean: '', english: '',
    dictionary: { word1: { ko: '', pos: '', phonetics: '', ko_context: '' }, word2: { ko: '', pos: '', phonetics: '', ko_context: '' }, word3: { ko: '', pos: '', phonetics: '', ko_context: '' } },
    keys: [
      { phrase: 'english expression', ko_org: '', en_org: '', ko_var1: '', en_var1: '', ko_var2: '', en_var2: '', ko_long: '', en_long: '' },
      { phrase: 'english expression', ko_org: '', en_org: '', ko_var1: '', en_var1: '', ko_var2: '', en_var2: '', ko_long: '', en_long: '' },
      { phrase: 'english expression', ko_org: '', en_org: '', ko_var1: '', en_var1: '', ko_var2: '', en_var2: '', ko_long: '', en_long: '' }
    ],
    drills: [
      { step: 1, ko: '', en_full: '', blur_part: 'none' },
      { step: 2, ko: '', en_full: '', blur_part: 'keyword' },
      { step: 3, ko: '', en_full: '', blur_part: 'all' }
    ],
    vocab: [
      { word: 'english_word', meaning: 'korean_meaning', pos: '', phonetics: '', example_en: '', example_ko: '', var1_en: '', var1_ko: '', var2_en: '', var2_ko: '', var3_en: '', var3_ko: '', wrong_options: ['w1','w2'], confusing_words: ['s1','s2'] },
      { word: 'english_word', meaning: 'korean_meaning', pos: '', phonetics: '', example_en: '', example_ko: '', var1_en: '', var1_ko: '', var2_en: '', var2_ko: '', var3_en: '', var3_ko: '', wrong_options: ['w1','w2'], confusing_words: ['s1','s2'] },
      { word: 'english_word', meaning: 'korean_meaning', pos: '', phonetics: '', example_en: '', example_ko: '', var1_en: '', var1_ko: '', var2_en: '', var2_ko: '', var3_en: '', var3_ko: '', wrong_options: ['w1','w2'], confusing_words: ['s1','s2'] }
    ]
  };
  return 'User said (Korean): "' + text + '"\nDifficulty: ' + level + '\n\nRules:\n- 3 keys. en_var1/en_var2/en_long must include phrase keyword.\n- 3 vocab. word=English only(NO Korean). meaning=Korean.\n- 3 dictionary entries. key=English word.\n- blur_part: lowercase word or "none" or "all".\n- Fill ALL fields. No empty strings.\n\nReturn JSON only:\n' + JSON.stringify(schema);
}
function validate(obj) {
  var required = ['title_ko','title_en','korean','english','dictionary','keys','drills','vocab'];
  for (var i = 0; i < required.length; i++) { if (obj[required[i]] == null) throw new Error('Missing field: ' + required[i]); }
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
  var text = ((req.body || {}).text || '').trim();
  var difficulty = (req.body || {}).difficulty || 'intermediate';
  if (!text || text.length < 2) return res.status(400).json({ error: 'Speech not recognized. Please try again.' });
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
    if (e.name === 'AbortError') { console.error('[analyze] timeout'); return res.status(504).json({ error: 'Timeout. Please try again.' }); }
    console.error('[analyze]', e.message);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
handler.config = { api: { bodyParser: { sizeLimit: '1mb' } } };
module.exports = handler;
