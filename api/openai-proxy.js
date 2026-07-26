export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { audio, action, target_english, difficulty, lang_mode } = req.body;
    const API_KEY = process.env.OPENAI_API_KEY;

    try {
        // 1. 오디오 파일을 받아 Whisper로 STT 변환
        const audioBuffer = Buffer.from(audio, 'base64');
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');
        
        if (action === 'evaluate') formData.append('language', 'en');
        else if (lang_mode === 'ko') formData.append('language', 'ko');

        const sttResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}` }, body: formData
        });
        const sttData = await sttResponse.json();
        const userSpeech = sttData.text || "";

        // 2. 한국어 상황 분석 및 훈련 데이터 3세트 생성 (초고속 다이어트 모드 + 전체 맥락 반영)
        if (action === 'korean') {
            // 난이도에 따른 프롬프트 세부 조정
            let levelInstr = "";
            if (difficulty === "beginner") {
                levelInstr = "초급: 매우 쉬운 기초 단어와 짧고 단순한 문장 구조로 번역하세요.";
            } else if (difficulty === "intermediate") {
                levelInstr = "중급: 실생활이나 비즈니스에서 원어민들이 자주 쓰는 자연스러운 표현으로 번역하세요.";
            } else if (difficulty === "advanced") {
                levelInstr = "고급: 학술적, 전문적이거나 격식 있고 세련된 고급 어휘를 사용하여 번역하세요.";
            }

            const instruction = `
            사용자 음성 전체 내용: "${userSpeech}" 
            선택된 난이도 지침: ${levelInstr}
            
            [초고속 응답 및 내용 충실성 규정]
            1. 사용자의 음성 내용 **전체 맥락**을 꼼꼼히 파악하여 빠짐없이 영어로 번역하세요. 일부분만 번역해서는 안 됩니다.
            2. 'keys' 배열에는 전체 문장의 흐름을 이해하는 데 가장 중요한 핵심 덩어리 표현을 **정확히 3개** 추출하세요. 문장이 길 경우, 문장을 구성하는 주요 구(Phrase) 3가지를 나누어 추출하세요.
            3. 'vocab' 배열에는 번역된 영어 문장에서 학습 가치가 높은 핵심 단어를 **정확히 3개** 추출하세요.
            4. 지시된 JSON 구조 외의 부가적인 설명(phonetics, 예문 등)은 속도 저하를 유발하므로 절대 생성하지 마세요.
            
            반환 JSON 구조:
            {
                "title_ko": "상황 전체 요약", 
                "title_en": "Main Title", 
                "korean": "사용자의 말 전체를 다듬은 자연스러운 한국어", 
                "english": "전체 내용을 반영한 원어민식 영어 문장",
                "dictionary": { 
                    "word1": {"ko":"뜻","pos":"품사"}, "word2": {"ko":"뜻","pos":"품사"}, "word3": {"ko":"뜻","pos":"품사"} 
                },
                "keys": [
                    {"phrase": "핵심표현1 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"},
                    {"phrase": "핵심표현2 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"},
                    {"phrase": "핵심표현3 (구)", "ko_org": "해당 구의 해석", "en_org": "전체 영어 문장"}
                ],
                "vocab": [
                    {"word": "단어1", "meaning": "뜻", "wrong_options": ["오답1","오답2"]},
                    {"word": "단어2", "meaning": "뜻", "wrong_options": ["오답1","오답2"]},
                    {"word": "단어3", "meaning": "뜻", "wrong_options": ["오답1","오답2"]}
                ]
            }`;

            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: instruction }], 
                    response_format: { type: "json_object" },
                    temperature: 0.7
                })
            });
            const gptData = await gptResponse.json();
            return res.status(200).json(JSON.parse(gptData.choices[0].message.content));
        
        // 3. 발음 평가 채점
        } else {
            const evalInstruction = `목표 문장: "${target_english}", 사용자 인식됨: "${userSpeech}". 매우 관대하게 채점하여 score(10~100 숫자)와 feedback만 JSON으로 반환.`;
            const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: evalInstruction }], 
                    response_format: { type: "json_object" } 
                })
            });
            const gptResult = await gptResponse.json();
            const result = JSON.parse(gptResult.choices[0].message.content);
            
            res.status(200).json({ ...result, recognized_text: userSpeech || "" });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
}
```eof

