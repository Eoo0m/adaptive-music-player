// ===== Playlist Builder =====

const pb = {
    state: 'idle',
    keyword: '',
    userName: '',
    timeOfDay: '',
    season: '여름',
    keywordPoolKeys: [],
    keywordPoolData: [],
    selectedTracks: [],
    currentCandidates: [],
    seenTrackKeys: new Set(),
    completedPlaylist: null,
    savedPlaylistId: null,
    prefetchPromise: null,
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

    const headerDiv = document.createElement('div');
    headerDiv.className = 'playlist-builder-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'playlist-builder-title';
    titleEl.textContent = `${pb.userName}님의 ${pb.season || '여름'} ${pb.timeOfDay} 플레이리스트 만들기`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

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

    const guide = document.createElement('div');
    guide.className = 'playlist-builder-guide';
    if (pb.selectedTracks.length === 0) {
        guide.textContent = '앨범 커버를 클릭하세요. (6/6)';
    } else if (pb.selectedTracks.length < 6) {
        guide.textContent = `다음 곡을 선택하세요. (${pb.selectedTracks.length}/6)`;
    }
    body.appendChild(guide);

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
    pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));

    const section = getPbSection();
    const guide = section.querySelector('.playlist-builder-guide');
    if (guide) guide.textContent = '다른 후보를 찾고 있어요...';
    const grid = section.querySelector('.playlist-builder-grid');
    if (grid) grid.style.opacity = '0.3';

    const lastSelected = pb.selectedTracks[pb.selectedTracks.length - 1];

    if (!lastSelected) {
        const unseen = pb.keywordPoolData.filter(c => !pb.seenTrackKeys.has(c.track_key));
        const pool = unseen.length >= 12 ? unseen : pb.keywordPoolData;
        if (unseen.length < 12) pb.seenTrackKeys = new Set();
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        pb.currentCandidates = shuffled.slice(0, 12);
        pb.currentCandidates.forEach(c => pb.seenTrackKeys.add(c.track_key));
        renderPlaylistBuilderSelecting();
        return;
    }

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

    if (pb.selectedTracks.length >= 6) {
        await finishPlaylistBuilder();
        return;
    }

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
        renderPlaylistBuilder();
    }
}

function renderPlaylistBuilderResult(chosenKeys) {
    const section = getPbSection();
    section.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'home-feed-card playlist-builder-card';

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

        if (isChosen) trackDiv.classList.add('pb-chosen');
        grid.appendChild(trackDiv);
    });

    body.appendChild(grid);

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
        lastFavorites = [];
        lastSavedPlaylists = [];
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
        startPlaylistBuilder();
    } else {
        startPlaylistBuilder();
    }
}

// ===== 플로팅 플리 빌더 위젯 =====

const fpb = {
    tracks: [],   // { track_key, title, artist, cover_image_url }
    open: false,
};

// fpb가 열려 있을 때 새로 추가된 카드 하트도 자동으로 + 버튼으로 교체
(function _fpbObserver() {
    const observer = new MutationObserver(mutations => {
        if (!fpb.open) return;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                // 새로 추가된 노드 안의 search-grid-card 하트 버튼들 교체
                const btns = node.querySelectorAll ? node.querySelectorAll('.search-grid-card .search-grid-heart') : [];
                btns.forEach(btn => _fpbConvertBtn(btn));
                // 노드 자체가 search-grid-card인 경우
                if (node.classList?.contains('search-grid-card')) {
                    const btn = node.querySelector('.search-grid-heart');
                    if (btn) _fpbConvertBtn(btn);
                }
            }
        }
    });
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();

function fpbOpen() {
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }
    fpb.open = true;
    fpbRender();
    document.getElementById('fpbToggleBtn')?.classList.add('active');
    _fpbToggleCardHearts(true);
}

function fpbClose() {
    fpb.open = false;
    fpb.tracks = [];
    const el = document.getElementById('fpbWidget');
    if (el) el.remove();
    document.getElementById('fpbToggleBtn')?.classList.remove('active');
    _fpbToggleCardHearts(false);
}

function _fpbConvertBtn(btn) {
    if (btn.dataset.fpbConverted) return; // 이미 변환됨
    // 카드 dataset.trackJson 우선, 없으면 onclick에서 track_key만 추출
    const card = btn.closest('[data-track-json]');
    let track = null;
    if (card?.dataset.trackJson) {
        try { track = JSON.parse(card.dataset.trackJson); } catch (_) {}
    }
    if (!track) {
        const onclick = btn.getAttribute('onclick') || '';
        const match = onclick.match(/'([^']+)'\)/);
        const trackKey = match ? match[1] : null;
        track = (window.searchResultsData || []).find(t => t.track_key === trackKey)
            || (window.lastMapData?.tracks || []).find(t => t.track_key === trackKey)
            || (trackKey ? { track_key: trackKey } : null);
    }
    if (!track) return;

    btn.dataset.origOnclick = btn.getAttribute('onclick') || '';
    btn.dataset.origHtml = btn.innerHTML;
    btn.dataset.fpbConverted = '1';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    btn.removeAttribute('onclick');
    btn.onclick = e => { e.stopPropagation(); fpbAddTrack(track); };
}

function _fpbRestoreBtn(btn) {
    if (!btn.dataset.fpbConverted) return;
    if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
    if (btn.dataset.origOnclick) btn.setAttribute('onclick', btn.dataset.origOnclick);
    btn.onclick = null;
    delete btn.dataset.origHtml;
    delete btn.dataset.origOnclick;
    delete btn.dataset.fpbConverted;
}

