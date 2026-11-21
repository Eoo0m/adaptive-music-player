// ===== MusicKit =====
let musicKitInstance = null;

function updateAppleMusicBtn() {
    const btn = document.getElementById('appleMusicBtn');
    const label = document.getElementById('appleMusicBtnLabel');
    if (!btn) return;
    const linked = !!(musicKitInstance && musicKitInstance.isAuthorized);
    btn.classList.toggle('linked', linked);
    if (label) label.textContent = linked ? '연결됨' : '연결';
}

async function toggleAppleMusicLink() {
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }
    if (musicKitInstance && musicKitInstance.isAuthorized) return;
    if (!window.MusicKit) {
        document.addEventListener('musickitloaded', () => initMusicKit(), { once: true });
        return;
    }
    await initMusicKit();
}

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
        if (musicKitInstance.isAuthorized) {
            localStorage.setItem('apple_music_linked', '1');
        }
        updateAppleMusicBtn();
        musicKitInstance.addEventListener('playbackStateDidChange', ({ state }) => {
            playerIsPlaying = (state === 2);
            if (playerIsPlaying) {
                if (!playerPlayStartTime) playerPlayStartTime = Date.now();
                document.getElementById('playerNextLoading')?.classList.add('hidden');
            }
            const playIcon = document.getElementById('playerPlayIcon');
            const pauseIcon = document.getElementById('playerPauseIcon');
            if (playIcon) playIcon.style.display = playerIsPlaying ? 'none' : 'block';
            if (pauseIcon) pauseIcon.style.display = playerIsPlaying ? 'block' : 'none';
            playerWidgetSetPulse(playerIsPlaying);
            const expPlayIcon = document.getElementById('playerExpPlayIcon');
            if (expPlayIcon) expPlayIcon.innerHTML = playerIsPlaying
                ? '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            if (state === 5) playerNextSimilar();
        });
    } catch (e) {
        console.warn('MusicKit init failed:', e);
    }
}

