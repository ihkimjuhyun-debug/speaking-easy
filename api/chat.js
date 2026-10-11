// api/chat.js  — AI 영어 회화 파트너 (GPT-4o-mini)
// ✅ 외부 require 없음  ✅ 25초 타임아웃  ✅ CORS  ✅ 히스토리 클라이언트 전달

'use strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchT(url, opts, ms = 25000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try   { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function retry(fn, n = 3) {
  let err;
  for (let i = 0; i < n; i++) {
    try {
      const r = await fn();
      if (r.status === 429 || r.status >= 500) {
        err = new Error('HTTP ' + r.status);
        if (i < n - 1) { await sleep(Math.pow(2, i) * 600 + Math.random() * 400); continue; }
        return r;
      }
      return r;
    } catch (e) {
      err = e;
      if (e.name === 'AbortError') throw e;
      if (i < n - 1) await sleep(Math.pow(2, i) * 600 + Math.random() * 400);
    }
  }
  throw err;
}

const DEFAULT_SYSTEM = `You are Ryan, a friendly and encouraging English conversation partner helping a Korean adult improve their spoken English. Rules:
1. Always respond in English (simple, clear sentences).
2. Keep replies short: 2-4 sentences max.
3. After EVERY reply, add a single line starting with "💡 TIP:" to briefly correct or improve one thing from what the user said (grammar, word choice, or pronunciation note). If the user was perfect, write "💡 TIP: Great job! No corrections needed."
4. Be warm, encouraging, and natural — like a real conversation.
5. If the user writes in Korean, gently reply in English and add "(try saying this in English next time!)".`;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: '허용되지 않는 메서드' });

  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });

  const { messages, system } = req.body || {};

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: '메시지가 없습니다.' });
  }

  // Limit history to last 20 messages to stay within token budget
  const history = messages.slice(-20);

  const payload = {
    model:      'gpt-4o-mini',
    messages:   [
      { role: 'system', content: system || DEFAULT_SYSTEM },
      ...history,
    ],
    max_tokens: 250,
    temperature: 0.8,
  };

  try {
    const r   = await retry(() => fetchT('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body:    JSON.stringify(payload),
    }));
    const raw = await r.text();
    if (!r.ok) {
      console.error('[chat] GPT 오류', r.status, raw.slice(0, 200));
      return res.status(500).json({ error: 'AI 응답 실패. 다시 시도해주세요.' });
    }
    const d = JSON.parse(raw);
    const reply = d.choices?.[0]?.message?.content || '';
    return res.status(200).json({ reply });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'AI 응답 시간 초과. 다시 시도해주세요.' });
    }
    console.error('[chat]', e.message);
    return res.status(500).json({ error: 'AI 오류: ' + e.message });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '1mb' } } };
module.exports = handler;
