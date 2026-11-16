// ===== Tab Navigation =====
function switchTab(tab) {
    if ((tab === 'favorites' || tab === 'home' || tab === 'map' || tab === 'settings') && !authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }
    currentTab = tab;
    if (tab !== 'map') {
        const intro = document.getElementById('mapIntroOverlay');
        if (intro && intro.style.display !== 'none') {
            intro.style.display = 'none';
            mapIntroShown = true;
            showMusicMap();
        }
    }
    const nextBtn = document.getElementById('playerNext');
    const shuffleBtn = document.getElementById('playerShuffle');
    const mapActive = tab === 'map' && !!lastMapData;
    if (nextBtn) nextBtn.disabled = (!mapActive && !currentPlaylistQueue);
    if (shuffleBtn) shuffleBtn.disabled = !mapActive;

    document.getElementById('tabSearch').classList.toggle('active', tab === 'search');
    document.getElementById('tabFavorites').classList.toggle('active', tab === 'favorites');
    document.getElementById('tabMap').classList.toggle('active', tab === 'map');
    const btMap = { home: 'btHome', search: 'btSearch', favorites: 'btFavorites', map: 'btMap' };
    ['btHome', 'btSearch', 'btFavorites', 'btMap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === btMap[tab]);
    });

    const searchInterface = document.getElementById('initialSongInput');
    const searchBody = document.getElementById('searchBody');
    const favoritesView = document.getElementById('favoritesView');
    const homeFeedView = document.getElementById('homeFeedView');
    const mapView = document.getElementById('mapView');
    const settingsView = document.getElementById('settingsView');
    const trackInfo = document.getElementById('trackInfo');

    searchInterface.classList.add('hidden');
    if (searchBody) searchBody.classList.add('hidden');
    favoritesView.classList.add('hidden');
    homeFeedView.classList.add('hidden');
    mapView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    trackInfo.classList.add('hidden');

    document.getElementById('tabSettings')?.classList.toggle('active', tab === 'settings');

    if (tab === 'search') {
        searchInterface.classList.remove('hidden');
        if (searchBody) searchBody.classList.remove('hidden');
        if (typeof _navClear === 'function') _navClear();
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
    } else if (tab === 'map') {
        searchInterface.classList.add('hidden');
        searchInterface.classList.remove('mini');
        mapView.classList.remove('hidden');
        if (!mapIntroShown) {
            showMapIntro();
        } else {
            showMusicMap();
        }
    } else if (tab === 'settings') {
        if (settingsView) {
            settingsView.classList.remove('hidden');
            _renderSettingsProfile();
        }
    }
}

// ===== Utilities =====
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

function getTrackTitle(track) {
    return track.track || track.track_name || track.title || track.name || 'Unknown';
}

function getTrackArtist(track) {
    return track.artist || track.artist_name || 'Unknown Artist';
}

function setCurrentCandidates(tracks) {
    currentCandidateKeys = tracks.map(t => t.track_key).filter(Boolean);
}

function isVisible(id) {
    const element = document.getElementById(id);
    return element && !element.classList.contains('hidden');
}

