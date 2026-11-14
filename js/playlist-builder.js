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

function playPlaylist(tracks) {
    if (!tracks || tracks.length === 0) return;
    currentPlaylistQueue = tracks;
    currentPlaylistIndex = 0;
    const nextBtn = document.getElementById('playerNext');
    if (nextBtn) nextBtn.disabled = false;
    openTrackOnYouTube(tracks[0], tracks.map(t => t.track_key), true);
}
