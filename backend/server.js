// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// ---------------- Env & path ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

// ---------------- Python recommendation service ----------------
let pythonProcess;
const PYTHON_BIN = process.env.PYTHON_BIN || path.join(__dirname, 'venv', 'bin', 'python');

async function ensureRecoService() {
  try {
    const r = await fetch('http://127.0.0.1:5001/health');
    if (r.ok) {
      console.log('✅ Recommendation service is running');
      return;
    }
  } catch {
    console.log('🤖 Starting recommendation service...');
    pythonProcess = spawn(PYTHON_BIN, ['recommendation_service.py'], {
      cwd: __dirname,
      stdio: 'pipe'
    });
    pythonProcess.stdout.on('data', d => process.stdout.write(`[Reco] ${d}`));
    pythonProcess.stderr.on('data', d => process.stderr.write(`[RecoErr] ${d}`));
  }
}
process.on('SIGINT', () => { if (pythonProcess) pythonProcess.kill(); process.exit(0); });
ensureRecoService();

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

// ---------------- Recommendation/Search API (→ Python :5001) ----------------
// 유사 추천(다단계: 로컬 추천 → Spotify 매칭은 프론트에서 /find-spotify-tracks 호출)
app.post('/recommend', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (e) {
    console.error('Recommend error:', e);
    res.status(500).json({ error: 'recommendation service unavailable' });
  }
});

// 다양한 추천(로컬 엔진) — 프론트가 current_track_id를 보내면 그대로 파이썬으로 프록시
// server.js 에 추가 (기존 라우트들 아래 아무 곳)
app.post('/recommend-diverse-tracks', async (req, res) => {
  const { spotify_track, access_token } = req.body;
  if (!access_token || !spotify_track) {
    return res.status(400).json({ error: 'Missing access token or track info' });
  }

  try {
    // 토큰 검증
    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (!me.ok) return res.status(401).json({ error: 'Invalid or expired access token' });

    // 1) 로컬 검색으로 track_id 찾기
    const query = `${spotify_track.name} ${spotify_track.artists?.[0]?.name || ''}`.trim();
    const searchR = await fetch('http://127.0.0.1:5001/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!searchR.ok) return res.status(502).json({ error: 'search failed', status: searchR.status, text: await searchR.text() });
    const searchData = await searchR.json();
    const best = (searchData.results || [])[0];
    if (!best?.track_id) return res.json({ spotify_tracks: [] });

    // 2) diverse 추천 (track_id 기반)
    const diverseR = await fetch('http://127.0.0.1:5001/recommend-diverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_track_id: best.track_id, num_recommendations: 15 })
    });
    if (!diverseR.ok) return res.status(502).json({ error: 'diverse failed', status: diverseR.status, text: await diverseR.text() });
    const diverseData = await diverseR.json();

    // 3) Spotify 매칭 (최대 10개)
    const out = [];
    for (const rec of (diverseData.recommendations || []).slice(0, 10)) {
      const q = `track:"${rec.track}" artist:"${rec.artist}"`;
      const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });
      if (s.ok) {
        const sj = await s.json();
        const it = sj?.tracks?.items?.[0];
        if (it) out.push({ ...rec, spotify_track: it, uri: it.uri, preview_url: it.preview_url, track: it });
      }
    }

    res.json({ spotify_tracks: out });
  } catch (e) {
    console.error('recommend-diverse-tracks error:', e);
    res.status(500).json({ error: 'Failed to get diverse recommendations' });
  }
});

// 로컬 메타DB/제목검색
app.post('/search-songs', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: 'search service unavailable' });
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

// ---------------- Root / 404 ----------------
app.get('/', (_req, res) => res.send('dynplayer API'));
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

// 127.0.0.1로 바인딩 (Nginx가 프록시)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎵 Backend on 127.0.0.1:${PORT} (public via https://api.dynplayer.win)`);
});