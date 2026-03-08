// ===== Global Variables =====
let currentTrackIndex = 0;        // 현재 선택된 트랙 인덱스
let searchMode = 'track';         // 검색 모드: 'track' or 'keyword'

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

// ===== Search Mode Toggle =====
function toggleSearchMode() {
    const btn = document.getElementById('modeToggleBtn');
    const searchInput = document.getElementById('searchInput');

    if (searchMode === 'track') {
        searchMode = 'keyword';
        btn.textContent = '키워드';
        searchInput.placeholder = '키워드를 입력하세요 (예: 공부할 때 듣는 재즈, 드라이브 팝송)';
    } else {
        searchMode = 'track';
        btn.textContent = '트랙';
        searchInput.placeholder = '노래 제목을 입력하세요 (예: Shape of You, Ed Sheeran)';
    }

    // 검색 결과 초기화
    document.getElementById('searchResults').innerHTML = '';
    searchInput.focus();
}

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
    document.getElementById('searchInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') doSearch();
    });

    // 검색창 바깥쪽 클릭 시 검색결과만 닫기 (검색창은 항상 유지)
    document.addEventListener('click', (e) => {
        const searchInterface = document.getElementById('initialSongInput');
        const searchResults = document.getElementById('searchResults');

        // 미니 모드일 때 검색창 바깥 클릭하면 검색결과만 닫기
        if (searchInterface.classList.contains('mini') &&
            !searchInterface.contains(e.target)) {
            searchResults.innerHTML = '';
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
