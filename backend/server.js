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
const PORT = process.env.PORT || 3000;

// CORS 설정 - 프론트엔드 도메인 허용
const corsOptions = {
  origin: [
    'https://dynplayer.win',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Start Python recommendation service
let pythonProcess;

async function checkRecommendationService() {
  try {
    const response = await fetch('http://localhost:5001/health');
    if (response.ok) {
      console.log('✅ Recommendation service is already running');
      return true;
    }
  } catch (error) {
    console.log('🤖 Starting recommendation service...');
    pythonProcess = spawn('python', ['recommendation_service.py'], {
      cwd: __dirname,
      stdio: 'pipe'
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Recommendation Service]: ${data.toString()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Recommendation Service Error]: ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Recommendation Service]: Process exited with code ${code}`);
    });
    
    return false;
  }
}

// Clean up Python process on exit
process.on('SIGINT', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  process.exit(0);
});

// Check if recommendation service is running, start if needed
checkRecommendationService();

// Serve static files from the current directory
app.use(express.static(__dirname));

// Spotify OAuth endpoints
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

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    res.redirect('/#error=access_denied');
    return;
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.access_token) {
      // Redirect to the main page with the token
      res.redirect(`/#access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}`);
    } else {
      res.redirect('/#error=invalid_token');
    }
  } catch (error) {
    console.error('Error getting access token:', error);
    res.redirect('/#error=server_error');
  }
});

