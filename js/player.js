// ===== Spotify SDK Initialization =====
window.onSpotifyWebPlaybackSDKReady = () => {
    if (access_token) initializeSpotifyPlayer();
};

function initializeSpotifyPlayer() {
    if (!access_token) return;

    player = new Spotify.Player({
        name: 'Spotify iPod Web Player',
        getOAuthToken: cb => cb(access_token),
        volume: 0.5
    });

    player.addListener('initialization_error', ({ message }) => console.error('초기화 오류:', message));
    player.addListener('authentication_error', ({ message }) => {
        console.error('인증 오류:', message);
        refreshAccessToken();
    });
    player.addListener('account_error', ({ message }) => {
        console.error('계정 오류:', message);
        alert('Spotify Premium 계정이 필요합니다.');
    });
    player.addListener('playback_error', ({ message }) => console.error('재생 오류:', message));

    player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const previousTrack = current_track;
        current_track = state.track_window.current_track;
        is_paused = state.paused;

        // 트랙이 변경될 때 로그 및 검증
        if (previousTrack?.id !== current_track?.id && current_track) {
            console.log(`🎧 Spotify Player State Changed:`);
            console.log(`   Previous: ${previousTrack?.name || 'None'} (ID: ${previousTrack?.id || 'N/A'})`);
            console.log(`   Current: ${current_track.name} (ID: ${current_track.id})`);
            console.log(`   Expected Track ID: ${expectedTrackId}`);
            console.log(`   Expected playlist[${currentTrackIndex}]:`, playlist[currentTrackIndex]);

            // ⚠️ 잘못된 트랙이 재생되면 다음 곡으로 건너뛰기
            if (expectedTrackId && current_track.id !== expectedTrackId) {
                console.error(`❌ WRONG TRACK PLAYING! Expected: ${expectedTrackId}, Got: ${current_track.id}`);
                console.warn(`⏭️ Skipping to next track in playlist...`);
                expectedTrackId = null;  // 리셋
                setTimeout(() => playNext(), 500);
                return;
            } else if (expectedTrackId && current_track.id === expectedTrackId) {
                console.log(`✅ Correct track is playing`);
                expectedTrackId = null;  // 리셋
            }
        }

        // 트랙이 변경될 때 이전 트랙의 듣기 기록 저장
        if (previousTrack?.id && previousTrack?.id !== current_track?.id) {
            lastPlayedTrack = previousTrack;
            recordTrackCompletion('auto', state.position);
        }
        if (previousTrack?.id !== current_track?.id && current_track) {
            trackStartTime = Date.now();
            trackDuration = current_track.duration_ms;
        }

        // 자동 종료 감지 → 다음 곡 재생 (이전 트랙이 있을 때만)
        if (state.position === 0 && state.paused && current_track && previousTrack?.id) {
            setTimeout(() => playNext(), 600);
        } else {
            // 플레이리스트가 있을 때만 UI 업데이트
            if (playlist.length > 0) {
                updateTrackInfo();
                updatePlayPauseIcon();
            }
        }
    });

    player.addListener('ready', ({ device_id: ready_device_id }) => {
        console.log('🎵 Spotify Player Ready with Device ID', ready_device_id);
        device_id = ready_device_id;
        transferPlaybackToDevice(device_id);
        if (playlist.length > 0) setTimeout(() => playTrackAtIndex(0), 1200);
    });

    player.connect();
}

async function transferPlaybackToDevice(device_id) {
    try {
        await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ device_ids: [device_id], play: false })
        });
    } catch (e) {
        console.error('재생 장치 전환 오류:', e);
    }
}

// ===== Playback Control =====
async function playTrackAtIndex(index) {
    if (!playlist[index]) return;

    // 명시적으로 인덱스 설정
    currentTrackIndex = index;

    const track = playlist[index];
    const uri = track.uri || track.spotify_track?.uri || track.track?.uri;
    if (!uri || !device_id) return;

    const t = track.spotify_track || track.track || track;
    const name = t.name || track.track || 'Unknown Track';
    const artists = t.artists ? t.artists.map(a => a.name).join(', ') : (track.artist || 'Unknown Artist');
    const album = t.album?.name || track.album || null;
    const trackId = t.id || uri?.split(':')[2];
    const similarityText = (typeof track.similarity === 'number') ? ` (${(track.similarity * 100).toFixed(1)}% similar)` : '';

    // 예상 트랙 ID 저장
    expectedTrackId = trackId;

    console.log(`▶️ [${index + 1}/${playlist.length}] ${name} - ${artists}${similarityText}`);
    console.log(`   🔑 Expected Track ID: ${trackId}`);
    console.log(`   🎵 URI: ${uri}`);
    console.log(`   📦 Full track object:`, track);

    // 클릭 시 즉시 로그 전송
    logListeningData({
        track_name: name,
        artist_name: artists,
        album_name: album,
        spotify_uri: uri,
        spotify_track_id: trackId
    }).catch(err => console.error('Failed to log track click:', err));

    try {
        // Spotify Player 상태를 완전히 리셋하고 새 트랙 재생
        const playPayload = {
            uris: [uri],
            position_ms: 0
        };

        console.log(`   📤 Sending to Spotify API:`, playPayload);

        const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(playPayload)
        });

        console.log(`   📥 Spotify API Response: ${response.status} ${response.statusText}`);

        // 403 에러 발생 시 1초 후 재시도
        if (response.status === 403) {
            console.warn('플레이어 준비 중... 1초 후 재시도');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [uri] })
            });
        }
    } catch (e) {
        console.error('트랙 재생 오류:', e);
    }
}

