// 질문 생성 로직 부분 (예시)
async function generateTrainingData(wordData) {
    const trainingBatches = [];
    
    // 1개가 아닌 3개의 훈련 세트 생성
    for (let i = 0; i < 3; i++) {
        const batch = {
            chunk: await getChunk(wordData),       // 덩어리
            coreWord: wordData.word,               // 핵심 단어
            fullSentence: await getSentence(wordData) // 전체 문장
        };
        trainingBatches.push(batch);
    }
    return trainingBatches;
}
