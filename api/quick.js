'use strict';
// ── quick.js: 빠른 대화 모드 ────────────────────────────────────────
// 한국어 음성 → STT → GPT 번역 → 영어만 반환
// 목표: 3~5초

function resolveExt(mime) {
  var m = (mime || '').toLowerCase();
  if (m.indexOf('mp4') > -1 || m.indexOf('m4a') > -1) return 'mp4';
  if (m.indexOf('ogg') > -1) return 'ogg';
  if (m.indexOf('wav') > -1) return 'wav';
  return 'webm';
}

function fetchT(url, opts, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms || 20000);
  opts.signal = ctrl.signal;
  return fetch(url, opts).finally(function() { clearTimeout(timer); });
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
  var audio = body.audio;
  var mimeType = body.mimeType || '';

  if (!audio) return res.status(400).json({ error: 'No audio data' });

  var buf;
  try { buf = Buffer.from(audio, 'base64'); } catch(e) {
    return res.status(400).json({ error: 'base64 decode failed' });
  }

  // ── STT: 한국어 인식 ────────────────────────────────────────────
  var koreanText = '';
  try {
    var ext  = resolveExt(mimeType);
    var form = new FormData();
    form.append('file', new Blob([buf], { type: 'application/octet-stream' }), 'audio.' + ext);
    form.append('model', 'whisper-1');
    form.append('language', 'ko');

    var sttR = await fetchT('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY },
      body: form
    }, 18000);

    if (!sttR.ok) {
      var sttErr = await sttR.text();
      console.error('[quick] STT error', sttR.status, sttErr.slice(0, 100));
      return res.status(500).json({ error: '음성 인식 실패. 다시 시도해주세요.' });
    }
    koreanText = (JSON.parse(await sttR.text()).text || '').trim();
  } catch(e) {
    console.error('[quick] STT exception', e.message);
    return res.status(500).json({ error: '음성 처리 오류. 다시 시도해주세요.' });
  }

  if (!koreanText || koreanText.length < 1) {
    return res.status(200).json({ korean: '', english: '음성이 인식되지 않았습니다.' });
  }

  // ── GPT: 초경량 번역 프롬프트 ────────────────────────────────────
  // max_tokens 150 → GPT 응답 시간 ~1초
  var english = '';
  try {
    var gR = await fetchT('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: 'Translate to natural English. Return ONLY JSON: {"english":"..."}\n\nKorean: "' + koreanText + '"'
        }],
        max_tokens: 200,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    }, 12000);

    if (gR.ok) {
      var gD = JSON.parse(await gR.text());
      var gC = gD.choices && gD.choices[0] && gD.choices[0].message && gD.choices[0].message.content;
      if (gC) english = JSON.parse(gC).english || '';
    }
  } catch(e) {
    console.warn('[quick] GPT fallback', e.message);
    english = '번역 실패. 다시 시도해주세요.';
  }

  return res.status(200).json({ korean: koreanText, english: english });
}

handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
module.exports = handler;
