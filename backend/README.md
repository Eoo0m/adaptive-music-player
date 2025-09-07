# 🔧 Dynplayer Backend

Spotify API와 AI 추천 엔진을 통합한 백엔드 서버

## 설치 및 실행

```bash
# Node.js 의존성 설치
npm install

# Python 의존성 설치
pip install -r requirements.txt

# 서버 실행
npm start
```

## 환경 변수 설정

`.env` 파일 생성:
```env
SPOTIFY_CLIENT_ID="your_spotify_client_id"
SPOTIFY_CLIENT_SECRET="your_spotify_client_secret" 
REDIRECT_URI="https://dynplayer.win/callback"
PORT=8889
```

## 배포 옵션

### Railway (추천)
```bash
railway login
railway init
railway up
```

### Render
1. GitHub 연결
2. Root Directory: `backend`
3. Build Command: `npm install && pip install -r requirements.txt`
4. Start Command: `npm start`

## API 엔드포인트

- `GET /login` - Spotify OAuth 시작
- `GET /callback` - OAuth 콜백 처리  
- `POST /refresh_token` - 토큰 갱신
- `POST /recommend` - AI 음악 추천
- `POST /find-spotify-tracks` - Spotify 트랙 검색
- `POST /recommend-from-spotify-track` - 현재 재생곡 기반 추천

## 파일 구조

- `server.js` - Express 메인 서버
- `recommendation_service.py` - Python AI 추천 엔진
- `*.npy` - 음악 임베딩 벡터 데이터
- `*.csv` - 메타데이터