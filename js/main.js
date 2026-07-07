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
    document.getElementById('layoutToggle').classList.remove('hidden');
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
        lastFavorites = data.favorites || [];
        renderFavorites(lastFavorites);
    } catch (e) {
        console.error('Load favorites error:', e);
        list.innerHTML = '<div class="favorites-empty">찜 목록을 불러올 수 없습니다.</div>';
    }
}

function renderFavorites(favorites) {
    const list = document.getElementById('favoritesList');
    if (!favorites || favorites.length === 0) {
        list.className = 'favorites-list';
        list.innerHTML = '<div class="favorites-empty">찜한 곡이 없습니다.</div>';
        return;
    }

    setCurrentCandidates(favorites);
    list.className = `favorites-list ${recommendationViewMode === 'list' ? 'track-list compact-track-list' : ''}`;
    list.innerHTML = '';

    favorites.forEach(fav => {
        const track = {
            track_key: fav.track_key,
            track: fav.title,
            title: fav.title,
            artist: fav.artist,
            album: fav.album,
            cover_image_url: fav.cover_image_url,
            playlist_count: fav.playlist_count
        };

        const trackDiv = createTrackCard(track, false, () => {
            switchTab('search');
            selectTrack(track);
        }, {
            favorited: true,
            candidateKeys: currentCandidateKeys,
            onFavoriteChange: (heartBtn) => {
                if (!heartBtn.classList.contains('favorited')) {
                    lastFavorites = lastFavorites.filter(item => item.track_key !== fav.track_key);
                    renderFavorites(lastFavorites);
                }
            }
        });

        list.appendChild(trackDiv);
    });
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
        lastHomeFeeds = data.feeds || [];
        renderHomeFeeds(lastHomeFeeds);
    } catch (e) {
        console.error('Home feed error:', e);
        list.innerHTML = '<div class="favorites-empty">홈 피드를 불러올 수 없습니다.</div>';
    }
}