async function playSpotifyTrack(uri) {
    if (!device_id || !uri) return;
    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [uri] })
        });
    } catch (e) {
        console.error('Spotify track playback error:', e);
    }
}

function recordTrackCompletion(reason = 'auto', currentPosition = 0) {
    if (current_track) {
        console.log(`📝 Track completed: ${current_track.name}`);

        logListeningData({
            track_name: current_track.name,
            artist_name: current_track.artists?.map(a => a.name).join(', ') || 'Unknown',
            album_name: current_track.album?.name || null,
            spotify_uri: current_track.uri || null,
            spotify_track_id: current_track.id || null
        }).catch(err => console.error('Failed to log listening data:', err));
    }
}

// ===== Navigation =====
async function playNext() {
    console.log(`⏭️ playNext() called - currentTrackIndex: ${currentTrackIndex}, playlist.length: ${playlist.length}`);

    // 1) 플레이리스트에 다음 곡이 있으면 재생
    if (playlist.length > 0 && currentTrackIndex < playlist.length - 1) {
        currentTrackIndex++;
        console.log(`   ➡️ Moving to next track: index ${currentTrackIndex}`);
        await playTrackAtIndex(currentTrackIndex);
        return;
    }

    // 2) 플레이리스트 끝 → 현재 곡 기반으로 새 추천 받기
    if (!current_track) {
        console.warn('⚠️ No current track to base recommendations on');
        return;
    }

    try {
        console.log('🎵 Playlist ended, fetching new recommendations...');
        console.log(`🎵 Current playing track: ${current_track.name} by ${current_track.artists?.[0]?.name}`);

        // 현재 플레이리스트에서 track_key 찾기
        const currentPlaylistTrack = playlist[currentTrackIndex];
        console.log('🔍 Current playlist track:', currentPlaylistTrack);
        console.log('🔍 Track has track_key?', currentPlaylistTrack?.track_key);

        let trackKey = currentPlaylistTrack?.track_key;

        if (!trackKey) {
            console.warn('⚠️ No track_key in playlist, cannot fetch recommendations');
            alert('이 곡은 추천 데이터베이스에 없어서 다음 곡을 추천할 수 없습니다.');
            return;
        }

        console.log(`🔑 Using track_key: ${trackKey}`);

        // track_key로 추천 받기
        const recResp = await fetch(`${API_BASE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_key: trackKey, num_recommendations: 30 })
        });

        if (!recResp.ok) throw new Error('Recommendation failed');

        const recData = await recResp.json();
        if (!recData.recommendations || recData.recommendations.length === 0) {
            throw new Error('No recommendations found');
        }

        // Spotify 매칭
        const spotifyResp = await fetch(`${API_BASE_URL}/find-spotify-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: recData.recommendations, access_token })
        });

        if (!spotifyResp.ok) throw new Error('Spotify matching failed');

        const spotifyData = await spotifyResp.json();
        if (!spotifyData.spotify_tracks || spotifyData.spotify_tracks.length === 0) {
            throw new Error('No Spotify tracks found');
        }

        // 새 플레이리스트 설정
        playlist = spotifyData.spotify_tracks.slice(0, 10);
        currentTrackIndex = 0;

        console.log(`✅ New playlist loaded: ${playlist.length} tracks`);
        await playSpotifyTrack(playlist[0].uri || playlist[0].spotify_track?.uri);

    } catch (e) {
        console.error('⚠️ Failed to fetch next recommendations:', e);
        alert('다음 추천곡을 가져올 수 없습니다.');
    }
}

async function playPrevious() {
    if (playlist.length === 0) return;
    currentTrackIndex = currentTrackIndex === 0 ? playlist.length - 1 : currentTrackIndex - 1;
    await playTrackAtIndex(currentTrackIndex);
}

