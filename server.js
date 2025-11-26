// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// ---------------- Supabase ----------------
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const app = express();
const PORT = process.env.PORT || 8889;

// 프록시 신뢰 (Cloudflare/Nginx 뒤에 있을 때)
app.set('trust proxy', 1);

// ---------------- CORS ----------------
const corsOptions = {
    origin: [
        'https://dynplayer.win',
        'https://www.dynplayer.win',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// ---------------- Health ----------------
app.get('/health', (_req, res) => res.send('ok'));

// ---------------- Spotify OAuth ----------------
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// 1) 로그인 시작 (Spotify authorize)
app.get('/login', (req, res) => {
    const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-library-read',
        'user-library-modify',
        'user-read-playback-state',
        'user-modify-playback-state',
        'playlist-read-private',
        'playlist-read-collaborative'
    ].join(' ');

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scopes,
        redirect_uri: process.env.REDIRECT_URI,
        state: generateRandomString(16)
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// 2) 콜백에서 토큰 교환
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/#error=access_denied');

    try {
        const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64')
            },
            body: new URLSearchParams({
                code,
                redirect_uri: process.env.REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });
        const tokenData = await r.json();

        if (tokenData.access_token) {
            res.redirect(
                `https://dynplayer.win/#access_token=${tokenData.access_token}` +
                (tokenData.refresh_token ? `&refresh_token=${tokenData.refresh_token}` : '')
            );
        } else {
            res.redirect('/#error=invalid_token');
        }
    } catch (e) {
        console.error('OAuth token error:', e);
        res.redirect('/#error=server_error');
    }
});

// 3) 리프레시 토큰
app.post('/refresh_token', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh token' });

    try {
        const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token
            })
        });
        res.json(await r.json());
    } catch (e) {
        console.error('Refresh token error:', e);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

// ---------------- Supabase-based Search & Recommendation ----------------
// 1) 제목 기반 검색 (search_tracks_by_title 함수 사용)
app.post('/search-songs', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    try {
        const { data, error } = await supabase.rpc('search_tracks_by_title', {
            query_text: query,
            match_count: 10
        });

        if (error) {
            console.error('Supabase search error:', error);
            return res.status(500).json({ error: 'Search failed' });
        }

        // 결과 포맷 변환 (기존 API와 호환)
        const results = (data || []).map(item => ({
            track_id: item.id,
            track_key: item.track_key,
            track: item.title,
            artist: item.artist,
            album: item.album,
            pos_count: item.pos_count,
            similarity: item.similarity
        }));

        res.json({ results });
    } catch (e) {
        console.error('Search error:', e);
        res.status(500).json({ error: 'search service unavailable' });
    }
});

// 2) track_key 기반 유사 음악 추천 (match_tracks_by_key 함수 사용)
app.post('/recommend', async (req, res) => {
    const { track_key, num_recommendations = 30 } = req.body;
    if (!track_key) return res.status(400).json({ error: 'Missing track_key' });

    try {
        const { data, error } = await supabase.rpc('match_tracks_by_key', {
            input_track_key: track_key,
            match_count: num_recommendations
        });

        if (error) {
            console.error('Supabase recommend error:', error);
            return res.status(500).json({ error: 'Recommendation failed' });
        }

        // 결과 포맷 변환
        const recommendations = (data || []).map(item => ({
            track_id: item.id,
            track_key: item.track_key,
            track: item.title,
            artist: item.artist,
            album: item.album,
            pos_count: item.pos_count,
            similarity: item.similarity
        }));

        res.json({
            recommendations,
            original_song: { track_key }
        });
    } catch (e) {
        console.error('Recommend error:', e);
        res.status(500).json({ error: 'recommendation service unavailable' });
    }
});

