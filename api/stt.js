// api/stt.js — 음성 → 텍스트 (Whisper STT 전용)
// Blob/FormData 미사용, 수동 multipart 구성으로 Node.js 호환성 보장

export const config = {
api: {
bodyParser: {
sizeLimit: ‘10mb’,
},
},
};

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).end();

```
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY 환경변수 없음' });

try {
    const { audio, mimeType, lang_mode } = req.body;

    if (!audio) return res.status(400).json({ error: '오디오 데이터 없음' });

    // MIME 타입에 따른 파일 확장자 결정
    // iOS Safari: video/mp4 또는 audio/mp4 → .mp4
    // Chrome: audio/webm → .webm
    const resolvedMime = (mimeType || 'audio/webm').toLowerCase();
    let ext = 'webm';
    if (resolvedMime.includes('mp4') || resolvedMime.includes('m4a') || resolvedMime.includes('aac')) {
        ext = 'mp4';
    } else if (resolvedMime.includes('ogg')) {
        ext = 'ogg';
    } else if (resolvedMime.includes('wav')) {
        ext = 'wav';
    }

    const audioBuf = Buffer.from(audio, 'base64');
    const filename = `audio.${ext}`;
    const boundary = `FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;

    // 수동 multipart/form-data 구성
    // FormData + Blob 대신 Buffer를 직접 조립하여 Node.js 버전 무관 안정성 확보
    const CRLF = '\r\n';
    const partsList = [
        // 오디오 파일 파트
        Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
            `Content-Type: application/octet-stream${CRLF}${CRLF}`
        ),
        audioBuf,
        // 모델 파라미터
        Buffer.from(
            `${CRLF}--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
            `whisper-1${CRLF}`
        ),
    ];

    // 언어 설정: 한국어 모드에서만 ko 지정, 영어혼용(focus90)은 Whisper 자동감지
    if (lang_mode === 'ko') {
        partsList.push(
            Buffer.from(
                `--${boundary}${CRLF}` +
                `Content-Disposition: form-data; name="language"${CRLF}${CRLF}` +
                `ko${CRLF}`
            )
        );
    }

    partsList.push(Buffer.from(`--${boundary}--${CRLF}`));

    const body = Buffer.concat(partsList);

    const sttResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
    });

    // json() 대신 text() 먼저 읽어 파싱 에러 방지
    const responseText = await sttResponse.text();

    if (!sttResponse.ok) {
        console.error('[STT] Whisper 에러:', responseText);
        return res.status(500).json({
            error: `Whisper 오류 (${sttResponse.status}): ${responseText.slice(0, 200)}`
        });
    }

    let sttData;
    try {
        sttData = JSON.parse(responseText);
    } catch (parseErr) {
        console.error('[STT] JSON 파싱 실패:', responseText);
        return res.status(500).json({ error: 'Whisper 응답 파싱 실패: ' + responseText.slice(0, 100) });
    }

    return res.status(200).json({ text: sttData.text || '' });

} catch (err) {
    console.error('[STT] catch:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
}
```

}