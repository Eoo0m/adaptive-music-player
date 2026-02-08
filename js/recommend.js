// ===== Click History Management =====
function addClickedTrack(trackKey) {
    // 중복 제거
    if (!clickedTracks.includes(trackKey)) {
        clickedTracks.push(trackKey);

        // 최대 10개 유지 (FIFO)
        if (clickedTracks.length > 10) {
            clickedTracks.shift();
        }

        console.log(`📝 Added to click history: ${trackKey}`);
        console.log(`📊 Click history (${clickedTracks.length}/10):`, clickedTracks);
    }
}

// ===== Track-based Recommendations =====
async function loadRecommendationsFromTrack(track, trackIndex) {
    // track_key가 있는지 확인
    if (!track.track_key) {
        console.warn('⚠️ No track_key available for this track');
        alert('이 트랙은 추천 데이터베이스에 없습니다.');
        return;
    }

    console.log('🎵 Loading recommendations from track:', track.track_key);

    // 클릭한 트랙을 히스토리에 추가 (최대 5개 유지)
    addClickedTrack(track.track_key);

    // 앨범 커버 클릭 로그 전송 (트랙기반 유사 음악 로드시)
    const trackName = track.track || track.name || 'Unknown Track';
    const artistName = track.artist || (track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown Artist');
    const albumName = track.album || (track.album_name) || null;
    const spotifyUri = track.uri || null;
    const spotifyTrackId = spotifyUri ? spotifyUri.split(':').pop() : null;

    logListeningData({
        track_name: trackName,
        artist_name: artistName,
        album_name: albumName,
        spotify_uri: spotifyUri,
        spotify_track_id: spotifyTrackId
    }).catch(err => console.error('Failed to log album cover click:', err));

    try {
        // 추천 받기 (중복 제거를 고려해 더 많이 요청)
        const recResp = await fetch(`${API_BASE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_key: track.track_key,
                num_recommendations: 50  // 중복 제거 후에도 충분하도록 50개 요청
            })
        });

        if (!recResp.ok) throw new Error('Recommendation failed');

        const recData = await recResp.json();
        if (!recData.recommendations || recData.recommendations.length === 0) {
            throw new Error('No recommendations found');
        }

        console.log(`🎯 Main recommendations received: ${recData.recommendations.length} tracks`);
        console.log('📋 Main recommendations (first 10):', recData.recommendations.slice(0, 10).map(t => `${t.track} - ${t.artist}`));

        // 클릭 히스토리가 10개 이상이면 매번 평균 기반 추천 새로 가져오기
        if (clickedTracks.length >= 10) {
            await fetchAverageBasedRecommendations();
        } else {
            // 10개 미만이면 평균 기반 추천 초기화
            averageBasedTracks = [];
        }

        // 중복 제거 및 플레이리스트 구성
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 DEDUPLICATION DEBUG');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 먼저 평균 기반 추천에서 중복 제거된 곡들만 추출
        const seenIds = new Set();
        seenIds.add(track.track_key);  // 클릭한 트랙 먼저 추가

        // 메인 추천 track_key 모두 추가 (중복 체크용)
        recData.recommendations.forEach(t => {
            if (t.track_key) seenIds.add(t.track_key);
        });

        console.log('\n🎯 AVERAGE-BASED RECOMMENDATIONS (deduplication check):');
        console.log(`   Total received: ${averageBasedTracks.length} tracks`);

        // 평균 기반에서 중복 제거
        const uniqueAvgTracks = [];
        let avgDuplicates = 0;

        for (let i = 0; i < averageBasedTracks.length; i++) {
            const t = averageBasedTracks[i];
            const trackId = t.track_key;
            const trackName = t.track || 'Unknown';
            const artistName = t.artist || 'Unknown';

            if (trackId && !seenIds.has(trackId)) {
                uniqueAvgTracks.push(t);
                seenIds.add(trackId);
                console.log(`   ✅ [${uniqueAvgTracks.length}] ${trackName} - ${artistName}`);
            } else {
                avgDuplicates++;
                console.log(`   ❌ [DUP] ${trackName} - ${artistName} (already in main)`);
            }
        }

        console.log(`   ✅ Unique: ${uniqueAvgTracks.length} tracks`);
        console.log(`   ❌ Duplicates: ${avgDuplicates} tracks\n`);

        // 플레이리스트 구성 결정
        let displayTracks = [];

        if (uniqueAvgTracks.length >= 5) {
            // 평균 기반이 5곡 이상: 원곡(1) + 메인(9) + 평균(5) = 15곡
            console.log('📝 LAYOUT: Original(1) + Main(9) + Average(5) = 15 tracks');
            displayTracks = [
                track,
                ...recData.recommendations.slice(0, 9),
                ...uniqueAvgTracks.slice(0, 5)
            ];

            console.log('   Row 1 (5): Original + Main(4)');
            console.log('   Row 2 (5): Main(5)');
            console.log('   Row 3 (5): Average(5)');
        } else {
            // 평균 기반이 5곡 미만: 원곡(1) + 메인(14) = 15곡
            console.log('📝 LAYOUT: Original(1) + Main(14) = 15 tracks');
            console.log(`   (Average-based insufficient: only ${uniqueAvgTracks.length} unique tracks)`);
            displayTracks = [
                track,
                ...recData.recommendations.slice(0, 14)
            ];
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 FINAL DISPLAY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Total tracks to display: ${displayTracks.length}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // UI 업데이트
        updateTrackDisplayOnly(displayTracks, 0);

    } catch (e) {
        console.error('⚠️ Failed to fetch recommendations:', e);
        alert('추천곡을 가져올 수 없습니다.');
    }
}

// ===== Average-based Recommendations =====
async function fetchAverageBasedRecommendations() {
    try {
        console.log('\n🎯 ═══════════════════════════════════════════');
        console.log('🎯 FETCHING AVERAGE-BASED RECOMMENDATIONS');
        console.log('🎯 ═══════════════════════════════════════════');
        console.log(`   Click history (${clickedTracks.length} tracks):`, clickedTracks);

        const response = await fetch(`${API_BASE_URL}/recommend-average`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_keys: clickedTracks,
                num_recommendations: 15  // 중복 제거 후에도 5개 확보하도록 15개 요청
            })
        });

        if (!response.ok) {
            throw new Error('Average-based recommendation failed');
        }

        const data = await response.json();
        console.log(`   Received ${data.recommendations ? data.recommendations.length : 0} recommendations from backend`);

        if (data.recommendations && data.recommendations.length > 0) {
            console.log('   Raw recommendations (first 10):');
            data.recommendations.slice(0, 10).forEach((t, i) => {
                console.log(`      ${i+1}. ${t.track} - ${t.artist}`);
            });

            // DB 트랙 직접 사용 (Spotify 매칭 불필요)
            averageBasedTracks = data.recommendations;
            console.log(`   ✅ Using DB tracks: ${averageBasedTracks.length} tracks`);
        }
        console.log('🎯 ═══════════════════════════════════════════\n');
    } catch (e) {
        console.error('⚠️ Failed to fetch average-based recommendations:', e);
        averageBasedTracks = [];
    }
}

// ===== Display Functions =====
function updateTrackDisplayOnly(tracks, currentIndex) {
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

    // 순서대로 표시 (섞지 않음)
    const tracksToDisplay = [];
    for (let i = currentIndex; i < endIdx; i++) {
        tracksToDisplay.push({ track: tracks[i], originalIndex: i });
    }

    console.log('📋 Tracks to display (순서대로):');
    tracksToDisplay.forEach(({ track }, i) => {
        console.log(`   ${i+1}. ${track.track || track.name} - ${track.artist}`);
    });

    tracksToDisplay.forEach(({ track, originalIndex }) => {
        const isCurrent = originalIndex === currentIndex;

        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-item' + (isCurrent ? ' current' : '');
        trackDiv.style.cursor = 'pointer';

        const img = document.createElement('img');
        img.src = track.cover_image_url || '';
        img.alt = track.track || 'Unknown';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'track-item-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'track-item-title';
        titleDiv.textContent = track.track || 'Unknown';

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
            const query = encodeURIComponent(`${track.track || track.track_name} ${track.artist || track.artist_name}`);
            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
        };

        trackGrid.appendChild(trackDiv);
    });

    console.log('✅ Track display updated');
}