// 3) Diverse 추천 (Spotify 트랙 기반으로 Supabase에서 검색 후 랜덤 추천)
app.post('/recommend-diverse-tracks', async (req, res) => {
    const { spotify_track, access_token } = req.body;
    if (!access_token || !spotify_track) {
        return res.status(400).json({ error: 'Missing access token or track info' });
    }

    try {
        console.time('[diverse]');
        console.log('🔴 /recommend-diverse-tracks called');

        // 1) Spotify 트랙 정보로 Supabase에서 검색
        const title = spotify_track?.name || '';
        const artist = spotify_track?.artists?.[0]?.name || '';
        const query = `${title} ${artist}`.trim();

        const { data: searchData, error: searchError } = await supabase.rpc('search_tracks_by_title', {
            query_text: query,
            match_count: 5
        });

        if (searchError || !searchData || searchData.length === 0) {
            console.warn('[diverse] no matching track found in Supabase');
            return res.json({ spotify_tracks: [] });
        }

        // 2) 가장 유사도 높은 트랙의 track_key 사용
        const seedTrackKey = searchData[0].track_key;
        console.log(`[diverse] Using seed track_key: ${seedTrackKey}`);

        // 3) 해당 트랙과 유사한 트랙들 가져오기 (많이 가져와서 랜덤 선택)
        const { data: similarData, error: similarError } = await supabase.rpc('match_tracks_by_key', {
            input_track_key: seedTrackKey,
            match_count: 50
        });

        if (similarError || !similarData || similarData.length === 0) {
            console.warn('[diverse] no similar tracks found');
            return res.json({ spotify_tracks: [] });
        }

        // 4) 유사도 낮은 순으로 정렬 (diverse하게) 후 15개 선택
        const diversePool = [...similarData]
            .sort((a, b) => a.similarity - b.similarity) // 유사도 낮은 순
            .slice(0, 15);

        console.log(`[diverse] selected ${diversePool.length} diverse candidates`);

        // 5) Spotify 매핑 (최대 10개)
        const out = [];
        for (const rec of diversePool) {
            const q = `track:"${rec.title}" artist:"${rec.artist}"`;
            const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });
            if (!s.ok) {
                console.warn('⚠️ spotify search fail', s.status);
                continue;
            }
            const sj = await s.json();
            const it = sj?.tracks?.items?.[0];
            if (it) {
                out.push({
                    track: rec.title,
                    artist: rec.artist,
                    album: rec.album,
                    track_key: rec.track_key,
                    similarity: rec.similarity,
                    spotify_track: it,
                    uri: it.uri,
                    preview_url: it.preview_url
                });
            }
            if (out.length >= 10) break;
        }

        console.log(`[diverse] mapped to Spotify: ${out.length}`);
        console.timeEnd('[diverse]');
        return res.json({ spotify_tracks: out });

    } catch (e) {
        console.error('recommend-diverse-tracks error:', e);
        return res.status(500).json({ error: 'Failed to get diverse recommendations' });
    }
});

// 추천 결과를 Spotify 트랙으로 매핑
app.post('/find-spotify-tracks', async (req, res) => {
    const { tracks, access_token } = req.body;
    if (!access_token || !tracks) return res.status(400).json({ error: 'Missing access token or tracks' });

    try {
        const out = [];
        const shuffled = [...tracks].sort(() => 0.5 - Math.random());
        for (const track of shuffled.slice(0, 10)) {
            const q = `track:"${track.track}" artist:"${track.artist}"`;
            const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });
            if (s.ok) {
                const sj = await s.json();
                const it = sj?.tracks?.items?.[0];
                if (it) out.push({ ...track, spotify_track: it, uri: it.uri, preview_url: it.preview_url });
            }
        }
        res.json({ spotify_tracks: out });
    } catch (e) {
        console.error('find-spotify-tracks error:', e);
        res.status(500).json({ error: 'Failed to find Spotify tracks' });
    }
});

// (옵션) 랜덤 트랙 샘플
app.get('/random-tracks', async (req, res) => {
    const { access_token, limit = 10 } = req.query;
    if (!access_token) return res.status(400).json({ error: 'Missing access token' });

    try {
        const r = await fetch('https://api.spotify.com/v1/me/tracks?limit=50&offset=0', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        const j = await r.json();
        if (j.items?.length) {
            const shuffled = [...j.items].sort(() => 0.5 - Math.random());
            return res.json({ tracks: shuffled.slice(0, Math.min(+limit, shuffled.length)) });
        }
        const rec = await fetch(`https://api.spotify.com/v1/recommendations?seed_genres=pop,rock,electronic&limit=${limit}`, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        res.json({ tracks: (await rec.json()).tracks || [] });
    } catch (e) {
        console.error('random-tracks error:', e);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// ---------------- Listening Log ----------------
// 듣는 기록 저장
app.post('/log-listening', async (req, res) => {
    const {
        track_name,
        artist_name,
        album_name,
        spotify_uri,
        spotify_track_id,
        duration_ms,
        played_duration_ms,
        completion_percentage,
        recommendation_mode,
        similarity_score,
        session_id
    } = req.body;

    if (!track_name || !artist_name) {
        return res.status(400).json({ error: 'Missing required fields: track_name, artist_name' });
    }

    try {
        const { data, error } = await supabase
            .from('listening_logs')
            .insert([
                {
                    track_name,
                    artist_name,
                    album_name: album_name || null,
                    spotify_uri: spotify_uri || null,
                    spotify_track_id: spotify_track_id || null,
                    duration_ms: duration_ms || null,
                    played_duration_ms: played_duration_ms || null,
                    completion_percentage: completion_percentage || null,
                    recommendation_mode: recommendation_mode || null,
                    similarity_score: similarity_score || null,
                    session_id: session_id || null
                }
            ])
            .select();

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({ error: 'Failed to log listening data' });
        }

        res.json({ success: true, data });
    } catch (e) {
        console.error('log-listening error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------------- Root / 404 ----------------
app.get('/', (_req, res) => res.send('dynplayer API'));
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

// 127.0.0.1로 바인딩 (Nginx가 프록시)
app.listen(PORT, '127.0.0.1', () => {
    console.log(`🎵 Backend on 127.0.0.1:${PORT} (public via https://api.dynplayer.win)`);
});