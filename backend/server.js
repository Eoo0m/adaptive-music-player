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
// server.js — 기존 /recommend-diverse-tracks 교체
app.post('/recommend-diverse-tracks', async (req, res) => {
  const { spotify_track, access_token } = req.body;
  if (!access_token || !spotify_track) {
    return res.status(400).json({ error: 'Missing access token or track info' });
  }

  // 🔎 유틸: 문자열 정규화(피처링/괄호 제거, 공백정리, 소문자)
  const norm = (s = '') => s
    .toString()
    .normalize('NFKD')
    .replace(/\((feat\.?|with)[^)]+\)/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  try {
    console.time('[diverse]');
    console.log('🔴 /recommend-diverse-tracks called');

    // 0) 토큰 검증(빠른 실패)
    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (!me.ok) {
      const t = await me.text();
      console.error('❌ me failed', me.status, t);
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    // 1) 로컬 검색용 쿼리 후보들 만들기
    const st = spotify_track;
    const title = st?.name || '';
    const artist0 = st?.artists?.[0]?.name || '';
    const titleN = norm(title), artistN = norm(artist0);

    const queries = Array.from(new Set([
      `${title} ${artist0}`.trim(),
      `${title}`.trim(),
      `${titleN} ${artistN}`.trim(),
      `${titleN}`.trim(),
    ])).filter(Boolean);

    // 2) 로컬 track_id 찾기 (여러 쿼리 시도, 상위 결과에서 후보 몇 개 시도)
    let bestCandidates = [];
    for (const q of queries) {
      const searchR = await fetch('http://127.0.0.1:5001/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      if (!searchR.ok) {
        console.warn('⚠️ /search failed', searchR.status, await searchR.text());
        continue;
      }
      const sj = await searchR.json();
      const rows = (sj?.results || []).slice(0, 5); // 상위 5개만
      console.log(`[diverse] local search "${q}" -> ${rows.length} hits`);
      bestCandidates.push(...rows);
      if (bestCandidates.length >= 5) break;
    }
    // 중복 제거(로컬 track_id 기준)
    const seen = new Set();
    bestCandidates = bestCandidates.filter(r => {
      if (!r.track_id) return false;
      if (seen.has(r.track_id)) return false;
      seen.add(r.track_id);
      return true;
    }).slice(0, 3); // 최대 3개 seed 시도

    if (bestCandidates.length === 0) {
      console.warn('[diverse] no local candidate track_id found');
      return res.json({ spotify_tracks: [] });
    }

    // 3) 각 후보로 diverse 추천 요청(성공한 것 누적)
    let diversePool = [];
    for (const cand of bestCandidates) {
      const diverseR = await fetch('http://127.0.0.1:5001/recommend-diverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_track_id: cand.track_id, num_recommendations: 20 })
      });
      const text = await diverseR.text();
      if (!diverseR.ok) {
        console.warn('⚠️ /recommend-diverse failed', diverseR.status, text);
        continue;
      }
      const dj = JSON.parse(text);
      const recs = dj?.recommendations || [];
      console.log(`[diverse] seed=${cand.track_id} got ${recs.length} recs`);
      diversePool.push(...recs);
      if (diversePool.length >= 20) break;
    }

    // 4) 추천이 하나도 없으면 종료
    if (diversePool.length === 0) {
      console.warn('[diverse] empty from server');
      return res.json({ spotify_tracks: [] });
    }

    // 5) (제목/아티스트) 기준 중복 제거 후 상위 15개만 Spotify 매핑
    const key = r => `${norm(r.track)}|${norm(r.artist)}`;
    const seenKey = new Set();
    diversePool = diversePool.filter(r => {
      const k = key(r);
      if (seenKey.has(k)) return false;
      seenKey.add(k);
      return true;
    }).slice(0, 15);

    console.log(`[diverse] unique candidates for Spotify match: ${diversePool.length}`);

    // 6) Spotify 매핑 (최대 10개 반환)
    const out = [];
    for (const rec of diversePool) {
      const q = `track:"${rec.track}" artist:"${rec.artist}"`;
      const s = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });
      if (!s.ok) {
        console.warn('⚠️ spotify search fail', s.status, await s.text());
        continue;
      }
      const sj = await s.json();
      const it = sj?.tracks?.items?.[0];
      if (it) out.push({ ...rec, spotify_track: it, uri: it.uri, preview_url: it.preview_url, track: it });
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