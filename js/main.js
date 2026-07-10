// ===== API Configuration =====
const API_BASE_URL = 'https://api.dynplayer.win';

// ===== Auth =====
let authToken = localStorage.getItem('auth_token');
let currentUser = null;

function loginWithGoogle() {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
}

function loginWithSpotify() {
    window.location.href = `${API_BASE_URL}/auth/spotify/login`;
}

function continueAsGuest() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('initialSongInput').classList.remove('hidden');
    document.getElementById('sideTab').classList.remove('hidden');
    document.getElementById('layoutToggle').classList.remove('hidden');
}

// ===== Tab Navigation =====
function switchTab(tab) {
    if ((tab === 'favorites' || tab === 'home' || tab === 'map') && !authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }

    document.getElementById('tabHome').classList.toggle('active', tab === 'home');
    document.getElementById('tabSearch').classList.toggle('active', tab === 'search');
    document.getElementById('tabFavorites').classList.toggle('active', tab === 'favorites');
    document.getElementById('tabMap').classList.toggle('active', tab === 'map');

    const searchInterface = document.getElementById('initialSongInput');
    const favoritesView = document.getElementById('favoritesView');
    const homeFeedView = document.getElementById('homeFeedView');
    const mapView = document.getElementById('mapView');
    const trackInfo = document.getElementById('trackInfo');

    searchInterface.classList.add('hidden');
    favoritesView.classList.add('hidden');
    homeFeedView.classList.add('hidden');
    mapView.classList.add('hidden');
    trackInfo.classList.add('hidden');

    if (tab === 'search') {
        searchInterface.classList.remove('hidden');
        trackInfo.classList.remove('hidden');
    } else if (tab === 'favorites') {
        favoritesView.classList.remove('hidden');
        if (lastFavorites.length > 0) {
            renderFavorites(lastFavorites, lastSavedPlaylists);
        } else {
            loadFavorites();
        }
    } else if (tab === 'home') {
        homeFeedView.classList.remove('hidden');
        renderPlaylistBuilder();
        if (lastHomeFeeds.length > 0) {
            renderHomeFeeds(lastHomeFeeds);
        } else {
            loadHomeFeed();
        }
    } else if (tab === 'map') {
        mapView.classList.remove('hidden');
        showMusicMap();
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
        const [favRes, plRes] = await Promise.all([
            fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE_URL}/playlist-builder/my-playlists`, { headers: getAuthHeaders() }),
        ]);
        if (!favRes.ok) throw new Error('Failed to load favorites');

        const favData = await favRes.json();
        lastFavorites = favData.favorites || [];

        if (plRes.ok) {
            const plData = await plRes.json();
            lastSavedPlaylists = plData.playlists || [];
        }

        renderFavorites(lastFavorites, lastSavedPlaylists);
    } catch (e) {
        console.error('Load favorites error:', e);
        list.innerHTML = '<div class="favorites-empty">찜 목록을 불러올 수 없습니다.</div>';
    }
}

function renderFavorites(favorites, savedPlaylists = []) {
    const container = document.getElementById('favoritesView');
    // 기존 동적으로 추가된 플레이리스트 섹션 제거
    const existing = container.querySelector('.fav-playlists-section');
    if (existing) existing.remove();

    // 저장된 플레이리스트 → fav-songs-card 위에 별도 카드로 삽입
    if (savedPlaylists.length > 0) {
        const plSection = document.createElement('div');
        plSection.className = 'fav-playlists-section';

        savedPlaylists.forEach((pl, idx) => {
            const card = document.createElement('div');
            card.className = 'home-feed-card';

            const titleRow = document.createElement('div');
            titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:0;cursor:pointer;';

            const titleEl = document.createElement('h3');
            titleEl.className = 'home-feed-card-title';
            titleEl.style.margin = '0';
            titleEl.textContent = pl.name;

            const toggleBtn = document.createElement('button');
            toggleBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:0 4px;line-height:1;';
            toggleBtn.textContent = '▲';

            titleRow.appendChild(titleEl);
            titleRow.appendChild(toggleBtn);
            card.appendChild(titleRow);

            // 12곡 그리드
            const grid = document.createElement('div');
            grid.className = recommendationViewMode === 'list'
                ? 'home-feed-grid track-list compact-track-list'
                : 'home-feed-grid';
            grid.style.marginTop = '10px';

            (pl.tracks || []).forEach(t => {
                const track = {
                    track_key: t.track_key,
                    track: t.track_name || t.title,
                    title: t.track_name || t.title,
                    artist: t.artist,
                    album: t.album,
                    cover_image_url: t.cover_image_url,
                    playlist_count: t.playlist_count,
                };
                const trackDiv = createTrackCard(track, false, () => {
                    switchTab('search');
                    selectTrack(track);
                }, { candidateKeys: (pl.tracks || []).map(x => x.track_key) });

                trackDiv.classList.add('pb-chosen');
                grid.appendChild(trackDiv);
            });

            card.appendChild(grid);

            // 접기/펼치기
            titleRow.onclick = () => {
                const collapsed = grid.style.display === 'none';
                grid.style.display = collapsed ? '' : 'none';
                grid.style.marginTop = collapsed ? '10px' : '0';
                toggleBtn.textContent = collapsed ? '▲' : '▼';
            };

            plSection.appendChild(card);
        });

        // fav-songs-card 앞에 삽입
        const songCard = container.querySelector('.fav-songs-card');
        container.insertBefore(plSection, songCard);
    }

    // 찜한 곡 섹션
    const list = document.getElementById('favoritesList');
    list.innerHTML = '';

    if (!favorites || favorites.length === 0) {
        list.className = 'favorites-list';
        list.innerHTML = '<div class="favorites-empty">찜한 곡이 없습니다.</div>';
        return;
    }

    setCurrentCandidates(favorites);
    // 항상 6열 그리드 (home-feed-grid 스타일 사용)
    list.className = `favorites-list ${recommendationViewMode === 'list' ? 'track-list compact-track-list' : ''}`;

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
                    renderFavorites(lastFavorites, lastSavedPlaylists);
                }
            }
        });

        list.appendChild(trackDiv);
    });
}

function openSavedPlaylist(playlistId) {
    const pl = lastSavedPlaylists.find(p => p.id === playlistId);
    if (!pl) return;

    pb.state = 'finished';
    pb.completedPlaylist = (pl.tracks || []).map(t => ({
        track_key: t.track_key,
        title: t.track_name || t.title,
        artist: t.artist,
        album: t.album,
        cover_image_url: t.cover_image_url,
        playlist_count: t.playlist_count,
    }));
    pb.selectedTracks = [];
    pb.userName = '';
    pb.timeOfDay = '';

    switchTab('home');
}

// ===== Home Feed =====
async function loadHomeFeed() {
    renderPlaylistBuilder();
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
                lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
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
                // 캐시에 추가 (다음 탭 진입 시 재요청 없이 바로 반영)
                lastFavorites = [{
                    track_key: track.track_key,
                    title: track.track || track.title,
                    artist: track.artist,
                    album: track.album,
                    cover_image_url: track.cover_image_url,
                    playlist_count: track.playlist_count,
                }, ...lastFavorites];
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
    localStorage.removeItem('login_type');
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
            localStorage.setItem('login_type', currentUser.login_type || 'google');
            console.log('✅ Logged in as:', currentUser.email);
        } else {
            // 토큰 만료
            authToken = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('login_type');
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
let lastSavedPlaylists = [];
let lastHomeFeeds = [];
let lastMapData = null;      // 캐시된 취향 지도 데이터
let mapPrefetchPromise = null; // 프리패치 중인 Promise

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
    const loginType = localStorage.getItem('login_type');
    if (loginType === 'spotify') {
        window.open(`https://open.spotify.com/track/${track.track_key}`, '_blank');
    } else {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + track.artist)}`, '_blank');
    }
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
        renderFavorites(lastFavorites, lastSavedPlaylists);
    } else if (isVisible('homeFeedView')) {
        renderPlaylistBuilder();
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

// ===== Playlist Builder =====

const pb = {
    state: 'idle',          // idle | loading | selecting | finished
    keyword: '',
    userName: '',
    timeOfDay: '',
    season: '여름',
    keywordPoolKeys: [],    // 100곡 pool track_key
    keywordPoolData: [],    // 100곡 pool 전체 데이터 (새로고침용)
    selectedTracks: [],     // 유저가 선택한 곡들 (최대 6)
    currentCandidates: [],  // 현재 그리드에 표시 중인 12곡
    seenTrackKeys: new Set(), // 지금까지 보여준 모든 곡 key
    completedPlaylist: null,  // 완성 후 12곡 전체
    savedPlaylistId: null,
    prefetchPromise: null,  // 미리 호출한 start API 결과
};

function getPbSection() {
    return document.getElementById('playlistBuilderSection');
}

function renderPlaylistBuilderLoading() {
    const section = getPbSection();
    section.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'home-feed-card playlist-builder-card';
    const name = currentUser?.display_name || currentUser?.email?.split('@')[0] || '';
    card.innerHTML = `
        <div class="playlist-builder-header">
            <h3 class="playlist-builder-title">${name}님의 여름 플레이리스트 만들기</h3>
        </div>
        <div class="favorites-empty" style="padding:16px 0">후보 곡을 찾고 있어요...</div>
    `;
    section.appendChild(card);
}

function prefetchPlaylistBuilder() {
    if (!currentUser || !authToken) return;
    if (pb.state !== 'idle') return;

    pb.prefetchPromise = fetch(`${API_BASE_URL}/playlist-builder/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    }).then(res => {
        if (!res.ok) throw new Error('start failed');
        return res.json();
    }).catch(e => {
        console.error('Playlist builder prefetch error:', e);
        pb.prefetchPromise = null;
        return null;
    });
}

