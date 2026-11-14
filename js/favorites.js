// ===== Favorites =====

async function loadFavorites() {
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
        logAction('favorite', { selected_track_key: track.track_key, candidate_track_keys: currentCandidateKeys, extra: isFavorited ? 'remove' : 'add' });
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
        item.appendChild(img); item.appendChild(name);
        grid.appendChild(item);
    });
    section.appendChild(grid);
    return section;
}

function _makeFavPagedSection(title, tracks, onClickTrack) {
    const PAGE_SIZE = 20;
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

    const totalPages = Math.ceil(tracks.length / PAGE_SIZE);
    const gridWrap = document.createElement('div');
    section.appendChild(gridWrap);

    const pagination = document.createElement('div');
    pagination.className = 'fav-pagination';
    section.appendChild(pagination);

    function renderPage(page) {
        const start = page * PAGE_SIZE;
        const pageTracks = tracks.slice(start, start + PAGE_SIZE);

        gridWrap.innerHTML = '';
        const scroll = document.createElement('div');
        scroll.className = 'fav-hscroll-recent';
        pageTracks.forEach(t => {
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
            item.appendChild(img); item.appendChild(name); item.appendChild(artist);
            scroll.appendChild(item);
        });
        gridWrap.appendChild(scroll);

        pagination.innerHTML = '';
        if (totalPages <= 1) return;
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `fav-page-btn${i === page ? ' active' : ''}`;
            btn.textContent = i + 1;
            btn.onclick = () => renderPage(i);
            pagination.appendChild(btn);
        }
    }

    renderPage(0);
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
    header.textContent = '플레이리스트';
    section.appendChild(header);

    if (!savedPlaylists || savedPlaylists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-section-empty';
        empty.textContent = '없습니다';
        section.appendChild(empty);
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

        const row = document.createElement('div');
        row.style.cssText = 'position:relative;width:100%;max-width:900px;height:72px;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.08);margin-bottom:8px;';

        const deleteBtn = document.createElement('div');
        deleteBtn.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:80px;background:#e53935;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:600;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s;';
        deleteBtn.textContent = '삭제';
        deleteBtn.onclick = async () => {
            try {
                await fetch(`${API_BASE_URL}/playlist-builder/playlist/${pl.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                row.remove();
                lastSavedPlaylists = lastSavedPlaylists.filter(p => p.id !== pl.id);
            } catch(e) { console.error('플리 삭제 실패', e); }
        };

        const card = document.createElement('div');
        card.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;gap:14px;padding:0 16px;background:rgba(255,255,255,.06);border-radius:12px;cursor:pointer;transition:transform .25s ease;box-sizing:border-box;';

        const stackWrap = document.createElement('div');
        stackWrap.style.cssText = 'position:relative;height:48px;flex-shrink:0;';
        const previewTracks = (pl.tracks || []).slice(0, 4);
        const total = previewTracks.length;
        previewTracks.forEach((t, i) => {
            const img = document.createElement('img');
            img.src = t.cover_image_url || '';
            img.style.cssText = `position:absolute;left:${i * 18}px;width:44px;height:44px;border-radius:6px;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,.5);z-index:${total - i};`;
            img.onerror = () => { img.style.background = '#1a1a24'; img.src = ''; };
            stackWrap.appendChild(img);
        });
        stackWrap.style.width = `${44 + (total - 1) * 18}px`;

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:14px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameEl.textContent = pl.name;
        const countEl = document.createElement('div');
        countEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,.45);margin-top:2px;';
        countEl.textContent = `${(pl.tracks || []).length}곡`;
        info.appendChild(nameEl);
        info.appendChild(countEl);

        card.appendChild(stackWrap);
        card.appendChild(info);
        row.appendChild(deleteBtn);
        row.appendChild(card);

        let startX = 0, moved = false, opened = false;
        const showDelete = (show) => { deleteBtn.style.opacity = show ? '1' : '0'; deleteBtn.style.pointerEvents = show ? 'auto' : 'none'; };
        const swipeStart = (x) => { startX = x; moved = false; };
        const swipeMove = (x) => {
            const dx = startX - x;
            if (Math.abs(dx) > 5) moved = true;
            const val = Math.max(0, Math.min(80, (opened ? 80 : 0) + dx));
            card.style.transition = 'none';
            card.style.transform = `translateX(-${val}px)`;
            if (val > 0) showDelete(true);
        };
        const swipeEnd = (x) => {
            const dx = startX - x;
            card.style.transition = 'transform .25s ease';
            if (!opened && dx > 40) { card.style.transform = 'translateX(-80px)'; opened = true; showDelete(true); }
            else if (opened && dx < -20) { card.style.transform = 'translateX(0)'; opened = false; showDelete(false); }
            else { card.style.transform = opened ? 'translateX(-80px)' : 'translateX(0)'; showDelete(opened); }
            if (!moved) {
                if (opened) { card.style.transform = 'translateX(0)'; opened = false; showDelete(false); }
                else { playPlaylist(plTracks); }
            }
        };
        card.addEventListener('mousedown', e => swipeStart(e.clientX));
        window.addEventListener('mousemove', e => { if (startX) swipeMove(e.clientX); });
        window.addEventListener('mouseup', e => { if (startX) { swipeEnd(e.clientX); startX = 0; } });
        card.addEventListener('touchstart', e => swipeStart(e.touches[0].clientX), { passive: true });
        card.addEventListener('touchmove', e => swipeMove(e.touches[0].clientX), { passive: true });
        card.addEventListener('touchend', e => swipeEnd(e.changedTouches[0].clientX));

        section.appendChild(row);
    });

    return section;
}

function renderFavorites(favorites, savedPlaylists = [], recentTracks = []) {
    const container = document.getElementById('favoritesView');
    container.querySelectorAll('.fav-section, .fav-playlists-section, .fav-songs-card').forEach(el => el.remove());

    const onClickTrack = (t) => {
        const track = { track_key: t.track_key, track: t.title || t.track_name, title: t.title || t.track_name, artist: t.artist, cover_image_url: t.cover_image_url, apple_music_id: t.apple_music_id };
        openTrackOnYouTube(track);
    };

    container.appendChild(_makeRecentSection('최근 재생', recentTracks.slice(0, 10), onClickTrack));
    container.appendChild(_makeFavPagedSection('저장된 곡', favorites.map(f => ({ ...f, title: f.title || f.track_name })), onClickTrack));
    container.appendChild(_makePlSection(savedPlaylists));
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
