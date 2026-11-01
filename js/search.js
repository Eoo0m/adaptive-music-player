// ===== Search UI =====
// 검색창은 항상 표시되므로 이 함수는 더 이상 필요하지 않음
function showSearchInterface() {
    // 검색창 포커스만 설정
    document.getElementById('searchInput').focus();
}

// ===== Loading Indicator =====
const GUIDE_TEXT_DEFAULT = '앨범 커버를 클릭해 추천을 받고, 더블클릭해 바로 재생해보세요.';

function showLoadingIndicator(message) {}
function hideLoadingIndicator() {}

// ===== Unified Search =====
async function doSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        logAction('search', { search_query: query, search_mode: searchMode });
    }
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
    }
}

// ===== Keyword Search =====
async function searchByKeyword(retryCount = 0) {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) {
        alert('키워드를 입력해주세요.');
        return;
    }

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
    }
}

// ===== Display Search Results =====
function displaySearchResults(results, type) {
    const div = document.getElementById('searchResults');

    const keyword = document.getElementById('searchInput').value.trim();
    div.innerHTML = '';

    // 키워드 검색 항목 — 항상 상단에 표시
    if (keyword) {
        const keywordRow = document.createElement('div');
        keywordRow.className = 'search-result-row search-keyword-row';
        keywordRow.innerHTML = `
            <div class="search-result-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="search-result-info">
                <div class="search-result-title">'${keyword}' 키워드 검색</div>
                <div class="search-result-sub">분위기/감성으로 찾기</div>
            </div>
            <div class="search-result-arrow">›</div>
        `;
        keywordRow.onclick = () => {
            searchByKeyword();
        };
        div.appendChild(keywordRow);
    }

    if (!results || !Array.isArray(results) || results.length === 0) return;

    if (typeof setGuideText === 'function') setGuideText('앨범 커버를 클릭해 추천을 받고, 더블클릭해 바로 재생해보세요');
    window.searchResultsData = [];
    window.searchCandidateKeys = results.slice(0, 20).map(r => r.track_key).filter(Boolean);

    // 트랙 결과 리스트
    results.slice(0, 10).forEach((r, index) => {
        window.searchResultsData[index] = r;
        const trackName = type === 'keyword' ? (r.track_name || r.track || 'Unknown') : (r.track || r.track_name || 'Unknown');
        const artistName = r.artist || 'Unknown';
        const coverSrc = r.cover_image_url || '';
        const isFav = (lastFavorites || []).some(f => f.track_key === r.track_key);

        const row = document.createElement('div');
        row.className = 'search-result-row';
        row.innerHTML = `
            <img class="search-result-cover" src="${coverSrc}" alt="" ${!coverSrc ? 'style="display:none"' : ''}>
            ${!coverSrc ? '<div class="search-result-cover search-result-cover-placeholder"></div>' : ''}
            <div class="search-result-info">
                <div class="search-result-title">${trackName}</div>
                <div class="search-result-sub">${artistName}</div>
            </div>
            <button class="search-result-heart ${isFav ? 'favorited' : ''}" data-idx="${index}" onclick="event.stopPropagation(); toggleFavoriteFromSearch(${index}, this)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="search-result-play" onclick="event.stopPropagation(); openTrackOnYouTube(window.searchResultsData[${index}])">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
        `;
        row.onclick = () => selectTrack(window.searchResultsData[index]);
        div.appendChild(row);
    });
}

function toggleFavoriteFromSearch(index, btn) {
    const track = window.searchResultsData[index];
    if (!track) return;
    const svg = btn.querySelector('svg');
    const isFav = btn.classList.contains('favorited');
    btn.classList.toggle('favorited');
    if (svg) svg.setAttribute('fill', isFav ? 'none' : 'currentColor');
    toggleFavorite(track, btn);
}

// ===== Track Selection =====
async function selectTrack(trackData) {
    console.log('Selected track:', trackData);

    logAction('select_from_search', {
        selected_track_key: trackData.track_key,
        candidate_track_keys: window.searchCandidateKeys || [trackData.track_key]
    });

    // 세션 히스토리 초기화 (새 검색 시작)
    clickedTracks = [];
    console.log('🔄 Session history cleared for new search');

    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
    if (typeof setGuideText === 'function') setGuideText('마음에 드는 곡을 저장하고, 취향지도를 만들어보세요');

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

    showLoadingIndicator('추천곡을 찾는 중입니다.');

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
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 19)];
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
    setCurrentCandidates(tracks);
    console.log('🎨 Updating track display, total tracks:', tracks.length);

    const trackInfoContainer = document.getElementById('trackInfo');
    trackInfoContainer.innerHTML = '';
    trackInfoContainer.style.pointerEvents = 'auto';

    appendRecommendationHeader(trackInfoContainer, tracks, currentIndex);

    const trackGrid = document.createElement('div');
    trackGrid.className = `track-grid ${recommendationViewMode === 'list' ? 'track-list' : ''}`;
    trackInfoContainer.appendChild(trackGrid);

    const endIdx = Math.min(tracks.length, currentIndex + 20);
    const tracksToDisplay = [];
    for (let i = currentIndex; i < endIdx; i++) {
        tracksToDisplay.push({ track: tracks[i], originalIndex: i });
    }

    tracksToDisplay.forEach(({ track, originalIndex }) => {
        const isCurrent = originalIndex === currentIndex;

        const singleAction = isCurrent
            ? () => showSearchInterface()
            : () => loadRecommendationsFromTrack(track, originalIndex);
        const trackDiv = createTrackCard(track, isCurrent, singleAction);

        trackGrid.appendChild(trackDiv);
    });

    console.log('✅ Track display updated');
}