// Token refresh endpoint
app.post('/refresh_token', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Missing refresh token' });
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      })
    });

    const tokenData = await response.json();
    res.json(tokenData);
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Song recommendation endpoints
app.post('/recommend', async (req, res) => {
  try {
    const recommendationResponse = await fetch('http://localhost:5001/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await recommendationResponse.json();
    
    // Log recommendations with similarity scores
    if (data.recommendations && data.recommendations.length > 0) {
      console.log(`🎯 Generated ${data.recommendations.length} recommendations:`);
      data.recommendations.slice(0, 5).forEach((rec, idx) => {
        const similarity = (rec.similarity * 100).toFixed(1);
        console.log(`  ${idx + 1}. ${rec.track} - ${rec.artist} (${similarity}% similar)`);
      });
      if (data.recommendations.length > 5) {
        console.log(`  ... and ${data.recommendations.length - 5} more`);
      }
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error calling recommendation service:', error);
    res.status(500).json({ error: 'Recommendation service unavailable' });
  }
});

app.post('/search-songs', async (req, res) => {
  try {
    const searchResponse = await fetch('http://localhost:5001/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await searchResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Error calling search service:', error);
    res.status(500).json({ error: 'Search service unavailable' });
  }
});

// Get recommendations based on currently playing Spotify track
app.post('/recommend-from-spotify-track', async (req, res) => {
  const { spotify_track, access_token } = req.body;

  if (!access_token || !spotify_track) {
    console.error('❌ Missing required data:', { 
      access_token: access_token ? 'present' : 'missing',
      spotify_track: spotify_track ? 'present' : 'missing' 
    });
    return res.status(400).json({ error: 'Missing access token or track info' });
  }

  if (!spotify_track.name || !spotify_track.artists || !spotify_track.artists[0]) {
    console.error('❌ Invalid track structure:', spotify_track);
    return res.status(400).json({ error: 'Invalid track structure' });
  }

  // Test token validity with a simple API call
  try {
    const tokenTestResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    if (!tokenTestResponse.ok) {
      console.error(`❌ Invalid access token: ${tokenTestResponse.status} - ${tokenTestResponse.statusText}`);
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
  } catch (error) {
    console.error('❌ Token validation failed:', error);
    return res.status(401).json({ error: 'Token validation failed' });
  }

  try {
    // First, try to find the track in our recommendation database by name/artist
    const searchResponse = await fetch('http://localhost:5001/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        query: `${spotify_track.name} ${spotify_track.artists[0].name}`.trim()
      })
    });

    if (!searchResponse.ok) {
      console.error(`❌ Recommendation service search failed: ${searchResponse.status}`);
      return res.status(500).json({ error: 'Recommendation service search failed' });
    }

    const searchData = await searchResponse.json();
    
    if (searchData.results && searchData.results.length > 0) {
      // Find best match
      const bestMatch = searchData.results.find(result => 
        result.track.toLowerCase().includes(spotify_track.name.toLowerCase()) ||
        spotify_track.name.toLowerCase().includes(result.track.toLowerCase())
      ) || searchData.results[0];

      // Get recommendations based on this match
      const recommendResponse = await fetch('http://localhost:5001/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          song_title: bestMatch.track,
          artist_name: bestMatch.artist,
          num_recommendations: 10
        })
      });

      if (!recommendResponse.ok) {
        console.error(`❌ Recommendation service failed: ${recommendResponse.status}`);
        return res.status(500).json({ error: 'Recommendation service failed' });
      }

      const recommendData = await recommendResponse.json();
      
      if (recommendData.recommendations && recommendData.recommendations.length > 0) {
        // Find Spotify tracks for the recommendations
        const spotifyTracks = [];
        
        for (const rec of recommendData.recommendations.slice(0, 5)) { // Get top 5
          const query = `track:"${rec.track}" artist:"${rec.artist}"`;
          const spotifySearchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          });

          if (!spotifySearchResponse.ok) {
            console.error(`❌ Spotify search failed: ${spotifySearchResponse.status} - ${spotifySearchResponse.statusText}`);
            continue;
          }

          const spotifySearchData = await spotifySearchResponse.json();
          
          if (spotifySearchData.tracks && spotifySearchData.tracks.items.length > 0) {
            const spotifyTrack = spotifySearchData.tracks.items[0];
            spotifyTracks.push({
              ...rec,
              spotify_track: spotifyTrack,
              uri: spotifyTrack.uri,
              preview_url: spotifyTrack.preview_url
            });
          }
        }

        res.json({ 
          spotify_tracks: spotifyTracks,
          original_match: bestMatch
        });
      } else {
        res.json({ spotify_tracks: [] });
      }
    } else {
      // If not found in our database, use Spotify's own recommendations
      const seedTrackId = spotify_track.id;
      console.log(`🎯 Using Spotify track ID as seed: ${seedTrackId}`);
      console.log(`🎯 Track name: ${spotify_track.name} by ${spotify_track.artists[0].name}`);
      
      const spotifyRecResponse = await fetch(`https://api.spotify.com/v1/recommendations?seed_tracks=${seedTrackId}&limit=5`, {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      if (!spotifyRecResponse.ok) {
        console.error(`❌ Spotify recommendations failed: ${spotifyRecResponse.status} - ${spotifyRecResponse.statusText}`);
        
        // Try with artist and genre seeds instead
        console.log('🔄 Trying with artist seed instead...');
        const artistId = spotify_track.artists[0].id;
        const artistSeedResponse = await fetch(`https://api.spotify.com/v1/recommendations?seed_artists=${artistId}&limit=5`, {
          headers: {
            'Authorization': `Bearer ${access_token}`
          }
        });
        
        if (!artistSeedResponse.ok) {
          console.error(`❌ Artist seed recommendations also failed: ${artistSeedResponse.status}`);
          return res.status(500).json({ error: 'Spotify recommendations failed' });
        }
        
        const artistRecData = await artistSeedResponse.json();
        
        if (artistRecData.tracks) {
          const spotifyTracks = artistRecData.tracks.map(track => ({
            track: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            spotify_track: track,
            uri: track.uri,
            preview_url: track.preview_url,
            similarity: 0.7 // Lower similarity for artist-based recommendations
          }));

          console.log(`🎵 Found ${spotifyTracks.length} tracks using artist seed`);
          return res.json({ spotify_tracks: spotifyTracks });
        }
      }

      const spotifyRecData = await spotifyRecResponse.json();
      
      if (spotifyRecData.tracks) {
        const spotifyTracks = spotifyRecData.tracks.map(track => ({
          track: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          spotify_track: track,
          uri: track.uri,
          preview_url: track.preview_url,
          similarity: 0.8 // Default similarity for Spotify recommendations
        }));

        res.json({ spotify_tracks: spotifyTracks });
      } else {
        res.json({ spotify_tracks: [] });
      }
    }
  } catch (error) {
    console.error('❌ Error getting recommendations from Spotify track:', error.message);
    console.error('❌ Stack trace:', error.stack);
    console.error('❌ Request details:', {
      spotify_track: spotify_track?.name,
      artist: spotify_track?.artists?.[0]?.name,
      access_token: access_token ? 'present' : 'missing'
    });
    res.status(500).json({ error: 'Failed to get recommendations: ' + error.message });
  }
});

