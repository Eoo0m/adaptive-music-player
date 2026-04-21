// ===== API Configuration =====
const API_BASE_URL = 'https://api.dynplayer.win';

// ===== Auth =====
let authToken = localStorage.getItem('auth_token');
let currentUser = null;

function loginWithGoogle() {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
}

function continueAsGuest() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('initialSongInput').classList.remove('hidden');
    document.getElementById('sideTab').classList.remove('hidden');
}

// ===== Tab Navigation =====
function switchTab(tab) {
    if ((tab === 'favorites' || tab === 'home') && !authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }

    document.getElementById('tabHome').classList.toggle('active', tab === 'home');
    document.getElementById('tabSearch').classList.toggle('active', tab === 'search');
    document.getElementById('tabFavorites').classList.toggle('active', tab === 'favorites');

    const searchInterface = document.getElementById('initialSongInput');
    const favoritesView = document.getElementById('favoritesView');
    const homeFeedView = document.getElementById('homeFeedView');
    const trackInfo = document.getElementById('trackInfo');

    searchInterface.classList.add('hidden');
    favoritesView.classList.add('hidden');
    homeFeedView.classList.add('hidden');
    trackInfo.classList.add('hidden');

    if (tab === 'search') {
        searchInterface.classList.remove('hidden');
        trackInfo.classList.remove('hidden');
    } else if (tab === 'favorites') {
        favoritesView.classList.remove('hidden');
        loadFavorites();
    } else if (tab === 'home') {
        homeFeedView.classList.remove('hidden');
        loadHomeFeed();
    }
}

async function loadFavorites() {
    const list = document.getElementById('favoritesList');
    const profileCard = document.getElementById('favProfileCard');

    // 프로필 카드 업데이트
    if (currentUser) {
        document.getElementById('favProfileImg').src = currentUser.profile_image_url || '';
        document.getElementById('favProfileName').textContent = currentUser.display_name || currentUser.email || '';
        profileCard.classList.remove('hidden');
    } else {
        profileCard.classList.add('hidden');
    }

    if (!authToken) {
        list.innerHTML = '<div class="favorites-empty">로그인 후 이용할 수 있습니다.</div>';
        return;
    }

    list.innerHTML = '<div class="favorites-empty">불러오는 중...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/favorites`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load favorites');

        const data = await res.json();
        if (!data.favorites || data.favorites.length === 0) {
            list.innerHTML = '<div class="favorites-empty">찜한 곡이 없습니다.</div>';
            return;
        }

        list.innerHTML = '';
        data.favorites.forEach(fav => {
            const trackDiv = document.createElement('div');
            trackDiv.className = 'track-item';
            trackDiv.style.cursor = 'pointer';

            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'album-cover-wrapper';

            const img = document.createElement('img');
            img.src = fav.cover_image_url || '';
            img.alt = fav.title || 'Unknown';

            const heartBtn = document.createElement('button');
            heartBtn.className = 'heart-btn favorited';
            heartBtn.innerHTML = '&#9829;';
            heartBtn.onclick = (e) => {
                e.stopPropagation();
                toggleFavorite({ track_key: fav.track_key }, heartBtn);
                // 찜 해제 시 목록에서 제거
                setTimeout(() => {
                    if (!heartBtn.classList.contains('favorited')) {
                        trackDiv.remove();
                        if (list.children.length === 0) {
                            list.innerHTML = '<div class="favorites-empty">찜한 곡이 없습니다.</div>';
                        }
                    }
                }, 300);
            };

            imgWrapper.appendChild(img);
            imgWrapper.appendChild(heartBtn);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'track-item-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'track-item-title';
            titleDiv.textContent = fav.title || 'Unknown';

            const artistDiv = document.createElement('div');
            artistDiv.className = 'track-item-artist';
            artistDiv.textContent = fav.artist || 'Unknown';

            infoDiv.appendChild(titleDiv);
            infoDiv.appendChild(artistDiv);

            trackDiv.appendChild(imgWrapper);
            trackDiv.appendChild(infoDiv);

            onClickOrDblClick(trackDiv,
                () => {
                    switchTab('search');
                    selectTrack({
                        track_key: fav.track_key,
                        track: fav.title,
                        artist: fav.artist,
                        album: fav.album,
                        cover_image_url: fav.cover_image_url,
                        playlist_count: fav.playlist_count
                    });
                },
                () => {
                    logAction('play', { selected_track_key: fav.track_key, candidate_track_keys: currentCandidateKeys });
                    const query = encodeURIComponent(`${fav.title} ${fav.artist}`);
                    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
                }
            );

            list.appendChild(trackDiv);
        });
    } catch (e) {
        console.error('Load favorites error:', e);
        list.innerHTML = '<div class="favorites-empty">찜 목록을 불러올 수 없습니다.</div>';
    }
}

