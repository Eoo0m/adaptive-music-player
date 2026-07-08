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
        renderPlaylistBuilder();
        if (lastHomeFeeds.length > 0) {
            renderHomeFeeds(lastHomeFeeds);
        } else {
            loadHomeFeed();
        }
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
        const res = await fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to load favorites');

        const data = await res.json();
        lastFavorites = data.favorites || [];
        const savedPlaylists = getSavedPlaylists();
        renderFavorites(lastFavorites, savedPlaylists);
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
            grid.className = `home-feed-grid ${recommendationViewMode === 'list' ? 'compact-track-list' : ''}`;
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
                    renderFavorites(lastFavorites);
                }
            }
        });

        list.appendChild(trackDiv);
    });
}

function openSavedPlaylist(playlistId) {
    const playlists = getSavedPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    pb.state = 'finished';
    pb.completedPlaylist = pl.tracks || [];
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
        renderPlaylistBuilderLoading();
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

    headerDiv.appendChild(titleEl);
    headerDiv.appendChild(resetBtn);
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

    // 선택된 곡들 (위 행)
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
    grid.className = `playlist-builder-grid ${recommendationViewMode === 'list' ? 'compact-track-list' : ''}`;

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
    grid.className = `playlist-builder-result-grid ${recommendationViewMode === 'list' ? 'compact-track-list' : ''}`;

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

function savePlaylist(btn) {
    if (pb.savedPlaylistId) return;

    const name = `${pb.userName}님의 ${pb.season || '여름'} ${pb.timeOfDay} 플레이리스트`;
    const userId = currentUser?.user_id || currentUser?.id || 'unknown';
    const key = `dynplayer_playlists_${userId}`;

    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const newPlaylist = {
        id: Date.now(),
        name,
        tracks: pb.completedPlaylist || [],
        created_at: new Date().toISOString(),
    };
    existing.unshift(newPlaylist);
    localStorage.setItem(key, JSON.stringify(existing));

    pb.savedPlaylistId = newPlaylist.id;
    btn.disabled = true;
    btn.textContent = '저장됨 ♥';
    btn.style.background = 'rgba(255, 107, 129, 0.5)';
}

function getSavedPlaylists() {
    const userId = currentUser?.user_id || currentUser?.id || 'unknown';
    const key = `dynplayer_playlists_${userId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
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
    } else {
        // idle → 바로 시작
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
        prefetchPlaylistBuilder(); // 플레이리스트 빌더 미리 호출
    } else {
        // 비로그인 → 로그인 선택 화면 표시
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('layoutToggle').classList.add('hidden');
    }
});
