// ===== Search UI =====
function showSearchInterface() {
    const searchInterface = document.getElementById('initialSongInput');
    const trackInfo = document.getElementById('trackInfo');

    // 토글 방식: 이미 보이면 숨기고, 숨겨져 있으면 보이기
    if (searchInterface.classList.contains('hidden')) {
        searchInterface.classList.remove('hidden');
        if (trackInfo) trackInfo.classList.add('hidden');
        document.getElementById('searchInput').focus();
    } else {
        searchInterface.classList.add('hidden');
        if (trackInfo) trackInfo.classList.remove('hidden');
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchInput').value = '';
    }
}

// ===== Unified Search =====
async function doSearch() {
    if (searchMode === 'track') {
        await searchByTrack();
    } else {
        await searchByKeyword();
    }
}

// ===== Track Search =====
async function searchByTrack(retryCount = 0) {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        alert('검색어를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.textContent = retryCount > 0 ? `재시도 중... (${retryCount}/2)` : '검색 중...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const r = await fetch(`${API_BASE_URL}/search-songs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const d = await r.json();

        console.log('🔍 Search response:', d);

        if (d.error) {
            document.getElementById('searchResults').innerHTML = `<div class="error-message">${d.error}</div>`;
        } else if (d.results && Array.isArray(d.results)) {
            displaySearchResults(d.results, 'track');
        } else {
            document.getElementById('searchResults').innerHTML = '<div class="error-message">검색 결과 형식이 올바르지 않습니다.</div>';
        }
    } catch (e) {
        console.error('Search error:', e);
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return searchByTrack(retryCount + 1);
        } else {
            document.getElementById('searchResults').innerHTML = '<div class="error-message">검색 서비스에 연결할 수 없습니다.</div>';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '검색';
    }
}

// ===== Keyword Search =====
async function searchByKeyword(retryCount = 0) {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) {
        alert('키워드를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.textContent = retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '검색 중...';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(`${API_BASE_URL}/search-by-keyword`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, top_k: 200 }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        if (data.debug) {
            console.log('🔍 키워드 검색 결과:', keyword);
            console.log('📊 찾은 플레이리스트 수:', data.debug.playlists_found);
        }

        displaySearchResults(data.results, 'keyword');

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Keyword search error:', e);
        if (retryCount < 3) {
            const delayMs = Math.pow(2, retryCount) * 2000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return searchByKeyword(retryCount + 1);
        } else {
            alert('키워드 검색 중 오류가 발생했습니다.');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '검색';
    }
}

// ===== Display Search Results =====
function displaySearchResults(results, type) {
    const div = document.getElementById('searchResults');

    if (!results || !Array.isArray(results) || results.length === 0) {
        div.innerHTML = '<div class="error-message">검색 결과가 없습니다.</div>';
        return;
    }

    let html = '<div class="recommendation-list" style="max-height:200px;">';
    results.slice(0, 10).forEach((r) => {
        const coverImageSrc = r.cover_image_url || '';
        const trackName = type === 'keyword' ? (r.track_name || 'Unknown') : (r.track || 'Unknown');
        const artistName = r.artist || 'Unknown';
        const albumName = r.album || 'Unknown';

        html += `
      <div class="recommendation-item" onclick='selectTrack(${JSON.stringify(r).replace(/'/g, "\\'")})'>
        <img class="rec-album-cover" src="${coverImageSrc}" alt="" style="${!coverImageSrc ? 'display:none;' : ''}">
        <div class="rec-info">
          <div class="rec-title">${trackName}</div>
          <div class="rec-artist">${artistName} - ${albumName}</div>
        </div>
      </div>`;
    });
    html += '</div>';
    div.innerHTML = html;
}

// ===== Track Selection =====
async function selectTrack(trackData) {
    console.log('Selected track:', trackData);

    document.getElementById('searchResults').innerHTML = '';
    const trackName = trackData.track || trackData.track_name;
    document.getElementById('searchInput').value = `${trackName} - ${trackData.artist}`;

    await showRecommendations(trackData);

    document.getElementById('initialSongInput').classList.add('hidden');
    const trackInfo = document.getElementById('trackInfo');
    if (trackInfo) trackInfo.classList.remove('hidden');
}

// ===== Show Recommendations =====
async function showRecommendations(selectedTrack) {
    if (!selectedTrack || !selectedTrack.track_key) {
        alert('먼저 노래를 검색하고 선택해주세요.');
        return;
    }

    console.log('🎵 Showing recommendations for track_key:', selectedTrack.track_key);

    try {
        const r = await fetch(`${API_BASE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_key: selectedTrack.track_key,
                num_recommendations: 30
            })
        });
        const d = await r.json();

        if (d.error) {
            alert(d.error);
        } else if (d.recommendations?.length > 0) {
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 14)];
            updateTrackDisplay(displayTracks, 0);
        } else {
            alert('추천곡을 찾을 수 없습니다.');
        }
    } catch (e) {
        console.error('Recommendation error:', e);
        alert('추천 시스템에 연결할 수 없습니다.');
    }
}

// ===== Track Display =====
function updateTrackDisplay(tracks, currentIndex) {
    console.log('🎨 Updating track display, total tracks:', tracks.length);

    const trackInfoContainer = document.getElementById('trackInfo');
    trackInfoContainer.innerHTML = '';
    trackInfoContainer.style.pointerEvents = 'auto';

    const guideText = document.createElement('div');
    guideText.className = 'guide-text';
    guideText.textContent = '앨범 커버를 클릭해 추천을 받고, 더블클릭해 바로 재생해보세요.';
    trackInfoContainer.appendChild(guideText);

    const trackGrid = document.createElement('div');
    trackGrid.className = 'track-grid';
    trackInfoContainer.appendChild(trackGrid);

    const endIdx = Math.min(tracks.length, currentIndex + 15);
    const tracksToDisplay = [];
    for (let i = currentIndex; i < endIdx; i++) {
        tracksToDisplay.push({ track: tracks[i], originalIndex: i });
    }

    tracksToDisplay.forEach(({ track, originalIndex }) => {
        const isCurrent = originalIndex === currentIndex;

        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-item' + (isCurrent ? ' current' : '');
        trackDiv.style.cursor = 'pointer';

        const img = document.createElement('img');
        img.src = track.cover_image_url || '';
        img.alt = track.track || track.track_name || 'Unknown';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'track-item-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'track-item-title';
        titleDiv.textContent = track.track || track.track_name || 'Unknown';

        const artistDiv = document.createElement('div');
        artistDiv.className = 'track-item-artist';
        artistDiv.textContent = track.artist || 'Unknown Artist';

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(artistDiv);

        trackDiv.appendChild(img);
        trackDiv.appendChild(infoDiv);

        if (isCurrent) {
            trackDiv.onclick = showSearchInterface;
        } else {
            trackDiv.onclick = () => loadRecommendationsFromTrack(track, originalIndex);
        }

        trackDiv.ondblclick = (e) => {
            e.stopPropagation();
            const query = encodeURIComponent(`${track.track || track.track_name} ${track.artist}`);
            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
        };

        trackGrid.appendChild(trackDiv);
    });

    console.log('✅ Track display updated');
}
