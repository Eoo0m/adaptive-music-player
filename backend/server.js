// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// ★ 내부 포트로만 대기 (Nginx가 443에서 받아 127.0.0.1:8889로 프록시)
const PORT = process.env.PORT || 8889;

// ★ Cloudflare/Nginx 뒤에 있으므로 https, client IP 인식
app.set('trust proxy', 1);

// ★ 운영 프론트 도메인만 허용
const corsOptions = {
  origin: ['https://dynplayer.win', 'https://www.dynplayer.win'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// ---- 헬스체크 ----
app.get('/health', (_req, res) => res.send('ok'));

// ---- 추천 Python 서비스 기동/체크 ----
let pythonProcess;

async function checkRecommendationService() {
  try {
    const response = await fetch('http://127.0.0.1:5001/health');
    if (response.ok) {
      console.log('✅ Recommendation service is already running');
      return true;
    }
  } catch (error) {
    console.log('🤖 Starting recommendation service...');
    pythonProcess = spawn('python3', ['recommendation_service.py'], {
      cwd: __dirname,
      stdio: 'pipe',
    });

    pythonProcess.stdout.on('data', (d) => console.log(`[Recommendation Service]: ${d.toString()}`));
    pythonProcess.stderr.on('data', (d) => console.error(`[Recommendation Service Error]: ${d.toString()}`));
    pythonProcess.on('close', (code) => console.log(`[Recommendation Service]: exited code ${code}`));
  }
  return false;
}

process.on('SIGINT', () => { if (pythonProcess) pythonProcess.kill(); process.exit(0); });

checkRecommendationService();

// ---- 정적 파일 (필요 시 유지) ----
app.use(express.static(__dirname));

// ---- Spotify OAuth ----
function generateRandomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

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
    'playlist-read-collaborative',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: process.env.REDIRECT_URI, // ← 반드시 https://api.dynplayer.win/callback
    state: generateRandomString(16),
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/#error=access_denied');

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        code,
        redirect_uri: process.env.REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.access_token) {
      return res.redirect(`/#access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}`);
    }
    return res.redirect('/#error=invalid_token');
  } catch (e) {
    console.error('Error getting access token:', e);
    return res.redirect('/#error=server_error');
  }
});

app.post('/refresh_token', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh token' });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }),
    });
    const tokenData = await response.json();
    res.json(tokenData);
  } catch (e) {
    console.error('Error refreshing token:', e);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// ---- 추천/검색 프록시 (Python: 127.0.0.1:5001) ----
app.post('/recommend', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error('Error calling recommendation service:', e);
    res.status(500).json({ error: 'Recommendation service unavailable' });
  }
});

app.post('/search-songs', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error('Error calling search service:', e);
    res.status(500).json({ error: 'Search service unavailable' });
  }
});

app.post('/recommend-from-spotify-track', async (req, res) => {
  const { spotify_track, access_token } = req.body;
  if (!access_token || !spotify_track) return res.status(400).json({ error: 'Missing access token or track info' });

  // 토큰 확인
  try {
    const ping = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!ping.ok) return res.status(401).json({ error: 'Invalid or expired access token' });
  } catch {
    return res.status(401).json({ error: 'Token validation failed' });
  }

  try {
    // 내부 검색 → 추천
    const searchRes = await fetch('http://127.0.0.1:5001/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${spotify_track.name} ${spotify_track.artists?.[0]?.name}`.trim() }),
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.results?.length) {
        const best = searchData.results.find(r =>
          r.track.toLowerCase().includes(spotify_track.name.toLowerCase()) ||
          spotify_track.name.toLowerCase().includes(r.track.toLowerCase())
        ) || searchData.results[0];

        const recRes = await fetch('http://127.0.0.1:5001/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ song_title: best.track, artist_name: best.artist, num_recommendations: 10 }),
        });

        if (recRes.ok) {
          const recData = await recRes.json();
          if (recData.recommendations?.length) {
            // 상위 5개 spotify 검색
            const out = [];
            for (const rec of recData.recommendations.slice(0, 5)) {
              const q = `track:"${rec.track}" artist:"${rec.artist}"`;
              const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
                headers: { Authorization: `Bearer ${access_token}` },
              });
              if (!s.ok) continue;
              const sj = await s.json();
              const item = sj.tracks?.items?.[0];
              if (item) out.push({ ...rec, spotify_track: item, uri: item.uri, preview_url: item.preview_url });
            }
            return res.json({ spotify_tracks: out, original_match: best });
          }
        }
      }
    }

    // Fallback: Spotify native recommendations
    const seedTrackId = spotify_track.id;
    const srec = await fetch(`https://api.spotify.com/v1/recommendations?seed_tracks=${seedTrackId}&limit=5`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (srec.ok) {
      const sj = await srec.json();
      const out = (sj.tracks || []).map(t => ({
        track: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        spotify_track: t,
        uri: t.uri,
        preview_url: t.preview_url,
        similarity: 0.8,
      }));
      return res.json({ spotify_tracks: out });
    }

    // Fallback 2: artist seed
    const artistId = spotify_track.artists?.[0]?.id;
    const arec = await fetch(`https://api.spotify.com/v1/recommendations?seed_artists=${artistId}&limit=5`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (arec.ok) {
      const aj = await arec.json();
      const out = (aj.tracks || []).map(t => ({
        track: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        spotify_track: t,
        uri: t.uri,
        preview_url: t.preview_url,
        similarity: 0.7,
      }));
      return res.json({ spotify_tracks: out });
    }

    return res.json({ spotify_tracks: [] });
  } catch (e) {
    console.error('❌ Error getting recommendations from Spotify track:', e);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

app.post('/find-spotify-tracks', async (req, res) => {
  const { tracks, access_token } = req.body;
  if (!access_token || !tracks) return res.status(400).json({ error: 'Missing access token or tracks' });

  try {
    const shuffled = tracks.slice().sort(() => 0.5 - Math.random());
    const out = [];
    for (const track of shuffled.slice(0, 10)) {
      const q = `track:"${track.track}" artist:"${track.artist}"`;
      const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!s.ok) continue;
      const sj = await s.json();
      const item = sj.tracks?.items?.[0];
      if (item) out.push({ ...track, spotify_track: item, uri: item.uri, preview_url: item.preview_url });
    }
    res.json({ spotify_tracks: out });
  } catch (e) {
    console.error('💥 Error finding Spotify tracks:', e);
    res.status(500).json({ error: 'Failed to find Spotify tracks' });
  }
});

// SPA 파일 서빙 (필요 시)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎵 Backend on 127.0.0.1:${PORT} (public via https://api.dynplayer.win)`);
});