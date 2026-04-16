// 1. 전역 변수 설정
let mediaRecorder, chunks = [];
let audioCtx, analyser, dataArray, animationId;
let lessonData = null; // AI가 준 전체 데이터 (drills, keys 등)
let currentDrillIndex = 0;
let currentDifficulty = 'intermediate';
let currentLangMode = 'ko';
const synth = window.speechSynthesis;

// 2. 초기 설정 및 탭 전환
function setDifficulty(diff) {
    currentDifficulty = diff;
    document.querySelectorAll('.diff-opt').forEach(opt => opt.classList.remove('active'));
    document.getElementById(`diff-${diff}`).classList.add('active');
}

function showView(viewId) {
    ['introView', 'dashboardView', 'practiceView', 'loadingUI'].forEach(id => {
        document.getElementById(id).style.display = (id === viewId) ? 'block' : 'none';
    });
}

// 3. 녹음 로직 (핵심)
async function startRecordMode(mode) {
    currentLangMode = mode;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];

    document.getElementById('recordingPanel').style.display = 'flex';
    
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/m4a' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            sendToAI(base64Audio); // AI 프록시로 전송
        };
    };

    mediaRecorder.start();
}

function stopAnyRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('recordingPanel').style.display = 'none';
        showView('loadingUI');
    }
}

// 4. AI 통신 로직 (Vercel Proxy 연결)
async function sendToAI(base64Audio) {
    try {
        const response = await fetch('/api/openai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio: base64Audio,
                action: 'korean', // 처음 문장 생성 시
                difficulty: currentDifficulty,
                lang_mode: currentLangMode
            })
        });

        lessonData = await response.json();
        renderDashboard();
    } catch (error) {
        alert("AI 분석 중 오류가 발생했습니다.");
        showView('introView');
    }
}

// 5. 대시보드 및 연습 시작
function renderDashboard() {
    showView('dashboardView');
    document.getElementById('dashKoText').innerText = lessonData.korean;
    
    // 드릴 시작 버튼 생성 (첫 번째 드릴부터 시작)
    const drillList = document.getElementById('keyList');
    drillList.innerHTML = `
        <button class="btn-apple btn-blue" onclick="startPractice(0)">학습 시작하기 (5단계 드릴)</button>
    `;
}

function startPractice(index) {
    currentDrillIndex = index;
    const drill = lessonData.drills[index];
    showView('practiceView');
    
    document.getElementById('stepBadge').innerText = `STEP ${index + 1}`;
    document.getElementById('pracKoText').innerText = drill.ko;
    
    // 영어 문장을 단어별 span으로 쪼개서 넣기 (카라오케 준비)
    setupKaraokeText(drill.en);
}

// 6. 카라오케 시스템 (가장 중요한 부분!)
function setupKaraokeText(sentence) {
    const container = document.getElementById('pracEnText');
    container.innerHTML = '';
    
    // 문장을 단어 단위로 쪼개서 span 생성
    const words = sentence.split(' ');
    words.forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'en-word';
        span.innerText = word;
        container.appendChild(span);
    });
}

function playTTS() {
    const container = document.getElementById('pracEnText');
    const text = container.innerText;
    const spans = container.querySelectorAll('.en-word');

    synth.cancel(); // 이전 소리 끄기
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;

    // 카라오케 실시간 색상 변경 이벤트
    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            const upToNow = text.substring(0, charIndex + event.charLength).trim();
            const wordIdx = upToNow.split(/\s+/).length - 1;

            spans.forEach((span, i) => {
                if (i <= wordIdx) span.classList.add('active-blue');
                else span.classList.remove('active-blue');
            });
        }
    };

    utterance.onend = () => {
        // 재생 끝나면 버튼 상태 변경 등 처리
    };

    synth.speak(utterance);
}

// 7. 다음 단계로 이동
function nextDrillStage() {
    if (currentDrillIndex < lessonData.drills.length - 1) {
        startPractice(currentDrillIndex + 1);
    } else {
        alert("축하합니다! 모든 단계를 완료하셨습니다.");
        location.reload();
    }
}
