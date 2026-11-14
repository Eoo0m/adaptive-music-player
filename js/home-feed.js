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

function makeScrollingRow(tracks, direction) {
    const ITEM_W = 260;
    const GAP = 12;
    const totalW = tracks.length * (ITEM_W + GAP);
    const duration = totalW / 55;

    const row = document.createElement('div');
    row.className = 'default-track-row';

    const track = document.createElement('div');
    track.className = `default-track-belt${direction === 'rtl' ? ' rtl' : ''}`;
    track.style.animationDuration = `${duration}s`;

    for (let copy = 0; copy < 2; copy++) {
        tracks.forEach(t => {
            const item = document.createElement('div');
            item.className = 'recommendation-item default-track-item';
            const img = document.createElement('img');
            img.className = 'rec-album-cover';
            img.src = t.cover_image_url || '';
            img.alt = '';
            const info = document.createElement('div');
            info.className = 'rec-info';
            info.innerHTML = `<div class="rec-title">${t.title || ''}</div><div class="rec-artist">${t.artist || ''}</div>`;
            item.appendChild(img);
            item.appendChild(info);
            item.onclick = () => selectTrack(t);
            track.appendChild(item);
        });
    }

    row.appendChild(track);
    return row;
}

async function loadDefaultTracks() {
    const container = document.getElementById('searchResults');
    if (!container || container.innerHTML.trim()) return;

    try {
        const [feedRes, topRes] = await Promise.all([
            _homeFeedCache
                ? Promise.resolve({ ok: true, _cached: true })
                : fetch(`${API_BASE_URL}/home-feed-v2`),
            fetch(`${API_BASE_URL}/top-tracks?limit=100`)
        ]);

        let feedData = _homeFeedCache;
        if (!feedData && feedRes.ok) {
            feedData = await feedRes.json();
            _homeFeedCache = feedData;
        }
        const feedTracks = (feedData?.tracks || []);

        let topTracks = [];
        if (topRes.ok) {
            const topData = await topRes.json();
            const all = topData.tracks || [];
            const feedKeys = new Set(feedTracks.map(t => t.track_key));
            const pool = all.filter(t => !feedKeys.has(t.track_key));
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            topTracks = pool.slice(0, 10);
        }

        if (container.innerHTML.trim()) return;
        if (currentTab !== 'search') return;

        const trackInfo = document.getElementById('trackInfo');
        if (trackInfo && !trackInfo.innerHTML.trim()) {
            const gridTracks = [...topTracks, ...feedTracks.slice(0, 24 - topTracks.length)];
            setCurrentCandidates(gridTracks);
            updateTrackDisplay(gridTracks, 0);
            trackInfo.classList.remove('hidden');
        }
    } catch (e) {
        // 실패 시 조용히 무시
    }
}

function renderHomeFeed(tracks, container) {
    container.innerHTML = '';
    const isFavMap = new Map((lastFavorites || []).map(f => [f.track_key, true]));

    tracks.forEach((r) => {
        const coverSrc = r.cover_image_url || '';
        const isFav = isFavMap.has(r.track_key);

        const row = document.createElement('div');
        row.className = 'search-result-row';
        row.innerHTML = `
            ${coverSrc
                ? `<img class="search-result-cover" src="${coverSrc}" alt="">`
                : `<div class="search-result-cover search-result-cover-placeholder"></div>`}
            <div class="search-result-info">
                <div class="search-result-title">${r.title || ''}</div>
                <div class="search-result-sub">${r.artist || ''}</div>
            </div>
            <button class="search-result-heart ${isFav ? 'favorited' : ''}" onclick="event.stopPropagation(); toggleFavoriteFromHomeFeed('${r.track_key}', this)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="search-result-play" onclick="event.stopPropagation(); openTrackOnYouTube(${JSON.stringify(r)})">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
        `;
        row.onclick = () => selectTrack(r);
        container.appendChild(row);
    });
}
