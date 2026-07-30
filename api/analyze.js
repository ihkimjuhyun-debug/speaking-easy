'use strict';
var sleep=function(ms){return new Promise(function(r){return setTimeout(r,ms);});};
function fetchT(url,opts,ms){var ctrl=new AbortController();var timer=setTimeout(function(){ctrl.abort();},ms||24000);opts.signal=ctrl.signal;return fetch(url,opts).finally(function(){clearTimeout(timer);});}
function retry(fn,n){var attempt=0;function run(){return fn().catch(function(e){if(e.name==='AbortError')throw e;if(attempt<(n||3)-1){attempt++;return sleep(attempt*600).then(run);}throw e;});}return run();}

function buildPrompt(text,difficulty){
  var lvl=difficulty==='beginner'?'basic/simple':difficulty==='advanced'?'advanced/academic':'intermediate/business';
  // 텍스트 길이 제한 없음 - 2분 분량(~1200자)도 처리
  if(text.length>1500) text=text.slice(0,1500);
  return 'Korean: "'+text+'"\nLevel: '+lvl+'\n\nReturn ONLY valid JSON. ALL fields filled. No empty strings. Be concise.\n\n'
    +'{"title_ko":"","title_en":"","korean":"교정된 자연스러운 한국어","english":"complete English translation",'
    +'"dictionary":{"단어1":{"ko":"뜻","pos":"noun","phonetics":"/ab/","ko_context":"예시"},"단어2":{"ko":"뜻","pos":"verb","phonetics":"/cd/","ko_context":"예시"},"단어3":{"ko":"뜻","pos":"adj","phonetics":"/ef/","ko_context":"예시"}},'
    +'"keys":[{"phrase":"핵심구","ko_org":"뜻","en_org":"sentence","ko_var1":"뜻","en_var1":"sentence with phrase","ko_var2":"뜻","en_var2":"sentence with phrase","ko_long":"뜻","en_long":"long sentence with phrase"},{"phrase":"핵심구","ko_org":"뜻","en_org":"sentence","ko_var1":"뜻","en_var1":"sentence with phrase","ko_var2":"뜻","en_var2":"sentence with phrase","ko_long":"뜻","en_long":"long sentence with phrase"},{"phrase":"핵심구","ko_org":"뜻","en_org":"sentence","ko_var1":"뜻","en_var1":"sentence with phrase","ko_var2":"뜻","en_var2":"sentence with phrase","ko_long":"뜻","en_long":"long sentence with phrase"}],'
    +'"drills":[{"step":1,"ko":"한국어1","en_full":"English 1.","blur_part":"none"},{"step":2,"ko":"한국어2","en_full":"English 2.","blur_part":"keyword"},{"step":3,"ko":"한국어3","en_full":"English 3.","blur_part":"all"}],'
    +'"vocab":[{"word":"EnglishOnly","meaning":"한국어뜻","pos":"noun","phonetics":"/x/","context_sentence":"Sentence with _____.","context_sentence_ko":"빈칸 한국어.","example_en":"ex.","example_ko":"예시.","var1_en":"v1.","var1_ko":"변형1.","var2_en":"v2.","var2_ko":"변형2.","var3_en":"v3.","var3_ko":"변형3.","wrong_options":["한오답1","한오답2"],"confusing_words":["sim1","sim2"]},{"word":"EnglishOnly","meaning":"한국어뜻","pos":"verb","phonetics":"/y/","context_sentence":"Sentence with _____.","context_sentence_ko":"빈칸 한국어.","example_en":"ex.","example_ko":"예시.","var1_en":"v1.","var1_ko":"변형1.","var2_en":"v2.","var2_ko":"변형2.","var3_en":"v3.","var3_ko":"변형3.","wrong_options":["한오답1","한오답2"],"confusing_words":["sim1","sim2"]},{"word":"EnglishOnly","meaning":"한국어뜻","pos":"adj","phonetics":"/z/","context_sentence":"Sentence with _____.","context_sentence_ko":"빈칸 한국어.","example_en":"ex.","example_ko":"예시.","var1_en":"v1.","var1_ko":"변형1.","var2_en":"v2.","var2_ko":"변형2.","var3_en":"v3.","var3_ko":"변형3.","wrong_options":["한오답1","한오답2"],"confusing_words":["sim1","sim2"]}],'
    +'"vocab_group":[{"en":"Contextual sentence _____.","ko":"단어1 한국어.","answer":"vocab_word_1"},{"en":"Contextual sentence _____.","ko":"단어2 한국어.","answer":"vocab_word_2"},{"en":"Contextual sentence _____.","ko":"단어3 한국어.","answer":"vocab_word_3"}]}\n\n'
    +'RULES: vocab words=English only. vocab_group=near-synonyms different nuance. drills blur_part=lowercase word or "none" or "all".';
}

function validate(obj){
  var req=['title_ko','title_en','korean','english','dictionary','keys','drills','vocab','vocab_group'];
  for(var i=0;i<req.length;i++){if(!obj[req[i]])throw new Error('Missing: '+req[i]);}
  if(!Array.isArray(obj.keys)||obj.keys.length<3)throw new Error('keys<3');
  if(!Array.isArray(obj.drills)||obj.drills.length<3)throw new Error('drills<3');
  if(!Array.isArray(obj.vocab)||obj.vocab.length<3)throw new Error('vocab<3');
  if(!Array.isArray(obj.vocab_group)||obj.vocab_group.length<3)throw new Error('vocab_group<3');
  for(var d=0;d<obj.drills.length;d++){if(!obj.drills[d].en_full||!obj.drills[d].ko)throw new Error('drills['+d+'] empty');}
  for(var v=0;v<obj.vocab.length;v++){if(!obj.vocab[v].context_sentence)throw new Error('vocab['+v+'] no context_sentence');}
}

async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  var KEY=process.env.OPENAI_API_KEY;
  if(!KEY)return res.status(500).json({error:'API key missing'});
  var body=req.body||{};
  var text=(body.text||'').trim();
  var diff=body.difficulty||'intermediate';
  if(!text||text.length<2)return res.status(400).json({error:'음성이 인식되지 않았습니다.'});

  var prompt=buildPrompt(text,diff);
  async function callGPT(){
    return retry(function(){
      return fetchT('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],max_tokens:1800,temperature:0.3,response_format:{type:'json_object'}})
      },24000);
    },3).then(function(r){
      return r.text().then(function(raw){
        if(!r.ok)throw new Error('GPT HTTP '+r.status);
        var d=JSON.parse(raw);
        var c=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
        if(!c)throw new Error('GPT empty');
        return JSON.parse(c);
      });
    });
  }

  try{
    var parsed,lastErr;
    for(var i=0;i<3;i++){
      try{parsed=await callGPT();validate(parsed);break;}
      catch(e){lastErr=e;console.warn('[analyze] attempt',i+1,e.message);if(i===2)throw lastErr;}
    }
    return res.status(200).json(parsed);
  }catch(e){
    if(e.name==='AbortError')return res.status(504).json({error:'분석 시간이 초과됐습니다. 더 짧게 말씀해주세요.'});
    console.error('[analyze]',e.message);
    return res.status(500).json({error:'학습 데이터 생성 실패. 다시 시도해주세요.'});
  }
}

handler.config={api:{bodyParser:{sizeLimit:'1mb'}}};
module.exports=handler;