function openTrackOnYouTube(track, candidateKeys = currentCandidateKeys, keepQueue = false) {
    if (!keepQueue) {
        currentPlaylistQueue = null;
        currentPlaylistIndex = -1;
    }
    logAction('play', { selected_track_key: track.track_key, candidate_track_keys: candidateKeys });
    if (currentTab === 'map') playerMoveCamToTrack(track.track_key);
    updatePlayerWidget(track, false);
    document.getElementById('playerNextLoading')?.classList.remove('hidden');
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(getTrackTitle(track) + ' ' + getTrackArtist(track))}`, '_blank');
    } else {
        playWithAppleMusic(track);
    }
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

    const dotsBtn = document.createElement('button');
    dotsBtn.className = 'track-dots-btn';
    dotsBtn.innerHTML = '<span></span><span></span><span></span>';
    dotsBtn.onclick = (e) => {
        e.stopPropagation();
        _openTrackMenu(e, track, dotsBtn, options);
    };

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(dotsBtn);
    trackDiv.appendChild(imgWrapper);
    trackDiv.appendChild(infoDiv);

    if (recommendationViewMode === 'list') {
        const playBtn = document.createElement('button');
        playBtn.className = 'track-play-btn';
        playBtn.type = 'button';
        playBtn.setAttribute('aria-label', `${getTrackTitle(track)} 재생`);
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

// ===== Track Dots Menu =====
let _trackMenuEl = null;

function _openTrackMenu(_e, track, anchorEl, options = {}) {
    _closeTrackMenu();

    const isFav = !!(lastFavorites || []).find(f => f.track_key === track.track_key);

    const menu = document.createElement('div');
    menu.className = 'track-dots-menu';

    const item = document.createElement('button');
    item.className = 'track-dots-menu-item';
    item.textContent = isFav ? '저장 취소' : '저장하기';
    item.onclick = async (ev) => {
        ev.stopPropagation();
        _closeTrackMenu();
        await toggleFavorite(track, null);
        if (options.onFavoriteChange) options.onFavoriteChange(null, track);
    };
    menu.appendChild(item);

    document.body.appendChild(menu);
    _trackMenuEl = menu;

    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.right - menu.offsetWidth;
    if (left < 4) left = 4;
    if (top + 48 > window.innerHeight) top = rect.top - 48;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    setTimeout(() => {
        document.addEventListener('click', _closeTrackMenu, { once: true });
    }, 0);
}

function _closeTrackMenu() {
    if (_trackMenuEl) { _trackMenuEl.remove(); _trackMenuEl = null; }
}

// 뮤직맵 canvas용 트랙 메뉴
function openMapTrackMenu(track, screenX, screenY) {
    _closeTrackMenu();
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }

    const isFav = !!(lastFavorites || []).find(f => f.track_key === track.track_key);

    const menu = document.createElement('div');
    menu.className = 'track-dots-menu';

    const item = document.createElement('button');
    item.className = 'track-dots-menu-item';
    item.textContent = isFav ? '저장 취소' : '저장하기';
    item.onclick = async (ev) => {
        ev.stopPropagation();
        _closeTrackMenu();
        await toggleFavorite(track, null);
    };
    menu.appendChild(item);

    document.body.appendChild(menu);
    _trackMenuEl = menu;

    let left = screenX - menu.offsetWidth / 2;
    let top = screenY - menu.offsetHeight - 8;
    if (left < 4) left = 4;
    if (left + menu.offsetWidth > window.innerWidth - 4) left = window.innerWidth - menu.offsetWidth - 4;
    if (top < 4) top = screenY + 8;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    setTimeout(() => {
        document.addEventListener('click', _closeTrackMenu, { once: true });
    }, 0);
}

// ===== Keyboard / Media Session =====
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            playerTogglePlayPause();
        }
    });

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => playerTogglePlayPause());
        navigator.mediaSession.setActionHandler('pause', () => playerTogglePlayPause());
        navigator.mediaSession.setActionHandler('nexttrack', () => playerNextSimilar());
    }
});

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', async () => {
    updateAppleMusicBtn();
    await checkAuth();
    if (currentUser) {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('initialSongInput').classList.remove('hidden');
        document.getElementById('sideBar')?.classList.remove('hidden');
        loadFavorites().then(() => prefetchMusicMap());
        const appleMusicBtn = document.getElementById('appleMusicBtn');
        if (appleMusicBtn) appleMusicBtn.style.display = '';
        if (localStorage.getItem('apple_music_linked') === '1') {
            if (window.MusicKit) {
                initMusicKit();
            } else {
                document.addEventListener('musickitloaded', () => initMusicKit(), { once: true });
            }
        }
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});
