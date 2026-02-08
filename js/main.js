// ===== Global Variables =====
let player, is_paused = true, current_track = null, device_id = null;
let expectedTrackId = null;  // 재생 요청한 트랙 ID
let access_token = null, refresh_token = null;

let playlist = [];                // 현재 플레이리스트
let currentTrackIndex = 0;        // 재생 인덱스

// ===== Playback Tracking =====
let trackStartTime = null;        // 현재 트랙 시작 시간
let trackDuration = null;         // 현재 트랙 총 길이(ms)
let lastPlayedTrack = null;       // 이전에 재생한 트랙

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

// ===== Authentication =====
function initializeAuth() {
    const hashParams = new URLSearchParams(window.location.hash.substr(1));
    const storedToken = localStorage.getItem('spotify_access_token');
    const storedRefresh = localStorage.getItem('spotify_refresh_token');
    access_token = hashParams.get('access_token') || storedToken;
    refresh_token = hashParams.get('refresh_token') || storedRefresh;

    if (hashParams.get('error')) {
        document.getElementById('errorMessage').textContent = '로그인에 실패했습니다: ' + hashParams.get('error');
        return;
    }
    if (access_token) {
        localStorage.setItem('spotify_access_token', access_token);
        if (refresh_token) localStorage.setItem('spotify_refresh_token', refresh_token);

        document.getElementById('loginScreen').classList.add('hidden');

        // 검색창 표시, track-info와 아이팟 숨김 (명확한 초기 상태 설정)
        const searchInterface = document.getElementById('initialSongInput');
        const trackInfo = document.getElementById('trackInfo');
        const ipodWrapper = document.getElementById('ipodWrapper');

        searchInterface.classList.remove('hidden');
        trackInfo.classList.add('hidden');
        if (ipodWrapper) ipodWrapper.classList.add('hidden');

        window.location.hash = '';
    }
}

function login() {
    window.location.href = `${API_BASE_URL}/login`;
}

// 바로 접속 (재생 없이 추천만)
function directAccess() {
    const loginScreen = document.getElementById('loginScreen');
    const searchInput = document.getElementById('initialSongInput');

    // 로그인 화면 완전히 제거
    loginScreen.remove();
    searchInput.classList.remove('hidden');

    // 검색창이 확실히 보이도록 스타일 강제 적용
    searchInput.style.display = 'block';
    searchInput.style.visibility = 'visible';
    searchInput.style.opacity = '1';
    searchInput.style.zIndex = '1000';

    // 검색창에 포커스
    setTimeout(() => {
        document.getElementById('initialSongTitle').focus();
    }, 100);
}

async function refreshAccessToken() {
    if (!refresh_token) {
        logout();
        return;
    }
    try {
        const r = await fetch('/refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token })
        });
        const d = await r.json();
        if (d.access_token) {
            access_token = d.access_token;
            localStorage.setItem('spotify_access_token', access_token);
            if (d.refresh_token) {
                refresh_token = d.refresh_token;
                localStorage.setItem('spotify_refresh_token', refresh_token);
            }
        } else {
            logout();
        }
    } catch (e) {
        console.error('토큰 새로고침 오류:', e);
        logout();
    }
}

function logout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    access_token = null;
    refresh_token = null;
    if (player) player.disconnect();
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('trackInfo').classList.add('hidden');
}

// ===== Helper Functions =====
function getSeed() {
    if (current_track?.id) return current_track;
    if (lastPlayedTrack?.id) return lastPlayedTrack;
    const last = playlist[playlist.length - 1];
    const t = last ? (last.spotify_track || last.track || last) : null;
    return t || null;
}

// ===== Debug Functions =====
function fmtSeed(seed) {
    if (!seed) return 'Unknown seed';
    const title = seed.name || seed.track || 'Unknown';
    const artist = (seed.artists ? seed.artists.map(a => a.name).join(', ') : seed.artist) || 'Unknown Artist';
    return `${title} — ${artist}`;
}

function fmtRecItem(trackObj, idx) {
    const t = trackObj.spotify_track || trackObj.track || trackObj;
    const name = t?.name || trackObj.track || 'Unknown Track';
    const artists = (t?.artists ? t.artists.map(a => a.name).join(', ') : trackObj.artist) || 'Unknown Artist';
    const sim = (trackObj.similarity ?? t?.similarity ?? null);
    const simTxt = (typeof sim === 'number') ? `  [sim=${(sim * 100).toFixed(1)}%]` : '';
    return `${String(idx + 1).padStart(2, '0')}. ${name} — ${artists}${simTxt}`;
}

function logRecommendationList(kind, seedTrack, list) {
    console.log(`\n📦 ${kind} RECS (n=${list.length})  |  seed: ${fmtSeed(seedTrack)}`);
    for (let i = 0; i < list.length; i++) console.log('   ' + fmtRecItem(list[i], i));
    console.log('—'.repeat(48) + '\n');
}

function showPlaylistStatus() {
    if (playlist.length === 0) {
        console.log('🚫 No playlist loaded');
        return;
    }
    console.log(`\n📊 ===== PLAYLIST STATUS =====`);
    console.log(`📍 Position: ${currentTrackIndex + 1}/${playlist.length}`);
    console.log(`🎵 Current: ${current_track?.name || 'None'} - ${current_track?.artists?.map(a => a.name).join(', ') || 'Unknown'}`);
    console.log(`📋 Remaining: ${playlist.length - currentTrackIndex - 1}`);
    console.log(`============================\n`);
}
window.showPlaylistStatus = showPlaylistStatus;

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

    // 검색창 바깥쪽 클릭 시 검색창 닫기
    document.addEventListener('click', (e) => {
        const searchInterface = document.getElementById('initialSongInput');
        const searchButton = document.querySelector('button[onclick="showSearchInterface()"]');
        const trackInfo = document.getElementById('trackInfo');

        // 검색창이 열려있고, 클릭한 곳이 검색창 내부가 아니고, 검색 버튼도 아니고, track-info도 아니면
        if (!searchInterface.classList.contains('hidden') &&
            !searchInterface.contains(e.target) &&
            !trackInfo.contains(e.target) &&
            e.target !== searchButton) {
            searchInterface.classList.add('hidden');
            if (trackInfo) trackInfo.classList.remove('hidden');
        }
    });
});

// ===== Initialization =====
createStars();
setInterval(createDust, 2000);
initializeAuth();
