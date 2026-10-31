// ===== API Configuration =====
const API_BASE_URL = 'https://api.caromusic.kr';

// ===== Auth =====
let authToken = localStorage.getItem('auth_token');
let currentUser = null;

function loginWithGoogle() {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
}

function loginWithSpotify() {
    window.location.href = `${API_BASE_URL}/auth/spotify/login`;
}

function loginWithApple() {
    window.location.href = `${API_BASE_URL}/auth/apple/login`;
}

// ===== MusicKit =====
let musicKitInstance = null;

async function initMusicKit() {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/apple-music/token`);
        if (!res.ok) return;
        const { token } = await res.json();
        await MusicKit.configure({
            developerToken: token,
            app: { name: 'Caro', build: '1.0' },
        });
        musicKitInstance = MusicKit.getInstance();
        console.log('🎵 MusicKit initialized');
        if (!musicKitInstance.isAuthorized) {
            await musicKitInstance.authorize();
        }
        musicKitInstance.addEventListener('playbackStateDidChange', ({ state }) => {
            // state 2 = playing, others = paused/stopped
            playerIsPlaying = (state === 2);
            if (playerIsPlaying && !playerPlayStartTime) playerPlayStartTime = Date.now();
            const playIcon = document.getElementById('playerPlayIcon');
            const pauseIcon = document.getElementById('playerPauseIcon');
            if (playIcon) playIcon.style.display = playerIsPlaying ? 'none' : 'block';
            if (pauseIcon) pauseIcon.style.display = playerIsPlaying ? 'block' : 'none';
            playerWidgetBump(playerIsPlaying ? 'bump' : 'bump');
            playerWidgetSetPulse(playerIsPlaying);
        });
    } catch (e) {
        console.warn('MusicKit init failed:', e);
    }
}

async function playWithAppleMusic(track) {
    try {
        if (!musicKitInstance) await initMusicKit();
        if (!musicKitInstance) throw new Error('MusicKit unavailable');

        // 유저 인증 (Apple Music 구독자 확인)
        if (!musicKitInstance.isAuthorized) {
            await musicKitInstance.authorize();
        }

        if (track.apple_music_id) {
            try { await musicKitInstance.stop(); } catch(e) {}
            await musicKitInstance.setQueue({ songs: [track.apple_music_id], startPlaying: true });
            updatePlayerWidget(track, true);
        } else {
            // apple_music_id 없으면 YouTube fallback
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(getTrackTitle(track) + ' ' + getTrackArtist(track))}`, '_blank');
        }
    } catch (e) {
        console.error('Apple Music playback failed:', e);
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(getTrackTitle(track) + ' ' + getTrackArtist(track))}`, '_blank');
    }
}

function continueAsGuest() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('initialSongInput').classList.remove('hidden');
    document.getElementById('sideTab').classList.remove('hidden');
    document.getElementById('bottomTab').classList.remove('hidden');
}

// ===== Tab Navigation =====
function switchTab(tab) {
    if ((tab === 'favorites' || tab === 'home' || tab === 'map') && !authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }
    currentTab = tab;
    // 지도 인트로 열려있으면 닫기
    if (tab !== 'map') {
        const intro = document.getElementById('mapIntroOverlay');
        if (intro && intro.style.display !== 'none') {
            intro.style.display = 'none';
            mapIntroShown = true;
            showMusicMap();
        }
    }
    const nextBtn = document.getElementById('playerNext');
    if (nextBtn) nextBtn.disabled = (tab !== 'map' && !currentPlaylistQueue);

    document.getElementById('tabSearch').classList.toggle('active', tab === 'search');
    document.getElementById('tabFavorites').classList.toggle('active', tab === 'favorites');
    document.getElementById('tabMap').classList.toggle('active', tab === 'map');
    // 하단 탭바 (모바일)
    const btMap = { home: 'btHome', search: 'btSearch', favorites: 'btFavorites', map: 'btMap' };
    ['btHome', 'btSearch', 'btFavorites', 'btMap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === btMap[tab]);
    });

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
        if (!mapIntroShown) {
            showMapIntro();
        } else {
            showMusicMap();
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

        savedPlaylists.forEach((pl) => {
            const plTracks = (pl.tracks || []).map(t => ({
                track_key: t.track_key,
                title: t.track_name || t.title,
                artist: t.artist,
                album: t.album,
                cover_image_url: t.cover_image_url,
                apple_music_id: t.apple_music_id,
            }));

            // 행 전체 = 스와이프 컨테이너
            const row = document.createElement('div');
            row.style.cssText = 'position:relative;width:100%;max-width:900px;height:80px;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.08);margin-bottom:0;';

            // 삭제 버튼 (오른쪽에 고정)
            const deleteBtn = document.createElement('div');
            deleteBtn.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:80px;background:#e53935;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
            deleteBtn.textContent = '삭제';
            deleteBtn.onclick = async () => {
                try {
                    await fetch(`${API_BASE_URL}/playlist-builder/playlists/${pl.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                    row.remove();
                    lastSavedPlaylists = lastSavedPlaylists.filter(p => p.id !== pl.id);
                } catch(e) { console.error('플리 삭제 실패', e); }
            };

            // 카드 (row를 완전히 덮음)
            const card = document.createElement('div');
            card.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;gap:16px;padding:0 18px;background:rgba(255,255,255,.06);border-radius:12px;cursor:pointer;transition:transform .25s ease;box-sizing:border-box;';

            // 앨범 커버 스택
            const stackWrap = document.createElement('div');
            stackWrap.style.cssText = 'position:relative;height:52px;flex-shrink:0;';
            const previewTracks = (pl.tracks || []).slice(0, 4);
            const total = previewTracks.length;
            previewTracks.forEach((t, i) => {
                const img = document.createElement('img');
                img.src = t.cover_image_url || '';
                img.style.cssText = `position:absolute;left:${i * 20}px;width:48px;height:48px;border-radius:6px;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,.5);z-index:${total - i};`;
                img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };
                stackWrap.appendChild(img);
            });
            stackWrap.style.width = `${48 + (total - 1) * 20}px`;

            // 텍스트
            const info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            nameEl.textContent = pl.name;
            const countEl = document.createElement('div');
            countEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,.45);margin-top:3px;';
            countEl.textContent = `${(pl.tracks || []).length}곡`;
            info.appendChild(nameEl);
            info.appendChild(countEl);

            card.appendChild(stackWrap);
            card.appendChild(info);
            row.appendChild(deleteBtn);
            row.appendChild(card);

            // 스와이프 & 클릭
            let startX = 0, startY = 0, moved = false, opened = false;

            const swipeStart = (x, y) => { startX = x; startY = y; moved = false; };
            const swipeMove = (x) => {
                const dx = startX - x;
                if (Math.abs(dx) > 5) moved = true;
                const base = opened ? 80 : 0;
                const val = Math.max(0, Math.min(80, base + dx));
                card.style.transition = 'none';
                card.style.transform = `translateX(-${val}px)`;
            };
            const swipeEnd = (x) => {
                const dx = startX - x;
                card.style.transition = 'transform .25s ease';
                if (!opened && dx > 40) { card.style.transform = 'translateX(-80px)'; opened = true; }
                else if (opened && dx < -20) { card.style.transform = 'translateX(0)'; opened = false; }
                else { card.style.transform = opened ? 'translateX(-80px)' : 'translateX(0)'; }
                // 클릭 (이동 없으면 재생)
                if (!moved) {
                    if (opened) { card.style.transform = 'translateX(0)'; opened = false; }
                    else { playPlaylist(plTracks); }
                }
            };

            card.addEventListener('mousedown', e => swipeStart(e.clientX, e.clientY));
            window.addEventListener('mousemove', e => { if (startX && moved !== undefined) swipeMove(e.clientX); });
            window.addEventListener('mouseup', e => { if (startX) { swipeEnd(e.clientX); startX = 0; } });
            card.addEventListener('touchstart', e => swipeStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
            card.addEventListener('touchmove', e => swipeMove(e.touches[0].clientX), { passive: true });
            card.addEventListener('touchend', e => swipeEnd(e.changedTouches[0].clientX));

            plSection.appendChild(row);
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

    switchTab('search');
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
const recommendationViewMode = 'grid';
let lastRecommendationTracks = [];
let lastRecommendationIndex = 0;
let lastFavorites = [];
let lastSavedPlaylists = [];
let lastHomeFeeds = [];
let lastMapData = null;      // 캐시된 취향 지도 데이터
let mapPrefetchPromise = null; // 프리패치 중인 Promise
let mapIntroShown = false;   // 인트로를 이미 봤으면 스킵 (세션 중 1회)

// ===== Player Widget State =====
let playerCurrentTrack = null;    // 현재 재생 중인 트랙
let playerIsPlaying = false;      // 재생 상태
let playerPlayStartTime = null;   // 재생 시작 시각 (ms)
let playerCurrentDuration = null; // 현재 곡 전체 길이 (ms), MusicKit에서 얻음
let currentTab = 'search';        // 현재 탭
let currentPlaylistQueue = null;  // 플리 순서 재생 중일 때 트랙 배열
let currentPlaylistIndex = -1;    // 현재 재생 중인 인덱스

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

function openTrackOnYouTube(track, candidateKeys = currentCandidateKeys, keepQueue = false) {
    if (!keepQueue) {
        currentPlaylistQueue = null;
        currentPlaylistIndex = -1;
    }
    logAction('play', { selected_track_key: track.track_key, candidate_track_keys: candidateKeys });
    const loginType = localStorage.getItem('login_type');
    if (loginType === 'apple') {
        playWithAppleMusic(track);
    } else if (loginType === 'spotify') {
        updatePlayerWidget(track, false);
        window.open(`https://open.spotify.com/track/${track.track_key}`, '_blank');
    } else {
        updatePlayerWidget(track, false);
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + track.artist)}`, '_blank');
    }
}

function isVisible(id) {
    const element = document.getElementById(id);
    return element && !element.classList.contains('hidden');
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

// 페이지 로드 시 인증 확인 후 화면 결정
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (currentUser) {
        // 로그인 상태 → 바로 검색 화면
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('initialSongInput').classList.remove('hidden');
        document.getElementById('sideTab').classList.remove('hidden');
        document.getElementById('bottomTab').classList.remove('hidden');
        loadFavorites(); // 찜 목록은 하트 표시용으로 백그라운드 로드
        // Apple 로그인 유저면 MusicKit 미리 초기화
        if (localStorage.getItem('login_type') === 'apple') {
            if (window.MusicKit) {
                initMusicKit();
            } else {
                document.addEventListener('musickitloaded', () => initMusicKit(), { once: true });
            }
        }
    } else {
        // 비로그인 → 로그인 선택 화면 표시
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});

// ===== Map Intro =====

function showMapIntro() {
    const overlay = document.getElementById('mapIntroOverlay');
    const scroller = document.getElementById('mapIntroScrollOuter');
    const canvas = document.getElementById('mapIntroCanvas');
    if (!overlay || !canvas) { mapIntroShown = true; showMusicMap(); return; }

    overlay.style.display = 'block';
    overlay.scrollTop = 0;

    // 인트로 canvas 초기화
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 실제 찜 곡 이미지로 노드 생성
    const favs = (typeof lastFavorites !== 'undefined' && lastFavorites.length > 0)
        ? lastFavorites : [];
    const clusterCenters = [
        { x: W * 0.25, y: H * 0.35 },
        { x: W * 0.65, y: H * 0.28 },
        { x: W * 0.75, y: H * 0.68 },
        { x: W * 0.32, y: H * 0.70 },
        { x: W * 0.52, y: H * 0.50 },
    ];
    const nodes = [];
    const imgCache = {};

    // 찜 곡을 5개 클러스터에 배분
    const perCluster = Math.ceil(Math.max(favs.length, 20) / 5);
    clusterCenters.forEach((c, ci) => {
        const count = ci === 4 ? 4 : 8;
        for (let i = 0; i < count; i++) {
            const favIdx = ci * perCluster + i;
            const fav = favs[favIdx % Math.max(favs.length, 1)];
            const angle = (i / count) * Math.PI * 2 + ci * 0.7;
            const r = 60 + Math.random() * 80;
            const isSeed = ci === 4 || i === 0;
            const node = {
                x: c.x + Math.cos(angle) * r,
                y: c.y + Math.sin(angle) * r,
                size: isSeed ? 56 : (i < 2 ? 48 : 34 + Math.random() * 16),
                isSeed,
                alpha: 1,
                cluster: ci,
                img: null,
                coverUrl: fav ? fav.cover_image_url : null,
            };
            // 이미지 로드
            if (node.coverUrl && !imgCache[node.coverUrl]) {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.onload = () => { imgCache[node.coverUrl] = im; };
                im.onerror = () => { imgCache[node.coverUrl] = null; };
                im.src = node.coverUrl;
                imgCache[node.coverUrl] = im; // 로딩 중에도 참조 유지
            }
            nodes.push(node);
        }
    });

    // 현재 "포커스" 노드 인덱스와 애니메이션 상태
    let focusIdx = 0;  // 하이라이트된 노드
    let pulseT = 0;    // 재생 펄스
    let camX = 0, camY = 0, camScale = 1; // 카메라 (intro용)
    let camTX = 0, camTY = 0, camTScale = 1;
    let introStep = 0; // 0~4
    let jumpT = 0;     // 점프 애니메이션 (step3)
    let jumpFrom = null, jumpTo = null;
    let destroyed = false;

    // 카메라를 노드에 포커스
    function focusOn(nodeIdx, scale) {
        const n = nodes[nodeIdx];
        camTX = W / 2 - n.x * scale;
        camTY = H / 2 - n.y * scale;
        camTScale = scale;
    }

    // 초기 카메라: 전체 보기
    camX = camTX = 0; camY = camTY = 0; camScale = camTScale = 1;

    function drawIntro() {
        if (destroyed) return;
        requestAnimationFrame(drawIntro);
        if (overlay.style.display === 'none') return;

        // 카메라 lerp
        camX += (camTX - camX) * 0.07;
        camY += (camTY - camY) * 0.07;
        camScale += (camTScale - camScale) * 0.07;

        pulseT += 0.04;

        ctx.clearRect(0, 0, W, H);

        // 배경 그라디언트
        const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
        bg.addColorStop(0, '#0d0e1a');
        bg.addColorStop(1, '#07080f');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(camX, camY);
        ctx.scale(camScale, camScale);

        // 연결선 (같은 클러스터끼리)
        ctx.globalAlpha = 0.08;
        nodes.forEach((a, i) => {
            nodes.forEach((b, j) => {
                if (j <= i) return;
                if (a.cluster !== b.cluster) return;
                const dx = a.x - b.x, dy = a.y - b.y;
                if (dx*dx + dy*dy > 160*160) return;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = 'rgba(255,255,255,.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        });
        ctx.globalAlpha = 1;

        // 노드
        nodes.forEach((n, i) => {
            n.alpha += (n.targetAlpha - n.alpha) * 0.05;
            if (n.alpha < 0.01) return;

            const isFocus = (i === focusIdx);
            const isJumpDest = (jumpTo && n === jumpTo);
            const pulse = (isFocus && introStep === 1) ? (1 + 0.1 * Math.sin(pulseT * 2)) : 1;
            const sz = n.size * pulse;
            const half = sz / 2;

            ctx.save();
            ctx.globalAlpha = n.alpha;
            ctx.translate(n.x, n.y);

            // glow
            if (isFocus || n.isSeed) {
                ctx.shadowColor = n.isSeed ? '#1db954' : 'rgba(255,255,255,.6)';
                ctx.shadowBlur = isFocus ? sz * 0.8 : sz * 0.3;
            }
            if (isJumpDest && jumpT > 0.5) {
                ctx.shadowColor = '#a0c8e8';
                ctx.shadowBlur = sz * 1.2 * (jumpT - 0.5) * 2;
            }

            // 둥근 사각형
            ctx.beginPath();
            const r = sz * 0.18;
            ctx.moveTo(-half+r, -half); ctx.lineTo(half-r, -half);
            ctx.quadraticCurveTo(half, -half, half, -half+r);
            ctx.lineTo(half, half-r);
            ctx.quadraticCurveTo(half, half, half-r, half);
            ctx.lineTo(-half+r, half);
            ctx.quadraticCurveTo(-half, half, -half, half-r);
            ctx.lineTo(-half, -half+r);
            ctx.quadraticCurveTo(-half, -half, -half+r, -half);
            ctx.closePath();

            // 이미지 또는 색상 채우기
            const im = n.coverUrl ? imgCache[n.coverUrl] : null;
            if (im && im.complete && im.naturalWidth > 0) {
                ctx.save();
                ctx.clip();
                ctx.drawImage(im, -half, -half, sz, sz);
                ctx.restore();
                ctx.beginPath();
                const r2 = sz * 0.18;
                ctx.moveTo(-half+r2,-half); ctx.lineTo(half-r2,-half);
                ctx.quadraticCurveTo(half,-half,half,-half+r2); ctx.lineTo(half,half-r2);
                ctx.quadraticCurveTo(half,half,half-r2,half); ctx.lineTo(-half+r2,half);
                ctx.quadraticCurveTo(-half,half,-half,half-r2); ctx.lineTo(-half,-half+r2);
                ctx.quadraticCurveTo(-half,-half,-half+r2,-half); ctx.closePath();
            } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.fill();
            }

            // 어둡게 오버레이 (비시드, 비포커스)
            if (!n.isSeed && !isFocus) {
                ctx.beginPath();
                const r3 = sz * 0.18;
                ctx.moveTo(-half+r3,-half); ctx.lineTo(half-r3,-half);
                ctx.quadraticCurveTo(half,-half,half,-half+r3); ctx.lineTo(half,half-r3);
                ctx.quadraticCurveTo(half,half,half-r3,half); ctx.lineTo(-half+r3,half);
                ctx.quadraticCurveTo(-half,half,-half,half-r3); ctx.lineTo(-half,-half+r3);
                ctx.quadraticCurveTo(-half,-half,-half+r3,-half); ctx.closePath();
                ctx.fillStyle = 'rgba(0,0,0,.4)';
                ctx.fill();
            }

            // 테두리
            if (n.isSeed || isFocus) {
                ctx.strokeStyle = n.isSeed ? '#1db954' : 'rgba(255,255,255,.7)';
                ctx.lineWidth = isFocus ? Math.max(2.5, sz * 0.07) : Math.max(2, sz * 0.05);
                ctx.shadowBlur = 0;
                ctx.stroke();
            }

            // 재생 아이콘 (step1 포커스 노드)
            if (isFocus && introStep === 1) {
                ctx.fillStyle = 'rgba(255,255,255,.9)';
                ctx.shadowBlur = 0;
                const ps = sz * 0.22;
                ctx.beginPath();
                ctx.moveTo(-ps*0.4, -ps*0.6);
                ctx.lineTo(ps*0.8, 0);
                ctx.lineTo(-ps*0.4, ps*0.6);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        });

        ctx.restore();
    }
    requestAnimationFrame(drawIntro);

    // 패널 전환
    const panels = [0,1,2,3,4].map(i => document.getElementById('mapIntroPanel' + i));

    function showPanel(idx) {
        panels.forEach((p, i) => {
            if (!p) return;
            if (i === idx) { p.classList.remove('hidden'); }
            else { p.classList.add('hidden'); }
        });
        introStep = idx;
    }
    showPanel(0);

    // 스크롤 진행도 → 스텝 전환
    const STEPS = 5;
    let lastStep = -1;

    function onIntroScroll() {
        const max = scroller.scrollHeight - H;
        const progress = max > 0 ? overlay.scrollTop / max : 0;
        const step = Math.min(STEPS - 1, Math.floor(progress * STEPS));

        if (step === lastStep) return;
        lastStep = step;
        showPanel(step);

        if (step === 0) {
            // 전체 지도 보기
            camTX = 0; camTY = 0; camTScale = 1;
            focusIdx = -1;
        } else if (step === 1) {
            // 중앙 시드 클러스터 포커스 → 곡 재생
            focusIdx = nodes.findIndex(n => n.cluster === 4);
            focusOn(focusIdx, 1.4);
        } else if (step === 2) {
            // 인접 노드로 이동 (같은 클러스터 중 가장 가까운)
            const prev = nodes.findIndex(n => n.cluster === 4);
            const base = nodes[prev];
            let bestIdx = -1, bestDist = Infinity;
            nodes.forEach((n, i) => {
                if (i === prev) return;
                const dx = n.x - base.x, dy = n.y - base.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            });
            focusIdx = bestIdx;
            focusOn(focusIdx, 1.6);
        } else if (step === 3) {
            // 먼 노드로 점프
            const base = nodes[focusIdx >= 0 ? focusIdx : 0];
            let bestIdx = -1, bestDist = 0;
            nodes.forEach((n, i) => {
                const dx = n.x - base.x, dy = n.y - base.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d > bestDist) { bestDist = d; bestIdx = i; }
            });
            jumpFrom = nodes[focusIdx >= 0 ? focusIdx : 0];
            jumpTo = nodes[bestIdx];
            jumpT = 0;
            // 점프 애니메이션: 카메라 먼저 멀리 당겼다가 목적지로
            camTX = W/2 - (jumpFrom.x + (jumpTo.x - jumpFrom.x)*0.5) * 0.6;
            camTY = H/2 - (jumpFrom.y + (jumpTo.y - jumpFrom.y)*0.5) * 0.6;
            camTScale = 0.6;
            setTimeout(() => {
                focusIdx = bestIdx;
                focusOn(focusIdx, 1.5);
                jumpT = 1;
            }, 700);
        } else if (step === 4) {
            // 아웃트로: 전체 지도 다시 보기
            focusIdx = -1;
            camTX = 0; camTY = 0; camTScale = 1;
        }
    }

    overlay.addEventListener('scroll', onIntroScroll, { passive: true });

    // 시작 버튼
    const startBtn = document.getElementById('mapIntroStartBtn');
    if (startBtn) {
        startBtn.onclick = () => {
            destroyed = true;
            overlay.removeEventListener('scroll', onIntroScroll);
            overlay.style.display = 'none';
            mapIntroShown = true;
            showMusicMap();
        };
    }
}

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
    const COVER = 140, GAP = 50, LABEL_H = 42, STEP = COVER + GAP;
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

    // 백엔드 grid_col/grid_row → 픽셀 (격자 직접 매핑)
    const maxCol = Math.max(...tracks.map(t => t.grid_col ?? t.x ?? 0));
    const maxRow = Math.max(...tracks.map(t => t.grid_row ?? t.y ?? 0));

    const grid = tracks.map(track => {
        const col = track.grid_col ?? track.x ?? 0;
        const row = track.grid_row ?? track.y ?? 0;
        const px = col * STEP - maxCol * STEP / 2;
        const py = row * VSTEP - maxRow * VSTEP / 2;
        const spread = 2.5;
        return { track, px, py, apx: px * spread, apy: py * spread, animT: 0 };
    });

    const images = {};
    const TARGET_SCALE = window.innerWidth <= 768 ? 0.42 : 0.6;
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
    let velocity = { x: 0, y: 0 };
    let lastDragPos = { x: 0, y: 0 };

    function loop() {
        if (destroyed) return;
        requestAnimationFrame(loop);
        // 지도 탭이 닫히면 렌더 스킵 (loop는 유지)
        if (document.getElementById('mapView').classList.contains('hidden')) return;

        // 엣지 패닝 (canvas 기준 가장자리 10% 이내일 때)
        if (!isDragging && mousePos.x >= 0) {
            const EDGE = 0.1;
            const SPEED = 16;
            const rect = canvas.getBoundingClientRect();
            const cx = mousePos.x - rect.left, cy = mousePos.y - rect.top;
            const w = rect.width, h = rect.height;
            const nx = cx / w, ny = cy / h;
            if (nx < EDGE)        cam.tx += SPEED * (EDGE - nx) / EDGE;
            else if (nx > 1-EDGE) cam.tx -= SPEED * (nx - (1-EDGE)) / EDGE;
            if (ny < EDGE)        cam.ty += SPEED * (EDGE - ny) / EDGE;
            else if (ny > 1-EDGE) cam.ty -= SPEED * (ny - (1-EDGE)) / EDGE;
        }

        // 관성: 드래그 안 할 때 velocity 감속
        if (!isDragging) {
            cam.tx += velocity.x;
            cam.ty += velocity.y;
            velocity.x *= 0.88;
            velocity.y *= 0.88;
            if (Math.abs(velocity.x) < 0.1) velocity.x = 0;
            if (Math.abs(velocity.y) < 0.1) velocity.y = 0;
        }

        // 외부에서 카메라 이동 요청 (playerMoveCamToTrack)
        if (window.mapCamTarget) {
            const t = window.mapCamTarget;
            cam.tx = lw() / 2 - t.px * cam.scale;
            cam.ty = lh() / 2 - t.py * cam.scale;
            window.mapCamTarget = null;
        }

        clampCam();
        cam.x += (cam.tx - cam.x) * 0.15;
        cam.y += (cam.ty - cam.y) * 0.15;

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
            const isPlaying = playerIsPlaying && playerCurrentTrack && playerCurrentTrack.track_key === track.track_key;
            const pulse = isPlaying ? (1 + 0.07 * Math.sin(Date.now() / 280)) : 1;
            const size = COVER * cam.scale * hs * pf * pulse;
            const half = size / 2;

            item.screenX = sx; item.screenY = sy; item.screenHalf = half;

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
        const rect = canvas.getBoundingClientRect();
        const cx = mx - rect.left;
        const cy = my - rect.top;
        for (let i=grid.length-1; i>=0; i--) {
            const item = grid[i];
            const { screenX: sx, screenY: sy, screenHalf: half } = item;
            if (sx===undefined) continue;
            if (cx>=sx-half&&cx<=sx+half&&cy>=sy-half&&cy<=sy+half) return item;
        }
        return null;
    }

    const mapTooltip = document.getElementById('mapTooltip');
    const onMouseMove = e => {
        if (!isDragging) return;
        velocity={x:e.clientX-lastDragPos.x, y:e.clientY-lastDragPos.y};
        lastDragPos={x:e.clientX,y:e.clientY};
        cam.tx=camStart.x+(e.clientX-dragStart.x);
        cam.ty=camStart.y+(e.clientY-dragStart.y);
    };
    const onResize = () => {
        const d = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * d;
        canvas.height = window.innerHeight * d;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.scale(d, d);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    new MutationObserver(() => {
        if (!document.contains(newWrap)) {
            destroyed = true;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('resize', onResize);
        }
    }).observe(document.getElementById('mapView'), { childList: true, subtree: true });

    newWrap.addEventListener('mousemove', e => {
        mousePos = { x: e.clientX, y: e.clientY };
        if (isDragging) { hoveredItem=null; newWrap.style.cursor='grabbing'; if (mapTooltip) mapTooltip.style.display='none'; return; }
        const item=hitTest(e.clientX,e.clientY);
        hoveredItem=item;
        newWrap.style.cursor=item?'pointer':'grab';
        if (mapTooltip) {
            if (item && !item.track.is_seed) {
                const t = item.track;
                let html = '';
                if (t.is_bridge && t.bridge_seed_a && t.bridge_seed_b) {
                    const a = t.bridge_seed_a, b = t.bridge_seed_b;
                    html = `<span style="color:#4a9eff;font-size:10px;letter-spacing:.05em">◆ 브릿지</span><br>`
                         + `<b>${a.title || a.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${a.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(a.sim*100).toFixed(0)}%</span><br>`
                         + `<b>${b.title || b.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${b.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(b.sim*100).toFixed(0)}%</span>`;
                } else if (t.source_seed_title) {
                    html = `<span style="color:#1db954;font-size:10px;letter-spacing:.05em">← 시드</span><br><b>${t.source_seed_title}</b><br><span style="color:rgba(255,255,255,.55);font-size:11px">${t.source_seed_artist || ''}</span>`;
                }
                if (html) { mapTooltip.innerHTML=html; mapTooltip.style.left=(e.clientX+14)+'px'; mapTooltip.style.top=(e.clientY-10)+'px'; mapTooltip.style.display='block'; }
                else mapTooltip.style.display='none';
            } else mapTooltip.style.display='none';
        }
    });
    newWrap.addEventListener('mouseleave', () => { mousePos={x:-1,y:-1}; if (mapTooltip) mapTooltip.style.display='none'; });
    newWrap.addEventListener('mousedown', e => {
        isDragging=true; dragStart={x:e.clientX,y:e.clientY}; camStart={x:cam.tx,y:cam.ty};
        lastDragPos={x:e.clientX,y:e.clientY}; velocity={x:0,y:0};
        newWrap.style.cursor='grabbing';
    });
    window.addEventListener('mouseup', e => {
        if (!isDragging) return;
        const moved=Math.abs(e.clientX-dragStart.x)>4||Math.abs(e.clientY-dragStart.y)>4;
        isDragging=false; newWrap.style.cursor='grab';
        if (!moved) {
            velocity={x:0,y:0};
            const item=hitTest(e.clientX,e.clientY);
            if (item) { cam.tx=lw()/2-item.px*cam.scale; cam.ty=lh()/2-item.py*cam.scale; }
            if (window._closeMapSearchIfOpen) window._closeMapSearchIfOpen();
        }
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
        if (item) openTrackOnYouTube(item.track);
    });
}

// ── 지도 검색 오버레이 ──
(function initMapSearch() {
    const API = 'https://api.caromusic.kr';
    let debounce = null;
    let selectedKey = null;
    let history = [];
    let favKeys = new Set();

    // 찜 상태 동기화 (lastFavorites 사용)
    function syncFavKeys() {
        if (typeof lastFavorites !== 'undefined') {
            favKeys = new Set(lastFavorites.map(f => f.track_key));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('mapSearchInput');
        const results = document.getElementById('mapSearchResults');
        const status = document.getElementById('mapSearchStatus');
        const refreshBtn = document.getElementById('mapRefreshBtn');
        if (!input) return;

        input.addEventListener('input', () => {
            clearTimeout(debounce);
            const q = input.value.trim();
            if (!q) { results.innerHTML = ''; status.textContent = ''; selectedKey = null; history = []; return; }
            debounce = setTimeout(() => mapSearch(q), 280);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { clearTimeout(debounce); const q = input.value.trim(); if (q) mapSearch(q); }
            if (e.key === 'Escape') closeMapSearch();
        });

        // 캔버스 클릭 시 검색 결과 닫기는 renderMusicMap의 mouseup에서 처리
        window._closeMapSearchIfOpen = () => {
            if (results.children.length > 0) closeMapSearch();
        };

        function closeMapSearch() {
            input.value = '';
            results.innerHTML = '';
            if (status) status.textContent = '';
            selectedKey = null; history = [];
            input.blur();
        }

        refreshBtn && refreshBtn.addEventListener('click', async () => {
            if (!authToken) { alert('로그인이 필요합니다.'); return; }
            refreshBtn.classList.add('spinning');
            lastMapData = null;
            mapPrefetchPromise = null;
            try {
                const canvas = document.getElementById('mapCanvas');
                const data = await fetchMusicMapData();
                if (!data) { alert('찜한 곡이 없습니다.'); return; }
                lastMapData = data;
                const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
                data.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
                if (canvas) renderMusicMap(canvas, data.tracks);
            } catch(e) {
                alert('지도 새로고침 실패: ' + e.message);
            } finally {
                refreshBtn.classList.remove('spinning');
            }
        });
    });

    async function mapSearch(q) {
        const results = document.getElementById('mapSearchResults');
        const status = document.getElementById('mapSearchStatus');
        status.textContent = '검색 중...';
        results.innerHTML = '';
        selectedKey = null; history = [];
        try {
            const res = await fetch(`${API}/search-songs`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q })
            });
            const data = await res.json();
            if (!data.results?.length) { status.textContent = '결과 없음'; return; }
            status.textContent = '';
            syncFavKeys();
            // 검색 결과는 최대 5개만
            data.results.slice(0, 5).forEach(track => results.appendChild(createItem(track)));
        } catch(e) { status.textContent = '검색 실패'; }
    }

    function renderResults(tracks, seedTrack) {
        const results = document.getElementById('mapSearchResults');
        // 결과 전체 교체: 시드 + 구분선 + 추천곡
        results.innerHTML = '';

        const seedEl = createItem(seedTrack);
        seedEl.classList.add('seed');
        results.appendChild(seedEl);

        const div = document.createElement('div');
        div.className = 'map-result-divider';
        div.textContent = '이 곡과 비슷한 음악';
        results.appendChild(div);

        tracks.forEach(track => results.appendChild(createItem(track)));
    }

    function createItem(track) {
        const item = document.createElement('div');
        item.className = 'map-result-item' + (track.track_key === selectedKey ? ' selected' : '');

        const cover = document.createElement('div');
        cover.className = 'map-result-cover';
        if (track.cover_image_url) {
            const img = document.createElement('img');
            img.src = track.cover_image_url;
            img.alt = '';
            cover.appendChild(img);
        } else { cover.textContent = '♪'; }

        const info = document.createElement('div');
        info.className = 'map-result-info';
        info.innerHTML = `<div class="map-result-title">${track.title || track.track || ''}</div><div class="map-result-artist">${track.artist || ''}</div>`;

        const actions = document.createElement('div');
        actions.className = 'map-result-actions';

        const heart = document.createElement('button');
        heart.className = 'map-result-heart' + (favKeys.has(track.track_key) ? ' active' : '');
        heart.textContent = favKeys.has(track.track_key) ? '♥' : '♡';
        heart.onclick = async e => {
            e.stopPropagation();
            const token = authToken;
            if (!token) { alert('로그인이 필요합니다.'); return; }
            const isFav = favKeys.has(track.track_key);
            try {
                await fetch(`${API}/favorites`, {
                    method: isFav ? 'DELETE' : 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ track_key: track.track_key })
                });
                if (isFav) { favKeys.delete(track.track_key); heart.className = 'map-result-heart'; heart.textContent = '♡'; }
                else { favKeys.add(track.track_key); heart.className = 'map-result-heart active'; heart.textContent = '♥'; }
                if (typeof lastFavorites !== 'undefined') {
                    if (isFav) lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
                    else lastFavorites.push({ track_key: track.track_key, title: track.title || track.track, artist: track.artist });
                }
            } catch(e) { alert('찜 처리 실패'); }
        };

        const play = document.createElement('button');
        play.className = 'map-result-play';
        play.textContent = '▶';
        play.title = 'YouTube';
        play.onclick = e => {
            e.stopPropagation();
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((track.title || track.track) + ' ' + track.artist)}`, '_blank');
        };

        actions.appendChild(heart);
        actions.appendChild(play);
        item.appendChild(cover);
        item.appendChild(info);
        item.appendChild(actions);

        item.onclick = () => onItemClick(track, item);
        return item;
    }

    async function onItemClick(track, itemEl) {
        document.querySelectorAll('.map-result-item').forEach(el => el.classList.remove('selected'));
        itemEl.classList.add('selected');
        selectedKey = track.track_key;
        history.push(track.track_key);

        const status = document.getElementById('mapSearchStatus');
        status.textContent = '추천 로드 중...';
        try {
            const res = await fetch(`${API}/recommend`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_keys: history.slice(-10), num_recommendations: 15, exclude_track_keys: history })
            });
            const data = await res.json();
            if (!data.recommendations?.length) throw new Error('empty');
            status.textContent = '';
            syncFavKeys();
            renderResults(data.recommendations, track);
        } catch(e) {
            try {
                const res2 = await fetch(`${API}/find-similar-tracks`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_key: track.track_key, num_recommendations: 15 })
                });
                const data2 = await res2.json();
                if (data2.recommendations?.length) {
                    status.textContent = '';
                    syncFavKeys();
                    renderResults(data2.recommendations, track);
                } else { status.textContent = '추천 결과 없음'; }
            } catch(e2) { status.textContent = '추천 실패'; }
        }
    }
})();

