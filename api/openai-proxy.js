'use strict';
// ── openai-proxy.js: 발음 평가 전용 ─────────────────────────────────────────
// STT(Whisper) + GPT 채점을 하나의 함수에서 처리
// STT는 stt.js, 분석은 analyze.js 가 담당 → 이 파일은 발음 평가만

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
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms || 22000);
  opts.signal = ctrl.signal;
  return fetch(url, opts).finally(function() { clearTimeout(timer); });
}

function retry(fn, n) {
  var attempt = 0;
  function run() {
    return fn().then(function(r) {
      if ((r.status === 429 || r.status >= 500) && attempt < (n||3) - 1) {
        attempt++;
        return sleep(attempt * 600).then(run);
      }
      return r;
    }).catch(function(e) {
      if (e.name === 'AbortError') throw e;
      if (attempt < (n||3) - 1) { attempt++; return sleep(attempt * 600).then(run); }
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
  if (!KEY) return res.status(500).json({ error: 'API key missing' });

  var body         = req.body || {};
  var audio        = body.audio;
  var mimeType     = body.mimeType || '';
  var targetEnglish = body.target_english || '';

  if (!audio) return res.status(400).json({ error: 'No audio data' });

  var buf;
  try { buf = Buffer.from(audio, 'base64'); } catch(e) {
    return res.status(400).json({ error: 'base64 decode failed' });
  }
  if (buf.length > 24 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large' });
  }

  // ── Step 1: Whisper STT (영어 인식) ─────────────────────────────
  var userSpeech = '';
  try {
    var ext  = resolveExt(mimeType);
    var form = new FormData();
    form.append('file', new Blob([buf], { type: 'application/octet-stream' }), 'audio.' + ext);
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    var sttR = await retry(function() {
      return fetchT('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + KEY },
        body: form
      }, 22000);
    }, 3);

    var sttRaw = await sttR.text();
    if (!sttR.ok) {
      console.error('[proxy] whisper error', sttR.status);
      return res.status(200).json({ score: 0, feedback: '음성 인식 실패. 다시 시도해주세요.', recognized_text: '' });
    }
    userSpeech = (JSON.parse(sttRaw).text || '').trim();
  } catch(e) {
    console.error('[proxy] STT error', e.message);
    return res.status(200).json({ score: 0, feedback: '음성 인식 오류. 다시 시도해주세요.', recognized_text: '' });
  }

  // ── Step 2: GPT 발음 채점 (초경량 프롬프트) ──────────────────────
  var cleanTarget = (targetEnglish || '').replace(/\?+/g, '').trim();
  if (!cleanTarget) {
    return res.status(200).json({ score: 70, feedback: '발음 완료!', recognized_text: userSpeech });
  }

  var evalPrompt = 'Target: "' + cleanTarget + '"\nRecognized: "' + userSpeech + '"\n'
    + 'Score pronunciation generously (10-100). Similar sounds = high score.\n'
    + 'Return ONLY JSON: {"score":85,"feedback":"짧은 한국어 피드백"}';

  var result = { score: 70, feedback: '발음 완료!', recognized_text: userSpeech };

  try {
    var gR = await retry(function() {
      return fetchT('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: evalPrompt }],
          max_tokens: 80,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      }, 12000);
    }, 3);

    var gRaw = await gR.text();
    var gD   = JSON.parse(gRaw);
    var gC   = gD.choices && gD.choices[0] && gD.choices[0].message && gD.choices[0].message.content;
    if (gC) {
      var parsed = JSON.parse(gC);
      if (typeof parsed.score === 'number' && parsed.feedback) result = parsed;
    }
  } catch(e) {
    console.warn('[proxy] GPT fallback:', e.message);
  }

  return res.status(200).json(Object.assign({}, result, { recognized_text: userSpeech }));
}

handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
module.exports = handler;