### 2. 프론트엔드 파일 (화면 UI)
이 코드는 **`index.html`** 파일의 내용을 전부 지우고 붙여넣어 주세요. (난이도 선택 기능 복구 및 마이크 녹음 초고속 압축 적용)

```html:index.html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>PolyGlot Master: Full Feature Fast</title>
    <script>
        window.onerror = function(msg, url, line) {
            console.error("앱 오류 방어 작동:", msg, "라인:", line);
            return true;
        };
    </script>
    <style>
        :root { --apple-navy: #1C1C1E; --ios-blue: #007AFF; --ios-red: #FF3B30; --ios-bg: #F2F2F7; --master-green: #34C759; --skip-blue: #B3D4FF; }
        body { font-family: -apple-system, sans-serif; background: var(--ios-bg); margin: 0; color: var(--apple-navy); overflow-x: hidden; }
        .container { max-width: 500px; margin: 0 auto; min-height: 100vh; background: var(--ios-bg); display: flex; flex-direction: column; padding-bottom: 40px; }
        .nav-bar { display: flex; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border-bottom: 0.5px solid #D1D1D6; position: sticky; top: 0; z-index: 1000; }
        .tab { flex: 1; padding: 16px 0; border: none; background: none; font-size: 14px; font-weight: 800; color: #8E8E93; cursor: pointer; }
        .tab.active { color: var(--ios-blue); border-bottom: 2.5px solid var(--ios-blue); }
        .section { display: none; padding: 20px; animation: fadeIn 0.3s; }
        .section.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .speech-bubble { background: #fff; border-radius: 20px; padding: 22px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-bottom: 20px; }
        .bubble-ko { font-size: 19px; font-weight: 900; text-align: center; line-height: 1.4; }
        .en-text-container { font-size: 24px; font-weight: 900; line-height: 1.35; color: var(--apple-navy); }
        
        /* 난이도 컨트롤 스타일 복구 */
        .diff-control { display: flex; background: #E5E5EA; border-radius: 14px; padding: 4px; margin-bottom: 20px; gap: 4px; }
        .diff-opt { flex: 1; text-align: center; padding: 12px 0; font-size: 14px; font-weight: 800; color: #8E8E93; border-radius: 10px; cursor: pointer; transition: 0.2s; }
        .diff-opt.active { background: #fff; color: var(--apple-navy); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .lang-opt.active { background: #E8F5E9; color: var(--master-green); }

        .lesson-card { background: #fff; border: 2px solid #EAEAEA; border-radius: 16px; padding: 16px; margin-bottom: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: 0.2s; }
        .lesson-card.mastered { border-color: var(--master-green); background: #F2FCF4; }
        
        .btn-apple { width: 100%; height: 60px; border-radius: 18px; border: none; font-size: 17px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .btn-red { background: var(--ios-red); color: white; }
        .btn-blue { background: var(--ios-blue); color: white; }
        .btn-gray { background: #E5E5EA; color: var(--apple-navy); }
        .btn-skip-pale { background: var(--skip-blue); color: #0056B3; font-weight: 900; }
        
        @keyframes boing { 0% { transform: scale(1); } 40% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .boing-active { animation: boing 0.3s ease-out; }
        .fixed-action-area { position: sticky; bottom: 10px; z-index: 999; padding-top: 10px; background: var(--ios-bg); }
    </style>
</head>
<body>

<div class="container">
    <nav class="nav-bar">
        <button class="tab active" id="tab-game" onclick="switchTab('game')">GAME START</button>
        <button class="tab" id="tab-archive" onclick="switchTab('archive')">STORAGE</button>
    </nav>

    <div id="sec-game" class="section active">
        <!-- 메인화면 -->
        <div id="introView">
            <div class="speech-bubble">
                <div id="introMainTitle" class="bubble-ko" style="margin-bottom: 20px;">실생활/비즈니스 상황에서<br>자주 쓰는 말을 해보세요</div>
                
                <!-- 난이도 선택 버튼 복구 -->
                <div class="diff-control">
                    <div class="diff-opt" onclick="setDifficulty('beginner', this)" id="diff-beginner">🌱 초급</div>
                    <div class="diff-opt active" onclick="setDifficulty('intermediate', this)" id="diff-intermediate">🌿 중급</div>
                    <div class="diff-opt" onclick="setDifficulty('advanced', this)" id="diff-advanced">🌳 상급</div>
                </div>
                
                <!-- 언어 모드 선택 버튼 복구 -->
                <div class="diff-control" style="background: #F2F2F7; margin-bottom: 0;">
                    <div class="diff-opt lang-opt active" onclick="setLangMode('ko')" id="lang-ko">🇰🇷 한국어 모드</div>
                    <div class="diff-opt lang-opt" onclick="setLangMode('en')" id="lang-en" style="font-size: 12px; display:flex; align-items:center; justify-content:center; gap:4px;">
                        <span>🇺🇸 영어 혼용 모드</span>
                    </div>
                </div>
            </div>
            <button id="mainRecordBtn" class="btn-apple btn-blue" onclick="handleMainRecording(this)">녹음 시작</button>
        </div>

        <!-- 훈련 대시보드 -->
        <div id="dashboardView" style="display:none;">
            <div class="speech-bubble">
                <div class="en-text-container" id="dashEnText"></div>
                <div id="dashKoText" style="margin-top:10px; font-weight:700; color:#666; font-size:15px;"></div>
            </div>
            
            <div style="font-weight:900; color:#888; margin-bottom:10px;">1. 덩어리 훈련 <span id="keyProgress" style="color:var(--ios-blue);">0/3</span></div>
            <div id="keyList"></div>
            
            <div style="font-weight:900; color:#888; margin:20px 0 10px;">2. 핵심 단어 <span id="vocabProgress" style="color:var(--ios-blue);">0/3</span></div>
            <div id="vocabList"></div>
            
            <button class="btn-apple btn-gray" style="margin-top:20px;" onclick="location.reload()">새로운 이야기</button>
        </div>

        <!-- 훈련 뷰 -->
        <div id="practiceView" style="display:none;">
            <div class="speech-bubble">
                <div class="bubble-ko" id="pracKoText"></div>
                <div class="en-text-container" id="pracEnText" style="margin-top:20px; text-align:center;"></div>
            </div>
            
            <div id="resultArea" style="display:none; margin-bottom:20px; padding:15px; background:#fff; border-radius:15px; border:1px solid #ddd;">
                <div style="font-size:28px; font-weight:900; color:var(--ios-blue);" id="scoreDisplay">0</div>
                <div id="feedbackDisplay" style="font-size:14.5px; font-weight:800; margin-top:5px; color:#444;"></div>
                <div style="font-size:13px; font-weight:700; color:#888; margin-top:8px;">인식된 발음: <span id="recTextDisplay" style="color:var(--ios-red);"></span></div>
            </div>
            
            <div class="fixed-action-area">
                <button id="pracRecordBtn" class="btn-apple btn-red" onclick="handlePracRecording(this)">녹음 시작</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-apple btn-gray" onclick="goDashboard()">← 목록</button>
                    <button id="nextBtn" class="btn-apple btn-skip-pale" onclick="goDashboard()" style="display:none;">완료 및 뒤로가기 →</button>
                </div>
            </div>
        </div>
    </div>

    <div id="sec-archive" class="section">
        <h2 style="font-weight:900; margin-bottom:15px;">학습 보관소</h2>
        <div id="archiveList"></div>
    </div>
</div>

<script>
    const STORAGE_KEY = 'archive_poly_v44'; // 키 업데이트
    let lessonData = null, currentMode = null, isRecording = false;
    let mediaRecorder, chunks = [];
    
    // 상태 변수 복구
    let selectedDifficulty = 'intermediate';
    let currentLangMode = 'ko'; 

    function safeLower(str) { return (str || "").toString().toLowerCase().trim(); }
    function applyBoing(el) { el.classList.remove('boing-active'); void el.offsetWidth; el.classList.add('boing-active'); }

    // 🌟 난이도 설정 함수 복구
    function setDifficulty(lvl, el) { 
        selectedDifficulty = lvl; 
        document.querySelectorAll('.diff-opt:not(.lang-opt)').forEach(o => o.classList.remove('active')); 
        if (el) el.classList.add('active'); 
        
        const titleEl = document.getElementById('introMainTitle');
        if(lvl === 'beginner') titleEl.innerHTML = "기초 단어를 사용해서<br>쉬운 일상을 말해보세요";
        else if(lvl === 'intermediate') titleEl.innerHTML = "실생활/비즈니스 상황에서<br>자주 쓰는 말을 해보세요";
        else titleEl.innerHTML = "전문적이거나 학술적인<br>깊이 있는 주제를 말해보세요";
    }

    // 🌟 언어 모드 설정 함수 복구
    function setLangMode(mode) { 
        currentLangMode = mode; 
        document.querySelectorAll('.lang-opt').forEach(el => el.classList.remove('active')); 
        document.getElementById(`lang-${mode}`).classList.add('active'); 
    }

    // 🌟 STT 및 LLM 분석 통합 파이프라인 (난이도, 언어모드 전달)
    async function processSpeechAI(action, targetText = "") {
        const b64 = await getBase64Audio();
        try {
            const res = await fetch("/api/openai-proxy", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    audio: b64, 
                    action, 
                    target_english: targetText, 
                    difficulty: selectedDifficulty, // 난이도 전달
                    lang_mode: currentLangMode      // 언어 모드 전달
                })
            });
            const data = await res.json();
            
            if (action === 'korean') {
                if (data.error) { alert(data.error); location.reload(); return; }
                
                lessonData = data;
                lessonData.id = Date.now();
                // 데이터 강제 보정 (혹시라도 AI가 배열을 덜 뱉었을 때 방어)
                lessonData.keys = lessonData.keys || [];
                lessonData.vocab = lessonData.vocab || [];
                lessonData.completed = { 
                    keys: new Array(lessonData.keys.length).fill(false), 
                    vocab: new Array(lessonData.vocab.length).fill(false) 
                };
                
                saveArchive();
                showDashboard();
            } else {
                renderResult(data);
            }
        } catch (e) { 
            alert("서버 연결이 지연되었습니다. 다시 시도해주세요."); 
            location.reload(); 
        }
    }

    // 결과 화면 렌더링
    function renderResult(data) {
        document.getElementById('resultArea').style.display = 'block';
        document.getElementById('scoreDisplay').innerText = data.score + "점";
        document.getElementById('feedbackDisplay').innerText = data.feedback || "피드백이 없습니다.";
        document.getElementById('recTextDisplay').innerText = data.recognized_text || "인식 실패";
        
        const btn = document.getElementById('pracRecordBtn');
        btn.innerText = "↻ 다시 시도";
        
        if (data.score >= 70) {
            lessonData.completed[currentMode.type][currentMode.idx] = true;
            document.getElementById('nextBtn').style.display = 'flex';
            applyBoing(document.getElementById('nextBtn'));
            saveArchive();
        }
    }

    // 대시보드 렌더링
    function showDashboard() {
        document.getElementById('introView').style.display = 'none';
        document.getElementById('practiceView').style.display = 'none';
        document.getElementById('dashboardView').style.display = 'block';
        
        document.getElementById('dashEnText').innerText = lessonData.english || "문장 생성 중 오류";
        document.getElementById('dashKoText').innerText = lessonData.korean || "";
        
        renderList('keyList', lessonData.keys, 'keys');
        renderList('vocabList', lessonData.vocab, 'vocab');
        
        const keysTotal = lessonData.keys.length;
        const vocabTotal = lessonData.vocab.length;
        document.getElementById('keyProgress').innerText = `${lessonData.completed.keys.filter(Boolean).length}/${keysTotal}`;
        document.getElementById('vocabProgress').innerText = `${lessonData.completed.vocab.filter(Boolean).length}/${vocabTotal}`;
    }

    function renderList(id, items, type) {
        const container = document.getElementById(id);
        if (!items || items.length === 0) {
            container.innerHTML = "<div style='color:#888; font-size:13px;'>데이터가 없습니다.</div>";
            return;
        }
        
        container.innerHTML = items.map((item, idx) => `
            <div class="lesson-card boing-active ${lessonData.completed[type][idx] ? 'mastered' : ''}" onclick="startPractice('${type}', ${idx}, this)">
                <div style="flex:1;">
                    <div style="font-weight:900; font-size:18px;">${item.phrase || item.word || "N/A"}</div>
                    <div style="font-size:14px; color:#888; margin-top:2px;">${item.ko_org || item.meaning || "뜻 없음"}</div>
                </div>
                <div style="font-size:22px;">${lessonData.completed[type][idx] ? '✅' : '▶'}</div>
            </div>
        `).join('');
    }

    function startPractice(type, idx, el) {
        if(el) applyBoing(el);
        currentMode = { type, idx };
        document.getElementById('dashboardView').style.display = 'none';
        document.getElementById('practiceView').style.display = 'block';
        document.getElementById('resultArea').style.display = 'none';
        document.getElementById('nextBtn').style.display = 'none';
        
        const item = lessonData[type][idx];
        document.getElementById('pracKoText').innerText = item.ko_org || item.meaning || "";
        document.getElementById('pracEnText').innerText = item.phrase || item.word || "";
        document.getElementById('pracRecordBtn').innerText = "녹음 시작";
    }

    // 메인화면 녹음 버튼 제어
    function handleMainRecording(btn) {
        applyBoing(btn);
        if (!isRecording) {
            isRecording = true; 
            btn.innerText = "■ 말을 끝내고 누르세요"; 
            startMic();
        } else {
            isRecording = false; 
            btn.innerText = "⚡ 초고속 분석 중..."; 
            stopMic(() => processSpeechAI('korean'));
        }
    }

    // 훈련화면 녹음 버튼 제어
    function handlePracRecording(btn) {
        applyBoing(btn);
        if (!isRecording) {
            isRecording = true; 
            btn.innerText = "■ 녹음 완료"; 
            startMic();
        } else {
            isRecording = false; 
            btn.innerText = "평가 중...";
            const target = lessonData[currentMode.type][currentMode.idx].phrase || lessonData[currentMode.type][currentMode.idx].word;
            stopMic(() => processSpeechAI('evaluate', target));
        }
    }

    // 🌟 오디오 전송 지연 시간(20초->2초)을 날려버리는 마이크 압축 로직
    async function startMic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 용량을 극단적으로 줄이는 설정 (16kbps 압축)
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 };
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            chunks = [];
            
            mediaRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            
            // 데이터를 250ms 단위로 쪼개 수집하여 딜레이 방지
            mediaRecorder.start(250); 
        } catch(e) { 
            alert("마이크 권한을 허용해주세요."); 
        }
    }

    function stopMic(callback) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.onstop = callback;
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
        }
    }

    // Base64 인코딩
    async function getBase64Audio() {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        return new Promise(resolve => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result.split(',')[1]);
            r.readAsDataURL(blob);
        });
    }

    // 아카이브(스토리지) 제어
    function saveArchive() {
        try {
            let arc = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            const idx = arc.findIndex(a => a.id === lessonData.id);
            if (idx > -1) arc[idx] = lessonData; 
            else arc.unshift(lessonData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(arc));
        } catch(e) { console.error("스토리지 저장 에러:", e); }
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-' + tab).classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById('sec-' + tab).classList.add('active');
        if (tab === 'archive') renderArchive();
    }

    function renderArchive() {
        try {
            const arc = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            const list = document.getElementById('archiveList');
            if(arc.length === 0) {
                list.innerHTML = "<p style='text-align:center; color:#888;'>저장된 기록이 없습니다.</p>";
                return;
            }
            list.innerHTML = arc.map(a => `
                <div class="lesson-card boing-active" onclick="loadArchive(${a.id}, this)">
                    <div style="flex:1;">
                        <div style="font-weight:900; margin-bottom:4px;">${a.title_ko || '상황 요약'}</div>
                        <div style="font-size:13px; color:#888;">${(a.english || "").substring(0, 45)}...</div>
                    </div>
                </div>
            `).join('');
        } catch(e) { console.error("스토리지 로드 에러:", e); }
    }

    function loadArchive(id, el) {
        applyBoing(el);
        const arc = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        lessonData = arc.find(a => a.id === id);
        if(lessonData) {
            setTimeout(() => {
                switchTab('game');
                showDashboard();
            }, 200);
        }
    }

    function goDashboard() { showDashboard(); }
</script>
</body>
</html>
```eof