// ===== Player Widget =====
function playerWidgetBump(cls) {
    const widget = document.getElementById('playerWidget');
    if (!widget) return;
    widget.classList.remove('bump', 'bump-track');
    // reflow 강제해서 animation 재시작
    void widget.offsetWidth;
    widget.classList.add(cls);
    widget.addEventListener('animationend', () => {
        widget.classList.remove(cls);
        playerWidgetSetPulse(playerIsPlaying);
    }, { once: true });
}

function playerWidgetSetPulse(playing) {
    const widget = document.getElementById('playerWidget');
    if (!widget) return;
    widget.classList.toggle('is-playing', playing);
}

function updatePlayerWidget(track, isPlaying) {
    if (!track) return;
    const isNewTrack = !playerCurrentTrack || playerCurrentTrack.track_key !== track.track_key;
    playerCurrentTrack = track;
    playerIsPlaying = isPlaying;
    if (isPlaying) {
        playerPlayStartTime = Date.now();
        // MusicKit에서 duration 가져오기
        if (musicKitInstance && musicKitInstance.currentPlaybackDuration) {
            playerCurrentDuration = musicKitInstance.currentPlaybackDuration * 1000;
        } else {
            playerCurrentDuration = null;
        }
    }

    const widget = document.getElementById('playerWidget');
    const art = document.getElementById('playerAlbumArt');
    const placeholder = document.getElementById('playerAlbumPlaceholder');
    const playIcon = document.getElementById('playerPlayIcon');
    const pauseIcon = document.getElementById('playerPauseIcon');

    if (!widget) return;
    widget.classList.remove('hidden');

    // 앨범아트
    const coverUrl = track.cover_image_url || track.album_art || track.cover || '';
    if (coverUrl) {
        art.src = coverUrl;
        art.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        art.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    // 재생/일시정지 아이콘
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';

    // 지도탭이거나 플리 재생 중이면 다음 버튼 활성화
    const nextBtn = document.getElementById('playerNext');
    if (nextBtn) nextBtn.disabled = (currentTab !== 'map' && !currentPlaylistQueue);

    // 애니메이션
    if (isNewTrack) {
        playerWidgetBump('bump-track');
    }
    playerWidgetSetPulse(isPlaying);
}

function playerTogglePlayPause() {
    if (!playerCurrentTrack) return;
    const loginType = localStorage.getItem('login_type');
    if (loginType === 'apple' && musicKitInstance) {
        if (musicKitInstance.playbackState === 2) { // playing
            musicKitInstance.pause();
            playerIsPlaying = false;
        } else {
            musicKitInstance.play();
            playerIsPlaying = true;
            if (!playerPlayStartTime) playerPlayStartTime = Date.now();
        }
        const playIcon = document.getElementById('playerPlayIcon');
        const pauseIcon = document.getElementById('playerPauseIcon');
        if (playIcon) playIcon.style.display = playerIsPlaying ? 'none' : 'block';
        if (pauseIcon) pauseIcon.style.display = playerIsPlaying ? 'block' : 'none';
    }
}

async function playerDynamicNext() {
    if (!playerCurrentTrack) return;

    // 플리 순서 재생 중이면 다음 곡 순서대로
    if (currentPlaylistQueue && currentPlaylistIndex >= 0) {
        const nextIndex = currentPlaylistIndex + 1;
        if (nextIndex >= currentPlaylistQueue.length) return; // 마지막 곡
        currentPlaylistIndex = nextIndex;
        const nextTrack = currentPlaylistQueue[nextIndex];
        openTrackOnYouTube(nextTrack, currentPlaylistQueue.map(t => t.track_key), true);
        return;
    }

    if (currentTab !== 'map' || !lastMapData) return;

    // 50% 기준: 재생 시작부터 경과 시간 vs 곡 길이
    let listenedMs = playerPlayStartTime ? (Date.now() - playerPlayStartTime) : 0;
    let durationMs = playerCurrentDuration;
    if (!durationMs && musicKitInstance && musicKitInstance.currentPlaybackDuration) {
        durationMs = musicKitInstance.currentPlaybackDuration * 1000;
    }

    const listenedHalf = durationMs ? (listenedMs >= durationMs * 0.5) : false;

    try {
        const mapTrackKeys = lastMapData ? lastMapData.tracks.map(t => t.track_key) : [];
        const res = await fetch(`${API_BASE_URL}/dynamic-next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_key: playerCurrentTrack.track_key,
                listened_half: listenedHalf,
                candidate_track_keys: mapTrackKeys
            })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.track) return;

        const nextTrack = data.track;
        playerMoveCamToTrack(nextTrack.track_key, !listenedHalf);
        openTrackOnYouTube(nextTrack);
    } catch (e) {
        console.error('dynamic-next failed:', e);
    }
}

function playPlaylist(tracks) {
    if (!tracks || tracks.length === 0) return;
    currentPlaylistQueue = tracks;
    currentPlaylistIndex = 0;
    const nextBtn = document.getElementById('playerNext');
    if (nextBtn) nextBtn.disabled = false;
    openTrackOnYouTube(tracks[0], tracks.map(t => t.track_key), true);
}

function playerMoveCamToTrack(trackKey, dramatic = false) {
    if (!lastMapData) return;
    // renderMusicMap의 grid 참조는 클로저 내부이므로 lastMapData.tracks에서 계산
    const tracks = lastMapData.tracks;
    const target = tracks.find(t => t.track_key === trackKey);
    if (!target) return;

    const COVER = 140, GAP = 50;
    const STEP = COVER + GAP;
    const VSTEP = STEP * 0.866;

    const maxCol = Math.max(...tracks.map(t => t.grid_col ?? t.x ?? 0));
    const maxRow = Math.max(...tracks.map(t => t.grid_row ?? t.y ?? 0));

    const col = target.grid_col ?? target.x ?? 0;
    const row = target.grid_row ?? target.y ?? 0;
    const px = col * STEP - maxCol * STEP / 2;
    const py = row * VSTEP - maxRow * VSTEP / 2;

    // cam은 renderMusicMap 클로저 내부이므로 직접 접근 불가.
    // window.mapCamTarget을 통해 통신
    window.mapCamTarget = { px, py, dramatic, trackKey };
}
