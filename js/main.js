// ===== Global Variables =====
let currentTrackIndex = 0;        // 현재 선택된 트랙 인덱스

// ===== Click History Tracking =====
let clickedTracks = [];           // 클릭한 트랙들의 track_key 저장 (최대 10개)
let averageBasedTracks = [];      // 평균 기반 추천 트랙들

// ===== API Configuration =====
const API_BASE_URL = 'https://api.dynplayer.win';

// ===== Session Management =====
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

let sessionId = generateSessionId(); // 페이지 로드 시 세션 ID 생성
console.log('🎵 Session initialized:', sessionId);

// ===== Listening Log =====
async function logListeningData(trackData) {
    if (!trackData || !trackData.track_name || !trackData.artist_name) {
        console.warn('⚠️ Skipping log: missing track data', trackData);
        return;
    }

    const payload = {
        ...trackData,
        session_id: sessionId
    };

    console.log('📤 Sending listening log:', payload);

    try {
        const response = await fetch(`${API_BASE_URL}/log-listening`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to log listening data:', response.status, errorText);
        } else {
            const result = await response.json();
            console.log('✅ Listening data logged successfully:', result);
        }
    } catch (e) {
        console.error('❌ Error logging listening data:', e);
    }
}

// ===== Background Visual Effects =====
function createStars() {
    const box = document.getElementById('stars');
    for (let i = 0; i < 200; i++) {
        const s = document.createElement('div');
        s.className = 'star';
        const sizes = ['small', 'medium', 'large'];
        s.classList.add(sizes[Math.floor(Math.random() * sizes.length)]);
        s.style.left = Math.random() * 100 + '%';
        s.style.top = Math.random() * 100 + '%';
        s.style.animationDelay = Math.random() * 2 + 's';
        s.style.animationDuration = (1 + Math.random() * 2) + 's';
        box.appendChild(s);
    }
}

function createDust() {
    const d = document.createElement('div');
    d.className = 'dust';
    d.style.left = Math.random() * 100 + '%';
    d.style.width = d.style.height = Math.random() * 3 + 1 + 'px';
    d.style.animationDuration = (8 + Math.random() * 4) + 's';
    d.style.animationDelay = Math.random() * 2 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 12000);
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    // 엔터로 검색
    document.getElementById('initialSongTitle').addEventListener('keypress', e => {
        if (e.key === 'Enter') searchInitialSongs();
    });
    document.getElementById('keywordSearchInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') searchByKeyword();
    });

    // 검색창 바깥쪽 클릭 시 검색창 닫기 (단, 추천이 있을 때만)
    document.addEventListener('click', (e) => {
        const searchInterface = document.getElementById('initialSongInput');
        const trackInfo = document.getElementById('trackInfo');

        // trackInfo에 실제 트랙이 있는지 확인
        const hasRecommendations = trackInfo && trackInfo.children.length > 0;

        // 검색창이 열려있고, 클릭한 곳이 검색창 내부가 아니고,
        // track-info도 아니고, 추천이 있을 때만 닫기
        if (!searchInterface.classList.contains('hidden') &&
            !searchInterface.contains(e.target) &&
            !trackInfo.contains(e.target) &&
            hasRecommendations) {
            searchInterface.classList.add('hidden');
            if (trackInfo) trackInfo.classList.remove('hidden');
        }
    });
});

// ===== Initialization =====
createStars();
setInterval(createDust, 2000);

// 페이지 로드 시 바로 검색창 표시
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('initialSongInput').classList.remove('hidden');
});