async function playWithAppleMusic(track, onFail) {
    try {
        if (!musicKitInstance) await initMusicKit();
        if (!musicKitInstance) throw new Error('MusicKit unavailable');

        if (!musicKitInstance.isAuthorized) {
            await musicKitInstance.authorize();
        }

        if (track.apple_music_id) {
            await musicKitInstance.setQueue({ songs: [track.apple_music_id], startPlaying: true });
            updatePlayerWidget(track, true);
        } else {
            if (onFail) { onFail(); return; }
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(getTrackTitle(track) + ' ' + getTrackArtist(track))}`, '_blank');
        }
    } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('CONTENT_RESTRICTED') || msg.includes('NOT_FOUND') || msg.includes('RESOURCE_NOT_FOUND')) {
            console.warn('Apple Music: 재생 불가 트랙, 다음 후보 시도:', track.title);
            if (onFail) onFail();
        } else {
            console.error('Apple Music playback failed:', e);
            if (onFail) onFail();
        }
    }
}

// ===== Player Widget =====
function playerWidgetBump(cls) {
    const widget = document.getElementById('playerWidget');
    if (!widget) return;
    widget.classList.remove('bump', 'bump-track');
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
    if (isNewTrack && isPlaying) _prefetchNextTracks(track.track_key);
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || '',
            artist: track.artist || '',
            album: track.album || '',
            artwork: track.cover_image_url ? [{ src: track.cover_image_url, sizes: '512x512', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        navigator.mediaSession.setActionHandler('play', () => {
            if (musicKitInstance) musicKitInstance.play();
            else playerTogglePlayPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (musicKitInstance) musicKitInstance.pause();
            else playerTogglePlayPause();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => playerNextSimilar());
    }
    if (isPlaying) {
        playerPlayStartTime = Date.now();
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

    const coverUrl = track.cover_image_url || track.album_art || track.cover || '';
    if (coverUrl) {
        art.src = coverUrl;
        art.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        art.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';

    const nextBtn = document.getElementById('playerNext');
    const shuffleBtn = document.getElementById('playerShuffle');
    const mapActive = currentTab === 'map' && !!lastMapData;
    if (nextBtn) nextBtn.disabled = (!mapActive && !currentPlaylistQueue);
    if (shuffleBtn) shuffleBtn.disabled = !mapActive;

    const expCover = document.getElementById('playerExpCover');
    const expPlayIcon = document.getElementById('playerExpPlayIcon');
    if (expCover) {
        expCover.src = coverUrl;
        expCover.style.display = coverUrl ? 'block' : 'none';
    }
    if (expPlayIcon) {
        expPlayIcon.innerHTML = isPlaying
            ? '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
    }
    if (_playerExpanded && isNewTrack) _populateExpandedTracks();

    if (isNewTrack) {
        playerWidgetBump('bump-track');
    }
    playerWidgetSetPulse(isPlaying);
}

function playerTogglePlayPause() {
    if (!playerCurrentTrack) return;
    if (musicKitInstance) {
        if (playerIsPlaying) {
            logAction('pause', { selected_track_key: playerCurrentTrack.track_key });
            musicKitInstance.pause();
        } else {
            musicKitInstance.play();
        }
    }
}

// ===== Next Track Prefetch & Play =====
const _prefetchCache = {};
let _fetchAndPlayInProgress = false;

function _prefetchNextTracks(trackKey) {
    if (!lastMapData || !trackKey) return;
    const candidateKeys = lastMapData.tracks.filter(t => t.track_key !== trackKey).map(t => t.track_key);
    const body = JSON.stringify({ track_key: trackKey, candidate_track_keys: candidateKeys });
    const headers = { 'Content-Type': 'application/json' };
    for (const ep of ['next-track', 'dynamic-next']) {
        const cacheKey = `${ep}:${trackKey}`;
        if (!_prefetchCache[cacheKey]) {
            _prefetchCache[cacheKey] = fetch(`${API_BASE_URL}/${ep}`, { method: 'POST', headers, body })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        }
    }
}

async function _fetchAndPlay(endpoint, trackKey) {
    if (!lastMapData) return;
    if (_fetchAndPlayInProgress) return;
    _fetchAndPlayInProgress = true;

    const nextBtn = document.getElementById('playerNext');
    const shuffleBtn = document.getElementById('playerShuffle');
    if (nextBtn) nextBtn.disabled = true;
    if (shuffleBtn) shuffleBtn.disabled = true;
    document.getElementById('playerNextLoading')?.classList.remove('hidden');

    try {
        const cacheKey = `${endpoint}:${trackKey}`;
        const minDelay = new Promise(r => setTimeout(r, 300));
        let dataPromise = _prefetchCache[cacheKey] || null;
        delete _prefetchCache[cacheKey];

        if (!dataPromise) {
            const candidateKeys = lastMapData.tracks.filter(t => t.track_key !== trackKey).map(t => t.track_key);
            const body = { track_key: trackKey };
            if (candidateKeys.length > 0) body.candidate_track_keys = candidateKeys;
            dataPromise = fetch(`${API_BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }).then(res => {
                if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
                return res.json();
            });
        }

        const [data] = await Promise.all([dataPromise, minDelay]);
        const tracks = (data?.tracks) || [];
        if (tracks.length === 0) {
            document.getElementById('playerNextLoading')?.classList.add('hidden');
            return;
        }

        let idx = 0;
        function tryNext() {
            if (idx >= tracks.length) return;
            const track = tracks[idx++];
            playerMoveCamToTrack(track.track_key);
            if (musicKitInstance && musicKitInstance.isAuthorized) {
                playWithAppleMusic(track, tryNext);
            } else {
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + track.artist)}`, '_blank');
            }
        }
        tryNext();
    } catch (err) {
        document.getElementById('playerNextLoading')?.classList.add('hidden');
        throw err;
    } finally {
        _fetchAndPlayInProgress = false;
        const mapActive = currentTab === 'map' && !!lastMapData;
        if (nextBtn) nextBtn.disabled = !mapActive;
        if (shuffleBtn) shuffleBtn.disabled = !mapActive;
    }
}

async function playerNextSimilar() {
    if (!playerCurrentTrack) return;

    if (currentPlaylistQueue && currentPlaylistIndex >= 0) {
        const nextIndex = currentPlaylistIndex + 1;
        if (nextIndex >= currentPlaylistQueue.length) return;
        currentPlaylistIndex = nextIndex;
        openTrackOnYouTube(currentPlaylistQueue[nextIndex], currentPlaylistQueue.map(t => t.track_key), true);
        return;
    }

    if (currentTab !== 'map' || !lastMapData) return;
    logAction('next_similar', { selected_track_key: playerCurrentTrack.track_key });
    try {
        await _fetchAndPlay('next-track', playerCurrentTrack.track_key);
    } catch (e) {
        console.error('next-track failed:', e);
    }
}

async function playerDynamicNext() {
    if (!playerCurrentTrack) return;
    if (currentTab !== 'map' || !lastMapData) return;
    logAction('next_dynamic', { selected_track_key: playerCurrentTrack.track_key });
    try {
        await _fetchAndPlay('dynamic-next', playerCurrentTrack.track_key);
    } catch (e) {
        console.error('dynamic-next failed:', e);
    }
}

// ===== Player Expanded Widget =====
let _playerExpanded = false;

function playerExpandWidget() {
    const widget = document.getElementById('playerWidget');
    if (!widget || _playerExpanded) return;
    _playerExpanded = true;
    widget.classList.add('expanded');
    _populateExpandedTracks();
}

function playerCollapseWidget() {
    const widget = document.getElementById('playerWidget');
    if (!widget || !_playerExpanded) return;
    _playerExpanded = false;
    widget.classList.remove('expanded');
}

function _populateExpandedTracks() {
    const nextEl = document.getElementById('playerExpNextTracks');
    const dynEl = document.getElementById('playerExpDynTracks');
    const coverEl = document.getElementById('playerExpCover');
    const playIconEl = document.getElementById('playerExpPlayIcon');
    if (!nextEl || !dynEl) return;

    if (coverEl && playerCurrentTrack) {
        const url = playerCurrentTrack.cover_image_url || playerCurrentTrack.cover || '';
        coverEl.src = url;
        coverEl.style.display = url ? 'block' : 'none';
    }
    if (playIconEl) {
        playIconEl.innerHTML = playerIsPlaying
            ? '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
    }

    function renderCovers(el, cacheKey) {
        el.innerHTML = '';
        const promise = _prefetchCache[cacheKey];
        if (!promise) return;
        promise.then(data => {
            if (!data) return;
            const tracks = (data.tracks || []).slice(0, 3);
            tracks.forEach(t => {
                const img = document.createElement('img');
                img.className = 'player-exp-track-cover';
                img.src = t.cover_image_url || '';
                img.title = `${t.title} - ${t.artist}`;
                img.onclick = () => {
                    const expCover = document.getElementById('playerExpCover');
                    if (expCover) { expCover.src = t.cover_image_url || ''; }
                    const nextEl = document.getElementById('playerExpNextTracks');
                    const dynEl = document.getElementById('playerExpDynTracks');
                    const dotsHtml = '<span class="player-exp-dot"></span><span class="player-exp-dot"></span><span class="player-exp-dot"></span>';
                    if (nextEl) nextEl.innerHTML = dotsHtml;
                    if (dynEl) dynEl.innerHTML = dotsHtml;
                    if (musicKitInstance && musicKitInstance.isAuthorized) {
                        playWithAppleMusic(t, null);
                    }
                };
                el.appendChild(img);
            });
        });
    }

    if (playerCurrentTrack) {
        renderCovers(nextEl, `next-track:${playerCurrentTrack.track_key}`);
        renderCovers(dynEl, `dynamic-next:${playerCurrentTrack.track_key}`);
    }
}

// ===== Player Drag Handle =====
(function initPlayerDrag() {
    document.addEventListener('DOMContentLoaded', () => {
        const handle = document.getElementById('playerDragHandle');
        const handleClose = document.getElementById('playerDragHandleClose');

        let startY = 0;
        let activeHandle = null;

        function onDown(e) {
            activeHandle = e.currentTarget;
            startY = e.touches ? e.touches[0].clientY : e.clientY;
        }
        function onMove(e) {
            if (!activeHandle) return;
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            const delta = y - startY;
            if (!_playerExpanded && activeHandle === handle && delta > 20) {
                activeHandle = null;
                playerExpandWidget();
            } else if (_playerExpanded && activeHandle === handleClose && delta < -20) {
                activeHandle = null;
                playerCollapseWidget();
            }
        }
        function onUp() { activeHandle = null; }

        if (handle) {
            handle.addEventListener('click', playerExpandWidget);
            handle.addEventListener('mousedown', onDown);
            handle.addEventListener('touchstart', onDown, { passive: true });
        }
        if (handleClose) {
            handleClose.addEventListener('mousedown', onDown);
            handleClose.addEventListener('touchstart', onDown, { passive: true });
            handleClose.addEventListener('click', playerCollapseWidget);
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    });
})();
