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
  if (!KEY) { console.error('[stt] no key'); return res.status(500).json({ error: 'API key missing' }); }
  var body = req.body || {};
  var audio = body.audio;
  var mimeType = body.mimeType || '';
  var lang_mode = body.lang_mode || '';
  if (!audio || typeof audio !== 'string') return res.status(400).json({ error: 'No audio data' });
  var buf;
  try { buf = Buffer.from(audio, 'base64'); } catch(e) { return res.status(400).json({ error: 'base64 decode failed' }); }
  if (buf.length > 24 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 24MB)' });
  var ext = resolveExt(mimeType);
  var blob = new Blob([buf], { type: 'application/octet-stream' });
  var form = new FormData();
  form.append('file', blob, 'audio.' + ext);
  form.append('model', 'whisper-1');
  if (lang_mode === 'ko') form.append('language', 'ko');
  try {
    var r = await retry(function() {
      return fetchT('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + KEY },
        body: form
      }, 25000);
    }, 3);
    var raw = await r.text();
    if (!r.ok) { console.error('[stt] whisper error', r.status, raw.slice(0, 200)); return res.status(500).json({ error: 'Whisper error ' + r.status }); }
    var data;
    try { data = JSON.parse(raw); } catch(e) { return res.status(500).json({ error: 'Parse failed' }); }
    return res.status(200).json({ text: data.text || '' });
  } catch(e) {
    if (e.name === 'AbortError') { console.error('[stt] timeout'); return res.status(504).json({ error: 'Timeout. Please try again.' }); }
    console.error('[stt]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
module.exports = handler;
