tee / opt / dynplayer / backend / server.js > /dev/null << 'EOF'
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
const PORT = process.env.PORT || 8889;

app.set('trust proxy', 1);

const corsOptions = {
  origin: [
    'https://dynplayer.win',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// ---------------- Health check ----------------
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
      stdio: 'pipe',
    });
    pythonProcess.stdout.on('data', d => process.stdout.write(`[Reco] ${d}`));
    pythonProcess.stderr.on('data', d => process.stderr.write(`[RecoErr] ${d}`));
  }
}
process.on('SIGINT', () => { if (pythonProcess) pythonProcess.kill(); process.exit(0); });
ensureRecoService();

// ---------------- Spotify OAuth ----------------
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}

app.get('/login', (req, res) => {
  const scopes = [
    'streaming', 'user-read-email', 'user-read-private', 'user-library-read', 'user-library-modify',
    'user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative'
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

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/#error=access_denied');

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
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
    const tokenData = await tokenResponse.json();
    if (tokenData.access_token) {
      res.redirect(`/#access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}`);
    } else {
      res.redirect('/#error=invalid_token');
    }
  } catch (e) {
    console.error('Error getting access token:', e);
    res.redirect('/#error=server_error');
  }
});

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
    console.error('Error refreshing token:', e);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// ---------------- Example recommendation/search API ----------------
app.post('/recommend', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/recommend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch {
    res.status(500).json({ error: 'recommendation service unavailable' });
  }
});

app.post('/search-songs', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:5001/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch {
    res.status(500).json({ error: 'search service unavailable' });
  }
});

// ---------------- 404 fallback ----------------
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎵 Backend on 127.0.0.1:${PORT} (public via https://api.dynplayer.win)`);
});
EOF