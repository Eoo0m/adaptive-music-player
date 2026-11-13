// ===== Search UI =====
function showSearchInterface() {
    document.getElementById('searchInput').focus();
}

function showLoadingIndicator(message) {}
function hideLoadingIndicator() {}

// ===== Search Home / Results Toggle =====
function _showSearchHome() {
    document.getElementById('searchHome').style.display = '';
    document.getElementById('searchResults').classList.add('hidden');
}

function _showSearchResults() {
    document.getElementById('searchHome').style.display = 'none';
    document.getElementById('searchResults').classList.remove('hidden');
}

// ===== Recent Searches =====
function _getRecentSearches() {
    try { return JSON.parse(localStorage.getItem('recent_searches') || '[]'); } catch { return []; }
}

function _saveRecentSearch(query) {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/recent-searches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query }),
    }).catch(() => {});
    // 로컬에도 저장
    const list = [query, ..._getRecentSearches().filter(q => q !== query)].slice(0, 10);
    localStorage.setItem('recent_searches', JSON.stringify(list));
    _renderRecentSearches();
}

function _deleteRecentSearch(query) {
    if (authToken) {
        const encoded = encodeURIComponent(query);
        fetch(`${API_BASE_URL}/recent-searches/${encoded}`, { method: 'DELETE', headers: getAuthHeaders() }).catch(() => {});
    }
    const list = _getRecentSearches().filter(q => q !== query);
    localStorage.setItem('recent_searches', JSON.stringify(list));
    _renderRecentSearches();
}

function _renderRecentSearches() {
    const container = document.getElementById('recentSearchesSection');
    if (!container) return;
    const searches = _getRecentSearches();
    if (searches.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = `<div class="recent-search-label">최근 검색</div>`;
    const row = document.createElement('div');
    row.className = 'recent-search-chips';
    searches.forEach(q => {
        const chip = document.createElement('div');
        chip.className = 'recent-search-chip';
        chip.innerHTML = `<span>${q}</span><button onclick="event.stopPropagation(); _deleteRecentSearch('${q.replace(/'/g, "\\'")}')">✕</button>`;
        chip.querySelector('span').onclick = () => {
            document.getElementById('searchInput').value = q;
            doSearch();
        };
        row.appendChild(chip);
    });
    container.appendChild(row);
}

function loadRecentSearchesFromServer() {
    if (!authToken) { _renderRecentSearches(); return; }
    fetch(`${API_BASE_URL}/recent-searches`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data?.queries) {
                localStorage.setItem('recent_searches', JSON.stringify(data.queries));
            }
            _renderRecentSearches();
        })
        .catch(() => _renderRecentSearches());
}

// 검색창 input 이벤트 연결 (DOMContentLoaded 후)
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', () => {
        if (!input.value.trim()) _showSearchHome();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch();
    });
    _showSearchHome();
    loadRecentSearchesFromServer();
});

// ===== Unified Search =====
let _currentSearchQuery = '';

async function doSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    _currentSearchQuery = query;
    _saveRecentSearch(query);
    _showSearchResults();
    logAction('search', { search_query: query, search_mode: 'smart' });

    window.searchResultsData = [];

    // 1. 엔티티 검색 즉시 (빠름)
    const entityPromise = fetch(`${API_BASE_URL}/search-songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }));

    // 2. 무드 검색 병렬 시작 (느림, 나중에 붙임)
    const moodPromise = fetch(`${API_BASE_URL}/smart-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, entity_limit: 0, mood_top_k: 24, mood_candidates: 100 }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 엔티티 먼저 표시
    const entityData = await entityPromise;
    if (_currentSearchQuery !== query) return; // 도중에 쿼리 바뀌었으면 취소
    const entityResults = (entityData.results || []).map(r => ({ ...r, track: r.track || r.track_name }));
    _renderEntityResults(entityResults, query);

    // 무드 완료되면 아래에 추가
    const moodData = await moodPromise;
    if (_currentSearchQuery !== query) return;
    if (moodData && moodData.mood_results && moodData.mood_results.length > 0) {
        _appendMoodResults(moodData.mood_results, query);
    }
}

function _makeTrackRow(r, index) {
    const trackName = r.track || r.track_name || 'Unknown';
    const artistName = r.artist || '';
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
    return row;
}

function _renderEntityResults(entityResults, query) {
    const div = document.getElementById('searchResults');
    div.innerHTML = '';
    window.searchResultsData = [];

    entityResults.forEach((r, i) => {
        window.searchResultsData[i] = r;
        div.appendChild(_makeTrackRow(r, i));
    });

    window.searchCandidateKeys = entityResults.map(r => r.track_key).filter(Boolean);
}

function _appendMoodResults(moodResults, query) {
    const div = document.getElementById('searchResults');
    const startIndex = window.searchResultsData.length;

    // 구분선
    const divider = document.createElement('div');
    divider.className = 'search-mood-divider';
    div.appendChild(divider);

    // 무드 그리드 버튼
    const moodBtn = document.createElement('div');
    moodBtn.className = 'search-result-row search-mood-grid-btn';
    moodBtn.innerHTML = `
        <div class="search-result-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="search-result-info">
            <div class="search-result-title">'${query}' 무드 결과 ${moodResults.length}곡</div>
            <div class="search-result-sub">클릭해서 추천 그리드로 보기</div>
        </div>
        <div class="search-result-arrow">›</div>
    `;
    moodBtn.onclick = () => {
        const tracks = moodResults.map(r => ({ ...r, track: r.track || r.track_name || '' }));
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchInput').value = '';
        _showSearchHome();
        updateTrackDisplay(tracks, 0);
        const si = document.getElementById('initialSongInput');
        if (si) { si.classList.add('mini'); si.classList.remove('hidden'); }
        const ti = document.getElementById('trackInfo');
        if (ti) ti.classList.remove('hidden');
    };
    div.appendChild(moodBtn);

    // 무드 개별 행 (상위 5개)
    moodResults.slice(0, 5).forEach((r, i) => {
        const idx = startIndex + i;
        window.searchResultsData[idx] = { ...r, track: r.track || r.track_name };
        div.appendChild(_makeTrackRow(window.searchResultsData[idx], idx));
    });

    window.searchCandidateKeys = [
        ...window.searchCandidateKeys,
        ...moodResults.map(r => r.track_key).filter(Boolean),
    ].slice(0, 20);
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

        const tracks = (data.results || []).map(r => ({
            ...r,
            track: r.track_name || r.track || 'Unknown'
        }));

        // 검색창 닫기
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchInput').value = '';
        _showSearchHome();

        // 추천 그리드에 표시
        updateTrackDisplay(tracks, 0);

        const searchInterface = document.getElementById('initialSongInput');
        if (searchInterface) {
            searchInterface.classList.add('mini');
            searchInterface.classList.remove('hidden');
        }
        const trackInfo = document.getElementById('trackInfo');
        if (trackInfo) trackInfo.classList.remove('hidden');

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

// ===== Display Search Results (legacy, 미사용) =====
function displaySearchResults(results, type) {
    // smartSearch로 대체됨 — 하위 호환용 stub
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
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 23)];
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

    const endIdx = Math.min(tracks.length, currentIndex + 24);
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
