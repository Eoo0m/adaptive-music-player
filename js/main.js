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
        if (typeof _navReset === 'function') _navReset();
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

    const metaDiv = document.createElement('div');
    metaDiv.className = 'track-item-meta';
    const metaParts = [];
    if (track.album) metaParts.push(track.album);
    if (track.release_year) metaParts.push(track.release_year);
    metaDiv.textContent = metaParts.join(' · ');

    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(artistDiv);
    if (metaParts.length > 0) infoDiv.appendChild(metaDiv);

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

    function addItem(label, fn) {
        const btn = document.createElement('button');
        btn.className = 'track-dots-menu-item';
        btn.textContent = label;
        btn.onclick = async (ev) => { ev.stopPropagation(); _closeTrackMenu(); await fn(); };
        menu.appendChild(btn);
    }

    addItem(isFav ? '저장 취소' : '저장하기', async () => {
        await toggleFavorite(track, null);
        if (options.onFavoriteChange) options.onFavoriteChange(null, track);
    });

    addItem('추천 보기', () => {
        switchTab('search');
        const normalized = { ...track, track: track.track || track.title || track.track_name };
        setTimeout(() => _openTrackDetail(normalized), 150);
    });

    addItem('플레이리스트에 추가', () => openPlaylistPickerPanel(track));

    addItem('코멘트 달기', () => openCommentPanel(track));

    if (typeof fpb !== 'undefined' && fpb.open && currentTab === 'search') {
        const inBuilder = fpb.tracks.find(t => t.track_key === track.track_key);
        addItem(inBuilder ? '빌더에서 제거' : '플리 빌더에 추가', () => {
            if (inBuilder) fpbRemoveTrack(track.track_key);
            else fpbAddTrack(track);
        });
    }

    if (options.extraItems && options.extraItems.length) {
        options.extraItems.forEach(({ label, fn }) => addItem(label, fn));
    }

    document.body.appendChild(menu);
    _trackMenuEl = menu;

    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.right - menu.offsetWidth;
    if (left < 4) left = 4;
    if (top + menu.offsetHeight > window.innerHeight) top = rect.top - menu.offsetHeight - 4;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    setTimeout(() => {
        document.addEventListener('click', _closeTrackMenu, { once: true });
    }, 0);
}

// ===== 플레이리스트 선택 패널 (빌드1) =====
function openPlaylistPickerPanel(track) {
    _closePanelOverlay();
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.id = 'playlistPickerOverlay';

    const panel = document.createElement('div');
    panel.className = 'panel-sheet';

    const header = document.createElement('div');
    header.className = 'panel-sheet-header';
    header.innerHTML = `<span>플레이리스트에 추가</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-sheet-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = _closePanelOverlay;
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 새 플리 생성 행
    const createRow = document.createElement('div');
    createRow.className = 'pl-picker-create-row';
    const nameInput = document.createElement('input');
    nameInput.className = 'pl-picker-name-input';
    nameInput.type = 'text';
    nameInput.placeholder = '새 플레이리스트 이름';
    const addBtn = document.createElement('button');
    addBtn.className = 'pl-picker-add-btn';
    addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addBtn.onclick = async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
            const res = await fetch(`${API_BASE_URL}/playlist-builder/playlist/create`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ name })
            });
            const d = await res.json();
            if (d.success) {
                // 새 플리에 곡 바로 추가
                await _addTrackToPlaylist(d.playlist_id, track.track_key);
                lastSavedPlaylists = lastSavedPlaylists || [];
                lastSavedPlaylists.unshift({ id: d.playlist_id, name, tracks: [], created_at: d.created_at });
                _closePanelOverlay();
            }
        } catch(e) { console.error(e); }
    };
    createRow.appendChild(nameInput);
    createRow.appendChild(addBtn);
    panel.appendChild(createRow);

    // 기존 플리 목록
    const list = document.createElement('div');
    list.className = 'pl-picker-list';
    (lastSavedPlaylists || []).forEach(pl => {
        const row = document.createElement('button');
        row.className = 'pl-picker-item';
        const coverSrc = pl.tracks?.[0]?.cover_image_url || '';
        row.innerHTML = `
            ${coverSrc ? `<img src="${coverSrc}" width="40" height="40" style="border-radius:6px;object-fit:cover;flex-shrink:0;">` : '<div style="width:40px;height:40px;border-radius:6px;background:rgba(255,255,255,.1);flex-shrink:0;"></div>'}
            <div class="pl-picker-item-info"><div class="pl-picker-item-name">${pl.name}</div><div class="pl-picker-item-count">${pl.tracks?.length || 0}곡</div></div>
        `;
        row.onclick = async () => {
            await _addTrackToPlaylist(pl.id, track.track_key);
            _closePanelOverlay();
        };
        list.appendChild(row);
    });
    if (!lastSavedPlaylists?.length) {
        list.innerHTML = '<div style="color:rgba(255,255,255,.35);font-size:13px;padding:16px 0;">플레이리스트가 없습니다</div>';
    }
    panel.appendChild(list);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) _closePanelOverlay(); };
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

async function _addTrackToPlaylist(playlistId, trackKey) {
    try {
        await fetch(`${API_BASE_URL}/playlist-builder/playlist/${playlistId}/add-track`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ track_key: trackKey })
        });
        // lastSavedPlaylists 동기화
        const pl = (lastSavedPlaylists || []).find(p => p.id === playlistId);
        if (pl && !pl.tracks.find(t => t.track_key === trackKey)) pl.tracks.push({ track_key: trackKey });
    } catch(e) { console.error('플리 추가 실패', e); }
}

// ===== 코멘트 패널 =====
function openCommentPanel(track) {
    _closePanelOverlay();
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.id = 'commentPanelOverlay';

    const panel = document.createElement('div');
    panel.className = 'panel-sheet';

    const header = document.createElement('div');
    header.className = 'panel-sheet-header';
    header.innerHTML = `<span>코멘트</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-sheet-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = _closePanelOverlay;
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 히어로 카드
    const hero = document.createElement('div');
    hero.className = 'comment-panel-hero';
    hero.innerHTML = `
        <img src="${track.cover_image_url || ''}" alt="" class="comment-panel-cover">
        <div class="comment-panel-info">
            <div class="comment-panel-title">${track.title || track.track || ''}</div>
            <div class="comment-panel-artist">${track.artist || ''}</div>
        </div>
    `;
    panel.appendChild(hero);

    // 댓글 입력
    const inputRow = document.createElement('div');
    inputRow.className = 'comment-panel-input-row';
    const textarea = document.createElement('textarea');
    textarea.className = 'comment-panel-textarea';
    textarea.placeholder = '이 곡에 대한 생각을 남겨보세요...';
    textarea.rows = 3;
    const submitBtn = document.createElement('button');
    submitBtn.className = 'comment-panel-submit';
    submitBtn.textContent = '저장';
    submitBtn.onclick = async () => {
        const text = textarea.value.trim();
        if (!text) return;
        submitBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE_URL}/comments`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ track_key: track.track_key, text })
            });
            if (res.ok) { _closePanelOverlay(); }
        } catch(e) { console.error(e); }
        submitBtn.disabled = false;
    };
    inputRow.appendChild(textarea);
    inputRow.appendChild(submitBtn);
    panel.appendChild(inputRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) _closePanelOverlay(); };
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function _closePanelOverlay() {
    const el = document.getElementById('playlistPickerOverlay') || document.getElementById('commentPanelOverlay');
    if (el) el.remove();
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
