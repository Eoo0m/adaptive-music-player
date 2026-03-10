// ===== Search UI =====
// 검색창은 항상 표시되므로 이 함수는 더 이상 필요하지 않음
function showSearchInterface() {
    // 검색창 포커스만 설정
    document.getElementById('searchInput').focus();
}

// ===== Loading Indicator =====
function showLoadingIndicator(message) {
    let indicator = document.getElementById('loadingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loadingIndicator';
        indicator.className = 'loading-indicator';
        document.querySelector('.search-section').appendChild(indicator);
    }
    indicator.textContent = message;
    indicator.style.display = 'block';
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
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

    const searchInput = document.getElementById('searchInput');
    searchInput.disabled = true;
    showLoadingIndicator('검색중...');

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

        // 500 에러 시 재시도
        if (!r.ok) {
            console.warn(`Search failed with status ${r.status}, retrying...`);
            if (retryCount < 3) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return searchByTrack(retryCount + 1);
            } else {
                document.getElementById('searchResults').innerHTML = '<div class="error-message">서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</div>';
                return;
            }
        }

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
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return searchByTrack(retryCount + 1);
        } else {
            document.getElementById('searchResults').innerHTML = '<div class="error-message">검색 서비스에 연결할 수 없습니다.</div>';
        }
    } finally {
        searchInput.disabled = false;
        hideLoadingIndicator();
    }
}

// ===== Keyword Search =====
async function searchByKeyword(retryCount = 0) {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) {
        alert('키워드를 입력해주세요.');
        return;
    }

    const searchInput = document.getElementById('searchInput');
    searchInput.disabled = true;
    showLoadingIndicator('검색중...');

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

        // 500 에러 시 재시도
        if (!response.ok) {
            console.warn(`Keyword search failed with status ${response.status}, retrying...`);
            if (retryCount < 3) {
                const delayMs = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return searchByKeyword(retryCount + 1);
            } else {
                alert('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
                return;
            }
        }

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
            const delayMs = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return searchByKeyword(retryCount + 1);
        } else {
            alert('키워드 검색 중 오류가 발생했습니다.');
        }
    } finally {
        searchInput.disabled = false;
        hideLoadingIndicator();
    }
}

// ===== Display Search Results =====
function displaySearchResults(results, type) {
    const div = document.getElementById('searchResults');

    if (!results || !Array.isArray(results) || results.length === 0) {
        div.innerHTML = '<div class="error-message">검색 결과가 없습니다.</div>';
        return;
    }

    let html = '<div class="recommendation-list">';
    results.slice(0, 10).forEach((r, index) => {
        const coverImageSrc = r.cover_image_url || '';
        const trackName = type === 'keyword' ? (r.track_name || 'Unknown') : (r.track || 'Unknown');
        const artistName = r.artist || 'Unknown';
        const albumName = r.album || 'Unknown';

        // Store track data in a global array to avoid JSON escaping issues
        if (!window.searchResultsData) window.searchResultsData = [];
        window.searchResultsData[index] = r;

        html += `
      <div class="recommendation-item" onclick="selectTrack(window.searchResultsData[${index}])">
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

    // 세션 히스토리 초기화 (새 검색 시작)
    clickedTracks = [];
    console.log('🔄 Session history cleared for new search');

    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';

    await showRecommendations(trackData);

    // 검색 인터페이스를 미니 모드로 전환하고 오른쪽 상단에 표시
    const searchInterface = document.getElementById('initialSongInput');
    searchInterface.classList.add('mini');
    searchInterface.classList.remove('hidden');

    const trackInfo = document.getElementById('trackInfo');
    if (trackInfo) trackInfo.classList.remove('hidden');
}

// ===== Show Recommendations =====
async function showRecommendations(selectedTrack) {
    if (!selectedTrack || !selectedTrack.track_key) {
        alert('먼저 노래를 검색하고 선택해주세요.');
        return;
    }

    console.log('🎵 Showing similar tracks for track_key:', selectedTrack.track_key);

    // 세션에 첫 트랙 추가
    addClickedTrack(selectedTrack.track_key);

    showLoadingIndicator('추천곡을 찾는 중...');

    try {
        // 검색 결과 클릭 시 /find-similar-tracks 사용
        const r = await fetch(`${API_BASE_URL}/find-similar-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_key: selectedTrack.track_key,
                num_recommendations: 30
            })
        });
        const d = await r.json();

        hideLoadingIndicator();

        if (d.error) {
            alert(d.error);
        } else if (d.recommendations?.length > 0) {
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 14)];
            updateTrackDisplay(displayTracks, 0);
        } else {
            alert('추천곡을 찾을 수 없습니다.');
        }
    } catch (e) {
        hideLoadingIndicator();
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
            // 현재 트랙 클릭 시 YouTube 링크로 이동
            trackDiv.onclick = () => {
                const query = encodeURIComponent(`${track.track || track.track_name} ${track.artist}`);
                window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
            };
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
