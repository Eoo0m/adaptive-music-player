// ===== Search Interface =====
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

// ===== Initial Song Search =====
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
        console.log('🔍 First result cover_image_url:', d.results?.[0]?.cover_image_url);

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

    // Supabase 데이터로 바로 표시 (Spotify API 호출 없음)
    let html = '<div class="recommendation-list" style="max-height:200px;">';
    results.slice(0, 10).forEach((r, idx) => {
        // cover_image_url이 있으면 사용, 없으면 빈 문자열
        const coverImageSrc = r.cover_image_url || '';

        html += `
      <div class="recommendation-item" onclick="selectAndStartPlaylist({
          track_key: '${r.track_key}',
          track: '${(r.track || '').replace(/'/g, "\\'")}',
          artist: '${(r.artist || '').replace(/'/g, "\\'")}',
          album: '${(r.album || '').replace(/'/g, "\\'")}',
          cover_image_url: '${r.cover_image_url || ''}'
      })">
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

    // 재시도 중인 경우 버튼 텍스트 변경
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

        // 결과를 songs 테이블에서 조회하여 메타데이터 가져오기
        await displayKeywordSearchResults(data.results);

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Keyword search error:', e);

        // 재시도 로직 (최대 3번)
        if (retryCount < 3) {
            console.log(`⚠️ 검색 실패, ${retryCount + 1}번째 재시도 중...`);
            // 지수 백오프: 2초, 4초, 8초 대기
            const delayMs = Math.pow(2, retryCount) * 2000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return searchByKeyword(retryCount + 1);
        } else {
            // 3번 재시도 후에도 실패하면 에러 메시지 표시
            alert('키워드 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '검색';
    }
}

// 키워드 검색 결과 표시 (Supabase 데이터만 사용, Spotify API 호출 제거)
async function displayKeywordSearchResults(results) {
    const div = document.getElementById('keywordSearchResults');

    if (results.length === 0) {
        div.innerHTML = '<div class="error-message">검색 결과가 없습니다.</div>';
        return;
    }

    // Supabase 데이터로 바로 표시 (Spotify API 호출 없음)
    let html = '<div class="recommendation-list" style="max-height:200px;">';
    results.forEach((r, idx) => {
        // cover_image_url이 있으면 사용, 없으면 빈 문자열
        const coverImageSrc = r.cover_image_url || '';

        html += `
      <div class="recommendation-item" onclick="selectAndStartPlaylist({
          track_key: '${r.track_key}',
          track: '${(r.track_name || '').replace(/'/g, "\\'")}',
          artist: '${(r.artist || '').replace(/'/g, "\\'")}',
          album: '${(r.album || '').replace(/'/g, "\\'")}',
          cover_image_url: '${r.cover_image_url || ''}'
      })">
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

// ===== Playlist Start =====
async function selectAndStartPlaylist(trackData) {
    console.log('Selected track:', trackData);
    console.log('Track key being passed:', trackData.track_key);
    document.getElementById('initialSearchResults').innerHTML = '';
    document.getElementById('initialSongTitle').value = `${trackData.track} - ${trackData.artist}`;

    // Spotify 로그인 여부 확인
    if (access_token) {
        // 로그인 되어있으면 재생
        await startRecommendationPlaylist(trackData);
    } else {
        // 로그인 안되어있으면 재생 없이 추천만
        await showRecommendationsOnly(trackData);
    }

    // 검색창 숨기고 트랙 정보 보이기
    document.getElementById('initialSongInput').classList.add('hidden');
    const trackInfo = document.getElementById('trackInfo');
    if (trackInfo) trackInfo.classList.remove('hidden');
}

async function startRecommendationPlaylist(selectedTrack) {
    if (!selectedTrack || !selectedTrack.track_key) {
        alert('먼저 노래를 검색하고 선택해주세요.');
        return;
    }

    console.log('🎵 Starting playlist with track_key:', selectedTrack.track_key);

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
        }
        else if (d.recommendations?.length > 0) {
            await setupInitialPlaylist(d.recommendations, selectedTrack);
        }
        else {
            alert('추천곡을 찾을 수 없습니다. 다른 노래를 시도해보세요.');
        }
    } catch (e) {
        console.error('Initial recommendation error:', e);
        alert('추천 시스템에 연결할 수 없습니다.');
    }
}

