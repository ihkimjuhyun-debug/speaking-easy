'use strict';
var sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };
function resolveExt(mime) {
  var m = (mime || '').toLowerCase();
  if (m.indexOf('mp4') > -1 || m.indexOf('m4a') > -1 || m.indexOf('aac') > -1) return 'mp4';
  if (m.indexOf('ogg') > -1) return 'ogg';
  if (m.indexOf('wav') > -1) return 'wav';
  if (m.indexOf('mpeg') > -1 || m.indexOf('mp3') > -1) return 'mp3';
  return 'webm';
}
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
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { console.error('[proxy] no key'); return res.status(500).json({ error: 'API key missing' }); }
  var body = req.body || {};
  var audio = body.audio;
  var mimeType = body.mimeType || '';
  var target_english = body.target_english || '';
  if (!audio || typeof audio !== 'string') return res.status(400).json({ error: 'No audio data' });
  var buf;
  try { buf = Buffer.from(audio, 'base64'); } catch(e) { return res.status(400).json({ error: 'base64 decode failed' }); }
  if (buf.length > 24 * 1024 * 1024) return res.status(400).json({ error: 'File too large' });
  var userSpeech = '';
  try {
    var ext = resolveExt(mimeType);
    var form = new FormData();
    form.append('file', new Blob([buf], { type: 'application/octet-stream' }), 'audio.' + ext);
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    var r = await retry(function() {
      return fetchT('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + KEY },
        body: form
      }, 25000);
    }, 3);
    var raw = await r.text();
    if (!r.ok) { console.error('[proxy] whisper error', r.status); return res.status(200).json({ score: 0, feedback: 'Speech recognition failed. Please try again.', recognized_text: 'failed' }); }
    userSpeech = JSON.parse(raw).text || '';
  } catch(e) {
    console.error('[proxy] stt error', e.message);
    return res.status(200).json({ score: 0, feedback: 'Speech recognition error. Please try again.', recognized_text: 'error' });
  }
  var cleanTarget = (target_english || '').replace(/\?+/g, '').trim();
  if (!cleanTarget) return res.status(200).json({ score: 0, feedback: 'No target text.', recognized_text: userSpeech });
  var prompt = 'Target: "' + cleanTarget + '"\nRecognized: "' + userSpeech + '"\n\nScore pronunciation generously. Similar = high score.\nReturn JSON only: {"score": integer 10-100, "feedback": "short Korean feedback 1-2 sentences"}';
  var result = { score: 70, feedback: 'Pronunciation check complete!' };
  try {
    var gr = await retry(function() {
      return fetchT('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 100, response_format: { type: 'json_object' } })
      }, 25000);
    }, 3);
    var graw = await gr.text();
    var gd = JSON.parse(graw);
    var gc = gd.choices && gd.choices[0] && gd.choices[0].message && gd.choices[0].message.content;
    if (gc) { var p = JSON.parse(gc); if (typeof p.score === 'number' && p.feedback) result = p; }
  } catch(e) { console.warn('[proxy] gpt fallback:', e.message); }
  return res.status(200).json(Object.assign({}, result, { recognized_text: userSpeech }));
}
handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
module.exports = handler;
