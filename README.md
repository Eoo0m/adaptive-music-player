# 🎵 Dynplayer - Adaptive Music Player

dynplayer.win 도메인으로 서비스되는 Spotify 기반 적응형 음악 플레이어

## 프로젝트 구조

```
├── frontend/          # 프론트엔드 (Cloudflare Pages)
│   └── index.html    # iPod 스타일 UI
├── backend/          # 백엔드 API 서버
│   ├── server.js     # Express 서버
│   ├── *.npy         # 음악 추천 벡터 데이터
│   └── recommendation_service.py  # Python 추천 엔진
└── spotify-local/    # 레거시 (삭제 예정)
```

## 🚀 배포 방법

### Frontend (Cloudflare Pages)
```bash
cd frontend/
# Cloudflare Pages에 연결
# Build command: (없음)
# Build output: /
```

### Backend (Node.js 서버)
```bash
cd backend/
npm install
npm start
```

## 🔧 환경 설정

### Frontend
- 정적 파일만 있으므로 별도 설정 불필요

### Backend
`.env` 파일 생성:
```
SPOTIFY_CLIENT_ID="your_client_id"
SPOTIFY_CLIENT_SECRET="your_client_secret"
REDIRECT_URI="https://dynplayer.win/callback"
PORT=8889
```

## 🌐 API 엔드포인트

- `GET /login` - Spotify OAuth 로그인
- `GET /callback` - OAuth 콜백
- `POST /recommend` - 음악 추천
- `POST /find-spotify-tracks` - Spotify 트랙 검색

## 📱 기능

- iPod 클래식 스타일 UI
- Spotify OAuth 인증
- AI 기반 음악 추천
- 실시간 재생 제어