async function startPlaylistBuilder() {
    pb.state = 'loading';
    renderPlaylistBuilderLoading();

    try {
        // 미리 호출한 결과가 있으면 재사용, 없으면 새로 호출
        const data = pb.prefetchPromise
            ? await pb.prefetchPromise
            : await fetch(`${API_BASE_URL}/playlist-builder/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            }).then(r => { if (!r.ok) throw new Error('start failed'); return r.json(); });

        pb.prefetchPromise = null;

        if (!data) throw new Error('no data');

        pb.state = 'selecting';
        pb.keyword = data.keyword;
        pb.userName = data.user_name;
        pb.timeOfDay = data.time_of_day;
        pb.season = data.season || '여름';
        pb.keywordPoolKeys = data.keyword_pool_keys || [];
        pb.keywordPoolData = data.keyword_pool_data || [];
        pb.selectedTracks = [];
        pb.currentCandidates = data.candidates || [];
        pb.seenTrackKeys = new Set(pb.currentCandidates.map(c => c.track_key));
        pb.completedPlaylist = null;
        pb.savedPlaylistId = null;

        renderPlaylistBuilderSelecting();
    } catch (e) {
        console.error('Playlist builder start error:', e);
        pb.state = 'idle';
        pb.prefetchPromise = null;
        // 실패 시 재시도 버튼 표시
        const section = getPbSection();
        section.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'home-feed-card playlist-builder-card';
        card.innerHTML = `<div class="favorites-empty" style="padding:16px 0">플레이리스트 준비 중 오류가 발생했어요. <button onclick="prefetchPlaylistBuilder();renderPlaylistBuilder()" style="color:#1db954;background:none;border:none;cursor:pointer;font-size:13px;">다시 시도</button></div>`;
        section.appendChild(card);
    }
}

function renderPlaylistBuilderSelecting() {
    const section = getPbSection();
    section.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'home-feed-card playlist-builder-card';

    // 헤더
    const headerDiv = document.createElement('div');
    headerDiv.className = 'playlist-builder-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'playlist-builder-title';
    titleEl.textContent = `${pb.userName}님의 ${pb.season || '여름'} ${pb.timeOfDay} 플레이리스트 만들기`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

    // 새로고침 버튼 (선택 단계 전체에서 표시)
    if (pb.selectedTracks.length < 6) {
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'playlist-builder-refresh-btn';
        refreshBtn.textContent = '↺ 새로고침';
        refreshBtn.title = '후보 새로고침';
        refreshBtn.onclick = refreshPbCandidates;
        btnRow.appendChild(refreshBtn);
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'playlist-builder-start-btn';
    resetBtn.style.background = 'rgba(255,255,255,0.1)';
    resetBtn.style.boxShadow = 'none';
    resetBtn.textContent = '처음부터';
    resetBtn.onclick = () => {
        pb.state = 'idle';
        pb.prefetchPromise = null;
        startPlaylistBuilder();
    };
    btnRow.appendChild(resetBtn);

    headerDiv.appendChild(titleEl);
    headerDiv.appendChild(btnRow);
    card.appendChild(headerDiv);

    const body = document.createElement('div');
    body.className = 'playlist-builder-body';

    // 안내 텍스트
    const guide = document.createElement('div');
    guide.className = 'playlist-builder-guide';
    if (pb.selectedTracks.length === 0) {
        guide.textContent = '앨범 커버를 클릭하세요. (6/6)';
    } else if (pb.selectedTracks.length < 6) {
        guide.textContent = `다음 곡을 선택하세요. (${pb.selectedTracks.length}/6)`;
    }
    body.appendChild(guide);

    // 선택된 곡들 (위 행) — 모드 무관하게 항상 그리드(앨범커버) 표시
    if (pb.selectedTracks.length > 0) {
        const selectedRow = document.createElement('div');
        selectedRow.className = 'playlist-builder-selected-row';

        pb.selectedTracks.forEach((track, idx) => {
            const item = document.createElement('div');
            item.className = 'pb-selected-item';

            const img = document.createElement('img');
            img.src = track.cover_image_url || '';
            img.alt = track.track_name || track.title || '';
            img.style.animationDelay = `${idx * 0.2}s`;

            const info = document.createElement('div');
            info.className = 'pb-selected-item-info';

            const titleEl = document.createElement('div');
            titleEl.className = 'pb-selected-item-title';
            titleEl.textContent = track.track_name || track.title || '';

            const artistEl = document.createElement('div');
            artistEl.className = 'pb-selected-item-artist';
            artistEl.textContent = track.artist || '';

            info.appendChild(titleEl);
            info.appendChild(artistEl);
            item.appendChild(img);
            item.appendChild(info);
            selectedRow.appendChild(item);
        });

        body.appendChild(selectedRow);
    }

    // 후보 그리드 (12곡, 6x2)
    const grid = document.createElement('div');
    grid.className = `playlist-builder-grid ${recommendationViewMode === 'list' ? 'track-list compact-track-list' : ''}`;

    pb.currentCandidates.forEach(track => {
        const normalizedTrack = {
            track_key: track.track_key,
            track: track.track_name || track.title,
            title: track.track_name || track.title,
            artist: track.artist,
            album: track.album,
            cover_image_url: track.cover_image_url,
            playlist_count: track.playlist_count,
        };

        const trackDiv = createTrackCard(normalizedTrack, false, () => {
            onPbTrackSelect(normalizedTrack);
        }, {});

        grid.appendChild(trackDiv);
    });

    body.appendChild(grid);
    card.appendChild(body);
    section.appendChild(card);
}

async function refreshPbCandidates() {
    // 현재 후보 12곡을 seen에 추가 (다시 뽑히지 않도록)
    pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));

    const section = getPbSection();
    const guide = section.querySelector('.playlist-builder-guide');
    if (guide) guide.textContent = '다른 후보를 찾고 있어요...';
    const grid = section.querySelector('.playlist-builder-grid');
    if (grid) grid.style.opacity = '0.3';

    const lastSelected = pb.selectedTracks[pb.selectedTracks.length - 1];

    // 선택이 없는 경우: keywordPoolData에서 unseen 곡을 랜덤 12개 뽑기
    if (!lastSelected) {
        const unseen = pb.keywordPoolData.filter(c => !pb.seenTrackKeys.has(c.track_key));
        // unseen이 12개 미만이면 seen 초기화 후 재시작 (pool 순환)
        const pool = unseen.length >= 12 ? unseen : pb.keywordPoolData;
        if (unseen.length < 12) pb.seenTrackKeys = new Set();

        // 랜덤 셔플 후 12개
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        pb.currentCandidates = shuffled.slice(0, 12);
        pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));
        renderPlaylistBuilderSelecting();
        return;
    }

    // 선택이 있는 경우: /next API 호출
    try {
        const res = await fetch(`${API_BASE_URL}/playlist-builder/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
                selected_track_key: lastSelected.track_key,
                keyword_track_keys: pb.keywordPoolKeys,
                seen_track_keys: Array.from(pb.seenTrackKeys),
                step: pb.selectedTracks.length,
                keyword: pb.keyword,
            }),
        });
        if (!res.ok) throw new Error('refresh failed');
        const data = await res.json();

        pb.currentCandidates = data.candidates || [];
        pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));
        renderPlaylistBuilderSelecting();
    } catch (e) {
        console.error('Playlist builder refresh error:', e);
        if (grid) grid.style.opacity = '1';
    }
}