// ===== Player Controls =====
async function togglePlayPause() {
    if (player) await player.togglePlay();
}

async function adjustVolume(delta) {
    if (!player) return;
    try {
        const state = await player.getCurrentState();
        if (state) {
            const newV = Math.max(0, Math.min(1, state.volume + delta));
            await player.setVolume(newV);
            const control = delta > 0 ? document.getElementById('volumeUp') : document.getElementById('volumeDown');
            if (control) {
                control.classList.add('active');
                setTimeout(() => control.classList.remove('active'), 200);
            }
        }
    } catch (e) {
        console.error('볼륨 조절 오류:', e);
    }
}

// ===== UI Updates =====
function updateTrackInfo() {
    if (!current_track) return;

    // 플레이리스트가 없으면 track-info 숨김 (새로고침 후 이전 곡이 남아있는 경우)
    if (playlist.length === 0) {
        document.getElementById('trackInfo').classList.add('hidden');
        return;
    }

    // 검색창이 열려있으면 track-info 업데이트하지 않음 (곡이 바뀌어도 커버 표시 안함)
    const searchInterface = document.getElementById('initialSongInput');
    if (!searchInterface.classList.contains('hidden')) {
        return;
    }

    document.getElementById('trackInfo').classList.remove('hidden');
    updateAllTracks();
    updateMediaSession();
}

function updateAllTracks() {
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
    const startIdx = currentTrackIndex;
    const endIdx = Math.min(playlist.length, currentTrackIndex + 15);

    // 첫 번째 트랙(원곡)은 그대로, 나머지는 랜덤 섞기
    const tracksToDisplay = [];
    for (let i = startIdx; i < endIdx; i++) {
        tracksToDisplay.push({ track: playlist[i], originalIndex: i });
    }

    // 첫 번째 트랙 제외하고 나머지 섞기
    if (tracksToDisplay.length > 1) {
        const firstTrack = tracksToDisplay[0];
        const remainingTracks = tracksToDisplay.slice(1);

        // Fisher-Yates 셔플
        for (let i = remainingTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
        }

        tracksToDisplay.splice(0, tracksToDisplay.length, firstTrack, ...remainingTracks);
    }

    tracksToDisplay.forEach(({ track, originalIndex }) => {
        const isCurrent = originalIndex === currentTrackIndex;

        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-item' + (isCurrent ? ' current' : '');
        trackDiv.style.cursor = 'pointer';

        const img = document.createElement('img');
        // Supabase cover_image_url 우선 사용, 없으면 Spotify 이미지
        if (track.cover_image_url) {
            img.src = track.cover_image_url;
        } else if (track.spotify_track?.album?.images?.[0]?.url) {
            img.src = track.spotify_track.album.images[0].url;
        } else if (track.album?.images?.[0]?.url) {
            img.src = track.album.images[0].url;
        } else {
            img.src = '';
        }
        img.alt = track.spotify_track?.name || track.track || track.track_name || '';

        // 트랙 정보
        const infoDiv = document.createElement('div');
        infoDiv.className = 'track-item-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'track-item-title';
        titleDiv.textContent = track.spotify_track?.name || track.track || track.track_name || 'Unknown';

        const artistDiv = document.createElement('div');
        artistDiv.className = 'track-item-artist';
        artistDiv.textContent = track.spotify_track?.artists?.map(a => a.name).join(', ') || track.artist || 'Unknown Artist';

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
}

function updateMediaSession() {
    if (!('mediaSession' in navigator) || !current_track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: current_track.name,
        artist: current_track.artists.map(a => a.name).join(', '),
        album: current_track.album?.name || 'Unknown Album',
        artwork: current_track.album?.images?.map(img => ({
            src: img.url,
            sizes: `${img.width}x${img.height}`,
            type: 'image/jpeg'
        })) || []
    });
    navigator.mediaSession.setActionHandler('play', async () => {
        await togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('pause', async () => {
        await togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', async () => {
        await playPrevious();
    });
    navigator.mediaSession.setActionHandler('nexttrack', async () => {
        await playNext();
    });
    navigator.mediaSession.playbackState = is_paused ? 'paused' : 'playing';
}

function updatePlayPauseIcon() {
    const playPauseIcon = document.getElementById('playPauseIcon');
    if (playPauseIcon) {
        playPauseIcon.textContent = is_paused ? '▶' : '‖';
    }
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = is_paused ? 'paused' : 'playing';
    }
}

function updateIPodState() {
    const el = document.getElementById('ipodContainer');
    if (el) {
        if (!is_paused) el.classList.add('playing');
        else el.classList.remove('playing');
    }
}
