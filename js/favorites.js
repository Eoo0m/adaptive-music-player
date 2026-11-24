// ===== Favorites =====

async function loadFavorites() {
    _favClusterData = null; // 찜 목록 새로 로드 시 클러스터 캐시 초기화
    const profileCard = document.getElementById('favProfileCard');

    if (currentUser) {
        document.getElementById('favProfileImg').src = currentUser.profile_image_url || '';
        document.getElementById('favProfileName').textContent = currentUser.display_name || currentUser.email || '';
        profileCard.classList.remove('hidden');
    } else {
        profileCard.classList.add('hidden');
    }

    try {
        const requests = [
            fetch(`${API_BASE_URL}/recent-plays`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE_URL}/playlist-builder/my-playlists`, { headers: getAuthHeaders() }),
        ];
        if (authToken) {
            requests.push(fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() }));
        }

        const [recentRes, plRes, favRes] = await Promise.all(requests);

        let recentTracks = [];
        if (recentRes.ok) {
            const d = await recentRes.json();
            recentTracks = d.tracks || [];
        }

        lastFavorites = [];
        if (favRes && favRes.ok) {
            const favData = await favRes.json();
            lastFavorites = favData.favorites || [];
        }

        lastSavedPlaylists = [];
        if (plRes.ok) {
            const plData = await plRes.json();
            lastSavedPlaylists = plData.playlists || [];
        }

        renderFavorites(lastFavorites, lastSavedPlaylists, recentTracks);
    } catch (e) {
        console.error('Load favorites error:', e);
    }
}

async function toggleFavorite(track, btn) {
    if (!authToken) {
        alert('로그인 후 이용할 수 있습니다.');
        return;
    }

    const isFavorited = btn
        ? btn.classList.contains('favorited')
        : !!(lastFavorites || []).find(f => f.track_key === track.track_key);

    const svgFilled = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    const svgEmpty  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

    if (isFavorited) {
        if (btn) { btn.classList.remove('favorited'); btn.innerHTML = svgEmpty; }
        lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
    } else {
        if (btn) {
            btn.classList.add('favorited');
            btn.innerHTML = svgFilled;
            btn.classList.remove('pop');
            void btn.offsetWidth;
            btn.classList.add('pop');
        }
        lastFavorites = [{
            track_key: track.track_key,
            title: track.track || track.title,
            artist: track.artist,
            album: track.album,
            cover_image_url: track.cover_image_url,
            playlist_count: track.playlist_count,
        }, ...lastFavorites];
    }

    try {
        let res;
        if (isFavorited) {
            res = await fetch(`${API_BASE_URL}/favorites/${track.track_key}`, { method: 'DELETE', headers: getAuthHeaders() });
        } else {
            res = await fetch(`${API_BASE_URL}/favorites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ track_key: track.track_key })
            });
        }
        if (!res.ok) throw new Error(await res.text());
        logAction(isFavorited ? 'favorite_remove' : 'favorite_add', { selected_track_key: track.track_key, candidate_track_keys: currentCandidateKeys });
    } catch (e) {
        // 롤백
        if (isFavorited) {
            if (btn) { btn.classList.add('favorited'); btn.innerHTML = svgFilled; }
            lastFavorites = [{ track_key: track.track_key, title: track.track || track.title, artist: track.artist, album: track.album, cover_image_url: track.cover_image_url, playlist_count: track.playlist_count }, ...lastFavorites];
        } else {
            if (btn) { btn.classList.remove('favorited'); btn.innerHTML = svgEmpty; }
            lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
        }
        console.error('Favorite toggle failed:', e);
    }
}

function toggleFavoriteFromHomeFeed(trackKey, btn) {
    const track = (_homeFeedCache?.tracks || []).find(t => t.track_key === trackKey);
    if (!track) return;
    const svg = btn.querySelector('svg');
    const isFav = btn.classList.contains('favorited');
    btn.classList.toggle('favorited');
    if (svg) svg.setAttribute('fill', isFav ? 'none' : 'currentColor');
    toggleFavorite(track, btn);
}

// ===== Favorites Render Helpers =====