function renderHomeFeeds(feeds) {
    const list = document.getElementById('homeFeedList');

    if (!feeds || feeds.length === 0) {
        list.innerHTML = '<div class="favorites-empty">먼저 곡을 찜해보세요.</div>';
        return;
    }

    list.innerHTML = '';

    feeds.forEach(feed => {
        const card = document.createElement('div');
        card.className = 'home-feed-card';

        const title = document.createElement('h3');
        title.className = 'home-feed-card-title';
        title.textContent = `저장한 '${feed.seed_track.title}'와 유사한 곡들`;
        card.appendChild(title);

        const grid = document.createElement('div');
        grid.className = `home-feed-grid ${recommendationViewMode === 'list' ? 'track-list compact-track-list' : ''}`;

        const feedTrackKeys = feed.similar.map(t => t.track_key);
        feed.similar.forEach(track => {
            const normalizedTrack = {
                track_key: track.track_key,
                track: track.title,
                title: track.title,
                artist: track.artist,
                album: track.album,
                cover_image_url: track.cover_image_url,
                playlist_count: track.playlist_count
            };

            const trackDiv = createTrackCard(normalizedTrack, false, () => {
                switchTab('search');
                selectTrack(normalizedTrack);
            }, {
                candidateKeys: feedTrackKeys
            });

            grid.appendChild(trackDiv);
        });

        card.appendChild(grid);
        list.appendChild(card);
    });
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
let recommendationViewMode = localStorage.getItem('recommendationViewMode') || 'grid';
let lastRecommendationTracks = [];
let lastRecommendationIndex = 0;
let lastFavorites = [];
let lastHomeFeeds = [];

// ===== Click History Tracking =====
let clickedTracks = [];           // 클릭한 트랙들의 track_key 저장 (최대 16개, Two-Tower 모델용)
let shownRecommendationKeys = [];      // 이미 화면에 보여준 추천 track_key 저장

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

function getTrackTitle(track) {
    return track.track || track.track_name || track.title || track.name || 'Unknown';
}

function getTrackArtist(track) {
    return track.artist || track.artist_name || 'Unknown Artist';
}

function openTrackOnYouTube(track, candidateKeys = currentCandidateKeys) {
    logAction('play', { selected_track_key: track.track_key, candidate_track_keys: candidateKeys });
    const query = encodeURIComponent(`${getTrackTitle(track)} ${getTrackArtist(track)}`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
}

function isVisible(id) {
    const element = document.getElementById(id);
    return element && !element.classList.contains('hidden');
}

function setRecommendationViewMode(mode) {
    recommendationViewMode = mode;
    localStorage.setItem('recommendationViewMode', mode);
    renderLayoutToggle();

    if (isVisible('favoritesView')) {
        renderFavorites(lastFavorites);
    } else if (isVisible('homeFeedView')) {
        renderHomeFeeds(lastHomeFeeds);
    } else if (lastRecommendationTracks.length > 0) {
        updateTrackDisplayOnly(lastRecommendationTracks, lastRecommendationIndex);
    }
}

function createViewToggle() {
    const viewToggle = document.createElement('div');
    viewToggle.className = 'view-toggle';

    const gridBtn = document.createElement('button');
    gridBtn.className = `view-toggle-btn${recommendationViewMode === 'grid' ? ' active' : ''}`;
    gridBtn.type = 'button';
    gridBtn.setAttribute('aria-label', '앨범 커버형 보기');
    gridBtn.innerHTML = '<span class="view-icon view-icon-grid" aria-hidden="true"></span>';
    gridBtn.onclick = () => setRecommendationViewMode('grid');

    const listBtn = document.createElement('button');
    listBtn.className = `view-toggle-btn${recommendationViewMode === 'list' ? ' active' : ''}`;
    listBtn.type = 'button';
    listBtn.setAttribute('aria-label', '가로형 보기');
    listBtn.innerHTML = '<span class="view-icon view-icon-list" aria-hidden="true"></span>';
    listBtn.onclick = () => setRecommendationViewMode('list');

    viewToggle.appendChild(gridBtn);
    viewToggle.appendChild(listBtn);
    return viewToggle;
}

function renderLayoutToggle() {
    let layoutToggle = document.getElementById('layoutToggle');
    if (!layoutToggle) {
        layoutToggle = document.createElement('div');
        layoutToggle.id = 'layoutToggle';
        layoutToggle.className = 'layout-toggle';
        layoutToggle.setAttribute('aria-label', '보기 방식 선택');
        document.body.appendChild(layoutToggle);
    }
    layoutToggle.innerHTML = '';
    layoutToggle.appendChild(createViewToggle());
}

function appendRecommendationHeader(container, tracks, currentIndex) {
    lastRecommendationTracks = tracks;
    lastRecommendationIndex = currentIndex;

    const header = document.createElement('div');
    header.className = 'track-display-header';

    const guideText = document.createElement('div');
    guideText.className = 'guide-text';
    guideText.textContent = '앨범 커버를 클릭해 추천을 받고, 더블클릭해 바로 재생해보세요.';

    header.appendChild(guideText);
    container.appendChild(header);
}

function createTrackCard(track, isCurrent, singleAction, options = {}) {
    const candidateKeys = options.candidateKeys || currentCandidateKeys;
    const trackDiv = document.createElement('div');
    trackDiv.className = 'track-item' + (isCurrent ? ' current' : '');
    trackDiv.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = track.cover_image_url || '';
    img.alt = getTrackTitle(track);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'track-item-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'track-item-title';
    titleDiv.textContent = getTrackTitle(track);

    const artistDiv = document.createElement('div');
    artistDiv.className = 'track-item-artist';
    artistDiv.textContent = getTrackArtist(track);

    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(artistDiv);

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'album-cover-wrapper';

    const heartBtn = document.createElement('button');
    heartBtn.className = `heart-btn${options.favorited ? ' favorited' : ''}`;
    heartBtn.innerHTML = options.favorited ? '&#9829;' : '&#9825;';
    heartBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(track, heartBtn);
        if (options.onFavoriteChange) {
            setTimeout(() => options.onFavoriteChange(heartBtn, track), 300);
        }
    };

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(heartBtn);
    trackDiv.appendChild(imgWrapper);
    trackDiv.appendChild(infoDiv);

    if (recommendationViewMode === 'list') {
        const playBtn = document.createElement('button');
        playBtn.className = 'track-play-btn';
        playBtn.type = 'button';
        playBtn.setAttribute('aria-label', `${getTrackTitle(track)} 유튜브에서 찾기`);
        playBtn.textContent = '▶';
        playBtn.onclick = (e) => {
            e.stopPropagation();
            openTrackOnYouTube(track, candidateKeys);
        };
        trackDiv.appendChild(playBtn);
    }

    onClickOrDblClick(trackDiv, singleAction, () => openTrackOnYouTube(track, candidateKeys));
    return trackDiv;
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
    renderLayoutToggle();

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
        document.getElementById('layoutToggle').classList.remove('hidden');
    } else {
        // 비로그인 → 로그인 선택 화면 표시
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('layoutToggle').classList.add('hidden');
    }
});
