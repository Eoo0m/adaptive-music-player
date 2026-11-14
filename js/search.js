// ===== Search UI =====
function showSearchInterface() {
    document.getElementById('searchInput').focus();
}

function showLoadingIndicator(message) {}
function hideLoadingIndicator() {}

// ===== Search Home / Results Toggle =====
function _showSearchHome() {
    const body = document.getElementById('searchBody');
    if (body) body.classList.remove('hidden');
    document.getElementById('searchHome').style.display = '';
    document.getElementById('searchResults').classList.add('hidden');
}

function _showSearchResults() {
    const body = document.getElementById('searchBody');
    if (body) body.classList.remove('hidden');
    document.getElementById('searchHome').style.display = 'none';
    document.getElementById('searchResults').classList.remove('hidden');
}

// ===== Recent Searches =====
function _getRecentSearches() {
    try { return JSON.parse(localStorage.getItem('recent_searches') || '[]'); } catch { return []; }
}

function _saveRecentSearch(query) {
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

// ===== Autocomplete =====
let _autocompleteTimer = null;

function _showAutocomplete(suggestions) {
    const el = document.getElementById('searchAutocomplete');
    if (!el) return;
    if (!suggestions || suggestions.length === 0) { el.classList.add('hidden'); return; }
    el.innerHTML = '';
    suggestions.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'autocomplete-row';
        row.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>${s}</span>
            <svg class="autocomplete-fill" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 9 11 15 5"/><line x1="9" y1="11" x2="21" y2="11"/></svg>
        `;
        row.onclick = () => {
            document.getElementById('searchInput').value = s;
            _hideAutocomplete();
            _currentSearchQuery = s;
            doSearch();
        };
        row.querySelector('.autocomplete-fill').onclick = e => {
            e.stopPropagation();
            document.getElementById('searchInput').value = s;
            _triggerAutocomplete(s);
        };
        if (i > 0) {
            const div = document.createElement('div');
            div.className = 'autocomplete-divider';
            el.appendChild(div);
        }
        el.appendChild(row);
    });
    el.classList.remove('hidden');
}

function _hideAutocomplete() {
    const el = document.getElementById('searchAutocomplete');
    if (el) el.classList.add('hidden');
}

function _triggerAutocomplete(q) {
    clearTimeout(_autocompleteTimer);
    if (!q.trim()) { _hideAutocomplete(); return; }
    _autocompleteTimer = setTimeout(async () => {
        try {
            const encoded = encodeURIComponent(q);
            const res = await fetch(`${API_BASE_URL}/search-autocomplete?q=${encoded}`);
            if (!res.ok) return;
            const data = await res.json();
            // 현재 input 값이 아직 같을 때만 표시
            const current = document.getElementById('searchInput').value.trim();
            if (current === q && !_currentSearchQuery) _showAutocomplete(data.suggestions || []);
        } catch {}
    }, 250);
}

// ===== Input 버튼 헬퍼 =====
function _clearSearchInput() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClearBtn').classList.add('hidden');
    _currentSearchQuery = '';
    _hideAutocomplete();
    _showSearchHome();
}

function _cancelSearch() {
    _clearSearchInput();
    _currentSearchQuery = '';
    document.getElementById('searchCancelBtn').classList.add('hidden');
    document.getElementById('searchInput').blur();
}

// 검색창 input 이벤트 연결 (DOMContentLoaded 후)
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', () => {
        if (_currentSearchQuery) return; // 검색 완료 상태에선 무시
        const val = input.value.trim();
        document.getElementById('searchClearBtn').classList.toggle('hidden', !val);
        if (!val) {
            _hideAutocomplete();
            _showSearchHome();
        } else {
            _triggerAutocomplete(val);
        }
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(_autocompleteTimer); _hideAutocomplete(); doSearch(); }
        if (e.key === 'Escape') _cancelSearch();
    });

    input.addEventListener('focus', () => {
        document.getElementById('searchCancelBtn').classList.remove('hidden');
        // 검색결과 보는 중이면 자동완성 안 띄움
        if (!_currentSearchQuery) {
            const val = input.value.trim();
            if (val) _triggerAutocomplete(val);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            _hideAutocomplete();
            if (!_currentSearchQuery && !input.value.trim()) {
                document.getElementById('searchCancelBtn').classList.add('hidden');
            }
        }, 150);
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

    // 엔티티 먼저 표시 (있을 때만)
    const entityData = await entityPromise;
    if (_currentSearchQuery !== query) return;
    const entityResults = (entityData.results || []).map(r => ({ ...r, track: r.track || r.track_name }));
    if (entityResults.length > 0) {
        _renderEntityResults(entityResults, query);
    }

    // 무드 완료되면 추가 (엔티티 없으면 단독으로 표시)
    const moodData = await moodPromise;
    if (_currentSearchQuery !== query) return;
    if (moodData && moodData.mood_results && moodData.mood_results.length > 0) {
        if (entityResults.length === 0) {
            // 엔티티 없으면 무드 결과만 단독 표시
            const div = document.getElementById('searchResults');
            div.innerHTML = '';
            window.searchResultsData = [];
            const label = document.createElement('div');
            label.className = 'search-section-label';
            label.textContent = `'${query}' 키워드 검색 결과`;
            div.appendChild(label);
            const grid = document.createElement('div');
            grid.className = 'search-mood-grid';
            moodData.mood_results.forEach(r => {
                window.searchResultsData.push(r);
                grid.appendChild(_makeTrackCard(r));
            });
            div.appendChild(grid);
            window.searchCandidateKeys = moodData.mood_results.map(r => r.track_key).filter(Boolean);
        } else {
            _appendMoodResults(moodData.mood_results, query);
        }
    }
}

// ===== Track Grid Card =====
function _makeTrackCard(r) {
    const trackName = r.track || r.track_name || 'Unknown';
    const artistName = r.artist || '';
    const coverSrc = r.cover_image_url || '';
    const isFav = (lastFavorites || []).some(f => f.track_key === r.track_key);

    const card = document.createElement('div');
    card.className = 'search-grid-card';
    card.innerHTML = `
        <div class="search-grid-cover">
            ${coverSrc ? `<img src="${coverSrc}" alt="">` : '<div class="search-grid-cover-placeholder"></div>'}
            <div class="search-grid-gradient"></div>
            <div class="search-grid-info">
                <div class="search-grid-title">${trackName}</div>
                <div class="search-grid-artist">${artistName}</div>
            </div>
            <button class="search-grid-heart ${isFav ? 'favorited' : ''}" onclick="event.stopPropagation(); _toggleFavCard(this, '${r.track_key}')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
        </div>
    `;
    card.onclick = () => _openTrackDetail(r);
    return card;
}

function _toggleFavCard(btn, trackKey) {
    const isFav = btn.classList.contains('favorited');
    btn.classList.toggle('favorited');
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isFav ? 'none' : 'currentColor');
    const track = (window.searchResultsData || []).find(t => t.track_key === trackKey) || { track_key: trackKey };
    toggleFavorite(track, btn);
}

function _renderEntityResults(entityResults, query) {
    const div = document.getElementById('searchResults');
    div.innerHTML = '';
    window.searchResultsData = entityResults;

    if (entityResults.length === 0) return;

    const label = document.createElement('div');
    label.className = 'search-section-label';
    label.textContent = '검색 결과';
    div.appendChild(label);

    // 2행 가로 스크롤 그리드
    const grid = document.createElement('div');
    grid.className = 'search-entity-grid';
    entityResults.forEach(r => grid.appendChild(_makeTrackCard(r)));
    div.appendChild(grid);

    window.searchCandidateKeys = entityResults.map(r => r.track_key).filter(Boolean);
}

function _appendMoodResults(moodResults, query) {
    const div = document.getElementById('searchResults');

    const divider = document.createElement('div');
    divider.className = 'search-results-divider';
    div.appendChild(divider);

    const label = document.createElement('div');
    label.className = 'search-section-label';
    label.textContent = `'${query}' 키워드 검색 결과`;
    div.appendChild(label);

    // 3열 세로 그리드
    const grid = document.createElement('div');
    grid.className = 'search-mood-grid';
    moodResults.forEach(r => {
        window.searchResultsData.push(r);
        grid.appendChild(_makeTrackCard(r));
    });
    div.appendChild(grid);

    window.searchCandidateKeys = [
        ...(window.searchCandidateKeys || []),
        ...moodResults.map(r => r.track_key).filter(Boolean),
    ].slice(0, 30);
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

// ===== Track Detail Panel =====
async function _openTrackDetail(track) {
    const panel = document.getElementById('trackDetailPanel');
    if (!panel) return;

    const trackName = track.track || track.track_name || 'Unknown';
    const artistName = track.artist || '';
    const coverSrc = track.cover_image_url || '';
    const isFav = (lastFavorites || []).some(f => f.track_key === track.track_key);

    panel.innerHTML = '';

    // 뒤로가기 버튼
    const backBtn = document.createElement('button');
    backBtn.className = 'track-detail-back';
    backBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 뒤로`;
    backBtn.addEventListener('click', _closeTrackDetail);
    panel.appendChild(backBtn);

    // 선택된 트랙
    const selectedDiv = document.createElement('div');
    selectedDiv.className = 'track-detail-selected';
    const coverEl = coverSrc ? `<img class="track-detail-selected-cover" src="${coverSrc}" alt="">` : '<div class="track-detail-selected-cover"></div>';
    selectedDiv.innerHTML = `
        ${coverEl}
        <div class="track-detail-selected-info">
            <div class="track-detail-selected-title">${trackName}</div>
            <div class="track-detail-selected-artist">${artistName}</div>
        </div>
    `;
    const heartBtn = document.createElement('button');
    heartBtn.className = `search-grid-heart ${isFav ? 'favorited' : ''}`;
    heartBtn.style.cssText = 'position:static;margin-left:auto;';
    heartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    heartBtn.addEventListener('click', e => { e.stopPropagation(); _toggleFavCard(heartBtn, track.track_key); });
    selectedDiv.appendChild(heartBtn);
    panel.appendChild(selectedDiv);

    // 유사한 곡 레이블 + 그리드
    const label = document.createElement('div');
    label.className = 'track-detail-similar-label';
    label.textContent = '유사한 곡';
    panel.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'track-detail-similar-grid';
    grid.id = 'trackDetailSimilarGrid';
    grid.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:13px;">불러오는 중...</div>';
    panel.appendChild(grid);

    panel.classList.remove('hidden');

    logAction('select_from_search', {
        selected_track_key: track.track_key,
        candidate_track_keys: window.searchCandidateKeys || [track.track_key]
    });

    try {
        const r = await fetch(`${API_BASE_URL}/find-similar-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_key: track.track_key, num_recommendations: 24 })
        });
        const d = await r.json();
        const grid = document.getElementById('trackDetailSimilarGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (d.recommendations?.length > 0) {
            d.recommendations.forEach(rec => {
                const card = _makeTrackCard(rec);
                // 유사곡 카드 클릭은 다시 detail로 (스택 갱신)
                card.onclick = () => _openTrackDetail(rec);
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:13px;">유사한 곡이 없습니다.</div>';
        }
    } catch (e) {
        const grid = document.getElementById('trackDetailSimilarGrid');
        if (grid) grid.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:13px;">불러오기 실패</div>';
    }
}

function _closeTrackDetail() {
    const panel = document.getElementById('trackDetailPanel');
    if (panel) { panel.classList.add('hidden'); panel.innerHTML = ''; }
    _showSearchResults();
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