// ===== Home Feed =====
async function loadHomeFeed() {
    const list = document.getElementById('homeFeedList');
    list.innerHTML = '<div class="favorites-empty">불러오는 중...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/home-feed`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load home feed');

        const data = await res.json();
        if (!data.feeds || data.feeds.length === 0) {
            list.innerHTML = '<div class="favorites-empty">먼저 곡을 찜해보세요.</div>';
            return;
        }

        list.innerHTML = '';
        data.feeds.forEach(feed => {
            const card = document.createElement('div');
            card.className = 'home-feed-card';

            const title = document.createElement('h3');
            title.className = 'home-feed-card-title';
            title.textContent = `저장한 '${feed.seed_track.title}'와 유사한 곡들`;
            card.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'home-feed-grid';

            feed.similar.forEach(track => {
                const trackDiv = document.createElement('div');
                trackDiv.className = 'track-item';
                trackDiv.style.cursor = 'pointer';

                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'album-cover-wrapper';

                const img = document.createElement('img');
                img.src = track.cover_image_url || '';
                img.alt = track.title || 'Unknown';

                const heartBtn = document.createElement('button');
                heartBtn.className = 'heart-btn';
                heartBtn.innerHTML = '&#9825;';
                heartBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleFavorite({ track_key: track.track_key }, heartBtn);
                };

                imgWrapper.appendChild(img);
                imgWrapper.appendChild(heartBtn);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'track-item-info';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'track-item-title';
                titleDiv.textContent = track.title || 'Unknown';

                const artistDiv = document.createElement('div');
                artistDiv.className = 'track-item-artist';
                artistDiv.textContent = track.artist || 'Unknown';

                infoDiv.appendChild(titleDiv);
                infoDiv.appendChild(artistDiv);

                trackDiv.appendChild(imgWrapper);
                trackDiv.appendChild(infoDiv);

                const feedTrackKeys = feed.similar.map(t => t.track_key);
                onClickOrDblClick(trackDiv,
                    () => {
                        switchTab('search');
                        selectTrack({
                            track_key: track.track_key,
                            track: track.title,
                            artist: track.artist,
                            album: track.album,
                            cover_image_url: track.cover_image_url,
                            playlist_count: track.playlist_count
                        });
                    },
                    () => {
                        logAction('play', { selected_track_key: track.track_key, candidate_track_keys: feedTrackKeys });
                        const query = encodeURIComponent(`${track.title} ${track.artist}`);
                        window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
                    }
                );

                grid.appendChild(trackDiv);
            });

            card.appendChild(grid);
            list.appendChild(card);
        });
    } catch (e) {
        console.error('Home feed error:', e);
        list.innerHTML = '<div class="favorites-empty">홈 피드를 불러올 수 없습니다.</div>';
    }
}

// ===== Favorites =====
async function toggleFavorite(track, btn) {
    if (!authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }

    const isFavorited = btn.classList.contains('favorited');

    try {
        if (isFavorited) {
            const res = await fetch(`${API_BASE_URL}/favorites/${track.track_key}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                btn.classList.remove('favorited');
                btn.innerHTML = '&#9825;';
                logAction('favorite', { selected_track_key: track.track_key, candidate_track_keys: currentCandidateKeys, extra: 'remove' });
            }
        } else {
            const res = await fetch(`${API_BASE_URL}/favorites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ track_key: track.track_key })
            });
            if (res.ok) {
                btn.classList.add('favorited');
                btn.innerHTML = '&#9829;';
                btn.classList.remove('pop');
                void btn.offsetWidth;
                btn.classList.add('pop');
                logAction('favorite', { selected_track_key: track.track_key, candidate_track_keys: currentCandidateKeys, extra: 'add' });
            }
        }
    } catch (e) {
        console.error('Favorite toggle failed:', e);
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    window.location.reload();
}

function getAuthHeaders() {
    if (!authToken) return {};
    return { 'Authorization': `Bearer ${authToken}` };
}

async function checkAuth() {
    // URL에서 토큰 파라미터 확인 (Google OAuth 콜백 후)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        authToken = token;
        localStorage.setItem('auth_token', token);
        // URL에서 토큰 제거
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (!authToken) return;

    // 토큰 유효성 확인
    try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            currentUser = await res.json();
            console.log('✅ Logged in as:', currentUser.email);
        } else {
            // 토큰 만료
            authToken = null;
            localStorage.removeItem('auth_token');
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
}

// ===== Click/DoubleClick Helper =====
function onClickOrDblClick(element, onSingle, onDouble) {
    let clickTimer = null;
    element.addEventListener('click', (e) => {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            onDouble(e);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
                onSingle(e);
            }, 250);
        }
    });
}

// ===== Global Variables =====
let currentTrackIndex = 0;        // 현재 선택된 트랙 인덱스
let searchMode = 'track';         // 검색 모드: 'track' or 'keyword'

// ===== Click History Tracking =====
let clickedTracks = [];           // 클릭한 트랙들의 track_key 저장 (최대 16개, Two-Tower 모델용)

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

// ===== Action Log =====
// 현재 화면에 표시된 트랙 키 목록 (후보 추적용)
let currentCandidateKeys = [];

function setCurrentCandidates(tracks) {
    currentCandidateKeys = tracks.map(t => t.track_key).filter(Boolean);
}

async function logAction(actionType, data = {}) {
    const payload = {
        session_id: sessionId,
        action_type: actionType,
        search_query: data.search_query || null,
        search_mode: data.search_mode || null,
        selected_track_key: data.selected_track_key || null,
        candidate_track_keys: data.candidate_track_keys || null,
        extra: data.extra || null
    };

    try {
        await fetch(`${API_BASE_URL}/log-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('Action log failed:', e);
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

// 페이지 로드 시 인증 확인 후 화면 결정
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (currentUser) {
        // 로그인 상태 → 바로 검색 화면
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('initialSongInput').classList.remove('hidden');
        document.getElementById('sideTab').classList.remove('hidden');
    } else {
        // 비로그인 → 로그인 선택 화면 표시
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});
