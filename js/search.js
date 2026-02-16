// ===== Search UI =====
function showSearchInterface() {
    const searchInterface = document.getElementById('initialSongInput');
    const trackInfo = document.getElementById('trackInfo');

    // 토글 방식: 이미 보이면 숨기고, 숨겨져 있으면 보이기
    if (searchInterface.classList.contains('hidden')) {
        searchInterface.classList.remove('hidden');
        if (trackInfo) trackInfo.classList.add('hidden');
        document.getElementById('initialSongTitle').focus();
    } else {
        searchInterface.classList.add('hidden');
        if (trackInfo) trackInfo.classList.remove('hidden');
        document.getElementById('initialSearchResults').innerHTML = '';
        document.getElementById('initialSongTitle').value = '';
    }
}

// ===== Title Search =====
async function searchInitialSongs(retryCount = 0) {
    const query = document.getElementById('initialSongTitle').value.trim();
    if (!query) {
        alert('검색어를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('initialSearchBtn');
    btn.disabled = true;
    btn.textContent = retryCount > 0 ? `재시도 중... (${retryCount}/2)` : '검색 중...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

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
            document.getElementById('initialSearchResults').innerHTML = `<div class="error-message">${d.error}</div>`;
        } else if (d.results && Array.isArray(d.results)) {
            displayInitialSearchResults(d.results);
        } else {
            console.error('Invalid response format:', d);
            document.getElementById('initialSearchResults').innerHTML = '<div class="error-message">검색 결과 형식이 올바르지 않습니다.</div>';
        }
    } catch (e) {
        console.error('Initial search error:', e);

        // 타임아웃이나 네트워크 에러 시 재시도 (최대 2회)
        if (retryCount < 2) {
            console.log(`⚠️ 검색 실패, ${retryCount + 1}번째 재시도 중...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
            return searchInitialSongs(retryCount + 1);
        } else {
            document.getElementById('initialSearchResults').innerHTML = '<div class="error-message">검색 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.</div>';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '검색';
    }
}

async function displayInitialSearchResults(results) {
    const div = document.getElementById('initialSearchResults');
    if (!results || !Array.isArray(results) || results.length === 0) {
        div.innerHTML = '<div class="error-message">검색 결과가 없습니다.</div>';
        return;
    }

    let html = '<div class="recommendation-list" style="max-height:200px;">';
    results.slice(0, 10).forEach((r, idx) => {
        const coverImageSrc = r.cover_image_url || '';

        html += `
      <div class="recommendation-item" onclick='selectTrack(${JSON.stringify(r).replace(/'/g, "\\'")})'>
        <img class="rec-album-cover" src="${coverImageSrc}" alt="" style="${!coverImageSrc ? 'display:none;' : ''}">
        <div class="rec-info">
          <div class="rec-title">${r.track || 'Unknown'}</div>
          <div class="rec-artist">${r.artist || 'Unknown'} - ${r.album || 'Unknown'}</div>
        </div>
      </div>`;
    });
    html += '</div>';
    div.innerHTML = html;
}

// ===== Keyword Search =====
async function searchByKeyword(retryCount = 0) {
    const keyword = document.getElementById('keywordSearchInput').value.trim();
    if (!keyword) {
        alert('키워드를 입력해주세요.');
        return;
    }

    const btn = document.getElementById('keywordSearchBtn');
    btn.disabled = true;

    if (retryCount > 0) {
        btn.textContent = `재시도 중... (${retryCount}/3)`;
    } else {
        btn.textContent = '검색 중...';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

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

        // 디버그 정보 콘솔 출력
        if (data.debug) {
            console.log('🔍 키워드 검색 결과:', keyword);
            console.log('📊 찾은 플레이리스트 수:', data.debug.playlists_found);
            console.log('📋 상위 플레이리스트:');
            console.table(data.debug.top_playlists);
            console.log('🎵 추천된 트랙 수:', data.debug.tracks_recommended);
            console.log('✅ 반환된 트랙 수:', data.debug.tracks_returned);
        }

        await displayKeywordSearchResults(data.results);

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Keyword search error:', e);

        // 재시도 로직 (최대 3번)
        if (retryCount < 3) {
            console.log(`⚠️ 검색 실패, ${retryCount + 1}번째 재시도 중...`);
            const delayMs = Math.pow(2, retryCount) * 2000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return searchByKeyword(retryCount + 1);
        } else {
            alert('키워드 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '검색';
    }
}

async function displayKeywordSearchResults(results) {
    const div = document.getElementById('keywordSearchResults');

    if (results.length === 0) {
        div.innerHTML = '<div class="error-message">검색 결과가 없습니다.</div>';
        return;
    }

    let html = '<div class="recommendation-list" style="max-height:200px;">';
    results.forEach((r, idx) => {
        const coverImageSrc = r.cover_image_url || '';

        html += `
      <div class="recommendation-item" onclick='selectTrack(${JSON.stringify(r).replace(/'/g, "\\'")})'>
        <img class="rec-album-cover" src="${coverImageSrc}" alt="" style="${!coverImageSrc ? 'display:none;' : ''}">
        <div class="rec-info">
          <div class="rec-title">${r.track_name || 'Unknown'}</div>
          <div class="rec-artist">${r.artist || 'Unknown'} - ${r.album || 'Unknown'}</div>
        </div>
      </div>`;
    });
    html += '</div>';
    div.innerHTML = html;
}

// ===== Track Selection =====
async function selectTrack(trackData) {
    console.log('Selected track:', trackData);

    // 검색 결과 초기화
    document.getElementById('initialSearchResults').innerHTML = '';
    document.getElementById('keywordSearchResults').innerHTML = '';
    document.getElementById('initialSongTitle').value = `${trackData.track || trackData.track_name} - ${trackData.artist}`;

    // 추천 표시
    await showRecommendations(trackData);

    // 검색창 숨기고 트랙 정보 보이기
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
            // 선택한 곡 + 추천 14곡
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 14)];
            updateTrackDisplay(displayTracks, 0);
        } else {
            alert('추천곡을 찾을 수 없습니다. 다른 노래를 시도해보세요.');
        }
    } catch (e) {
        console.error('Recommendation error:', e);
        alert('추천 시스템에 연결할 수 없습니다.');
    }
}

// ===== Track Display =====
function updateTrackDisplay(tracks, currentIndex) {
    console.log('🎨 Updating track display, total tracks:', tracks.length, 'current index:', currentIndex);

    const trackInfoContainer = document.getElementById('trackInfo');
    trackInfoContainer.innerHTML = '';
    trackInfoContainer.style.pointerEvents = 'auto';

    // 안내 문구 추가
    const guideText = document.createElement('div');
    guideText.className = 'guide-text';
    guideText.textContent = '앨범 커버를 클릭해 추천을 받고, 더블클릭해 바로 재생해보세요.';
    trackInfoContainer.appendChild(guideText);

    // 트랙 그리드 컨테이너 생성
    const trackGrid = document.createElement('div');
    trackGrid.className = 'track-grid';
    trackInfoContainer.appendChild(trackGrid);

    // 5개씩 3줄 = 총 15개 트랙 표시
    const endIdx = Math.min(tracks.length, currentIndex + 15);

    const tracksToDisplay = [];
    for (let i = currentIndex; i < endIdx; i++) {
        tracksToDisplay.push({ track: tracks[i], originalIndex: i });
    }

    console.log('📋 Tracks to display:');
    tracksToDisplay.forEach(({ track }, i) => {
        console.log(`   ${i+1}. ${track.track || track.track_name} - ${track.artist}`);
    });

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

        // 클릭 이벤트 - 현재 트랙(초록색)은 검색창, 다른 트랙은 추천
        if (isCurrent) {
            trackDiv.onclick = showSearchInterface;
        } else {
            trackDiv.onclick = () => loadRecommendationsFromTrack(track, originalIndex);
        }

        // 더블 클릭 이벤트 - 유튜브 검색
        trackDiv.ondblclick = (e) => {
            e.stopPropagation();
            const query = encodeURIComponent(`${track.track || track.track_name} ${track.artist}`);
            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
        };

        trackGrid.appendChild(trackDiv);
    });

    console.log('✅ Track display updated');
}