async function onPbTrackSelect(track) {
    pb.selectedTracks.push(track);

    // 6곡 완성
    if (pb.selectedTracks.length >= 6) {
        await finishPlaylistBuilder();
        return;
    }

    // 다음 후보 로드
    const section = getPbSection();
    const card = section.querySelector('.playlist-builder-card');
    if (card) {
        const body = card.querySelector('.playlist-builder-body');
        if (body) {
            const guide = body.querySelector('.playlist-builder-guide');
            if (guide) {
                guide.textContent = '다음 후보를 찾고 있어요...';
                guide.style.animation = 'blink 1s ease-in-out infinite';
            }
        }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/playlist-builder/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
                selected_track_key: track.track_key,
                keyword_track_keys: pb.keywordPoolKeys,
                seen_track_keys: Array.from(pb.seenTrackKeys),
                step: pb.selectedTracks.length,
                keyword: pb.keyword,
            }),
        });
        if (!res.ok) throw new Error('next failed');
        const data = await res.json();

        pb.currentCandidates = data.candidates || [];
        pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));

        renderPlaylistBuilderSelecting();
    } catch (e) {
        console.error('Playlist builder next error:', e);
        renderPlaylistBuilderSelecting();
    }
}

async function finishPlaylistBuilder() {
    const section = getPbSection();
    section.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'home-feed-card playlist-builder-card';
    card.innerHTML = `<div class="favorites-empty" style="padding:20px 0">플레이리스트를 완성하고 있어요...</div>`;
    section.appendChild(card);

    try {
        const res = await fetch(`${API_BASE_URL}/playlist-builder/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
                selected_track_keys: pb.selectedTracks.map(t => t.track_key),
            }),
        });
        if (!res.ok) throw new Error('finish failed');
        const data = await res.json();

        pb.state = 'finished';
        pb.completedPlaylist = data.playlist || [];
        const chosenKeys = new Set(pb.selectedTracks.map(t => t.track_key));

        renderPlaylistBuilderResult(chosenKeys);
    } catch (e) {
        console.error('Playlist builder finish error:', e);
        pb.state = 'idle';
        renderPlaylistBuilderIdle();
    }
}

function renderPlaylistBuilderResult(chosenKeys) {
    const section = getPbSection();
    section.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'home-feed-card playlist-builder-card';

    // 헤더
    const headerDiv = document.createElement('div');
    headerDiv.className = 'playlist-builder-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'playlist-builder-title';
    titleEl.textContent = `${pb.userName}님의 ${pb.season || '여름'} ${pb.timeOfDay} 플레이리스트`;

    const restartBtn = document.createElement('button');
    restartBtn.className = 'playlist-builder-start-btn';
    restartBtn.style.background = 'rgba(255,255,255,0.1)';
    restartBtn.style.boxShadow = 'none';
    restartBtn.textContent = '다시 만들기';
    restartBtn.onclick = () => {
        pb.state = 'idle';
        pb.prefetchPromise = null;
        startPlaylistBuilder();
    };

    headerDiv.appendChild(titleEl);
    headerDiv.appendChild(restartBtn);
    card.appendChild(headerDiv);

    const body = document.createElement('div');
    body.className = 'playlist-builder-body';

    // 결과 그리드 (12곡)
    const grid = document.createElement('div');
    grid.className = `playlist-builder-result-grid ${recommendationViewMode === 'list' ? 'track-list compact-track-list' : ''}`;

    const playlistTrackKeys = (pb.completedPlaylist || []).map(t => t.track_key);

    (pb.completedPlaylist || []).forEach(track => {
        const normalizedTrack = {
            track_key: track.track_key,
            track: track.track_name || track.title,
            title: track.track_name || track.title,
            artist: track.artist,
            album: track.album,
            cover_image_url: track.cover_image_url,
            playlist_count: track.playlist_count,
        };

        const isChosen = chosenKeys && chosenKeys.has(track.track_key);
        const trackDiv = createTrackCard(normalizedTrack, false, () => {
            switchTab('search');
            selectTrack(normalizedTrack);
        }, { candidateKeys: playlistTrackKeys });

        if (isChosen) {
            trackDiv.classList.add('pb-chosen');
        }

        grid.appendChild(trackDiv);
    });

    body.appendChild(grid);

    // 저장 버튼
    const saveRow = document.createElement('div');
    saveRow.className = 'playlist-builder-save-row';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'playlist-builder-save-btn';
    saveBtn.textContent = '저장하기';
    saveBtn.onclick = () => savePlaylist(saveBtn);

    saveRow.appendChild(saveBtn);
    body.appendChild(saveRow);

    card.appendChild(body);
    section.appendChild(card);
}

async function savePlaylist(btn) {
    if (pb.savedPlaylistId) return;

    btn.disabled = true;
    btn.textContent = '저장 중...';

    const name = `${pb.userName}님의 ${pb.season || '여름'} ${pb.timeOfDay} 플레이리스트`;
    const trackKeys = (pb.completedPlaylist || []).map(t => t.track_key);

    try {
        const res = await fetch(`${API_BASE_URL}/playlist-builder/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ name, track_keys: trackKeys }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();

        pb.savedPlaylistId = data.playlist_id;
        btn.textContent = '저장됨 ♥';
        btn.style.background = 'rgba(255, 107, 129, 0.5)';
        lastFavorites = []; // 찜 탭 캐시 무효화
        lastSavedPlaylists = []; // 저장된 플레이리스트 캐시 무효화
    } catch (e) {
        console.error('Playlist save error:', e);
        btn.disabled = false;
        btn.textContent = '저장 실패. 다시 시도';
    }
}