// Find Spotify tracks from recommendation results
app.post('/find-spotify-tracks', async (req, res) => {
  const { tracks, access_token } = req.body;

  console.log(`🔍 Finding Spotify tracks for ${tracks?.length || 0} recommendations (selecting random 10)`);

  if (!access_token || !tracks) {
    console.error('❌ Missing access token or tracks');
    return res.status(400).json({ error: 'Missing access token or tracks' });
  }

  try {
    const spotifyTracks = [];
    
    // Shuffle tracks first, then take 10 to get random selection instead of just top 10
    const shuffledTracks = tracks.sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < shuffledTracks.length && i < 10; i++) { // Random 10 tracks
      const track = shuffledTracks[i];
      const query = `track:"${track.track}" artist:"${track.artist}"`;
      
      const similarity = track.similarity ? `(${(track.similarity * 100).toFixed(1)}% similar)` : '';
      console.log(`🎵 Searching: ${query} ${similarity}`);
      
      const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      if (!searchResponse.ok) {
        console.error(`❌ Spotify search failed: ${searchResponse.status}`);
        continue;
      }

      const searchData = await searchResponse.json();
      
      if (searchData.tracks && searchData.tracks.items.length > 0) {
        const spotifyTrack = searchData.tracks.items[0];
        spotifyTracks.push({
          ...track,
          spotify_track: spotifyTrack,
          uri: spotifyTrack.uri,
          preview_url: spotifyTrack.preview_url
        });
        const similarity = track.similarity ? ` (${(track.similarity * 100).toFixed(1)}% similar)` : '';
        console.log(`✅ Found: ${spotifyTrack.name} by ${spotifyTrack.artists[0].name}${similarity}`);
      } else {
        console.log(`❌ Not found: ${track.track} by ${track.artist}`);
      }
    }

    console.log(`🎵 Found ${spotifyTracks.length} Spotify tracks out of ${tracks.length} recommendations`);
    res.json({ spotify_tracks: spotifyTracks });
  } catch (error) {
    console.error('💥 Error finding Spotify tracks:', error);
    res.status(500).json({ error: 'Failed to find Spotify tracks: ' + error.message });
  }
});

