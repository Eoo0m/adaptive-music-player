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
    if (musicKitInstance && musicKitInstance.isAuthorized) {
        playWithAppleMusic(track);
    } else {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + track.artist)}`, '_blank');
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

    const heartBtn = document.createElement('button');
    heartBtn.className = `heart-btn${options.favorited ? ' favorited' : ''}`;
    const heartSvg = (filled) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    heartBtn.innerHTML = heartSvg(options.favorited);
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
        document.getElementById('bottomTab').classList.remove('hidden');
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