function renderPlaylistBuilder() {
    if (!currentUser) return;

    if (pb.state === 'finished' && pb.completedPlaylist) {
        const chosenKeys = new Set(pb.selectedTracks.map(t => t.track_key));
        renderPlaylistBuilderResult(chosenKeys);
    } else if (pb.state === 'selecting') {
        renderPlaylistBuilderSelecting();
    } else if (pb.state === 'loading') {
        renderPlaylistBuilderLoading();
    } else if (pb.prefetchPromise) {
        // 프리패치 결과가 있으면 바로 이어서 시작 (로딩 최소화)
        startPlaylistBuilder();
    } else {
        // prefetch도 없고 idle → 시작
        startPlaylistBuilder();
    }
}

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
        loadHomeFeed(); // 백그라운드에서 홈 피드 미리 로드
        loadFavorites(); // 백그라운드에서 찜 목록 미리 로드
        prefetchPlaylistBuilder(); // 플레이리스트 빌더 미리 호출
        prefetchMusicMap(); // 취향 지도 미리 생성
    } else {
        // 비로그인 → 로그인 선택 화면 표시
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('layoutToggle').classList.add('hidden');
    }
});

// ===== Music Map =====

// sessionStorage 캐시 키: 찜 목록 track_key 배열을 join한 문자열 해시
function mapCacheKey(trackKeys) {
    return 'mapCache_' + trackKeys.slice().sort().join(',');
}