// Get random tracks from user's library
app.get('/random-tracks', async (req, res) => {
  const { access_token, limit = 10 } = req.query;

  if (!access_token) {
    return res.status(400).json({ error: 'Missing access token' });
  }

  try {
    // Get user's saved tracks with random offset
    const savedTracksResponse = await fetch('https://api.spotify.com/v1/me/tracks?limit=50&offset=0', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const savedTracksData = await savedTracksResponse.json();
    
    if (savedTracksData.items && savedTracksData.items.length > 0) {
      // Shuffle the tracks and return requested amount
      const shuffled = savedTracksData.items.sort(() => 0.5 - Math.random());
      const randomTracks = shuffled.slice(0, Math.min(limit, shuffled.length));
      res.json({ tracks: randomTracks });
    } else {
      // If no saved tracks, get recommendations
      const recommendationsResponse = await fetch(`https://api.spotify.com/v1/recommendations?seed_genres=pop,rock,electronic&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });
      
      const recommendationsData = await recommendationsResponse.json();
      res.json({ tracks: recommendationsData.tracks || [] });
    }
  } catch (error) {
    console.error('Error fetching random tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Serve the main HTML file for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Diverse track recommendation endpoint
app.post('/recommend-diverse-tracks', async (req, res) => {
  const { spotify_track, access_token } = req.body;

  if (!access_token || !spotify_track) {
    console.error('❌ Missing required data for diverse recommendations');
    return res.status(400).json({ error: 'Missing access token or track info' });
  }

  console.log(`🔀 Getting diverse recommendations for: ${spotify_track.name} by ${spotify_track.artists[0].name}`);
  console.log(`🔀 This should trigger DIVERSE RECOMMENDATIONS in Python service...`);

  try {
    // First, try to find the track in our database
    const searchResponse = await fetch('http://localhost:5001/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query: `${spotify_track.name} ${spotify_track.artists[0].name}`.trim()
      })
    });

    if (!searchResponse.ok) {
      throw new Error(`Search service failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    
    if (searchData.results && searchData.results.length > 0) {
      // Find best match
      const bestMatch = searchData.results.find(result => 
        result.track.toLowerCase().includes(spotify_track.name.toLowerCase()) ||
        spotify_track.name.toLowerCase().includes(result.track.toLowerCase())
      ) || searchData.results[0];

      console.log(`🎯 Found match for diverse recommendations: ${bestMatch.track} by ${bestMatch.artist}`);

      // Get diverse recommendations using track_id
      console.log(`🔀 Calling Python service: /recommend-diverse with track_id: ${bestMatch.track_id}`);
      const diverseResponse = await fetch('http://localhost:5001/recommend-diverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_track_id: bestMatch.track_id,
          num_recommendations: 10
        })
      });
      console.log(`🔀 Python service response status: ${diverseResponse.status}`);

      if (diverseResponse.ok) {
        const diverseData = await diverseResponse.json();
        
        if (diverseData.recommendations && diverseData.recommendations.length > 0) {
          console.log(`🔀 Generated ${diverseData.recommendations.length} diverse recommendations (sorted by popularity):`);
          diverseData.recommendations.slice(0, 5).forEach((rec, idx) => {
            const similarity = (rec.similarity * 100).toFixed(1);
            console.log(`  ${idx + 1}. ${rec.track} - ${rec.artist} (${similarity}% similar, 🔥${rec.pos_count} plays)`);
          });

          // Find Spotify tracks for diverse recommendations
          const spotifyTracks = [];
          
          // Shuffle and take top 10
          const shuffledRecommendations = diverseData.recommendations.sort(() => 0.5 - Math.random());
          
          for (let i = 0; i < Math.min(shuffledRecommendations.length, 10); i++) {
            const rec = shuffledRecommendations[i];
            const query = `track:"${rec.track}" artist:"${rec.artist}"`;
            
            const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
              headers: { 'Authorization': `Bearer ${access_token}` }
            });

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              if (searchData.tracks && searchData.tracks.items.length > 0) {
                const spotifyTrack = searchData.tracks.items[0];
                spotifyTracks.push({
                  ...rec,
                  spotify_track: spotifyTrack,
                  uri: spotifyTrack.uri,
                  preview_url: spotifyTrack.preview_url
                });
                const similarity = (rec.similarity * 100).toFixed(1);
                console.log(`✅ Found diverse: ${spotifyTrack.name} by ${spotifyTrack.artists[0].name} (${similarity}% similar, ${rec.pos_count} plays)`);
              }
            }
          }

          return res.json({ 
            spotify_tracks: spotifyTracks,
            diverse_mode: true,
            original_match: bestMatch
          });
        }
      }
    }

    // Fallback: use Spotify's own recommendations but with different genres
    console.log('🔄 Using Spotify genre-based diverse recommendations...');
    const spotifyRecResponse = await fetch(`https://api.spotify.com/v1/recommendations?seed_genres=classical,jazz,electronic,world-music,blues&limit=10`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (spotifyRecResponse.ok) {
      const spotifyRecData = await spotifyRecResponse.json();
      
      if (spotifyRecData.tracks) {
        const spotifyTracks = spotifyRecData.tracks.map(track => ({
          track: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          spotify_track: track,
          uri: track.uri,
          preview_url: track.preview_url,
          similarity: 0.1, // Very different
          pos_count: 1000 // Assume popular
        }));

        console.log(`🎵 Found ${spotifyTracks.length} genre-diverse tracks`);
        return res.json({ spotify_tracks: spotifyTracks, diverse_mode: true });
      }
    }

    res.json({ spotify_tracks: [], diverse_mode: true });

  } catch (error) {
    console.error('❌ Error getting diverse recommendations:', error.message);
    res.status(500).json({ error: 'Failed to get diverse recommendations: ' + error.message });
  }
});

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 Spotify iPod server running on http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://192.168.0.25:${PORT}`);
  console.log(`🔑 Visit http://192.168.0.25:${PORT}/login to authenticate with Spotify`);
});