async function setupInitialPlaylist(recommendations, originalSong) {
    try {
        console.log(`🎵 Setting up initial playlist with ${recommendations.length} recommendations`);

        // 기존 플레이리스트 완전히 초기화
        console.log('🔄 Clearing existing playlist...');
        playlist = [];
        currentTrackIndex = 0;
        current_track = null;

        // UI 초기화
        const playPauseIcon = document.getElementById('playPauseIcon');
        if (playPauseIcon) {
            playPauseIcon.textContent = '▶';
        }

        // 재생 중이면 완전히 중지
        if (player) {
            try {
                const state = await player.getCurrentState();
                if (state && !state.paused) {
                    console.log('⏸️ Stopping current playback...');
                    await player.pause();
                }
            } catch (e) {
                console.warn('Failed to pause player:', e);
            }
        }

        console.log('✅ Playlist cleared');

        // 먼저 선택한 원곡의 Spotify 정보 가져오기
        let originalSpotifyTrack = null;
        if (originalSong?.track && originalSong?.artist) {
            try {
                const query = `track:"${originalSong.track}" artist:"${originalSong.artist}"`;
                const origResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
                    headers: { 'Authorization': `Bearer ${access_token}` }
                });
                if (origResponse.ok) {
                    const data = await origResponse.json();
                    originalSpotifyTrack = data?.tracks?.items?.[0];
                }
            } catch (e) {
                console.warn('Failed to fetch original track:', e);
            }
        }

        const r = await fetch(`${API_BASE_URL}/find-spotify-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: recommendations, access_token })
        });
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        const d = await r.json();

        if (d.spotify_tracks?.length > 0) {
            // 원곡을 플레이리스트 맨 앞에 추가
            if (originalSpotifyTrack) {
                playlist.push({
                    track_key: originalSong.track_key,
                    track: originalSong.track,
                    artist: originalSong.artist,
                    spotify_track: originalSpotifyTrack,
                    uri: originalSpotifyTrack.uri,
                    preview_url: originalSpotifyTrack.preview_url
                });
            }

            // 추천곡들 추가 (원곡 제외하고 14개) + track_key 매핑
            console.log('📋 Adding recommended tracks to playlist:');
            d.spotify_tracks.slice(0, 14).forEach((spotifyTrack, idx) => {
                const recTrack = recommendations[idx];
                const trackName = spotifyTrack.spotify_track?.name || spotifyTrack.track;
                const artistName = spotifyTrack.spotify_track?.artists?.[0]?.name || spotifyTrack.artist;
                const similarity = recTrack?.similarity || spotifyTrack.similarity;

                console.log(`  ${idx + 2}. ${trackName} - ${artistName} (${similarity ? (similarity * 100).toFixed(1) + '% similar' : 'N/A'})`);

                playlist.push({
                    ...spotifyTrack,
                    track_key: recTrack?.track_key || spotifyTrack.track_key
                });
            });

            console.log(`✅ Playlist created: ${playlist.length} tracks (starting with selected track)`);
            document.getElementById('initialSongInput').classList.add('hidden');

            if (!player) initializeSpotifyPlayer();
            else playTrackAtIndex(0);
        } else {
            alert('Spotify에서 추천곡들을 찾을 수 없습니다. 다른 노래를 시도해보세요.');
        }
    } catch (e) {
        console.error('Error setting up playlist:', e);
        alert('플레이리스트 생성 중 오류: ' + e.message);
    }
}

// 재생 없이 추천만 보여주기
async function showRecommendationsOnly(selectedTrack) {
    if (!selectedTrack || !selectedTrack.track_key) {
        alert('먼저 노래를 검색하고 선택해주세요.');
        return;
    }

    console.log('🎵 Showing recommendations without playback for track_key:', selectedTrack.track_key);

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
        }
        else if (d.recommendations?.length > 0) {
            // 선택한 곡 + 추천 14곡
            const displayTracks = [selectedTrack, ...d.recommendations.slice(0, 14)];

            // 커버 이미지만 업데이트 (재생 없음)
            updateTrackDisplayOnly(displayTracks, 0);
        }
        else {
            alert('추천곡을 찾을 수 없습니다. 다른 노래를 시도해보세요.');
        }
    } catch (e) {
        console.error('Recommendation error:', e);
        alert('추천 시스템에 연결할 수 없습니다.');
    }
}