function _makeHScrollSection(title, tracks, onClickTrack, rows = 1) {
    const section = document.createElement('div');
    section.className = 'fav-section';

    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.textContent = title;
    section.appendChild(header);

    if (!tracks || tracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        section.appendChild(empty);
        return section;
    }

    const scroll = document.createElement('div');
    scroll.className = `fav-hscroll${rows === 2 ? ' fav-hscroll-2row' : ''}`;

    tracks.forEach(t => {
        const item = document.createElement('div');
        item.className = 'fav-hscroll-item';
        item.onclick = () => onClickTrack(t);

        const img = document.createElement('img');
        img.src = t.cover_image_url || '';
        img.className = 'fav-hscroll-cover';
        img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };

        const name = document.createElement('div');
        name.className = 'fav-hscroll-title';
        name.textContent = t.title || t.track_name || t.track || '';

        const artist = document.createElement('div');
        artist.className = 'fav-hscroll-artist';
        artist.textContent = t.artist || '';

        item.appendChild(img);
        item.appendChild(name);
        item.appendChild(artist);
        scroll.appendChild(item);
    });

    section.appendChild(scroll);
    return section;
}

function _makeRecentSection(title, tracks, onClickTrack) {
    const section = document.createElement('div');
    section.className = 'fav-section';
    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.textContent = title;
    section.appendChild(header);
    if (!tracks || tracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        section.appendChild(empty);
        return section;
    }
    const grid = document.createElement('div');
    grid.className = 'fav-hscroll-recent';
    tracks.forEach(t => {
        const item = document.createElement('div');
        item.className = 'fav-hscroll-item';
        item.onclick = () => onClickTrack(t);
        const img = document.createElement('img');
        img.src = t.cover_image_url || '';
        img.className = 'fav-hscroll-cover';
        img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };
        const name = document.createElement('div');
        name.className = 'fav-hscroll-title';
        name.textContent = t.title || t.track_name || t.track || '';
        const artist = document.createElement('div');
        artist.className = 'fav-hscroll-artist';
        artist.textContent = t.artist || '';
        const dotsBtn = document.createElement('button');
        dotsBtn.className = 'fav-dots-btn';
        dotsBtn.innerHTML = '<span></span><span></span><span></span>';
        dotsBtn.onclick = (e) => { e.stopPropagation(); _openTrackMenu(e, t, dotsBtn, {}); };
        item.appendChild(img); item.appendChild(dotsBtn); item.appendChild(name); item.appendChild(artist);
        grid.appendChild(item);
    });
    section.appendChild(grid);
    return section;
}

let _favClusterMode = false;
let _favClusterData = null;

function _makeFavTrackItem(t, onClickTrack, extraMenuItems = []) {
    const item = document.createElement('div');
    item.className = 'fav-hscroll-item';
    item.onclick = () => onClickTrack(t);
    const img = document.createElement('img');
    img.src = t.cover_image_url || '';
    img.className = 'fav-hscroll-cover';
    img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };
    const name = document.createElement('div');
    name.className = 'fav-hscroll-title';
    name.textContent = t.title || t.track_name || t.track || '';
    const artist = document.createElement('div');
    artist.className = 'fav-hscroll-artist';
    artist.textContent = t.artist || '';
    const dotsBtn = document.createElement('button');
    dotsBtn.className = 'fav-dots-btn';
    dotsBtn.innerHTML = '<span></span><span></span><span></span>';
    dotsBtn.onclick = (e) => { e.stopPropagation(); _openTrackMenu(e, t, dotsBtn, { extraItems: extraMenuItems }); };
    item.appendChild(img); item.appendChild(dotsBtn); item.appendChild(name); item.appendChild(artist);
    return item;
}