function _fpbToggleCardHearts(builderOpen) {
    document.querySelectorAll('.search-grid-card .search-grid-heart').forEach(btn => {
        if (builderOpen) _fpbConvertBtn(btn);
        else _fpbRestoreBtn(btn);
    });
}

function fpbAddTrack(track) {
    if (fpb.tracks.find(t => t.track_key === track.track_key)) return;
    fpb.tracks.push(track);
    fpbRender();
}

function fpbRemoveTrack(track_key) {
    fpb.tracks = fpb.tracks.filter(t => t.track_key !== track_key);
    fpbRender();
}

function fpbRender() {
    let widget = document.getElementById('fpbWidget');
    const wasPositioned = widget && widget.style.transform === 'none';
    const savedLeft = wasPositioned ? widget.style.left : null;
    const savedTop  = wasPositioned ? widget.style.top  : null;

    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'fpbWidget';
        widget.className = 'fpb-widget';
        document.body.appendChild(widget);
    }

    const titleVal = widget.querySelector('.fpb-title-input')?.value || '';

    widget.innerHTML = `
        <div class="fpb-drag-bar" id="fpbDragBar"><div class="fpb-drag-handle"></div></div>
        <div class="fpb-header">
            <button class="fpb-close-btn" onclick="fpbClose()">✕</button>
        </div>
        <input class="fpb-title-input" placeholder="플레이리스트 제목" value="${titleVal.replace(/"/g, '&quot;')}">
        <div class="fpb-tracks">
            ${fpb.tracks.length === 0
                ? `<div class="fpb-empty">카드의 + 버튼으로 추가하세요</div>`
                : `<div class="fpb-cover-grid">${fpb.tracks.map(t => `
                    <div class="fpb-cover-item">
                        ${t.cover_image_url ? `<img src="${t.cover_image_url}" alt="">` : '<div class="fpb-cover-placeholder"></div>'}
                        <div class="fpb-cover-gradient"></div>
                        <div class="fpb-cover-info">
                            <div class="fpb-cover-title">${(t.title || t.track || '').replace(/</g,'&lt;')}</div>
                            <div class="fpb-cover-artist">${(t.artist || '').replace(/</g,'&lt;')}</div>
                        </div>
                        <button class="fpb-cover-remove" onclick="fpbRemoveTrack('${t.track_key}')">✕</button>
                    </div>`).join('')}
                </div>`
            }
        </div>
        <button class="fpb-save-btn" onclick="fpbSave(this)" ${fpb.tracks.length === 0 ? 'disabled' : ''}>저장</button>
    `;

    // 드래그 후 위치 복원
    if (savedLeft && savedTop) {
        widget.style.left = savedLeft;
        widget.style.top = savedTop;
        widget.style.bottom = 'auto';
        widget.style.transform = 'none';
    }

    // 드래그 이동
    _fpbInitDrag(widget);
}

function _fpbInitDrag(widget) {
    const bar = widget.querySelector('#fpbDragBar');
    if (!bar) return;

    let startX, startY, origLeft, origTop;

    bar.addEventListener('mousedown', onDown);
    bar.addEventListener('touchstart', onDown, { passive: true });

    function onDown(e) {
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;

        const rect = widget.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;

        // 절대 위치로 전환 (transform 제거)
        widget.style.left = origLeft + 'px';
        widget.style.top = origTop + 'px';
        widget.style.bottom = 'auto';
        widget.style.transform = 'none';
        widget.classList.add('dragging');

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
        if (e.cancelable) e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        widget.style.left = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, origLeft + dx)) + 'px';
        widget.style.top = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, origTop + dy)) + 'px';
    }

    function onUp() {
        widget.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
    }
}

async function fpbSave(btn) {
    const titleInput = document.querySelector('#fpbWidget .fpb-title-input');
    const name = titleInput?.value.trim() || '내 플레이리스트';
    if (fpb.tracks.length === 0) return;

    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
        const res = await fetch(`${API_BASE_URL}/playlist-builder/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ name, track_keys: fpb.tracks.map(t => t.track_key) }),
        });
        if (!res.ok) throw new Error('save failed');
        btn.textContent = '저장됨 ♥';
        btn.style.background = 'rgba(29,185,84,0.3)';
        setTimeout(() => fpbClose(), 1200);
        lastSavedPlaylists = [];
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '저장 실패. 다시 시도';
    }
}

// trackDetailPanel의 + 버튼 갱신 (빌더 열림/닫힘 시)
function _fpbRefreshDetailBtn() {
    const container = document.getElementById('fpbDetailBtnSlot');
    if (!container) return;
    container.innerHTML = '';
    if (!fpb.open) return;
    const btn = _fpbMakeAddBtn(container._track);
    container.appendChild(btn);
}

function _fpbMakeAddBtn(track) {
    const btn = document.createElement('button');
    const already = fpb.tracks.find(t => t.track_key === track.track_key);
    btn.className = `search-grid-heart${already ? ' favorited' : ''}`;
    btn.style.cssText = 'position:static!important;top:auto!important;right:auto!important;';
    btn.title = already ? '빌더에서 제거' : '플리 빌더에 추가';
    btn.innerHTML = already
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (fpb.tracks.find(t => t.track_key === track.track_key)) {
            fpbRemoveTrack(track.track_key);
        } else {
            fpbAddTrack(track);
        }
        _fpbRefreshDetailBtn();
    });
    return btn;
}

function playPlaylist(tracks) {
    if (!tracks || tracks.length === 0) return;
    currentPlaylistQueue = tracks;
    currentPlaylistIndex = 0;
    const nextBtn = document.getElementById('playerNext');
    if (nextBtn) nextBtn.disabled = false;
    openTrackOnYouTube(tracks[0], tracks.map(t => t.track_key), true);
}