function loadMapCache(trackKeys) {
    try {
        const key = mapCacheKey(trackKeys);
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

function saveMapCache(trackKeys, data) {
    try {
        const key = mapCacheKey(trackKeys);
        sessionStorage.setItem(key, JSON.stringify(data));
    } catch(e) {}
}

async function fetchMusicMapData() {
    // 찜 목록 가져오기
    let trackKeys = [];
    try {
        const res = await fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            const favs = data.favorites || [];
            trackKeys = favs.slice(0, 20).map(f => f.track_key);
        }
    } catch(e) {}

    // 찜이 없으면 인기곡 10개로 대체
    if (trackKeys.length === 0) {
        try {
            const res = await fetch(`${API_BASE_URL}/top-tracks?limit=10`);
            if (res.ok) {
                const data = await res.json();
                trackKeys = (data.tracks || []).map(t => t.track_key);
            }
        } catch(e) {}
    }

    if (trackKeys.length === 0) return null;

    // sessionStorage 캐시 확인 — 같은 찜 목록이면 UMAP 재계산 없이 바로 반환
    const cached = loadMapCache(trackKeys);
    if (cached) { console.log('🗺️ Map cache hit'); return cached; }

    const res = await fetch(`${API_BASE_URL}/music-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ track_keys: trackKeys, fill_per_seed: 15, n_neighbors: 15, bridge_per_pair: 10 })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    // 결과를 sessionStorage에 저장
    saveMapCache(trackKeys, data);
    return data;
}

function prefetchMusicMap() {
    if (!authToken) return;
    mapPrefetchPromise = fetchMusicMapData().catch(e => {
        console.warn('Map prefetch failed:', e);
        return null;
    });
}

async function showMusicMap() {
    const canvas = document.getElementById('mapCanvas');
    const wrap = document.getElementById('mapCanvasWrap');
    const loading = document.getElementById('mapLoading');
    const empty = document.getElementById('mapEmpty');

    // 이미 데이터 있으면 재요청 없이 바로 렌더 (애니메이션 재시작)
    if (lastMapData) {
        const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
        lastMapData.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
        wrap.classList.remove('hidden');
        loading.classList.add('hidden');
        empty.classList.add('hidden');
        renderMusicMap(canvas, lastMapData.tracks);
        return;
    }

    wrap.classList.add('hidden');
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    try {
        // 프리패치 결과 대기, 실패(null)면 새로 요청
        const prefetched = mapPrefetchPromise ? await mapPrefetchPromise : null;
        const data = prefetched || await fetchMusicMapData();
        if (!data || !data.tracks || data.tracks.length === 0) {
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        lastMapData = data;
        // 찜 목록 기반으로 is_favorite 세팅
        const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
        data.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
        loading.classList.add('hidden');
        wrap.classList.remove('hidden');
        renderMusicMap(canvas, data.tracks);
    } catch(e) {
        console.error('Map load error:', e);
        loading.classList.add('hidden');
        empty.classList.remove('hidden');
    }
}

function renderMusicMap(canvas, tracks) {
    const COVER = 140, GAP = 22, LABEL_H = 42, STEP = COVER + GAP;
    const VSTEP = COVER + LABEL_H + GAP;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 논리 픽셀 크기 (dpr 무관하게 레이아웃/좌표 계산에 사용)
    const lw = () => window.innerWidth;
    const lh = () => window.innerHeight;

    // 시드를 격자에 배치하고 fill을 시드 주변 칸에 채움
    const seeds = tracks.filter(t => t.is_seed);
    const fills = tracks.filter(t => !t.is_seed && !t.is_bridge);
    const bridges = tracks.filter(t => t.is_bridge);

    // 시드 간격: fill이 들어갈 공간 확보 (반경 2칸 = 5칸 간격)
    const S = 5; // 시드 간 격자 간격

    // 백엔드 x,y → 격자 col,row (2D 구조 유지)
    const sxVals = seeds.map(t => t.x), syVals = seeds.map(t => t.y);
    const sxMin = Math.min(...sxVals), sxMax = Math.max(...sxVals);
    const syMin = Math.min(...syVals), syMax = Math.max(...syVals);
    const sxRange = (sxMax - sxMin) || 1, syRange = (syMax - syMin) || 1;
    const seedGridW = Math.max(1, Math.round(Math.sqrt(seeds.length * (lw() / lh()))));
    const seedGridH = Math.max(1, Math.ceil(seeds.length / seedGridW));

    const seedCell = {}; // track_key → {c, r}
    seeds.forEach(t => {
        const gc = Math.round((t.x - sxMin) / sxRange * (seedGridW - 1));
        const gr = Math.round((t.y - syMin) / syRange * (seedGridH - 1));
        seedCell[t.track_key] = { c: gc * S, r: gr * S };
    });

    // 나선형 인접 칸 (거리 순)
    function spiral(cc, rc, maxR) {
        const out = [];
        for (let r = 1; r <= maxR; r++)
            for (let dc = -r; dc <= r; dc++)
                for (let dr = -r; dr <= r; dr++)
                    if (Math.abs(dc) === r || Math.abs(dr) === r)
                        out.push([cc + dc, rc + dr]);
        return out;
    }

    const occupied = new Set();
    const cellOf = {}; // track_key → {c, r}

    seeds.forEach(t => {
        const { c, r } = seedCell[t.track_key];
        occupied.add(`${c},${r}`);
        cellOf[t.track_key] = { c, r };
    });

    // fill → 소속 시드 주변 빈 칸
    seeds.forEach(seed => {
        const { c, r } = seedCell[seed.track_key];
        const seedFills = fills.filter(f => f.source_seed_key === seed.track_key);
        const nearby = spiral(c, r, 2);
        let si = 0;
        for (const f of seedFills) {
            while (si < nearby.length && occupied.has(`${nearby[si][0]},${nearby[si][1]}`)) si++;
            if (si >= nearby.length) break;
            const [fc, fr] = nearby[si++];
            occupied.add(`${fc},${fr}`);
            cellOf[f.track_key] = { c: fc, r: fr };
        }
    });

    // bridge → 두 시드 중간
    bridges.forEach(t => {
        const ba = t.bridge_seed_a, bb = t.bridge_seed_b;
        const pa = ba && seedCell[ba.key], pb = bb && seedCell[bb.key];
        const mc = pa && pb ? Math.round((pa.c + pb.c) / 2) : 0;
        const mr = pa && pb ? Math.round((pa.r + pb.r) / 2) : 0;
        const nearby = [[mc, mr], ...spiral(mc, mr, 3)];
        let si = 0;
        while (si < nearby.length && occupied.has(`${nearby[si][0]},${nearby[si][1]}`)) si++;
        const [fc, fr] = nearby[si] || [mc, mr];
        occupied.add(`${fc},${fr}`);
        cellOf[t.track_key] = { c: fc, r: fr };
    });

    // 셀 → 픽셀
    const allC = Object.values(cellOf).map(p => p.c);
    const allR = Object.values(cellOf).map(p => p.r);
    const cMin = Math.min(...allC), rMin = Math.min(...allR);
    const cMax = Math.max(...allC), rMax = Math.max(...allR);

    const grid = tracks.map(track => {
        const cp = cellOf[track.track_key] || { c: 0, r: 0 };
        const col = cp.c - cMin, row = cp.r - rMin;
        const px = col * STEP + (row % 2 === 1 ? STEP / 2 : 0) - (cMax - cMin) * STEP / 2;
        const py = row * VSTEP - (rMax - rMin) * VSTEP / 2;
        const spread = 2.5;
        return { track, px, py, apx: px * spread, apy: py * spread, animT: 0 };
    });

    const images = {};
    const TARGET_SCALE = 0.6;
    const MIN_SCALE = 0.15, MAX_SCALE = 2.0;
    let cam = { x: lw()/2, y: lh()/2, scale: TARGET_SCALE, tx: lw()/2, ty: lh()/2 };
    let destroyed = false;

    // 그리드 범위 (패딩 포함)
    const PAD = COVER * 2;
    const gxMin = Math.min(...grid.map(g=>g.px)) - PAD;
    const gxMax = Math.max(...grid.map(g=>g.px)) + PAD;
    const gyMin = Math.min(...grid.map(g=>g.py)) - PAD;
    const gyMax = Math.max(...grid.map(g=>g.py)) + PAD;

    // 카메라 tx/ty가 그리드 밖으로 못 나가게 clamp
    // 그리드 world 좌표 → screen: sx = px * scale + tx
    // 그리드 우끝이 화면 왼쪽 밖으로: gxMax*s+tx < 0 → tx < -gxMax*s → 금지
    // 그리드 좌끝이 화면 오른쪽 밖으로: gxMin*s+tx > lw() → tx > lw()-gxMin*s → 금지
    function clampCam() {
        const s = cam.scale, w = lw(), h = lh();
        cam.tx = Math.max(-gxMax * s, Math.min(w - gxMin * s, cam.tx));
        cam.ty = Math.max(-gyMax * s, Math.min(h - gyMin * s, cam.ty));
    }
    let hoveredItem = null;
    const hoverScales = new Map();
    let isDragging = false, dragStart = {x:0,y:0}, camStart = {x:0,y:0};

    // 텍스트 truncation 캐시 (scale 변할 때만 무효화)
    const truncCache = new Map();
    let lastTruncScale = -1;
    function truncCached(ctx, text, maxW, key) {
        if (lastTruncScale !== cam.scale) { truncCache.clear(); lastTruncScale = cam.scale; }
        const ckey = key + '|' + maxW.toFixed(1);
        if (truncCache.has(ckey)) return truncCache.get(ckey);
        const result = truncate(ctx, text, maxW);
        truncCache.set(ckey, result);
        return result;
    }

    // drawOrder는 hover 변경 시에만 재계산
    let drawOrder = [...grid];
    let lastHoveredItem = null;

    // 이미지 로딩
    Promise.all(tracks.map(t => {
        if (!t.cover_image_url) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { images[t.track_key] = img; resolve(); };
            img.onerror = () => { images[t.track_key] = null; resolve(); };
            img.src = t.cover_image_url;
        });
    })).then(() => {
        // 이미지 로드 완료 후 애니메이션 시작 (버퍼링 방지)
        for (const item of grid) item.animT = 0;
        requestAnimationFrame(loop);
    });

    function toScreen(px, py) {
        return { sx: px * cam.scale + cam.x, sy: py * cam.scale + cam.y };
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
        ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
        ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
    }

    function truncate(ctx, text, maxW) {
        if (!text) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t+'…').width > maxW) t = t.slice(0,-1);
        return t+'…';
    }

    // 마우스 엣지 이동
    let mousePos = { x: -1, y: -1 };

    function loop() {
        if (destroyed) return;
        requestAnimationFrame(loop);
        // 지도 탭이 닫히면 렌더 스킵 (loop는 유지)
        if (document.getElementById('mapView').classList.contains('hidden')) return;

        // 엣지 패닝 (마우스가 화면 가장자리 10% 이내일 때)
        if (!isDragging && mousePos.x >= 0) {
            const EDGE = 0.1;
            const SPEED = 8;
            const w = lw(), h = lh();
            const nx = mousePos.x / w, ny = mousePos.y / h;
            if (nx < EDGE)       cam.tx += SPEED * (EDGE - nx) / EDGE;
            else if (nx > 1-EDGE) cam.tx -= SPEED * (nx - (1-EDGE)) / EDGE;
            if (ny < EDGE)       cam.ty += SPEED * (EDGE - ny) / EDGE;
            else if (ny > 1-EDGE) cam.ty -= SPEED * (ny - (1-EDGE)) / EDGE;
        }

        clampCam();
        cam.x += (cam.tx - cam.x) * 0.1;
        cam.y += (cam.ty - cam.y) * 0.1;

        // 앨범 모이는 애니메이션 (각 animT: 0→1)
        for (const item of grid) {
            if (item.animT < 1) item.animT = Math.min(1, item.animT + 0.022);
        }

        ctx.clearRect(0, 0, lw(), lh());

        const cx = lw() / 2, cy = lh() / 2;

        // hover 변경 시에만 drawOrder 재계산
        if (hoveredItem !== lastHoveredItem) {
            lastHoveredItem = hoveredItem;
            drawOrder = [...grid].sort((a,b) => {
                const r = t => hoveredItem===t?2:t.track.is_seed?1:0;
                return r(a)-r(b);
            });
        }

        // hoverScales: hover된 것과 1.0이 아닌 것만 업데이트
        if (hoveredItem) {
            const k = hoveredItem.track.track_key;
            const cur = hoverScales.get(k) || 1;
            hoverScales.set(k, cur + (1.3 - cur) * 0.13);
        }
        for (const [k, v] of hoverScales) {
            if (hoveredItem && k === hoveredItem.track.track_key) continue;
            if (Math.abs(v - 1) < 0.001) { hoverScales.set(k, 1); continue; }
            hoverScales.set(k, v + (1 - v) * 0.13);
        }

        for (const item of drawOrder) {
            const { track, px, py, apx, apy, animT } = item;
            // easeOut: 바깥에서 최종 위치로 모이기
            const e = 1 - Math.pow(1 - animT, 3);
            const curPx = apx + (px - apx) * e;
            const curPy = apy + (py - apy) * e;
            const { sx, sy } = toScreen(curPx, curPy);
            const hs = hoverScales.get(track.track_key) || 1;

            const ndx = (sx - cx) / (lw() * 0.48);
            const ndy = (sy - cy) / (lh() * 0.48);
            const pf = Math.max(0.3, 1 - Math.sqrt(ndx*ndx+ndy*ndy) * 0.58);
            const size = COVER * cam.scale * hs * pf;
            const half = size / 2;

            if (sx+half < 0 || sx-half > lw() || sy+half < 0 || sy-half > lh()) continue;

            const r = size * 0.12;
            const img = images[track.track_key];
            const isHov = hoveredItem === item;
            const isSeed = track.is_seed;
            const isFav = track.is_favorite;
            const isBridge = track.is_bridge;

            ctx.save();
            ctx.translate(sx, sy);
            if (isHov) { ctx.shadowColor='rgba(0,0,0,.8)'; ctx.shadowBlur=size*.4; ctx.shadowOffsetY=size*.06; }
            ctx.beginPath(); roundRect(ctx,-half,-half,size,size,r); ctx.clip();
            ctx.shadowBlur=0; ctx.shadowOffsetY=0;
            if (img) { ctx.drawImage(img,-half,-half,size,size); }
            else { ctx.fillStyle='#1a1a24'; ctx.fill(); }
            if (!isSeed && !isFav && !isHov) { ctx.fillStyle='rgba(0,0,0,.28)'; ctx.fillRect(-half,-half,size,size); }
            ctx.restore();

            // 텍스트
            // 텍스트: animT 0.7 이후 fade in
            const txtAlpha = Math.min(1, Math.max(0, (animT - 0.7) / 0.3));
            if (txtAlpha > 0) {
                const lblSz = Math.max(11, size * 0.14);
                const lblY = sy + half + 5;
                ctx.save();
                ctx.globalAlpha = txtAlpha;
                ctx.textAlign='center'; ctx.textBaseline='top';
                ctx.font=`600 ${lblSz}px -apple-system,sans-serif`;
                ctx.fillStyle=isHov?'#fff':'rgba(255,255,255,.82)';
                ctx.fillText(truncCached(ctx, track.title, size*1.1, track.track_key+'t'), sx, lblY);
                ctx.font=`${lblSz*.85}px -apple-system,sans-serif`;
                ctx.fillStyle=isHov?'rgba(255,255,255,.8)':'rgba(255,255,255,.45)';
                ctx.fillText(truncCached(ctx, track.artist, size*1.1, track.track_key+'a'), sx, lblY+lblSz+4);
                ctx.restore();
            }

            // 테두리
            if (isSeed || isFav || isHov) {
                ctx.save(); ctx.translate(sx,sy);
                ctx.beginPath(); roundRect(ctx,-half,-half,size,size,r);
                if (isFav) { ctx.strokeStyle='#1db954'; ctx.lineWidth=Math.max(3,size*.065); ctx.shadowColor='#1db954'; ctx.shadowBlur=isHov?size*.55:size*.3; }
                else if (isSeed) { ctx.strokeStyle='#1db954'; ctx.lineWidth=Math.max(2,size*.045); ctx.shadowColor='#1db954'; ctx.shadowBlur=isHov?size*.45:size*.2; }
                else if (isBridge) { ctx.strokeStyle='#4a9eff'; ctx.lineWidth=Math.max(2,size*.04); ctx.shadowColor='#4a9eff'; ctx.shadowBlur=isHov?size*.45:size*.2; }
                else { ctx.strokeStyle='rgba(255,255,255,.8)'; ctx.lineWidth=Math.max(1.5,size*.03); ctx.shadowColor='rgba(255,255,255,.35)'; ctx.shadowBlur=size*.25; }
                ctx.stroke(); ctx.restore();
            }
        }

    }

    // 이벤트 — 한 번만 등록 (리렌더 방지)
    const oldWrap = canvas.parentElement;
    const newWrap = oldWrap.cloneNode(false);
    newWrap.appendChild(canvas);
    oldWrap.parentElement.replaceChild(newWrap, oldWrap);

    function hitTest(mx, my) {
        const cx = lw()/2, cy = lh()/2;
        for (let i=grid.length-1; i>=0; i--) {
            const { track, px, py } = grid[i];
            const { sx, sy } = toScreen(px, py);
            const hs = hoverScales.get(track.track_key)||1;
            const ndx=(sx-cx)/(lw()*.48), ndy=(sy-cy)/(lh()*.48);
            const pf=Math.max(0.3,1-Math.sqrt(ndx*ndx+ndy*ndy)*.58);
            const half=COVER*cam.scale*hs*pf/2;
            if (mx>=sx-half&&mx<=sx+half&&my>=sy-half&&my<=sy+half) return grid[i];
        }
        return null;
    }

    const mapTooltip = document.getElementById('mapTooltip');
    const onMouseMove = e => {
        if (document.getElementById('mapView').classList.contains('hidden')) return;
        mousePos = { x: e.clientX, y: e.clientY };
        if (isDragging) {
            cam.tx=camStart.x+(e.clientX-dragStart.x);
            cam.ty=camStart.y+(e.clientY-dragStart.y);
            hoveredItem=null; newWrap.style.cursor='grabbing';
            if (mapTooltip) mapTooltip.style.display='none';
            return;
        }
        const item=hitTest(e.clientX,e.clientY);
        hoveredItem=item;
        newWrap.style.cursor=item?'pointer':'grab';
        if (mapTooltip) {
            if (item && !item.track.is_seed) {
                const t = item.track;
                let tx = e.clientX + 14;
                let ty = e.clientY - 10;
                let html = '';
                if (t.is_bridge && t.bridge_seed_a && t.bridge_seed_b) {
                    const a = t.bridge_seed_a, b = t.bridge_seed_b;
                    html = `<span style="color:#4a9eff;font-size:10px;letter-spacing:.05em">◆ 브릿지</span><br>`
                         + `<b>${a.title || a.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${a.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(a.sim*100).toFixed(0)}%</span><br>`
                         + `<b>${b.title || b.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${b.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(b.sim*100).toFixed(0)}%</span>`;
                } else if (t.source_seed_title) {
                    html = `<span style="color:#1db954;font-size:10px;letter-spacing:.05em">← 시드</span><br><b>${t.source_seed_title}</b><br><span style="color:rgba(255,255,255,.55);font-size:11px">${t.source_seed_artist || ''}</span>`;
                }
                if (html) {
                    mapTooltip.innerHTML = html;
                    mapTooltip.style.left = tx + 'px';
                    mapTooltip.style.top = ty + 'px';
                    mapTooltip.style.display = 'block';
                } else {
                    mapTooltip.style.display = 'none';
                }
            } else {
                mapTooltip.style.display = 'none';
            }
        }
    };
    const onMouseUp = e => {
        if (document.getElementById('mapView').classList.contains('hidden')) return;
        const moved=Math.abs(e.clientX-dragStart.x)>4||Math.abs(e.clientY-dragStart.y)>4;
        isDragging=false; newWrap.style.cursor='grab';
        if (!moved) {
            const item=hitTest(e.clientX,e.clientY);
            if (item) { cam.tx=lw()/2-item.px*cam.scale; cam.ty=lh()/2-item.py*cam.scale; }
        }
    };
    const onMouseLeave = () => { mousePos = { x: -1, y: -1 }; if (mapTooltip) mapTooltip.style.display='none'; };
    const onResize = () => {
        const d = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * d;
        canvas.height = window.innerHeight * d;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.scale(d, d);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('resize', onResize);

    // newWrap 제거 시 window 리스너도 정리 + loop 중단
    new MutationObserver(() => {
        if (!document.contains(newWrap)) {
            destroyed = true;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mouseleave', onMouseLeave);
            window.removeEventListener('resize', onResize);
        }
    }).observe(document.getElementById('mapView'), { childList: true, subtree: true });

    newWrap.addEventListener('mousedown', e => {
        isDragging=true; dragStart={x:e.clientX,y:e.clientY}; camStart={x:cam.tx,y:cam.ty};
        newWrap.style.cursor='grabbing';
    });
    newWrap.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100);
        const f = 1 - delta * 0.0008;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * f));
        const sf = newScale / cam.scale;
        cam.tx=e.clientX-(e.clientX-cam.tx)*sf; cam.ty=e.clientY-(e.clientY-cam.ty)*sf;
        cam.x=e.clientX-(e.clientX-cam.x)*sf; cam.y=e.clientY-(e.clientY-cam.y)*sf;
        cam.scale=newScale;
        clampCam();
    },{passive:false});
    newWrap.addEventListener('dblclick', e => {
        const item=hitTest(e.clientX,e.clientY);
        if (item) {
            const loginType = localStorage.getItem('login_type');
            if (loginType === 'spotify') {
                window.open(`https://open.spotify.com/track/${item.track.track_key}`, '_blank');
            } else {
                const t = item.track;
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(t.title + ' ' + t.artist)}`, '_blank');
            }
        }
    });
}
