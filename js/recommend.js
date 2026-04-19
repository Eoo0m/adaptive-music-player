// ===== Click History Management =====
function addClickedTrack(trackKey) {
    // 중복 제거
    if (!clickedTracks.includes(trackKey)) {
        clickedTracks.push(trackKey);

        // 최대 16개 유지 (Two-Tower max_seq_len)
        if (clickedTracks.length > 16) {
            clickedTracks.shift();
        }

        console.log(`📝 Added to click history: ${trackKey}`);
        console.log(`📊 Click history (${clickedTracks.length}/16):`, clickedTracks);
    }
}

// ===== Track-based Recommendations (Two-Tower Model) =====
async function loadRecommendationsFromTrack(track, trackIndex) {
    // track_key가 있는지 확인
    if (!track.track_key) {
        console.warn('⚠️ No track_key available for this track');
        alert('이 트랙은 추천 데이터베이스에 없습니다.');
        return;
    }

    console.log('🎵 Loading recommendations from track:', track.track_key);

    // 클릭한 트랙을 히스토리에 추가
    addClickedTrack(track.track_key);

    // 앨범 커버 클릭 로그 전송
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

    showLoadingIndicator('추천곡을 찾는 중입니다.');

    try {
        console.log(`🎯 Two-Tower recommend with ${clickedTracks.length} session tracks`);

        // Two-Tower 기반 세션 추천 (/recommend)
        const recResp = await fetch(`${API_BASE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_keys: clickedTracks,
                num_recommendations: 30
            })
        });

        if (!recResp.ok) throw new Error('Recommendation failed');

        const recData = await recResp.json();
        if (!recData.recommendations || recData.recommendations.length === 0) {
            throw new Error('No recommendations found');
        }

        console.log(`✅ Two-Tower recommendations received: ${recData.recommendations.length} tracks`);
        console.log('📋 Recommendations (first 10):', recData.recommendations.slice(0, 10).map(t => `${t.track} - ${t.artist}`));

        // 중복 제거 (세션 트랙 제외)
        const seenIds = new Set(clickedTracks);
        const uniqueTracks = recData.recommendations.filter(t => {
            if (seenIds.has(t.track_key)) return false;
            seenIds.add(t.track_key);
            return true;
        });

        // 플레이리스트 구성: 클릭한 트랙(1) + 추천(14) = 15곡
        const displayTracks = [track, ...uniqueTracks.slice(0, 14)];

        console.log(`📝 Display: ${displayTracks.length} tracks (1 selected + ${displayTracks.length - 1} recommendations)`);

        hideLoadingIndicator();

        // UI 업데이트
        updateTrackDisplayOnly(displayTracks, 0);

    } catch (e) {
        hideLoadingIndicator();
        console.error('⚠️ Failed to fetch recommendations:', e);
        alert('추천곡을 가져올 수 없습니다.');
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

        // 앨범 커버 + 하트 버튼을 감싸는 wrapper
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'album-cover-wrapper';

        const heartBtn = document.createElement('button');
        heartBtn.className = 'heart-btn';
        heartBtn.innerHTML = '&#9825;'; // 빈 하트
        heartBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(track, heartBtn);
        };

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(heartBtn);

        trackDiv.appendChild(imgWrapper);
        trackDiv.appendChild(infoDiv);

        // 클릭: 추천 / 더블클릭: 유튜브 재생
        const singleAction = isCurrent
            ? () => showSearchInterface()
            : () => loadRecommendationsFromTrack(track, originalIndex);
        const dblAction = () => {
            const query = encodeURIComponent(`${track.track || track.track_name} ${track.artist || track.artist_name}`);
            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
        };
        onClickOrDblClick(trackDiv, singleAction, dblAction);

        trackGrid.appendChild(trackDiv);
    });

    console.log('✅ Track display updated');
}