function _makeFavPagedSection(title, tracks, onClickTrack) {
    const PAGE_SIZE = 9;
    const section = document.createElement('div');
    section.className = 'fav-section';

    // 헤더 + 클러스터 토글
    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    header.appendChild(titleEl);

    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'fav-cluster-toggle-wrap';
    toggleWrap.title = '취향별 그룹으로 보기';

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'fav-cluster-toggle-label';
    toggleLabel.textContent = '취향 그룹';

    const toggle = document.createElement('div');
    toggle.className = `fav-cluster-toggle${_favClusterMode ? ' active' : ''}`;
    toggle.innerHTML = '<div class="fav-cluster-toggle-knob"></div>';

    toggleWrap.appendChild(toggleLabel);
    toggleWrap.appendChild(toggle);
    header.appendChild(toggleWrap);
    section.appendChild(header);

    if (!tracks || tracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        section.appendChild(empty);
        return section;
    }

    const gridWrap = document.createElement('div');
    section.appendChild(gridWrap);
    const pagination = document.createElement('div');
    pagination.className = 'fav-pagination';
    section.appendChild(pagination);

    function renderNormal(page) {
        const totalPages = Math.ceil(tracks.length / PAGE_SIZE);
        const pageTracks = tracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        gridWrap.innerHTML = '';
        const scroll = document.createElement('div');
        scroll.className = 'fav-hscroll-recent';
        pageTracks.forEach(t => scroll.appendChild(_makeFavTrackItem(t, onClickTrack)));
        gridWrap.appendChild(scroll);
        pagination.innerHTML = '';
        if (totalPages <= 1) return;
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `fav-page-btn${i === page ? ' active' : ''}`;
            btn.textContent = i + 1;
            btn.onclick = () => renderNormal(i);
            pagination.appendChild(btn);
        }
    }

    function renderClusters(clusters, page) {
        gridWrap.innerHTML = '';
        pagination.innerHTML = '';
        const totalPages = clusters.length;
        const cluster = clusters[page];
        if (!cluster) return;

        const label = document.createElement('div');
        label.className = 'fav-cluster-label';
        label.textContent = `그룹 ${page + 1} · ${cluster.tracks.length}곡`;
        gridWrap.appendChild(label);

        const scroll = document.createElement('div');
        scroll.className = 'fav-hscroll-recent';
        cluster.tracks.forEach(t => scroll.appendChild(_makeFavTrackItem(t, onClickTrack)));
        gridWrap.appendChild(scroll);

        if (totalPages <= 1) return;
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `fav-page-btn${i === page ? ' active' : ''}`;
            btn.textContent = i + 1;
            btn.onclick = () => renderClusters(clusters, i);
            pagination.appendChild(btn);
        }
    }

    async function switchToCluster() {
        if (!_favClusterData) {
            gridWrap.innerHTML = '<div class="fav-section-empty">불러오는 중...</div>';
            pagination.innerHTML = '';
            try {
                const res = await fetch(`${API_BASE_URL}/favorites/clustered`, { headers: getAuthHeaders() });
                if (!res.ok) throw new Error();
                _favClusterData = (await res.json()).clusters || [];
            } catch {
                gridWrap.innerHTML = '<div class="fav-section-empty">클러스터 로드 실패</div>';
                return;
            }
        }
        renderClusters(_favClusterData, 0);
    }

    toggleWrap.onclick = () => {
        _favClusterMode = !_favClusterMode;
        toggle.classList.toggle('active', _favClusterMode);
        if (_favClusterMode) {
            switchToCluster();
        } else {
            renderNormal(0);
        }
    };

    if (_favClusterMode && _favClusterData) {
        renderClusters(_favClusterData, 0);
    } else {
        _favClusterMode = false;
        renderNormal(0);
    }

    return section;
}

function _makeFavListSection(title, tracks, onClickTrack) {
    const section = document.createElement('div');
    section.className = 'fav-section';

    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.textContent = title;
    section.appendChild(header);

    if (!tracks || tracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        section.appendChild(empty);
        return section;
    }

    const list = document.createElement('div');
    list.className = 'fav-list';

    tracks.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'fav-list-item';
        item.onclick = () => onClickTrack(t);

        const num = document.createElement('div');
        num.className = 'fav-list-num';
        num.textContent = i + 1;

        const cover = document.createElement('img');
        cover.src = t.cover_image_url || '';
        cover.className = 'fav-list-cover';
        cover.onerror = () => { cover.style.background = '#1a1a24'; cover.src = ''; };

        const info = document.createElement('div');
        info.className = 'fav-list-info';
        info.innerHTML = `<div class="fav-list-title">${t.title || t.track_name || ''}</div><div class="fav-list-artist">${t.artist || ''}</div>`;

        item.appendChild(num);
        item.appendChild(cover);
        item.appendChild(info);
        list.appendChild(item);
    });

    section.appendChild(list);
    return section;
}

function _makePlSection(savedPlaylists) {
    const section = document.createElement('div');
    section.className = 'fav-section';

    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '플레이리스트';
    header.appendChild(titleSpan);
    const createPlBtn = document.createElement('button');
    createPlBtn.className = 'pl-create-btn';
    createPlBtn.title = '새 플레이리스트 만들기';
    createPlBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    createPlBtn.onclick = () => openPlaylistBuilderPanel();
    header.appendChild(createPlBtn);
    section.appendChild(header);

    const listWrap = document.createElement('div');

    if (!savedPlaylists || savedPlaylists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        listWrap.appendChild(empty);
        section.appendChild(listWrap);
        return section;
    }

    savedPlaylists.forEach((pl) => {
        const plTracks = (pl.tracks || []).map(t => ({
            track_key: t.track_key,
            title: t.track_name || t.title,
            artist: t.artist,
            album: t.album,
            cover_image_url: t.cover_image_url,
            apple_music_id: t.apple_music_id,
        }));

        const PAGE_SIZE = 9;

        const row = document.createElement('div');
        row.style.cssText = 'width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.08);margin-bottom:10px;overflow:hidden;transition:border-color .25s;';

        // 헤더 카드
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px 14px 12px 16px;background:rgba(255,255,255,.06);box-sizing:border-box;';

        // 상단 행: 이름/곡수 + 버튼들
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;gap:0;';

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;cursor:pointer;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameEl.textContent = pl.name;
        const countEl = document.createElement('div');
        countEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,.45);margin-top:3px;';
        countEl.textContent = `${(pl.tracks || []).length}곡`;
        info.appendChild(nameEl);
        info.appendChild(countEl);

        // 커버 가로스크롤
        const coverScroll = document.createElement('div');
        coverScroll.style.cssText = 'display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;cursor:pointer;';
        coverScroll.style.setProperty('-ms-overflow-style', 'none');
        const styleTag = document.createElement('style');
        styleTag.textContent = '.pl-cover-scroll::-webkit-scrollbar{display:none}';
        document.head.appendChild(styleTag);
        coverScroll.className = 'pl-cover-scroll';
        (pl.tracks || []).forEach(t => {
            const img = document.createElement('img');
            img.src = t.cover_image_url || '';
            img.style.cssText = 'width:52px;height:52px;border-radius:7px;object-fit:cover;flex-shrink:0;';
            img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };
            coverScroll.appendChild(img);
        });

        // 더블클릭 → 제목 인라인 편집
        nameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.value = pl.name;
            input.style.cssText = 'font-size:15px;font-weight:600;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:2px 8px;width:100%;box-sizing:border-box;outline:none;';
            nameEl.replaceWith(input);
            input.focus();
            input.select();
            async function commitRename() {
                const newName = input.value.trim();
                if (newName && newName !== pl.name) {
                    try {
                        await fetch(`${API_BASE_URL}/playlist-builder/playlist/${pl.id}`, {
                            method: 'PATCH',
                            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName })
                        });
                        pl.name = newName;
                        const updated = lastSavedPlaylists.find(p => p.id === pl.id);
                        if (updated) updated.name = newName;
                    } catch(err) { console.error('플리 이름 변경 실패', err); }
                }
                nameEl.textContent = pl.name;
                input.replaceWith(nameEl);
            }
            input.addEventListener('blur', commitRename);
            input.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
                if (ke.key === 'Escape') { input.value = pl.name; input.blur(); }
            });
        });

        // 버튼 그룹: ▶ 재생 / × 삭제 / ∨ 확장
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';

        function _plBtn(svgStr, title) {
            const b = document.createElement('button');
            b.title = title;
            b.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.45);width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:color .15s,background .15s;';
            b.innerHTML = svgStr;
            b.addEventListener('mouseenter', () => { b.style.color='#fff'; b.style.background='rgba(255,255,255,.08)'; });
            b.addEventListener('mouseleave', () => { b.style.color='rgba(255,255,255,.45)'; b.style.background='none'; });
            return b;
        }

        const playBtn = _plBtn(`<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`, '재생');
        playBtn.onclick = (e) => { e.stopPropagation(); playPlaylist(plTracks); };

        const delBtn = _plBtn(`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`, '삭제');
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!confirm(`"${pl.name}" 플레이리스트를 삭제할까요?`)) return;
            try {
                await fetch(`${API_BASE_URL}/playlist-builder/playlist/${pl.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                row.remove();
                lastSavedPlaylists = lastSavedPlaylists.filter(p => p.id !== pl.id);
            } catch(e) { console.error('플리 삭제 실패', e); }
        };

        btnGroup.appendChild(playBtn);
        btnGroup.appendChild(delBtn);

        topRow.appendChild(info);
        topRow.appendChild(btnGroup);
        card.appendChild(topRow);
        if ((pl.tracks || []).length > 0) card.appendChild(coverScroll);

        // 확장 영역
        const expandWrap = document.createElement('div');
        expandWrap.style.cssText = 'max-height:0;overflow:hidden;transition:max-height .35s cubic-bezier(.4,0,.2,1);background:rgba(255,255,255,.03);';
        const innerPad = document.createElement('div');
        innerPad.style.cssText = 'padding:12px 14px 14px;';
        expandWrap.appendChild(innerPad);

        const gridWrap = document.createElement('div');
        innerPad.appendChild(gridWrap);
        const paginationEl = document.createElement('div');
        paginationEl.className = 'fav-pagination';
        innerPad.appendChild(paginationEl);

        let expanded = false;

        async function removeTrackFromPlaylist(trackKey) {
            const idx = plTracks.findIndex(t => (t.track_key || t.id) === trackKey);
            if (idx === -1) return;
            plTracks.splice(idx, 1);
            const updatedPlEntry = lastSavedPlaylists.find(p => p.id === pl.id);
            if (updatedPlEntry) updatedPlEntry.tracks = [...plTracks];
            countEl.textContent = `${plTracks.length}곡`;
            try {
                await fetch(`${API_BASE_URL}/playlist-builder/playlist/${pl.id}/remove-track`, {
                    method: 'POST',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_key: trackKey })
                });
            } catch(err) { console.error('트랙 제거 실패', err); }
            renderPage(0);
            requestAnimationFrame(() => { expandWrap.style.maxHeight = `${innerPad.scrollHeight + 40}px`; });
        }

        function renderPage(page) {
            const totalPages = Math.ceil(plTracks.length / PAGE_SIZE);
            const pageTracks = plTracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            gridWrap.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'fav-hscroll-recent';
            pageTracks.forEach(t => {
                const trackKey = t.track_key || t.id;
                const extra = [{ label: '플레이리스트에서 삭제', fn: () => removeTrackFromPlaylist(trackKey) }];
                grid.appendChild(_makeFavTrackItem(t, (track) => openTrackOnYouTube(track), extra));
            });
            // 마지막 페이지에만 + 아이템 추가
            if (page === totalPages - 1 || totalPages === 0) {
                const addItem = document.createElement('div');
                addItem.className = 'fav-hscroll-item';
                addItem.style.cursor = 'pointer';
                addItem.title = '곡 추가';
                addItem.onclick = (e) => { e.stopPropagation(); openPlaylistBuilderPanel(pl); };
                const addCover = document.createElement('div');
                addCover.style.cssText = 'width:100%;aspect-ratio:1;border-radius:8px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px;color:rgba(255,255,255,.5);transition:background .15s;';
                addCover.textContent = '+';
                addItem.addEventListener('mouseenter', () => { addCover.style.background = 'rgba(255,255,255,.18)'; addCover.style.color = '#fff'; });
                addItem.addEventListener('mouseleave', () => { addCover.style.background = 'rgba(255,255,255,.1)'; addCover.style.color = 'rgba(255,255,255,.5)'; });
                addItem.appendChild(addCover);
                grid.appendChild(addItem);
            }
            gridWrap.appendChild(grid);
            paginationEl.innerHTML = '';
            if (totalPages <= 1) return;
            for (let i = 0; i < totalPages; i++) {
                const btn = document.createElement('button');
                btn.className = `fav-page-btn${i === page ? ' active' : ''}`;
                btn.textContent = i + 1;
                btn.onclick = () => renderPage(i);
                paginationEl.appendChild(btn);
            }
        }

        function toggleExpand(e) {
            if (e) e.stopPropagation();
            expanded = !expanded;
            if (expanded) {
                renderPage(0);
                requestAnimationFrame(() => {
                    expandWrap.style.maxHeight = `${innerPad.scrollHeight + 40}px`;
                });
                row.style.borderColor = 'rgba(255,255,255,.18)';
            } else {
                expandWrap.style.maxHeight = '0';
                row.style.borderColor = 'rgba(255,255,255,.08)';
            }
        }

        info.onclick = toggleExpand;
        coverScroll.onclick = toggleExpand;

        row.appendChild(card);
        row.appendChild(expandWrap);

        listWrap.appendChild(row);
    });

    section.appendChild(listWrap);
    return section;
}

function _makeCommentsSection() {
    const section = document.createElement('div');
    section.className = 'fav-section';
    section.id = 'favCommentsSection';

    const header = document.createElement('div');
    header.className = 'fav-section-title';
    header.textContent = '내 코멘트';
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'fav-comments-list';
    list.innerHTML = '<div class="fav-section-empty">불러오는 중...</div>';
    section.appendChild(list);

    if (!authToken) {
        list.innerHTML = '<div class="fav-section-empty">로그인 후 이용할 수 있습니다.</div>';
        return section;
    }

    fetch(`${API_BASE_URL}/comments/my`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
            const comments = d.comments || [];
            list.innerHTML = '';
            if (!comments.length) {
                list.innerHTML = '<div class="fav-section-empty">남긴 코멘트가 없습니다.</div>';
                return;
            }
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'fav-comment-item';
                item.innerHTML = `
                    <img src="${c.cover_image_url || ''}" alt="" class="fav-comment-cover">
                    <div class="fav-comment-body">
                        <div class="fav-comment-track">${c.title} · ${c.artist}</div>
                        <div class="fav-comment-text">${c.text}</div>
                    </div>
                    <button class="fav-comment-delete" data-id="${c.id}" title="삭제">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                `;
                item.querySelector('.fav-comment-delete').onclick = async (e) => {
                    e.stopPropagation();
                    await fetch(`${API_BASE_URL}/comments/${c.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                    item.remove();
                };
                list.appendChild(item);
            });
        })
        .catch(() => { list.innerHTML = '<div class="fav-section-empty">불러오기 실패</div>'; });

    return section;
}

function renderFavorites(favorites, savedPlaylists = [], recentTracks = []) {
    const container = document.getElementById('favoritesView');
    container.querySelectorAll('.fav-section, .fav-playlists-section, .fav-songs-card').forEach(el => el.remove());

    const onClickTrack = (t) => {
        const track = { track_key: t.track_key, track: t.title || t.track_name, title: t.title || t.track_name, artist: t.artist, cover_image_url: t.cover_image_url, apple_music_id: t.apple_music_id };
        openTrackOnYouTube(track);
    };

    container.appendChild(_makeRecentSection('최근 재생', recentTracks.slice(0, 9), onClickTrack));
    container.appendChild(_makeFavPagedSection('저장된 곡', favorites.map(f => ({ ...f, title: f.title || f.track_name })), onClickTrack));
    container.appendChild(_makePlSection(savedPlaylists));
    container.appendChild(_makeCommentsSection());
}

// ===== 플레이리스트 빌드2 패널 (저장탭 + 버튼) =====
// pl: 기존 플리에 곡 추가 모드 (있으면 제목 고정 + add-track API)
function openPlaylistBuilderPanel(pl = null) {
    _closePanelOverlay();
    if (!authToken) { alert('로그인 후 이용할 수 있습니다.'); return; }

    const addMode = !!pl;  // 기존 플리에 추가 모드
    const existingKeys = new Set((pl && pl.tracks || []).map(t => t.track_key));

    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.id = 'playlistPickerOverlay';

    const panel = document.createElement('div');
    panel.className = 'panel-sheet panel-sheet--large';

    const header = document.createElement('div');
    header.className = 'panel-sheet-header';
    let titleInput = null;
    if (addMode) {
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'flex:1;font-size:16px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        titleEl.textContent = pl.name + '에 곡 추가';
        header.appendChild(titleEl);
    } else {
        titleInput = document.createElement('input');
        titleInput.className = 'pl-builder-title-input';
        titleInput.type = 'text';
        titleInput.placeholder = '플레이리스트 이름';
        header.appendChild(titleInput);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-sheet-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = _closePanelOverlay;
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 선택된 곡 박스
    const selectedBox = document.createElement('div');
    selectedBox.className = 'pl-builder-selected-box';
    const selectedLabel = document.createElement('div');
    selectedLabel.className = 'pl-builder-box-label';
    selectedLabel.textContent = '담은 곡';
    const selectedGrid = document.createElement('div');
    selectedGrid.className = 'pl-builder-selected-grid';
    selectedGrid.innerHTML = '<div class="pl-builder-empty">곡을 선택하세요</div>';
    selectedBox.appendChild(selectedLabel);
    selectedBox.appendChild(selectedGrid);
    panel.appendChild(selectedBox);

    // 저장된 곡 박스
    const favLabel = document.createElement('div');
    favLabel.className = 'pl-builder-box-label';
    favLabel.style.marginTop = '16px';
    favLabel.textContent = '저장된 곡';
    panel.appendChild(favLabel);

    const favGrid = document.createElement('div');
    favGrid.className = 'pl-builder-fav-grid';
    panel.appendChild(favGrid);

    const selectedKeys = new Set();

    function renderFavGrid() {
        favGrid.innerHTML = '';
        (lastFavorites || []).forEach(f => {
            const alreadyIn = existingKeys.has(f.track_key);
            const card = document.createElement('div');
            card.className = `pl-builder-fav-card${(selectedKeys.has(f.track_key) || alreadyIn) ? ' selected' : ''}`;
            if (alreadyIn) card.style.opacity = '0.4';
            card.innerHTML = `<img src="${f.cover_image_url || ''}" alt="">`;
            card.onclick = () => {
                if (alreadyIn) return;
                if (selectedKeys.has(f.track_key)) {
                    selectedKeys.delete(f.track_key);
                } else {
                    selectedKeys.add(f.track_key);
                }
                renderSelected();
                renderFavGrid();
            };
            favGrid.appendChild(card);
        });
    }

    function renderSelected() {
        selectedGrid.innerHTML = '';
        const sel = (lastFavorites || []).filter(f => selectedKeys.has(f.track_key));
        if (!sel.length) {
            selectedGrid.innerHTML = '<div class="pl-builder-empty">곡을 선택하세요</div>';
            return;
        }
        sel.forEach(f => {
            const card = document.createElement('div');
            card.className = 'pl-builder-selected-card';
            card.innerHTML = `<img src="${f.cover_image_url || ''}" alt=""><button class="pl-builder-remove-btn">×</button>`;
            card.querySelector('.pl-builder-remove-btn').onclick = (e) => {
                e.stopPropagation();
                selectedKeys.delete(f.track_key);
                renderSelected();
                renderFavGrid();
            };
            selectedGrid.appendChild(card);
        });
    }

    renderFavGrid();

    // 저장 버튼
    const saveBtn = document.createElement('button');
    saveBtn.className = 'pl-builder-save-btn';
    saveBtn.textContent = addMode ? '곡 추가' : '플레이리스트 저장';
    saveBtn.onclick = async () => {
        if (!selectedKeys.size) return;
        if (addMode) {
            try {
                for (const key of selectedKeys) {
                    await fetch(`${API_BASE_URL}/playlist-builder/playlist/${pl.id}/add-track`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({ track_key: key })
                    });
                    existingKeys.add(key);
                    const trackData = (lastFavorites || []).find(f => f.track_key === key);
                    if (trackData) pl.tracks.push(trackData);
                }
                _closePanelOverlay();
                loadFavorites();
            } catch(e) { console.error(e); }
        } else {
            const name = titleInput.value.trim();
            if (!name) { titleInput.focus(); return; }
            try {
                const res = await fetch(`${API_BASE_URL}/playlist-builder/save`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ name, track_keys: [...selectedKeys] })
                });
                const d = await res.json();
                if (d.success) {
                    lastSavedPlaylists = lastSavedPlaylists || [];
                    const newPl = { id: d.playlist_id, name, tracks: (lastFavorites || []).filter(f => selectedKeys.has(f.track_key)), created_at: d.created_at };
                    lastSavedPlaylists.unshift(newPl);
                    _closePanelOverlay();
                    loadFavorites();
                }
            } catch(e) { console.error(e); }
        }
    };
    panel.appendChild(saveBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) _closePanelOverlay(); };
    requestAnimationFrame(() => overlay.classList.add('visible'));
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
